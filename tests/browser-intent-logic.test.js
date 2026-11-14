'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const address = require('../browser-address-logic.js');
globalThis.DaymarkBrowserAddress = address;
const engine = require('../browser-intent-logic.js');

test('a plain https link stays in the browser with no handoff', () => {
  const result = engine.classifyLink('https://example.com/page');
  assert.equal(result.kind, 'web');
  assert.equal(result.host, 'example.com');
  assert.equal(result.credentialsRefused, false);
  const plan = engine.planIntentHandoff('https://example.com/page');
  assert.equal(plan.verdict, 'opens-in-browser');
  assert.equal(plan.title, 'Stays in the browser');
});

test('embedded credentials in a web link are refused and disclosed', () => {
  const result = engine.classifyLink('https://user:secret@example.com/');
  assert.equal(result.kind, 'web');
  assert.equal(result.credentialsRefused, true);
  const plan = engine.planIntentHandoff('https://user:secret@example.com/');
  assert.ok(plan.lines.some((line) => line.indexOf('refused before navigation') !== -1));
  // The echoed host must not carry the credentials.
  assert.ok(!plan.lines.some((line) => line.indexOf('user:secret') !== -1));
});

test('mailto, tel, sms and geo are explicit user-triggered handoffs', () => {
  for (const scheme of engine.EXTERNAL_SCHEMES) {
    const result = engine.classifyLink(scheme + ':someone');
    assert.equal(result.kind, 'external-handoff', scheme);
    const plan = engine.planIntentHandoff(scheme + ':someone');
    assert.equal(plan.verdict, 'handoff');
    assert.ok(plan.lines.some((line) => line.indexOf('explicit user tap') !== -1));
  }
});

test('a malformed external handoff fails closed', () => {
  const result = engine.classifyLink('mailto:hello world');
  assert.equal(result.kind, 'malformed');
  const plan = engine.planIntentHandoff('mailto:hello world');
  assert.equal(plan.verdict, 'refused');
  assert.equal(plan.title, 'Not planned');
});

test('unapproved app schemes are refused instead of handed off', () => {
  for (const scheme of [
    'tg', 'market', 'whatsapp', 'telegram', 'smsto', 'viber', 'spotify',
    'youtube', 'chatgpt', 'instagram', 'android-app'
  ]) {
    const link = scheme + '://open';
    const result = engine.classifyLink(link);
    assert.equal(result.kind, 'blocked', scheme);
    assert.equal(engine.planIntentHandoff(link).verdict, 'refused', scheme);
  }
});

test('a full intent:// URI parses package, scheme and encoded fallback', () => {
  const link = 'intent://scan/#Intent;scheme=mailto;package=com.example.scan;S.browser_fallback_url=https%3A%2F%2Fexample.com%2Fproduct;end';
  const parsed = engine.parseIntentUri(link);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.packageName, 'com.example.scan');
  assert.equal(parsed.scheme, 'mailto');
  assert.equal(parsed.fallbackUrl, 'https://example.com/product');
  assert.equal(parsed.fallbackHonored, true);
  const plan = engine.planIntentHandoff(link);
  assert.equal(plan.kind, 'android-intent');
  assert.equal(plan.verdict, 'handoff');
  assert.ok(plan.lines.some((line) => line.indexOf('com.example.scan (pinned by the link)') !== -1));
  assert.ok(plan.lines.some((line) => line.indexOf('fallback origin is https://example.com') !== -1));
  assert.ok(!plan.lines.some((line) => line.indexOf('/product') !== -1), 'fallback path is not echoed');
});

test('intent target schemes are limited to HTTP(S) and explicit Android handlers', () => {
  assert.deepEqual(engine.INTENT_EXTERNAL_SCHEMES, ['mailto', 'tel', 'sms', 'geo']);
  for (const scheme of [
    'tg', 'market', 'whatsapp', 'telegram', 'smsto', 'viber', 'spotify', 'youtube',
    'chatgpt', 'instagram', 'android-app', 'chrome', 'chrome-extension', 'devtools',
    'view-source', 'vbscript', 'zxing', 'custom+scheme', 'file', 'content', 'javascript',
    'data', 'intent'
  ]) {
    const link = 'intent://scan/#Intent;scheme=' + scheme + ';end';
    const parsed = engine.parseIntentUri(link);
    assert.equal(parsed.ok, false, scheme + ' target must be refused');
    assert.match(parsed.reason, /explicit Android handler list/);
    assert.equal(engine.planIntentHandoff(link).verdict, 'refused', scheme + ' must not plan a handoff');
  }
});

test('an intent without a pinned package discloses the chooser', () => {
  const link = 'intent://share/#Intent;scheme=https;end';
  const parsed = engine.parseIntentUri(link);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.packageName, null);
  assert.equal(parsed.action, null);
  const plan = engine.planIntentHandoff(link);
  assert.ok(plan.lines.some((line) => line.indexOf('app chooser') !== -1));
});

test('a non-http fallback URL rejects the entire intent without echoing it', () => {
  const link = 'intent://x/#Intent;scheme=mailto;S.browser_fallback_url=javascript%3Aalert(1);end';
  const parsed = engine.parseIntentUri(link);
  assert.equal(parsed.ok, false);
  const plan = engine.planIntentHandoff(link);
  assert.equal(plan.verdict, 'refused');
  assert.ok(!JSON.stringify(plan).includes('javascript'));
});

