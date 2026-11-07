'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../browser-download-logic.js');

test('scenario ids are stable, known and uniquely labelled', () => {
  assert.deepEqual(engine.SCENARIO_IDS, [
    'same-origin-redirects', 'cross-origin-redirect', 'server-filename',
    'unknown-mime', 'expired-link', 'installable-app', 'spoofed-filename'
  ]);
  const scenarios = engine.listScenarios();
  assert.equal(scenarios.length, engine.SCENARIO_IDS.length);
  const labels = new Set(scenarios.map((s) => s.label));
  assert.equal(labels.size, scenarios.length, 'labels must be unique');
  for (const scenario of scenarios) {
    assert.ok(engine.isKnownScenarioId(scenario.id), scenario.id + ' must be a known id');
    // Every preset must plan successfully — a broken preset is a broken card.
    const plan = engine.planScenario(scenario.id);
    assert.equal(plan.ok, true, scenario.id + ' must plan');
    assert.ok(plan.filename && plan.filename.length > 0, scenario.id + ' needs a filename');
    assert.ok(plan.lines.length >= 5, scenario.id + ' needs all detail lines');
  }
});

test('sanitizeFilename strips control, format and separator characters', () => {
  assert.equal(engine.sanitizeFilename('report.pdf'), 'report.pdf');
  // Bidi override and path traversal are removed, never trusted.
  assert.equal(engine.sanitizeFilename('../../\u202Eevilexe.exe'), 'evilexe.exe');
  assert.equal(engine.sanitizeFilename('a\\b/c.txt'), 'a b c.txt');
  assert.equal(engine.sanitizeFilename('"quoted.pdf"'), 'quoted.pdf');
  assert.equal(engine.sanitizeFilename('..hidden'), 'hidden');
  assert.equal(engine.sanitizeFilename('  spaced   name.pdf  '), 'spaced name.pdf');
  assert.equal(engine.sanitizeFilename('a\u0000b\u007fc.pdf'), 'abc.pdf');
  // Nothing honest remaining fails closed instead of guessing.
  assert.equal(engine.sanitizeFilename(''), null);
  assert.equal(engine.sanitizeFilename('...'), null);
  assert.equal(engine.sanitizeFilename('///'), null);
  assert.equal(engine.sanitizeFilename(null), null);
  assert.equal(engine.sanitizeFilename(42), null);
  // Implausibly long names are dropped, not truncated into a lie.
  assert.equal(engine.sanitizeFilename('x'.repeat(600)), null);
  const capped = engine.sanitizeFilename('y'.repeat(200));
  assert.equal(capped.length, 120);
});

test('percentDecode decodes valid escapes and fails closed on bad ones', () => {
  assert.equal(engine.percentDecode('quarterly%20r%C3%A9port.pdf'), 'quarterly réport.pdf');
  assert.equal(engine.percentDecode('plain.pdf'), 'plain.pdf');
  assert.equal(engine.percentDecode('%E2%82%AC'), '€');
  assert.equal(engine.percentDecode('%zz'), null);
  assert.equal(engine.percentDecode('%2'), null);
  assert.equal(engine.percentDecode(''), null);
  assert.equal(engine.percentDecode(null), null);
});

test('filenameFromDisposition honors RFC 5987 over plain filenames', () => {
  // filename* wins over filename.
  assert.equal(engine.filenameFromDisposition(
    'attachment; filename="old-name.bin"; filename*=UTF-8' + "'" + "'" + 'quarterly%20r%C3%A9port.pdf'),
    'quarterly réport.pdf');
  assert.equal(engine.filenameFromDisposition('attachment; filename="report.pdf"'), 'report.pdf');
  assert.equal(engine.filenameFromDisposition('attachment; filename=report.pdf'), 'report.pdf');
  assert.equal(engine.filenameFromDisposition('inline; filename="view.txt"'), 'view.txt');
  // A non-UTF-8 filename* is ignored and the plain filename is used.
  assert.equal(engine.filenameFromDisposition(
    'attachment; filename*=iso-8859-1' + "'" + "'" + 'na%EFve.bin; filename="fallback.bin"'),
    'fallback.bin');
  // Spoofed names are sanitized, with the change reported.
  const parsed = engine.planDownload({
    url: 'https://example.com/d/1',
    contentDisposition: 'attachment; filename="../../\u202Eevilexe.exe"',
    mimeType: 'application/octet-stream'
  });
  assert.equal(parsed.filename, 'evilexe.exe');
  assert.ok(parsed.notices.some((n) => /unsafe characters; they were removed/.test(n)),
    'the sanitizer change must be disclosed');
  // Not a disposition at all, or unusable input, yields no name.
  assert.equal(engine.filenameFromDisposition('form-data; name="file"'), null);
  assert.equal(engine.filenameFromDisposition(''), null);
  assert.equal(engine.filenameFromDisposition(null), null);
  assert.equal(engine.filenameFromDisposition('x'.repeat(2000)), null);
});

