'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../permission-lifecycle-logic.js');

test('state ids are stable and in card order', () => {
  assert.deepEqual(engine.PERMISSION_STATE_IDS, [
    'granted',
    'denied-once',
    'denied-permanent',
    'revoked-settings',
    'site-reset'
  ]);
});

test('every catalog entry is well formed and honest', () => {
  for (const id of engine.PERMISSION_STATE_IDS) {
    const entry = engine.explainPermissionState(id);
    for (const field of ['label', 'title', 'summary', 'recovery', 'userAction', 'scope', 'network']) {
      assert.equal(typeof entry[field], 'string', id + ' must have a non-empty ' + field);
      assert.ok(entry[field].length > 0, id + ' ' + field + ' must not be empty');
    }
    assert.ok(Array.isArray(entry.stillWorks) && entry.stillWorks.length > 0, id + ' must keep at least one working thing');
    for (const line of entry.stillWorks) assert.ok(typeof line === 'string' && line.length > 0, id + ' stillWorks must be non-empty strings');
    assert.ok(Array.isArray(entry.lost), id + ' lost must be an array');
    for (const line of entry.lost) assert.equal(typeof line, 'string', id + ' lost must be strings');
    assert.equal(typeof entry.promptsAgain, 'boolean', id + ' promptsAgain must be a boolean');
    assert.equal(typeof entry.available, 'boolean', id + ' available must be a boolean');
    assert.equal(typeof entry.deletesData, 'boolean', id + ' deletesData must be a boolean');
  }
});

test('an unknown state id fails closed to the honest unknown entry', () => {
  const result = engine.explainPermissionState('definitely-not-a-state');
  assert.equal(result.id, 'unknown');
  assert.match(result.summary, /no honest description/);
  assert.ok(result.stillWorks.includes('Everything, out of caution'));
  assert.equal(result.deletesData, false);
  assert.equal(result.available, false);
});

test('explainPermissionState returns defensive copies', () => {
  const first = engine.explainPermissionState('granted');
  first.stillWorks.push('tampered');
  first.lost.push('tampered');
  const second = engine.explainPermissionState('granted');
  assert.ok(!second.stillWorks.includes('tampered'), 'stillWorks must be a copy');
  assert.ok(!second.lost.includes('tampered'), 'lost must be a copy');
});

test('isKnownPermissionState accepts only catalog ids', () => {
  for (const id of engine.PERMISSION_STATE_IDS) assert.equal(engine.isKnownPermissionState(id), true, id);
  assert.equal(engine.isKnownPermissionState('nope'), false);
  assert.equal(engine.isKnownPermissionState(42), false);
  assert.equal(engine.isKnownPermissionState(null), false);
});

test('listPermissionStates exposes honest flags', () => {
  const states = engine.listPermissionStates();
  assert.equal(states.length, engine.PERMISSION_STATE_IDS.length);
  const granted = states.find((state) => state.id === 'granted');
  assert.ok(granted, 'granted must be listed');
  assert.equal(granted.available, true);
  assert.equal(granted.promptsAgain, false);
  assert.equal(granted.deletesData, false);
  assert.equal(states.find((state) => state.id === 'denied-once').promptsAgain, true);
  assert.equal(states.find((state) => state.id === 'denied-permanent').promptsAgain, false);
  const siteReset = states.find((state) => state.id === 'site-reset');
  assert.ok(siteReset, 'site-reset must be listed');
  assert.equal(siteReset.deletesData, true);
  assert.equal(siteReset.promptsAgain, true);
});

test('denied-once explains that Android can prompt again', () => {
  const entry = engine.explainPermissionState('denied-once');
  assert.equal(entry.promptsAgain, true);
  assert.match(entry.summary, /does not treat one refusal as permanent/);
  assert.match(entry.recovery, /choose Allow when the prompt appears/);
  assert.ok(entry.lost.some((line) => /this one request/i.test(line)));
});

test('denied-permanent says only settings can restore the capability', () => {
  const entry = engine.explainPermissionState('denied-permanent');
  assert.equal(entry.promptsAgain, false);
  assert.match(entry.summary, /retrying inside Daymark cannot fix it/);
  assert.match(entry.recovery, /Android Settings/);
  assert.match(entry.recovery, /turn the capability back on/);
});

test('revoked-settings reassures that stored tasks survive a revoke', () => {
  const entry = engine.explainPermissionState('revoked-settings');
  assert.equal(entry.deletesData, false);
  assert.match(entry.summary, /stops working at once/);
  assert.match(entry.recovery, /are not deleted by revoking a permission/);
  assert.ok(entry.stillWorks.some((line) => /tasks, notes, Focus timer/.test(line)));
});

test('site-reset is scoped to one site and discloses the data cost', () => {
  const entry = engine.explainPermissionState('site-reset');
  assert.equal(entry.deletesData, true);
  assert.match(entry.summary, /Other sites and the rest of Daymark keep working/);
  assert.match(entry.recovery, /cleared site data is not part of a Daymark export/);
  assert.equal(entry.scope, 'That one site only');
});

test('planRecoveryPath warns that a site reset clears data Daymark cannot restore', () => {
  const plan = engine.planRecoveryPath(['site-reset']);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ids, ['site-reset']);
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0], /clears site data/);
  assert.match(plan.warnings[0], /not part of a Daymark export/);
  assert.match(plan.note, /does not change any Android or browser setting/);
});

test('planRecoveryPath does not warn for delete-free states', () => {
  const plan = engine.planRecoveryPath(['granted', 'denied-once']);
  assert.equal(plan.ok, true);
  assert.equal(plan.warnings.length, 0);
  assert.equal(plan.steps.length, 2);
  assert.match(plan.steps[0], /changes no stored data/);
});

test('planRecoveryPath rejects paths containing unknown states', () => {
  const plan = engine.planRecoveryPath(['granted', 'nope']);
  assert.equal(plan.ok, false);
  assert.match(plan.error, /Unknown permission state/);
  assert.equal(plan.steps.length, 0);
  assert.ok(!plan.ids.includes('nope'));
});

test('planRecoveryPath deduplicates while preserving order', () => {
  const plan = engine.planRecoveryPath(['denied-once', 'denied-once', 'granted']);
  assert.deepEqual(plan.ids, ['denied-once', 'granted']);
  assert.equal(plan.steps.length, 2);
});

test('planRecoveryPath fails closed on non-array input', () => {
  const plan = engine.planRecoveryPath('granted');
  assert.equal(plan.ok, false);
  assert.match(plan.error, /needs a list of state ids/);
});

test('planRecoveryPath fails closed on an empty list', () => {
  const plan = engine.planRecoveryPath([]);
  assert.equal(plan.ok, false);
  assert.match(plan.error, /at least one known state/);
});
