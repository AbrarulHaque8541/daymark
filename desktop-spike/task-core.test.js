const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./task-core.js');

test('normalizes titles and rejects empty, non-text, and oversized input', () => {
  assert.equal(core.normalizeTitle('  Plan the week  '), 'Plan the week');
  assert.throws(() => core.normalizeTitle('  '), /Enter a task title/);
  assert.throws(() => core.normalizeTitle(null), /must be text/);
  assert.throws(() => core.normalizeTitle('x'.repeat(161)), /160 characters/);
});

test('creates a new open task with stable supplied identity', () => {
  assert.deepEqual(core.createTask('Review notes', 'id-1'), {
    id: 'id-1', title: 'Review notes', done: false
  });
  assert.throws(() => core.createTask('Review notes', ''), /ID is required/);
});

test('completes and reopens only the selected task without mutating source list', () => {
  const first = core.createTask('First', '1');
  const second = core.createTask('Second', '2');
  const original = [first, second];
  const completed = core.setTaskDone(original, '1', true);
  assert.equal(completed[0].done, true);
  assert.equal(completed[1], second);
  assert.equal(original[0].done, false);
  assert.equal(core.setTaskDone(completed, '1', false)[0].done, false);
  assert.throws(() => core.setTaskDone(original, 'missing', true), /no longer exists/);
});

test('filters open, completed and all tasks deterministically', () => {
  const tasks = [
    core.createTask('Open item', '1'),
    Object.freeze({ id: '2', title: 'Done item', done: true })
  ];
  assert.deepEqual(core.filterTasks(tasks, 'open').map((task) => task.id), ['1']);
  assert.deepEqual(core.filterTasks(tasks, 'done').map((task) => task.id), ['2']);
  assert.deepEqual(core.filterTasks(tasks, 'all').map((task) => task.id), ['1', '2']);
  assert.throws(() => core.filterTasks(tasks, 'unknown'), /Unknown task filter/);
});

test('deletes the selected task and leaves the original list intact', () => {
  const tasks = [core.createTask('Keep', '1'), core.createTask('Remove', '2')];
  assert.deepEqual(core.removeTask(tasks, '2').map((task) => task.id), ['1']);
  assert.equal(tasks.length, 2);
});
