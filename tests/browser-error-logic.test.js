'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../browser-error-logic.js');

test('taxonomy ids are stable, known and uniquely labelled', () => {
  assert.deepEqual(engine.TAXONOMY_IDS, [
    'offline', 'dns-not-found', 'timeout', 'tls', 'http-client-error',
    'http-server-error', 'blocked-navigation', 'download-failure', 'unknown'
  ]);
  const scenarios = engine.listScenarios();
  assert.equal(scenarios.length, engine.TAXONOMY_IDS.length);
  const labels = new Set(scenarios.map((s) => s.label));
  assert.equal(labels.size, scenarios.length, 'labels must be unique');
  for (const scenario of scenarios) {
    assert.ok(engine.isKnownErrorId(scenario.id), scenario.id + ' must be a known id');
  }
});

test('every taxonomy entry is complete and honest', () => {
  const severities = new Set(['info', 'warn', 'danger']);
  for (const id of engine.TAXONOMY_IDS) {
    const entry = engine.TAXONOMY[id];
    assert.ok(entry.title && entry.title.length > 3, id + ' needs a title');
    assert.ok(entry.summary && entry.summary.length > 20, id + ' needs a real summary');
    assert.ok(Array.isArray(entry.recoveries) && entry.recoveries.length >= 2,
      id + ' needs at least two recovery steps');
    assert.ok(severities.has(entry.severity), id + ' needs a known severity');
    assert.equal(typeof entry.retryable, 'boolean', id + ' needs an explicit retryable flag');
  }
});

test('TLS failures are never presented as retryable', () => {
  const tls = engine.explainError('tls');
  assert.equal(tls.retryable, false);
  assert.match(tls.summary, /could not be verified/);
  assert.ok(tls.recoveries.some((step) => /never offers to continue/.test(step)));
});

test('error codes map to the right categories', () => {
  const cases = [
    ['ERR_INTERNET_DISCONNECTED', 'offline'],
    ['ERR_NAME_NOT_RESOLVED', 'dns-not-found'],
    ['ERR_DNS_NOT_FOUND', 'dns-not-found'],
    ['err_name_not_resolved', 'dns-not-found'],
    ['ERR_TIMED_OUT', 'timeout'],
    ['ERR_CONNECTION_TIMED_OUT', 'timeout'],
    ['ERR_CERT_AUTHORITY_INVALID', 'tls'],
    ['ERR_SSL_PROTOCOL_ERROR', 'tls'],
    ['ERR_BLOCKED_BY_ADMINISTRATOR', 'blocked-navigation'],
    ['ERR_DOWNLOAD_FILE_ERROR', 'download-failure']
  ];
  for (const [code, expected] of cases) {
    assert.equal(engine.classifyBrowserError(code).id, expected, code);
  }
});

test('HTTP statuses map to client and server categories only', () => {
  assert.equal(engine.classifyBrowserError({ httpStatus: 404 }).id, 'http-client-error');
  assert.equal(engine.classifyBrowserError({ httpStatus: 499 }).id, 'http-client-error');
  assert.equal(engine.classifyBrowserError({ httpStatus: 500 }).id, 'http-server-error');
  assert.equal(engine.classifyBrowserError({ httpStatus: 503 }).id, 'http-server-error');
  assert.equal(engine.classifyBrowserError({ httpStatus: 599 }).id, 'http-server-error');
  // Out-of-range or non-numeric statuses never claim a category.
  assert.equal(engine.classifyBrowserError({ httpStatus: 99 }).id, 'unknown');
  assert.equal(engine.classifyBrowserError({ httpStatus: 600 }).id, 'unknown');
  assert.equal(engine.classifyBrowserError({ httpStatus: 404.5 }).id, 'unknown');
  assert.equal(engine.classifyBrowserError({ httpStatus: '404' }).id, 'unknown');
});

test('the offline flag wins over any code', () => {
  const result = engine.classifyBrowserError({ code: 'ERR_NAME_NOT_RESOLVED', offline: true });
  assert.equal(result.id, 'offline');
});

test('classification fails closed instead of throwing', () => {
  for (const garbage of [null, undefined, '', 42, {}, [], 'ERR_', 'SOMETHING ELSE ENTIRELY']) {
    const result = engine.classifyBrowserError(garbage);
    assert.equal(result.id, 'unknown');
    assert.ok(result.recoveries.length >= 2, 'unknown still needs recovery steps');
  }
});

test('explainError fails closed to the honest unknown category', () => {
  for (const bad of ['nope', '', 42, null, undefined, {}, 'TLS ']) {
    const result = engine.explainError(bad);
    assert.equal(result.id, 'unknown');
    assert.equal(result.title, 'Something went wrong');
  }
  assert.equal(engine.explainError('unknown').id, 'unknown');
});

test('explainError returns copies, not live taxonomy arrays', () => {
  const first = engine.explainError('offline');
  first.recoveries.push('tampered');
  const second = engine.explainError('offline');
  assert.ok(!second.recoveries.includes('tampered'));
});

test('safeOrigin strips credentials, paths, queries and fragments', () => {
  assert.equal(engine.safeOrigin('https://user:pass@Site.example.com/a/b?token=sekret#frag'),
    'https://site.example.com');
  assert.equal(engine.safeOrigin('http://example.com:8080/x?y=1'), 'http://example.com:8080');
  assert.equal(engine.safeOrigin('http://example.com'), 'http://example.com');
  assert.equal(engine.safeOrigin('http://example.com:80/x'), 'http://example.com');
  assert.equal(engine.safeOrigin('https://example.com:443/x'), 'https://example.com');
  assert.equal(engine.safeOrigin('https://user@host'), 'https://host');
  // Unparsable or non-web input is omitted rather than echoed.
  assert.equal(engine.safeOrigin('javascript:alert(1)'), null);
  assert.equal(engine.safeOrigin('not a url'), null);
  assert.equal(engine.safeOrigin('ftp://example.com/x'), null);
  assert.equal(engine.safeOrigin(''), null);
  assert.equal(engine.safeOrigin(null), null);
});

test('classifyBrowserError reports a sanitized origin and status', () => {
  const result = engine.classifyBrowserError({
    code: 'ERR_NAME_NOT_RESOLVED',
    httpStatus: 404,
    url: 'https://site.example.com/page?token=sekret'
  });
  assert.equal(result.id, 'dns-not-found');
  assert.equal(result.origin, 'https://site.example.com');
  assert.equal(result.httpStatus, 404);
  const offline = engine.classifyBrowserError({ offline: true, httpStatus: 999 });
  assert.equal(offline.id, 'offline');
  assert.equal(offline.httpStatus, null);
});
