'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const logic = require('../browser-proxy-failures-logic.js');

const EXPECTED_IDS = [
  'proxy-unreachable',
  'auth-required',
  'bypass-rules',
  'dns-leak',
  'tls-interception',
  'session-reset'
];

test('the playbook exposes exactly the six fixed scenarios in a stable order', () => {
  assert.deepEqual(logic.listScenarios().map((s) => s.id), EXPECTED_IDS);
  for (const scenario of logic.listScenarios()) {
    assert.equal(typeof scenario.title, 'string');
    assert.ok(scenario.title.length > 0);
  }
});

test('every scenario documents behavior, recovery and honest limits', () => {
  for (const id of EXPECTED_IDS) {
    const plan = logic.explainScenario(id);
    assert.ok(plan, id + ' must be explained');
    for (const key of ['behavior', 'recovery', 'limits']) {
      assert.ok(Array.isArray(plan[key]) && plan[key].length > 0, id + '.' + key + ' must be non-empty');
      for (const line of plan[key]) {
        assert.equal(typeof line, 'string');
        assert.ok(line.trim().length > 0);
      }
    }
  }
});

test('the unreachable-proxy playbook promises no silent direct fallback', () => {
  const plan = logic.explainScenario('proxy-unreachable');
  const all = plan.behavior.concat(plan.recovery).join(' ');
  assert.ok(all.indexOf('never silently falls back') !== -1);
});

test('the auth playbook states WebView shows no proxy login prompt', () => {
  const plan = logic.explainScenario('auth-required');
  const all = plan.behavior.concat(plan.limits).join(' ');
  assert.ok(all.indexOf('does not show a proxy login prompt') !== -1);
});

test('the DNS playbook distinguishes local and remote resolution', () => {
  const plan = logic.explainScenario('dns-leak');
  const all = plan.behavior.join(' ');
  assert.ok(all.indexOf('resolved on this device first') !== -1);
  assert.ok(all.indexOf('remote DNS') !== -1);
});

test('the TLS playbook never offers a certificate bypass', () => {
  const plan = logic.explainScenario('tls-interception');
  const all = plan.behavior.concat(plan.limits).join(' ');
  assert.ok(all.indexOf('never bypasses certificate failures') !== -1);
  assert.ok(all.indexOf('no setting') !== -1);
});

test('the session-reset playbook states nothing is restored on its own', () => {
  const plan = logic.explainScenario('session-reset');
  const all = plan.behavior.concat(plan.limits).join(' ');
  assert.ok(all.indexOf('Nothing is restored on its own') !== -1);
});

test('explainScenario returns copies, not live catalog objects', () => {
  const plan = logic.explainScenario('bypass-rules');
  const originalLength = plan.behavior.length;
  plan.behavior.push('mutated');
  const fresh = logic.explainScenario('bypass-rules');
  assert.equal(fresh.behavior.length, originalLength);
  assert.ok(fresh.behavior.indexOf('mutated') === -1);
});

test('unknown or invalid scenario ids fail closed to null', () => {
  assert.equal(logic.explainScenario('no-such-scenario'), null);
  assert.equal(logic.explainScenario(''), null);
  assert.equal(logic.explainScenario(null), null);
  assert.equal(logic.explainScenario(undefined), null);
  assert.equal(logic.explainScenario(42), null);
});

test('isBypassed matches an exact host rule', () => {
  assert.deepEqual(
    logic.isBypassed('intranet.corp.example', ['intranet.corp.example']),
    { ok: true, bypassed: true, matchedRule: 'intranet.corp.example', skippedRules: 0 }
  );
});

test('isBypassed leading-dot rule matches the apex and subdomains only', () => {
  assert.equal(logic.isBypassed('example.com', ['.example.com']).bypassed, true);
  assert.equal(logic.isBypassed('shop.example.com', ['.example.com']).bypassed, true);
  assert.equal(logic.isBypassed('notexample.com', ['.example.com']).bypassed, false);
  assert.equal(logic.isBypassed('example.org', ['.example.com']).bypassed, false);
});

test('isBypassed loopback hosts always bypass with an honest label', () => {
  for (const host of ['localhost', 'box.localhost', '127.0.0.1', '[::1]']) {
    const result = logic.isBypassed(host, []);
    assert.equal(result.ok, true, host);
    assert.equal(result.bypassed, true, host);
    assert.ok(result.matchedRule.indexOf('loopback') !== -1, host);
  }
});

test('isBypassed fails closed on a host it cannot validate', () => {
  for (const host of ['', '   ', 'bad host', 'host/path', 'host:8080', null, undefined, 5]) {
    const result = logic.isBypassed(host, ['example.com']);
    assert.equal(result.ok, false, String(host) + ' must not get a bypass decision');
    assert.equal(result.bypassed, undefined, String(host) + ' must not leak a decision field');
  }
});

test('isBypassed skips and counts entries it cannot understand', () => {
  const result = logic.isBypassed('good.example', ['*.example.com', 'good.example', '']);
  assert.equal(result.ok, true);
  assert.equal(result.bypassed, true);
  assert.equal(result.matchedRule, 'good.example');
  assert.equal(result.skippedRules, 2);
});

test('isBypassed fails closed when the rule list is not an array', () => {
  const result = logic.isBypassed('example.com', '.example.com');
  assert.equal(result.ok, false);
  assert.equal(result.bypassed, undefined);
});

test('an empty rule list bypasses nothing', () => {
  assert.deepEqual(
    logic.isBypassed('example.com', []),
    { ok: true, bypassed: false, matchedRule: null, skippedRules: 0 }
  );
});

test('the module stays offline and loads without a DOM', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'browser-proxy-failures-logic.js'), 'utf8');
  assert.equal(source.indexOf('fetch('), -1, 'must not call fetch');
  assert.equal(source.indexOf('XMLHttpRequest'), -1, 'must not use XMLHttpRequest');
  const context = {};
  context.globalThis = context;
  assert.doesNotThrow(() => vm.runInNewContext(source, context));
  assert.equal(typeof context.globalThis.DaymarkBrowserProxyFailures.explainScenario, 'function');
});

test('the module exposes its API', () => {
  assert.equal(typeof logic.listScenarios, 'function');
  assert.equal(typeof logic.explainScenario, 'function');
  assert.equal(typeof logic.isBypassed, 'function');
  assert.deepEqual(logic.SCENARIO_IDS, EXPECTED_IDS);
});
