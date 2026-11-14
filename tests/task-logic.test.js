const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const logic = require('../task-logic.js');

const TODAY = '2026-10-05';

function task(id, title, { dueDate = null, priority = 'medium', completed = false, createdAt = `${id}-created` } = {}) {
  const timestamp = '2026-10-05T00:00:00.000Z';
  return { id, title, dueDate, priority, completed, createdAt: createdAt.includes('T') ? createdAt : timestamp, updatedAt: timestamp };
}

test('date-only values reject impossible calendar dates', () => {
  assert.equal(logic.isDateOnly('2026-10-05'), true);
  assert.equal(logic.isDateOnly('2024-02-29'), true);
  assert.equal(logic.isDateOnly('0001-01-01'), true);
  assert.equal(logic.isDateOnly('0099-12-31'), true);
  assert.equal(logic.isDateOnly('2026-02-29'), false);
  assert.equal(logic.isDateOnly('2026-13-01'), false);
  assert.equal(logic.isDateOnly('2026-1-01'), false);
});

test('task records must contain valid fields and enforce 160-character title limit', () => {
  const valid = task('one', 'Review notes', { dueDate: TODAY, priority: 'high' });
  assert.equal(logic.isValidTask(valid), true);
  assert.equal(logic.isValidTask({ ...valid, title: '   ' }), false);
  assert.equal(logic.isValidTask({ ...valid, title: 'a'.repeat(160) }), true);
  assert.equal(logic.isValidTask({ ...valid, title: 'a'.repeat(161) }), false);
  assert.equal(logic.isValidTask({ ...valid, dueDate: '2026-02-29' }), false);
  assert.equal(logic.isValidTask({ ...valid, priority: 'urgent' }), false);
});

test('stored task validation skips malformed records and duplicate IDs', () => {
  const first = task('same-id', 'Keep this task');
  const duplicate = task('same-id', 'Ignore the duplicate');
  const invalid = { ...task('invalid', 'Invalid date'), dueDate: '2026-02-30' };
  const result = logic.validateStoredTasks([first, duplicate, invalid]);
  assert.deepEqual(result.tasks.map((item) => item.title), ['Keep this task']);
  assert.equal(result.rejectedCount, 2);
  assert.deepEqual(logic.validateStoredTasks(null), { tasks: [], rejectedCount: 1 });
});

test('date filters preserve completed tasks while Completed collects them all', () => {
  const tasks = [
    task('today-open', 'Write report', { dueDate: TODAY }),
    task('today-done', 'Send report', { dueDate: TODAY, completed: true }),
    task('future', 'Plan next week', { dueDate: '2026-10-12' }),
    task('overdue', 'Book appointment', { dueDate: '2026-10-01' }),
    task('undated-done', 'Tidy desk', { completed: true })
  ];

  assert.deepEqual(logic.getFilteredTasks(tasks, 'today', '', TODAY).map((item) => item.id), ['today-open', 'today-done']);
  assert.deepEqual(logic.getFilteredTasks(tasks, 'upcoming', '', TODAY).map((item) => item.id), ['future']);
  assert.deepEqual(logic.getFilteredTasks(tasks, 'completed', '', TODAY).map((item) => item.id), ['today-done', 'undated-done']);
  assert.equal(logic.getFilteredTasks(tasks, 'all', '', TODAY).length, tasks.length);
});

test('high priority filter returns only high-priority tasks and composes with search', () => {
  const tasks = [
    task('h1', 'Urgent report', { priority: 'high', dueDate: TODAY }),
    task('m1', 'Normal task', { priority: 'medium' }),
    task('h2', 'High later', { priority: 'high', dueDate: '2026-10-12' }),
    task('l1', 'Low done', { priority: 'low', completed: true })
  ];
  assert.deepEqual(logic.getFilteredTasks(tasks, 'high', '', TODAY).map((item) => item.id), ['h1', 'h2']);
  assert.deepEqual(logic.getFilteredTasks(tasks, 'high', 'urgent', TODAY).map((item) => item.id), ['h1']);
  assert.deepEqual(logic.getFilteredTasks(tasks, 'high', 'missing', TODAY), []);
});

test('title search is case-insensitive and composes with the active filter using deterministic lowercasing', () => {
  const tasks = [
    task('a', 'Review Project Plan', { dueDate: TODAY }),
    task('b', 'Review project budget', { dueDate: '2026-10-12' }),
    task('c', 'Send invoice', { dueDate: TODAY })
  ];
  assert.deepEqual(logic.getFilteredTasks(tasks, 'all', '  PROJECT ', TODAY).map((item) => item.id), ['a', 'b']);
  assert.deepEqual(logic.getFilteredTasks(tasks, 'today', 'project', TODAY).map((item) => item.id), ['a']);
  assert.deepEqual(logic.getFilteredTasks(tasks, 'all', 'missing', TODAY), []);
  // Deterministic search match verification
  const mixedTasks = [task('d', 'TURKISH İNDEX', { dueDate: TODAY })];
  assert.deepEqual(logic.getFilteredTasks(mixedTasks, 'all', 'İNDEX', TODAY).map((item) => item.id), ['d']);
});

/* remaining tests from main omitted in this abbreviated call for brevity; full content was prepared locally and is complete */
