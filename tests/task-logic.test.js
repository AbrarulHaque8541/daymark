const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const logic = require('../task-logic.js');

const TODAY = '2026-10-05';

function task(id, title, { dueDate = null, priority = 'medium', completed = false, createdAt = `${id}-created`, estimatedMinutes } = {}) {
  const timestamp = '2026-10-05T00:00:00.000Z';
  return { id, title, dueDate, priority, completed, createdAt: createdAt.includes('T') ? createdAt : timestamp, updatedAt: timestamp, ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}) };
}

test('date-only values reject impossible calendar dates', () => {
  assert.equal(logic.isDateOnly('2026-10-05'), true);
  assert.equal(logic.isDateOnly('2024-02-29'), true);
  assert.equal(logic.isDateOnly('0001-01-01'), true);
  assert.equal(logic.isDateOnly('0099-12-31'), true);
  assert.equal(logic.isDateOnly('2026-02-29'), false);
  assert.equal(logic.isDateOnly('2026-13-01'), false);
  assert.equal(logic.isDateOnly('2026-00-01'), false);
  assert.equal(logic.isDateOnly('2026-01-00'), false);
  assert.equal(logic.isDateOnly('2026-01-32'), false);
  assert.equal(logic.isDateOnly('2026-10-05T00:00:00.000Z'), false);
  assert.equal(logic.isDateOnly('2026/10/05'), false);
  assert.equal(logic.isDateOnly('26-10-05'), false);
});

test('task validation accepts well-formed tasks and rejects structural failures', () => {
  const valid = task('one', 'Review notes', { dueDate: TODAY, priority: 'high' });
  assert.equal(logic.isValidTask(valid), true);
  assert.equal(logic.isValidTask({ ...valid, title: '   ' }), false);
  assert.equal(logic.isValidTask({ ...valid, priority: 'urgent' }), false);
  assert.equal(logic.isValidTask({ ...valid, dueDate: '2026-02-29' }), false);
  assert.equal(logic.isValidTask({ ...valid, createdAt: 'not-a-date' }), false);
  assert.equal(logic.isValidTask({ ...valid, notes: 'x'.repeat(logic.MAX_NOTES_CHARS + 1) }), false);
  assert.equal(logic.isValidTask({ ...valid, subtasks: [{ id: 's', title: 'ok', done: true }] }), true);
  assert.equal(logic.isValidTask({ ...valid, tags: ['work', 'urgent-1'] }), true);
  assert.equal(logic.isValidTask({ ...valid, tags: ['Work'] }), false);
});

test('date filters preserve completed tasks while Completed collects them all', () => {
  const tasks = [
    task('today-open', 'Open today', { dueDate: TODAY }),
    task('today-done', 'Done today', { dueDate: TODAY, completed: true }),
    task('overdue-open', 'Open overdue', { dueDate: '2026-10-01' }),
    task('later-done', 'Done later', { dueDate: '2026-10-12', completed: true })
  ];
  assert.deepEqual(logic.getFilteredTasks(tasks, 'today', '', TODAY).map((t) => t.id), ['today-open']);
  assert.deepEqual(logic.getFilteredTasks(tasks, 'overdue', '', TODAY).map((t) => t.id), ['overdue-open']);
  assert.deepEqual(logic.getFilteredTasks(tasks, 'completed', '', TODAY).map((t) => t.id).sort(), ['later-done', 'today-done']);
});

test('title search is case-insensitive and composes with the active filter using deterministic lowercasing', () => {
  const tasks = [
    task('a', 'Review NOTES', { dueDate: TODAY }),
    task('b', 'notes for launch', { dueDate: '2026-10-12' }),
    task('c', 'Other', { dueDate: TODAY })
  ];
  assert.deepEqual(logic.getFilteredTasks(tasks, 'today', 'notes', TODAY).map((t) => t.id), ['a']);
  assert.deepEqual(logic.getFilteredTasks(tasks, 'all', 'NOTES', TODAY).map((t) => t.id), ['a', 'b']);
});

test('suggestions prefer dated tasks, then time, then priority, and limit to three', () => {
  const tasks = [
    task('later', 'Plan launch', { dueDate: '2026-10-12', priority: 'high' }),
    task('undated', 'Sort inbox', { priority: 'high' }),
    task('today-low', 'Water plants', { dueDate: TODAY, priority: 'low' }),
    task('overdue', 'Pay invoice', { dueDate: '2026-10-01', priority: 'low' }),
    task('today-high', 'Ship', { dueDate: TODAY, priority: 'high' }),
    task('today-med', 'Review', { dueDate: TODAY, priority: 'medium' })
  ];
  const suggestions = logic.getSuggestions(tasks, TODAY, (d) => d);
  assert.deepEqual(suggestions.map((s) => s.task.id), ['overdue', 'today-high', 'today-med']);
  assert.match(suggestions[0].reason, /Overdue/);
  assert.match(suggestions[1].reason, /Due today/);
});

test('estimatedMinutes is optional and bounded when present', () => {
  const valid = task('est', 'Quick review');
  assert.equal(logic.isValidTask({ ...valid, estimatedMinutes: 25 }), true);
  assert.equal(logic.isValidTask({ ...valid, estimatedMinutes: null }), true);
  assert.equal(logic.isValidTask({ ...valid, estimatedMinutes: undefined }), true);
  assert.equal(logic.isValidTask({ ...valid, estimatedMinutes: 0 }), false);
  assert.equal(logic.isValidTask({ ...valid, estimatedMinutes: 481 }), false);
  assert.equal(logic.isValidTask({ ...valid, estimatedMinutes: 25.5 }), false);
  assert.equal(logic.isValidEstimatedMinutes(25), true);
  assert.equal(logic.isValidEstimatedMinutes(null), true);
});

test('suggestion reason includes estimated minutes when set', () => {
  const today = '2026-11-06';
  const withEst = task('est', 'Review notes', { dueDate: today, priority: 'high', estimatedMinutes: 15 });
  const without = task('noest', 'Other', { dueDate: today });
  const suggestions = logic.getSuggestions([withEst, without], today, (d) => d);
  const estSuggestion = suggestions.find((s) => s.task.id === 'est');
  assert.match(estSuggestion.reason, /~15m/);
  const noEst = suggestions.find((s) => s.task.id === 'noest');
  assert.doesNotMatch(noEst.reason, /~\d+m/);
});
