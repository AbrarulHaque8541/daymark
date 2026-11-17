'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../tls-gate-logic.js');

test('TLS failure ids are stable, known and uniquely labelled', () => {
  assert.deepEqual(engine.TLS_FAILURE_IDS, [
    'cert-date-invalid', 'cert-authority-invalid', 'cert-name-mismatch',
    'cert-revoked', 'cert-protocol', 'cert-generic'
  ]);
  const scenarios = engine.listTlsScenarios();
  assert.equal(scenarios.length, engine.TLS_FAILURE_IDS.length);
  const labels = new Set(scenarios.map((s) => s.label));
  assert.equal(labels.size, scenarios.length, 'labels must be unique');
  for (const scenario of scenarios) {
    assert.ok(engine.isKnownTlsId(scenario.id), scenario.id + ' must be a known id');
  }
});

test('every TLS failure entry is complete, dangerous and non-bypassable', () => {
  const severities = new Set(['info', 'warn', 'danger']);
  for (const id of engine.TLS_FAILURE_IDS) {
    const entry = engine.TLS_FAILURES[id];
    assert.ok(entry.title && entry.title.length > 3, id + ' needs a title');
    assert.ok(entry.summary && entry.summary.length > 20, id + ' needs a real summary');
    assert.ok(Array.isArray(entry.recoveries) && entry.recoveries.length >= 2,
      id + ' needs at least two recovery steps');
    assert.equal(entry.severity, 'danger', id + ' is always a danger-severity failure');
    assert.equal(engine.explainTlsFailure(id).bypassable, false,
      id + ' must never be presented as bypassable');
    assert.ok(entry.recoveries.some((step) => /[Gg]o back/.test(step)),
      id + ' must always offer going back as the safe choice');
  }
});

test('certificate error codes map to the right categories', () => {
  const cases = [
    ['ERR_CERT_DATE_INVALID', 'cert-date-invalid'],
    ['err_cert_date_invalid', 'cert-date-invalid'],
    ['ERR_CERT_AUTHORITY_INVALID', 'cert-authority-invalid'],
    ['ERR_CERT_WEAK_SIGNATURE_ALGORITHM', 'cert-authority-invalid'],
    ['ERR_CERT_COMMON_NAME_INVALID', 'cert-name-mismatch'],
    ['ERR_CERT_REVOKED', 'cert-revoked'],
    ['ERR_SSL_PROTOCOL_ERROR', 'cert-protocol'],
    ['ERR_CERT_ERROR', 'cert-generic'],
    ['ERR_SSL_HANDSHAKE_FAILURE', 'cert-generic']
  ];
  for (const [code, expected] of cases) {
    assert.equal(engine.classifyTlsCode(code), expected, code);
  }
});

test('non-certificate codes classify as null, not as a guessed category', () => {
  assert.equal(engine.classifyTlsCode('ERR_NAME_NOT_RESOLVED'), null);
  assert.equal(engine.classifyTlsCode('ERR_TIMED_OUT'), null);
  assert.equal(engine.classifyTlsCode('SOMETHING ELSE'), null);
  assert.equal(engine.classifyTlsCode(''), null);
  assert.equal(engine.classifyTlsCode(null), null);
  assert.equal(engine.classifyTlsCode(42), null);
});

test('explainTlsFailure fails closed to the honest generic category', () => {
  for (const bad of ['nope', '', 42, null, undefined, {}, 'ERR_NAME_NOT_RESOLVED']) {
    const result = engine.explainTlsFailure(bad);
    assert.equal(result.id, 'cert-generic');
    assert.equal(result.title, 'Connection not trusted');
    assert.equal(result.bypassable, false);
    assert.ok(result.recoveries.length >= 2, 'generic still needs recovery steps');
  }
});

test('explainTlsFailure returns copies, not live arrays', () => {
  const first = engine.explainTlsFailure('cert-date-invalid');
  first.recoveries.push('tampered');
  const second = engine.explainTlsFailure('cert-date-invalid');
  assert.ok(!second.recoveries.includes('tampered'));
});

test('consent states are stable and the undecided gate plans no network', () => {
  assert.deepEqual(engine.CONSENT_STATES, ['undecided', 'offline', 'online']);
  const undecided = engine.planConsentGate('undecided');
  assert.equal(undecided.state, 'undecided');
  assert.match(undecided.networkNote, /No network access is planned/);
  assert.ok(undecided.blocked.some((line) => /nothing is sent anywhere/.test(line)));
});

test('the online gate keeps TLS and updater guarantees even with consent', () => {
  const online = engine.planConsentGate('online');
  assert.ok(online.blocked.some((line) => /never overrides TLS/.test(line)));
  assert.ok(online.blocked.some((line) => /HTTPS-only/.test(line)));
  assert.match(online.networkNote, /nothing loads past a broken certificate check/);
});

test('planConsentGate fails closed: unknown states are undecided, never online', () => {
  for (const bad of ['nope', '', 42, null, undefined, {}, 'ONLINE ']) {
    const result = engine.planConsentGate(bad);
    assert.equal(result.state, 'undecided');
    assert.match(result.networkNote, /No network access is planned/);
  }
});

test('planConsentGate returns copies, not live gate arrays', () => {
  const first = engine.planConsentGate('offline');
  first.allowed.push('tampered');
  const second = engine.planConsentGate('offline');
  assert.ok(!second.allowed.includes('tampered'));
});

test('canTransition only allows explicit target states and never throws', () => {
  for (const from of engine.CONSENT_STATES.concat(['garbage', null, 42])) {
    for (const to of engine.CONSENT_STATES) {
      assert.equal(engine.canTransition(from, to), true, from + ' -> ' + to);
    }
    assert.equal(engine.canTransition(from, 'garbage'), false);
    assert.equal(engine.canTransition(from, undefined), false);
  }
});

test('safeOrigin strips credentials, paths, queries and fragments', () => {
  assert.equal(engine.safeOrigin('https://user:pass@Site.example.com/a/b?token=sekret#frag'),
    'https://site.example.com');
  assert.equal(engine.safeOrigin('http://example.com:8080/x?y=1'), 'http://example.com:8080');
  assert.equal(engine.safeOrigin('https://example.com:443/x'), 'https://example.com');
  assert.equal(engine.safeOrigin('javascript:alert(1)'), null);
  assert.equal(engine.safeOrigin('ftp://example.com/x'), null);
  assert.equal(engine.safeOrigin(''), null);
  assert.equal(engine.safeOrigin(null), null);
});

test('planTlsJourney combines a sanitized origin, TLS plan and gate plan', () => {
  const result = engine.planTlsJourney({
    code: 'ERR_CERT_COMMON_NAME_INVALID',
    url: 'https://site.example.com/page?token=sekret',
    consentState: 'online'
  });
  assert.equal(result.tls.id, 'cert-name-mismatch');
  assert.equal(result.origin, 'https://site.example.com');
  assert.equal(result.gate.state, 'online');
  assert.equal(result.bypassable, false);
  const offline = engine.planTlsJourney('ERR_CERT_REVOKED');
  assert.equal(offline.tls.id, 'cert-revoked');
  assert.equal(offline.gate.state, 'undecided', 'a bare code leaves the gate undecided');
  assert.equal(offline.origin, null);
  const garbage = engine.planTlsJourney(null);
  assert.equal(garbage.tls.id, 'cert-generic');
  assert.equal(garbage.gate.state, 'undecided');
});
