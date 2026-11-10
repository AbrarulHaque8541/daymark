'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../browser-data-logic.js');

test('catalog ids are stable and in card order', () => {
  assert.deepEqual(engine.CLEAR_ACTION_IDS, [
    'clear-completed',
    'clear-search',
    'webhook-clear-queue',
    'storage-clear-status',
    'import-merge',
    'export-backup',
    'clear-focus'
  ]);
});

test('every catalog entry is well formed and honest', () => {
  for (const id of engine.CLEAR_ACTION_IDS) {
    const entry = engine.explainClearAction(id);
    for (const field of ['label', 'title', 'summary', 'recovery', 'scope', 'network']) {
      assert.equal(typeof entry[field], 'string', id + ' must have a non-empty ' + field);
      assert.ok(entry[field].length > 0, id + ' ' + field + ' must not be empty');
    }
    assert.ok(Array.isArray(entry.removes), id + ' removes must be an array');
    for (const line of entry.removes) assert.equal(typeof line, 'string', id + ' removes must be strings');
    assert.ok(Array.isArray(entry.keeps) && entry.keeps.length > 0, id + ' must keep at least one thing');
    for (const line of entry.keeps) assert.ok(typeof line === 'string' && line.length > 0, id + ' keeps must be non-empty strings');
    assert.equal(typeof entry.recoverable, 'boolean', id + ' recoverable must be a boolean');
    assert.equal(typeof entry.deletesData, 'boolean', id + ' deletesData must be a boolean');
  }
});

test('an unknown action id fails closed to the honest unknown entry', () => {
  const result = engine.explainClearAction('definitely-not-an-action');
  assert.equal(result.id, 'unknown');
  assert.match(result.summary, /no honest description/);
  assert.ok(result.keeps.includes('Everything, out of caution'));
  assert.equal(result.deletesData, false);
});

test('explainClearAction returns defensive copies', () => {
  const first = engine.explainClearAction('clear-completed');
  first.removes.push('tampered');
  first.keeps.push('tampered');
  const second = engine.explainClearAction('clear-completed');
  assert.ok(!second.removes.includes('tampered'), 'removes must be a copy');
  assert.ok(!second.keeps.includes('tampered'), 'keeps must be a copy');
});

test('isKnownClearActionId accepts only catalog ids', () => {
  for (const id of engine.CLEAR_ACTION_IDS) assert.equal(engine.isKnownClearActionId(id), true, id);
  assert.equal(engine.isKnownClearActionId('nope'), false);
  assert.equal(engine.isKnownClearActionId(42), false);
  assert.equal(engine.isKnownClearActionId(null), false);
});

test('listClearActions exposes honest delete flags', () => {
  const actions = engine.listClearActions();
  assert.equal(actions.length, engine.CLEAR_ACTION_IDS.length);
  const clearCompleted = actions.find((action) => action.id === 'clear-completed');
  assert.ok(clearCompleted, 'clear-completed must be listed');
  assert.equal(clearCompleted.deletesData, true);
  assert.equal(actions.find((action) => action.id === 'clear-search').deletesData, false);
});

test('planClearSequence approves export before delete with no warnings', () => {
  const plan = engine.planClearSequence(['export-backup', 'clear-completed']);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ids, ['export-backup', 'clear-completed']);
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.warnings.length, 0);
  assert.equal(plan.note, 'Daymark runs nothing automatically; this plan only explains.');
});

test('planClearSequence warns when data is deleted with no export first', () => {
  const plan = engine.planClearSequence(['clear-completed']);
  assert.equal(plan.ok, true);
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0], /no Export step before it/);
});

test('planClearSequence does not demand an export for delete-free actions', () => {
  const plan = engine.planClearSequence(['clear-search']);
  assert.equal(plan.ok, true);
  assert.equal(plan.warnings.length, 0);
});

test('planClearSequence rejects plans containing unknown actions', () => {
  const plan = engine.planClearSequence(['export-backup', 'nope']);
  assert.equal(plan.ok, false);
  assert.match(plan.error, /Unknown clear action/);
  assert.equal(plan.steps.length, 0);
  assert.ok(!plan.ids.includes('nope'));
});

test('planClearSequence deduplicates while preserving order', () => {
  const plan = engine.planClearSequence(['clear-search', 'clear-search', 'export-backup']);
  assert.deepEqual(plan.ids, ['clear-search', 'export-backup']);
  assert.equal(plan.steps.length, 2);
});

test('planClearSequence fails closed on non-array input', () => {
  const plan = engine.planClearSequence('clear-completed');
  assert.equal(plan.ok, false);
  assert.match(plan.error, /needs a list of action ids/);
});

test('planClearSequence fails closed on an empty list', () => {
  const plan = engine.planClearSequence([]);
  assert.equal(plan.ok, false);
  assert.match(plan.error, /at least one known action/);
});
