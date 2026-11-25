'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const focus = require('../focus-mode-logic.js');
const flags = require('../feature-flags-logic.js');
const logic = require('../task-logic.js');

test('focus-mode is a live, switchable feature flag now', () => {
  const flag = flags.FEATURE_FLAGS.filter((entry) => entry.id === 'focus-mode')[0];
  assert.equal(flag.kind, 'feature');
  const flagRest = flags.FEATURE_FLAGS.filter((entry) => entry.id !== 'focus-mode');
  assert.equal(flagRest.filter((entry) => entry.kind === 'feature').length, 6);
  assert.equal(flagRest.filter((entry) => entry.kind === 'planned').length, 0);
  const storage = storageWith({});
  const saved = flags.setFlag(storage, 'focus-mode', true);
  assert.equal(saved.ok, true);
  assert.equal(saved.flags['focus-mode'], true);
});

function storageWith(seed) {
  const data = new Map();
  for (const key of Object.keys(seed || {})) data.set(key, seed[key]);
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
}

function task(overrides) {
  return Object.assign({
    id: 't1',
    title: 'Write the report',
    dueDate: null,
    dueTime: undefined,
    priority: 'medium',
    completed: false,
    createdAt: '2026-11-01T09:00:00Z',
    updatedAt: '2026-11-01T09:00:00Z'
  }, overrides || {});
}

const TODAY = '2026-11-21';

test('constants are capped and pinned', () => {
  assert.equal(focus.FOCUS_FLAG_ID, 'focus-mode');
  assert.equal(focus.TASKS_STORAGE_KEY, 'daymark.tasks.v1');
  assert.equal(focus.MAX_PICK_ITEMS, 50);
  assert.equal(focus.MAX_OPTION_CHARS, 80);
});

test('entryPlan is honest about what the overlay does and does not do', () => {
  const plan = focus.entryPlan();
  assert.equal(plan.length, 4);
  assert.equal(plan.some((line) => line.indexOf('Nothing is written to storage until you mark the task complete') !== -1), true);
  assert.equal(plan.some((line) => line.indexOf('No timer, no network call') !== -1), true);
});

test('flagIsOn reads only a successful, explicitly-on flag read', () => {
  const on = flags.readFlags(storageWith({ 'daymark.features.v1': JSON.stringify({ 'focus-mode': true }) }));
  assert.equal(focus.flagIsOn(on), true);
  const off = flags.readFlags(storageWith({}));
  assert.equal(focus.flagIsOn(off), false);
  assert.equal(focus.flagIsOn(null), false);
  assert.equal(focus.flagIsOn({ ok: true, flags: {} }), false);
});

test('pickOpenTasks keeps open tasks ordered overdue, due date, priority, title', () => {
  const tasks = [
    task({ id: 'b', title: 'Mid', dueDate: '2026-11-22', priority: 'low' }),
    task({ id: 'a', title: 'Overdue', dueDate: '2026-11-01' }),
    task({ id: 'c', title: 'Later', dueDate: '2026-12-01', priority: 'high' }),
    task({ id: 'd', title: 'None' }),
    task({ id: 'e', title: 'Done', completed: true })
  ];
  const pick = focus.pickOpenTasks(tasks, TODAY);
  assert.equal(pick.ok, true);
  assert.deepEqual(pick.items.map((item) => item.id), ['a', 'b', 'c', 'd']);
  assert.equal(pick.truncated, false);
});

test('pickOpenTasks de-duplicates ids and skips malformed drafts', () => {
  const tasks = [task({ id: 'a' }), task({ id: 'a' }), { id: '', title: 'x' }, null, 'nope'];
  const pick = focus.pickOpenTasks(tasks, TODAY);
  assert.deepEqual(pick.items.map((item) => item.id), ['a']);
});

test('pickOpenTasks fails closed on a non-array or an unreadable today', () => {
  assert.equal(focus.pickOpenTasks('nope', TODAY).reason, 'tasks-unreadable');
  assert.equal(focus.pickOpenTasks([], '21-11-2026').reason, 'today-unreadable');
  assert.equal(focus.pickOpenTasks(null, TODAY).ok, false);
});

test('pickOpenTasks truncates at the 50-item cap and says so', () => {
  const tasks = [];
  for (let i = 0; i < 55; i += 1) tasks.push(task({ id: 't' + i, title: 'Task ' + i }));
  const pick = focus.pickOpenTasks(tasks, TODAY);
  assert.equal(pick.items.length, 50);
  assert.equal(pick.truncated, true);
});

test('pickOpenTasks labels the today-due task and truncates very long titles', () => {
  const pick = focus.pickOpenTasks([task({ dueDate: TODAY, title: 'Short' })], TODAY);
  assert.equal(pick.items[0].label, 'Short · due today');
  const long = focus.pickOpenTasks([task({ title: 'x'.repeat(120) })], TODAY);
  assert.equal(long.items[0].label.length, 80);
  assert.equal(long.items[0].label.charAt(79), '…');
  assert.equal(long.items[0].truncated, true);
});