test('malformed intent URIs fail closed with a reason', () => {
  const missingParams = engine.parseIntentUri('intent://example.com/page');
  assert.equal(missingParams.ok, false);
  assert.match(missingParams.reason, new RegExp('parameter section'));
  const missingEnd = engine.parseIntentUri('intent://example.com/#Intent;package=com.example.app');
  assert.equal(missingEnd.ok, false);
  assert.match(missingEnd.reason, new RegExp(';end'));
  const plan = engine.planIntentHandoff('intent://example.com/page');
  assert.equal(plan.verdict, 'refused');
  assert.equal(plan.title, 'Not planned');
});

test('blocked schemes are refused outright', () => {
  const blocked = ['javascript', 'data', 'file', 'about'];
  for (const scheme of blocked) {
    const result = engine.classifyLink(scheme + ':whatever');
    assert.equal(result.kind, 'blocked', scheme);
    const plan = engine.planIntentHandoff(scheme + ':whatever');
    assert.equal(plan.verdict, 'refused');
    assert.equal(plan.title, 'Blocked scheme');
  }
});

test('unknown schemes plan nothing instead of guessing', () => {
  const result = engine.classifyLink('weirdapp://open');
  assert.equal(result.kind, 'unknown-scheme');
  const plan = engine.planIntentHandoff('weirdapp://open');
  assert.equal(plan.verdict, 'refused');
  assert.ok(plan.summary.indexOf('cannot prove') !== -1);
});

test('empty, scheme-less and control-character input never plans a handoff', () => {
  assert.equal(engine.classifyLink('').kind, 'none');
  assert.equal(engine.classifyLink('   ').kind, 'none');
  const noScheme = engine.classifyLink('just some words');
  assert.equal(noScheme.kind, 'no-scheme');
  const plan = engine.planIntentHandoff('just some words');
  assert.equal(plan.verdict, 'not-planned');
  const control = engine.classifyLink('https://example.com/x' + String.fromCharCode(7));
  assert.equal(control.kind, 'malformed');
});

test('oversized input fails closed at the documented limit', () => {
  const long = 'https://example.com/' + 'a'.repeat(engine.MAX_INPUT_CHARS + 1);
  const result = engine.classifyLink(long);
  assert.equal(result.kind, 'malformed');
  assert.ok(result.reason.indexOf('2048') !== -1);
});

test('long targets are truncated before they are echoed back', () => {
  const long = 'mailto:' + 'b'.repeat(300);
  const result = engine.classifyLink(long);
  assert.ok(result.target.length <= engine.MAX_ECHO_CHARS + 16);
  assert.ok(result.target.indexOf('(truncated)') !== -1);
});

test('the card never claims anything ran automatically', () => {
  const plan = engine.planIntentHandoff('mailto:someone@example.com');
  assert.ok(plan.network.indexOf('explicit user action') !== -1);
  assert.ok(plan.network.indexOf('None') === 0);
});

test('shared Android/web Intent URI contract fixture stays in parity', () => {
  const fixturePath = path.join(__dirname, '..', 'contracts', 'intent-uri-validation.tsv');
  const rows = fs.readFileSync(fixturePath, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
  assert.equal(rows.length, 58, 'the shared Intent URI fixture must retain all fifty-eight cases');
  let acceptedCount = 0;
  let rejectedCount = 0;
  for (const row of rows) {
    const [name, expected, input, expectedTarget, expectedFallback] = row.split('\t');
    assert.ok(name && input && (expected === 'accept' || expected === 'reject'), row);
    const parsed = engine.parseIntentUri(input);
    if (expected === 'accept') {
      acceptedCount += 1;
      assert.equal(parsed.ok, true, name);
      assert.equal(parsed.targetUri, expectedTarget, name + ' target');
      const fallback = expectedFallback === '-' ? '' : expectedFallback;
      assert.equal(parsed.fallbackUrl || '', fallback, name + ' fallback');
      const plan = engine.planIntentHandoff(input);
      assert.equal(plan.verdict, 'handoff', name + ' plan');
      if (fallback) {
        const origin = /^(https?:\/\/[^/?#]+)/i.exec(fallback);
        assert.ok(origin, name + ' fallback origin');
        assert.ok(JSON.stringify(plan).includes(origin[1]), name + ' discloses only the fallback origin');
        assert.ok(!JSON.stringify(plan).includes(fallback.slice(origin[1].length)),
          name + ' does not echo fallback path or query');
      }
    } else {
      rejectedCount += 1;
      assert.equal(parsed.ok, false, name);
      const plan = engine.planIntentHandoff(input);
      assert.equal(plan.verdict, 'refused', name + ' plan');
      assert.equal(plan.kind, 'malformed', name + ' classification');
      assert.ok(!JSON.stringify(plan).includes('secret'), name + ' does not echo secret-bearing input');
    }
  }
  assert.equal(acceptedCount, 12, 'all twelve accepted contract cases remain present');
  assert.equal(rejectedCount, 46, 'all forty-six rejected contract cases remain present');
});

test('non-ASCII fullwidth hex digits are rejected in percent escapes', () => {
  const input = 'intent://scan/#Intent;scheme=%７Ａ;end';
  const parsed = engine.parseIntentUri(input);
  assert.equal(parsed.ok, false);
  const plan = engine.planIntentHandoff(input);
  assert.equal(plan.verdict, 'refused');
  assert.equal(plan.kind, 'malformed');
});