test('filenameFromUrl extracts the last path segment only', () => {
  assert.equal(engine.filenameFromUrl('https://example.com/a/report.pdf?x=1#frag'), 'report.pdf');
  assert.equal(engine.filenameFromUrl('https://example.com/quarterly%20report.pdf'), 'quarterly report.pdf');
  assert.equal(engine.filenameFromUrl('https://example.com/a/'), null);
  assert.equal(engine.filenameFromUrl('https://example.com/'), null);
  assert.equal(engine.filenameFromUrl('not a url'), null);
  assert.equal(engine.filenameFromUrl(''), null);
  assert.equal(engine.filenameFromUrl(null), null);
});

test('classifyMime never presents an unknown type as known', () => {
  const pdf = engine.classifyMime('application/pdf');
  assert.equal(pdf.known, true);
  assert.equal(pdf.label, 'PDF document');
  const octet = engine.classifyMime('application/octet-stream');
  assert.equal(octet.known, false);
  assert.equal(octet.label, 'Unknown file type');
  const apk = engine.classifyMime('application/vnd.android.package-archive');
  assert.equal(apk.known, true);
  assert.equal(apk.label, 'Installable app file (APK)');
  assert.ok(apk.caution && /never opened silently/.test(apk.caution),
    'the APK caution must be explicit');
  const svg = engine.classifyMime('image/svg+xml');
  // SVG can carry scripts, so it is deliberately NOT in the known table.
  assert.equal(svg.known, false);
  const audio = engine.classifyMime('audio/ogg');
  assert.equal(audio.known, true);
  for (const garbage of ['', null, 42, 'not a mime', 'application/pdf extra']) {
    assert.equal(engine.classifyMime(garbage).known, false, JSON.stringify(garbage) + ' must be unknown');
  }
});

test('classifyRetry refuses to call expired and refused links retryable', () => {
  assert.equal(engine.classifyRetry(404).retryable, false);
  const gone = engine.classifyRetry(410);
  assert.equal(gone.retryable, false);
  assert.match(gone.advice, /fresh link/);
  assert.equal(engine.classifyRetry(403).retryable, false);
  assert.equal(engine.classifyRetry(429).retryable, true);
  assert.equal(engine.classifyRetry(500).retryable, true);
  assert.equal(engine.classifyRetry(null).retryable, true);
  assert.equal(engine.classifyRetry('404').retryable, true);
  assert.equal(engine.classifyRetry(404.5).retryable, true);
  assert.equal(engine.classifyRetry(999).retryable, true);
});

test('analyzeRedirects detects cross-origin chains and unverifiable hops', () => {
  const same = engine.analyzeRedirects([
    'https://example.com/start',
    'https://example.com/step',
    'https://example.com/files/report.pdf'
  ]);
  assert.equal(same.crossOrigin, false);
  assert.deepEqual(same.origins, ['https://example.com']);
  const cross = engine.analyzeRedirects([
    'https://example.com/dl',
    'https://cdn.example.com/track',
    'https://files.other.net/get/file.zip'
  ]);
  assert.equal(cross.crossOrigin, true);
  assert.equal(cross.origins[cross.origins.length - 1], 'https://files.other.net');
  // A non-URL hop marks the chain untrusted.
  const broken = engine.analyzeRedirects(['https://example.com/a', 'javascript:alert(1)']);
  assert.equal(broken.untrusted, true);
  assert.equal(broken.invalid, 1);
  const none = engine.analyzeRedirects(undefined);
  assert.equal(none.count, 0);
  assert.equal(none.untrusted, false);
  // Chains longer than the cap are honestly capped and marked untrusted.
  const longChain = [];
  for (let i = 0; i < engine.MAX_REDIRECT_HOPS + 8; i += 1) {
    longChain.push('https://example.com/hop' + i);
  }
  const capped = engine.analyzeRedirects(longChain);
  assert.equal(capped.count, engine.MAX_REDIRECT_HOPS);
  assert.equal(capped.untrusted, true);
  assert.ok(capped.invalid >= 8);
});

test('safeOrigin strips credentials, paths, queries and fragments', () => {
  assert.equal(engine.safeOrigin('https://user:pass@Site.example.com/a/b?token=sekret#frag'),
    'https://site.example.com');
  assert.equal(engine.safeOrigin('http://example.com:8080/x?y=1'), 'http://example.com:8080');
  assert.equal(engine.safeOrigin('http://example.com:80/x'), 'http://example.com');
  assert.equal(engine.safeOrigin('https://example.com:443/x'), 'https://example.com');
  assert.equal(engine.safeOrigin('javascript:alert(1)'), null);
  assert.equal(engine.safeOrigin('not a url'), null);
  assert.equal(engine.safeOrigin(''), null);
  assert.equal(engine.safeOrigin(null), null);
});

