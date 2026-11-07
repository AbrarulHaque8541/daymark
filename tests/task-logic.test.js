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
  assert.equal(logic.isValidTask({ ...valid, completed: 'yes' }), false);
  assert.equal(logic.isValidTask({ ...valid, createdAt: 'not-a-date' }), false);
});

test('stored task validation rejects malformed records and duplicate ids', () => {
  const result = logic.validateStoredTasks([
    task('keep', 'Keep me'),
    { id: 'bad', title: '' },
    task('keep', 'Duplicate')
  ]);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].id, 'keep');
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

test('week filter returns open tasks due within the next seven days inclusive', () => {
  const tasks = [
    task('today-open', 'Write report', { dueDate: TODAY }),
    task('week-end', 'Review', { dueDate: '2026-10-11' }),
    task('beyond', 'Later', { dueDate: '2026-10-12' }),
    task('overdue', 'Old', { dueDate: '2026-10-01' }),
    task('done-in-week', 'Finished', { dueDate: '2026-10-06', completed: true }),
    task('undated', 'No date')
  ];
  assert.deepEqual(logic.getFilteredTasks(tasks, 'week', '', TODAY).map((item) => item.id), ['today-open', 'week-end']);
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

test('demo suggestions are deterministic, prioritize nearest dates, and skip completed tasks', () => {
  const tasks = [
    task('later', 'Plan launch', { dueDate: '2026-10-12', priority: 'high' }),
    task('undated', 'Sort inbox', { priority: 'high' }),
    task('today-low', 'Water plants', { dueDate: TODAY, priority: 'low' }),
    task('overdue', 'Pay invoice', { dueDate: '2026-10-01', priority: 'low' }),
    task('today-high', 'Call dentist', { dueDate: TODAY, priority: 'high' }),
    task('done', 'Already finished', { dueDate: '2026-10-01', priority: 'high', completed: true })
  ];
  const results = logic.getSuggestions(tasks, TODAY, (date) => date);
  assert.deepEqual(results.map(({ task: item }) => item.id), ['overdue', 'today-high', 'today-low']);
  assert.match(results[0].reason, /^Overdue/);
  assert.deepEqual(logic.getSuggestions(tasks, TODAY, (date) => date), results);
});

test('due times are strict HH:mm values that require a due date', () => {
  assert.equal(logic.isTimeOnly('14:30'), true);
  assert.equal(logic.isTimeOnly('00:00'), true);
  assert.equal(logic.isTimeOnly('23:59'), true);
  assert.equal(logic.isTimeOnly('24:00'), false);
  assert.equal(logic.isTimeOnly('9:30'), false);
  assert.equal(logic.isTimeOnly('14:3'), false);
  assert.equal(logic.isTimeOnly('14:60'), false);
  assert.equal(logic.isTimeOnly(1430), false);

  const base = task('t', 'Task', { dueDate: TODAY });
  assert.equal(logic.isValidTask({ ...base, dueTime: '14:30' }), true);
  assert.equal(logic.isValidTask({ ...base, dueTime: null }), true);
  assert.equal(logic.isValidTask({ ...base, dueTime: '8:15' }), false);
  assert.equal(logic.isValidTask({ ...base, dueTime: '14:30', dueDate: null }), false);
});

test('notes, reminders, and subtasks validate with bounded fields', () => {
  const base = task('t', 'Task');
  assert.equal(logic.isValidTask({ ...base, notes: 'remember this' }), true);
  assert.equal(logic.isValidTask({ ...base, notes: 'x'.repeat(4000) }), true);
  assert.equal(logic.isValidTask({ ...base, notes: 'x'.repeat(4001) }), false);
  assert.equal(logic.isValidTask({ ...base, notes: 42 }), false);

  for (const lead of [0, 30, 60, 1440]) {
    assert.equal(logic.isValidTask({ ...base, reminderLeadMinutes: lead }), true);
  }
  assert.equal(logic.isValidTask({ ...base, reminderLeadMinutes: null }), true);
  assert.equal(logic.isValidTask({ ...base, reminderLeadMinutes: 45 }), false);
  assert.equal(logic.isValidTask({ ...base, reminderShownFire: '2026-10-05T09:00:00.000Z' }), true);
  assert.equal(logic.isValidTask({ ...base, reminderShownFire: 'not-a-date' }), false);

  const subtasks = [
    { id: 's1', title: 'Draft outline', done: false },
    { id: 's2', title: 'Review', done: true }
  ];
  assert.equal(logic.isValidTask({ ...base, subtasks }), true);
  assert.equal(logic.isValidTask({ ...base, subtasks: subtasks.concat({ id: 's1', title: 'dup', done: false }) }), false);
  assert.equal(logic.isValidTask({ ...base, subtasks: Array.from({ length: 21 }, (_, i) => ({ id: String(i), title: 'x', done: false })) }), false);
});

test('tags are normalized, unique, and bounded', () => {
  assert.deepEqual(logic.normalizeTags([' Project ', 'project', 'A-1', 'a_2']), ['project', 'a-1', 'a_2']);
  assert.throws(() => logic.normalizeTags(['bad tag!']), /letters/);
  assert.throws(() => logic.normalizeTags(['x'.repeat(25)]), /at most/);
  const tooMany = Array.from({ length: 6 }, (_, i) => `t${i}`);
  assert.throws(() => logic.normalizeTags(tooMany), /at most/);

  const base = task('t', 'Task');
  assert.equal(logic.isValidTask({ ...base, tags: ['project', 'urgent'] }), true);
  assert.equal(logic.isValidTask({ ...base, tags: null }), true);
  assert.equal(logic.isValidTask({ ...base, tags: ['Bad Tag'] }), false);
});

test('search also matches notes and same-date tasks order by due time', () => {
  const tasks = [
    task('late', 'Standup', { dueDate: TODAY, dueTime: '15:00' }),
    task('early', 'Standup notes', { dueDate: TODAY, dueTime: '09:00', notes: 'bring slides' }),
    task('other', 'Other', { dueDate: TODAY })
  ];
  // force dueTime onto the objects for the test
  tasks[0].dueTime = '15:00';
  tasks[1].dueTime = '09:00';
  tasks[1].notes = 'bring slides';
  const results = logic.getFilteredTasks(tasks, 'all', 'slides', TODAY);
  assert.deepEqual(results.map((item) => item.id), ['early']);
  const ordered = logic.getFilteredTasks(tasks, 'today', '', TODAY);
  assert.deepEqual(ordered.map((item) => item.id), ['early', 'late', 'other']);
});

test('shared task date contract matches the Java host implementation fixture', () => {
  const fixturePath = path.join(__dirname, '..', 'android-app', 'app', 'src', 'androidTest', 'assets', 'schema-v1-task-snapshot.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  assert.equal(logic.isDateOnly(fixture.today), true);
  assert.equal(logic.isValidTask(fixture.tasks[0]), true);
});