test('describeTask speaks in plain words and caps long notes', () => {
  const described = focus.describeTask(task({
    dueDate: TODAY,
    dueTime: '09:30',
    tags: ['work'],
    subtasks: [{ id: 's1', title: 'Draft', done: false }, { id: 's2', title: 'Send', done: true }],
    notes: 'Prepared for the review.'
  }), TODAY);
  assert.equal(described.ok, true);
  assert.deepEqual(described.lines, [
    'Priority: medium.',
    'Due today.',
    'Time: 09:30.',
    'Tags: work.',
    'Steps: 1 of 2 still open.',
    'Notes: Prepared for the review.',
    'Status: still open.'
  ]);
  const longNotes = focus.describeTask(task({ notes: 'n'.repeat(700), dueDate: TODAY }), TODAY);
  assert.equal(longNotes.truncated, true);
  assert.equal(longNotes.lines[2].length, 600);
});

test('describeTask fails closed on malformed drafts', () => {
  assert.equal(focus.describeTask(null, TODAY).reason, 'task-unreadable');
  assert.equal(focus.describeTask({ id: '', title: 'x' }, TODAY).ok, false);
  assert.equal(focus.describeTask({ id: 'a', title: '   ' }, TODAY).ok, false);
});

test('completeTaskInSnapshot flips only the chosen task and stamps updatedAt', () => {
  const result = focus.completeTaskInSnapshot(
    [task(), task({ id: 't2', title: 'Other' })],
    't1',
    '2026-11-21T04:30:00Z'
  );
  assert.equal(result.ok, true);
  assert.equal(result.tasks[0].completed, true);
  assert.equal(result.tasks[0].updatedAt, '2026-11-21T04:30:00Z');
  assert.equal(result.tasks[1].completed, false);
  assert.equal(result.tasks[0].title, 'Write the report');
});

test('completeTaskInSnapshot never mutates the input records', () => {
  const original = task();
  const snapshot = JSON.stringify(original);
  focus.completeTaskInSnapshot([original], 't1', '2026-11-21T04:30:00Z');
  assert.equal(JSON.stringify(original), snapshot);
});

test('completeTaskInSnapshot fails closed on unknown, duplicated or unreadable input', () => {
  assert.equal(focus.completeTaskInSnapshot([task()], 'nope', '2026-11-21T04:30:00Z').reason, 'unknown-task');
  assert.equal(focus.completeTaskInSnapshot([task(), task()], 't1', '2026-11-21T04:30:00Z').reason, 'tasks-ambiguous');
  assert.equal(focus.completeTaskInSnapshot(null, 't1', '2026-11-21T04:30:00Z').reason, 'tasks-unreadable');
  assert.equal(focus.completeTaskInSnapshot([task()], 't1', '').reason, 'timestamp-unreadable');
});

test('the completed snapshot still validates with the shared task logic', () => {
  const result = focus.completeTaskInSnapshot([task()], 't1', '2026-11-21T04:30:00Z');
  const validated = logic.validateStoredTasks(result.tasks);
  assert.equal(validated.rejectedCount, 0);
  assert.equal(validated.tasks[0].completed, true);
});

test('every complete-error reason lands on a plain sentence', () => {
  for (const reason of ['storage-unavailable', 'generation-unreadable', 'cleared', 'clear-in-progress',
    'task-clear-in-progress', 'conflict', 'tasks-ambiguous', 'tasks-unreadable', 'generation-write-failed',
    'task-write-failed', 'lock-unavailable', 'lock-failed', 'invalid-timestamp', 'mystery']) {
    const message = focus.describeCompleteError(reason);
    assert.equal(typeof message, 'string');
    assert.equal(message.length > 20, true);
    assert.equal(message.indexOf('nothing was saved') !== -1 || message.indexOf('Exit, then try again') !== -1, true);
  }
});

test('every entry-error reason lands on a plain sentence', () => {
  for (const reason of ['flag-off', 'no-tasks', 'tasks-unavailable', 'tasks-unreadable', 'storage-unavailable', 'unknown-task', 'mystery']) {
    const message = focus.describeEntryError(reason);
    assert.equal(typeof message, 'string');
    assert.equal(message.length > 20, true);
  }
  assert.match(focus.describeEntryError('flag-off'), /Feature settings/);
});

test('describeTask labels an unknown priority as medium without throwing', () => {
  const described = focus.describeTask(task({ priority: 'urgent' }), TODAY);
  assert.equal(described.ok, true);
  assert.equal(described.lines[0], 'Priority: medium.');
});