test('planDownload plans a same-origin redirect chain end to end', () => {
  const plan = engine.planDownload({
    url: 'https://example.com/files/report.pdf',
    redirects: ['https://example.com/start', 'https://example.com/step'],
    mimeType: 'application/pdf'
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.filename, 'report.pdf');
  assert.equal(plan.filenameSource, 'url');
  assert.equal(plan.origin, 'https://example.com');
  assert.equal(plan.type.label, 'PDF document');
  assert.equal(plan.redirects.crossOrigin, false);
  assert.equal(plan.retryable, true);
  const joined = plan.lines.join(' ');
  assert.match(joined, /Filename: report\.pdf \(from the link\)/);
  assert.match(joined, /all within https:\/\/example\.com/);
  assert.match(joined, /second tap within 1\.5 seconds is ignored/);
  assert.match(plan.summary, /Nothing suspicious was found/);
});

test('planDownload discloses cross-origin arrivals honestly', () => {
  const plan = engine.planDownload({
    url: 'https://files.other.net/get/file.zip',
    redirects: ['https://example.com/dl', 'https://files.other.net/get/file.zip'],
    mimeType: 'application/zip'
  });
  assert.equal(plan.ok, true);
  assert.match(plan.summary, /arrives from https:\/\/files\.other\.net after leaving https:\/\/example\.com/);
  assert.equal(plan.redirects.crossOrigin, true);
});

test('planDownload falls back to a safe default filename when nothing is usable', () => {
  const plan = engine.planDownload({ url: 'https://example.com/', mimeType: 'application/pdf' });
  assert.equal(plan.ok, true);
  assert.equal(plan.filename, 'download.pdf');
  assert.equal(plan.filenameSource, 'mime');
  const bare = engine.planDownload({ url: 'https://example.com/' });
  assert.equal(bare.filename, 'download');
  assert.equal(bare.filenameSource, 'default');
});

test('planDownload fails closed for malformed journeys instead of throwing', () => {
  for (const garbage of [null, undefined, 42, 'https://example.com/x', [], true]) {
    const plan = engine.planDownload(garbage);
    assert.equal(plan.ok, false);
    assert.equal(plan.filename, null);
    assert.equal(plan.lines.length, 0);
    assert.match(plan.summary, /could not be checked/);
  }
  const expired = engine.planDownload({ url: 'https://example.com/old.pdf', httpStatus: 410 });
  assert.equal(expired.retryable, false);
  assert.match(expired.lines.join(' '), /fresh link/);
});

test('coalesceTaps ignores a second tap inside the window and nothing unverifiable', () => {
  const state = {};
  assert.deepEqual(engine.coalesceTaps(state, 'https://example.com/a.pdf', 1000),
    { action: 'start', reason: 'new' });
  assert.deepEqual(engine.coalesceTaps(state, 'https://example.com/a.pdf', 2000),
    { action: 'ignore', reason: 'duplicate' });
  assert.deepEqual(engine.coalesceTaps(state, 'https://example.com/a.pdf', 1000 + engine.DUPLICATE_TAP_WINDOW_MS),
    { action: 'start', reason: 'new' });
  // A different key is a different download.
  assert.deepEqual(engine.coalesceTaps(state, 'https://example.com/b.pdf', 1000 + engine.DUPLICATE_TAP_WINDOW_MS),
    { action: 'start', reason: 'new' });
  // Unverifiable input never starts a second download.
  assert.deepEqual(engine.coalesceTaps(state, '', 5000), { action: 'ignore', reason: 'unverifiable' });
  assert.deepEqual(engine.coalesceTaps(state, null, 5000), { action: 'ignore', reason: 'unverifiable' });
  assert.deepEqual(engine.coalesceTaps(null, 'https://example.com/a.pdf', 5000),
    { action: 'ignore', reason: 'unverifiable' });
  assert.deepEqual(engine.coalesceTaps([], 'https://example.com/a.pdf', 5000),
    { action: 'ignore', reason: 'unverifiable' });
});

test('planScenario fails closed for unknown ids', () => {
  for (const bad of ['nope', '', 42, null, undefined, 'TLS ', {}]) {
    const plan = engine.planScenario(bad);
    assert.equal(plan.ok, false);
    assert.equal(plan.filename, null);
    assert.match(plan.summary, /not known/);
  }
});
