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
  assert.equal(logic.isValidTask({ ...base, reminderShownFire: '2026-10-05T13:30:00.000Z' }), true);
  assert.equal(logic.isValidTask({ ...base, reminderShownFire: 'not a date' }), false);

  const subtasks = [
    { id: 's1', title: 'Step one', done: false },
    { id: 's2', title: 'Step two', done: true }
  ];
  assert.equal(logic.isValidTask({ ...base, subtasks }), true);
  assert.equal(logic.isValidSubtasks(subtasks), true);
  assert.equal(logic.isValidSubtasks([...subtasks, { id: 's1', title: 'Duplicate', done: false }]), false);
  assert.equal(logic.isValidSubtasks([...subtasks, { id: 's3', title: '   ', done: false }]), false);
  assert.equal(logic.isValidSubtasks([...subtasks, { id: 's3', title: 'x'.repeat(121), done: false }]), false);
  assert.equal(logic.isValidSubtasks([...subtasks, { id: 's3', title: 'No state' }]), false);
  assert.equal(logic.isValidSubtasks(Array.from({ length: 21 }, (_, i) => ({ id: `s${i}`, title: `Step ${i}`, done: false }))), false);
  assert.equal(logic.isValidTask({ ...base, subtasks: [{ id: 's1', title: 'Only', done: false }] }), true);
});

test('legacy tasks without extended fields stay valid', () => {
  const legacy = task('legacy', 'Old task', { dueDate: TODAY });
  assert.equal(logic.isValidTask(legacy), true);
  const stored = logic.validateStoredTasks([legacy]);
  assert.equal(stored.tasks.length, 1);
  assert.equal(stored.rejectedCount, 0);
});

test('tags validate, normalize, and make tasks searchable', () => {
  const base = task('t', 'Task', { dueDate: TODAY });
  assert.equal(logic.isValidTask({ ...base, tags: ['work', 'errands-2'] }), true);
  assert.equal(logic.isValidTask({ ...base, tags: ['work'] }), true);
  assert.equal(logic.isValidTask({ ...base, tags: 'work' }), false);
  assert.equal(logic.isValidTask({ ...base, tags: ['Work'] }), false);
  assert.equal(logic.isValidTask({ ...base, tags: ['work', 'work'] }), false);
  assert.equal(logic.isValidTask({ ...base, tags: Array.from({ length: 6 }, (_, i) => `t${i}`) }), false);
  assert.equal(logic.isValidTask({ ...base, tags: ['x'.repeat(25)] }), false);
  assert.equal(logic.isValidTask({ ...base, tags: null }), true);
  assert.equal(logic.isTag('errands-2'), true);
  assert.equal(logic.isTag('Errands'), false);
  assert.deepEqual(logic.normalizeTags([' Work ', 'work', 'TO DO']), ['work', 'to-do']);
  assert.deepEqual(logic.normalizeTags(null), []);
  assert.throws(() => logic.normalizeTags(['x'.repeat(25)]));
  const tagged = { ...task('tagged', 'Buy groceries', { dueDate: TODAY }), tags: ['errands-2'] };
  const others = [task('other', 'Other'), tagged];
  assert.deepEqual(logic.getFilteredTasks(others, 'all', 'errands', TODAY).map((i) => i.id), ['tagged']);
  assert.deepEqual(logic.getFilteredTasks(others, 'all', 'groceries', TODAY).map((i) => i.id), ['tagged']);
});

test('search also matches notes and same-date tasks order by due time', () => {
  const withNotes = { ...task('n', 'Plain title'), notes: 'remember the éclair receipt' };
  const tasks = [task('a', 'Write report'), withNotes];
  assert.deepEqual(logic.getFilteredTasks(tasks, 'all', 'ÉCLAIR', TODAY).map((item) => item.id), ['n']);
  assert.deepEqual(logic.getFilteredTasks(tasks, 'all', 'plain', TODAY).map((item) => item.id), ['n']);

  const timed = [
    { ...task('late', 'Late today', { dueDate: TODAY }), dueTime: '18:00' },
    { ...task('early', 'Early today', { dueDate: TODAY }), dueTime: '08:00' },
    task('untimed', 'Untimed today', { dueDate: TODAY })
  ];
  assert.deepEqual(logic.getFilteredTasks(timed, 'all', '', TODAY).map((item) => item.id),
    ['early', 'late', 'untimed']);
});

test('shared task date contract matches the Java host implementation fixture', () => {
  const fixturePath = path.join(__dirname, '..', 'contracts', 'task-date-validation.tsv');
  const lines = fs.readFileSync(fixturePath, 'utf8').split(/\r?\n/);
  let cases = 0;
  for (const [index, line] of lines.entries()) {
    if (!line || line.startsWith('#')) continue;
    const columns = line.split('\t');
    assert.equal(columns.length, 2, `date fixture line ${index + 1} must have two columns`);
    assert.ok(columns[1] === 'true' || columns[1] === 'false',
      `date fixture line ${index + 1} must use a strict boolean`);
    assert.equal(logic.isDateOnly(columns[0]), columns[1] === 'true',
      `JavaScript date validation must match shared fixture line ${index + 1}`);
    cases += 1;
  }
  assert.equal(cases, 9, 'shared date contract must include all nine cases');
});

test('shared task instant contract matches Android strict instant validation', () => {
  const fixturePath = path.join(__dirname, '..', 'contracts', 'task-instant-validation.tsv');
  const lines = fs.readFileSync(fixturePath, 'utf8').split(/\r?\n/);
  let cases = 0;
  for (const [index, line] of lines.entries()) {
    if (!line || line.startsWith('#')) continue;
    const columns = line.split('\t');
    assert.equal(columns.length, 2, 'instant fixture line ' + (index + 1) + ' must have two columns');
    assert.ok(columns[1] === 'true' || columns[1] === 'false',
      'instant fixture line ' + (index + 1) + ' must use a strict boolean');
    const value = columns[0] === '~' ? '' : columns[0];
    assert.equal(logic.isValidInstant(value), columns[1] === 'true',
      'JavaScript instant validation must match shared fixture line ' + (index + 1));
    cases += 1;
  }
  assert.equal(cases, 58, 'shared instant contract must include all fifty-eight cases');
});

test('createdAt, updatedAt, and reminderShownFire use the same strict instant contract', () => {
  const valid = task('instant-fields', 'Instant fields');
  assert.equal(logic.isValidTask(valid), true);
  assert.equal(logic.isValidTask({ ...valid, createdAt: '2026-02-30T00:00:00Z' }), false);
  assert.equal(logic.isValidTask({ ...valid, updatedAt: '2026-11-10T10:00:00' }), false);
  assert.equal(logic.isValidTask({
    ...valid,
    reminderShownFire: '2026-11-10T10:00:00.1234567890Z'
  }), false);
  assert.equal(logic.isValidTask({
    ...valid,
    reminderShownFire: '2016-12-31T23:59:60Z'
  }), true);
});

test('instant comparison matches Java nanosecond, offset, and leap-second ordering', () => {
  assert.equal(logic.compareInstants('2026-11-10T10:00:00+05:30', '2026-11-10T04:30:00Z'), 0);
  assert.equal(logic.compareInstants('2026-11-10T10:00:00+01:30:15', '2026-11-10T08:29:45Z'), 0);
  assert.equal(logic.compareInstants('2026-11-10T10:00:00-00:00:30', '2026-11-10T10:00:30Z'), 0);
  assert.equal(logic.compareInstants('2026-11-10T10:00:00+18:00:00', '2026-11-09T16:00:00Z'), 0);
  assert.equal(logic.compareInstants('2026-11-10T10:00:00.000000001Z',
    '2026-11-10T10:00:00.000000002Z'), -1);
  assert.equal(logic.compareInstants('2016-12-31T23:59:60Z', '2016-12-31T23:59:59Z'), 0);
  assert.equal(logic.compareInstants('0000-01-01T00:00:00Z', '0001-01-01T00:00:00Z'), -1);
  assert.throws(() => logic.compareInstants('invalid', '2026-11-10T10:00:00Z'), /invalid task instants/);
});

test('duplicate JSON object keys are detected recursively without scanning string contents', () => {
  assert.equal(logic.hasDuplicateJsonKeys('{"title":"first","title":"last"}'), true);
  assert.equal(logic.hasDuplicateJsonKeys('[{"nested":{"id":1,"id":2}}]'), true);
  assert.equal(logic.hasDuplicateJsonKeys('{"a":1,"\\u0061":2}'), true);
  assert.equal(logic.hasDuplicateJsonKeys('{"one":{"id":1},"two":{"id":2}}'), false);
  assert.equal(logic.hasDuplicateJsonKeys('{"text":"{\\"id\\":1,\\"id\\":2}"}'), false);
  assert.equal(logic.hasDuplicateJsonKeys('{"a":1,"b":[true,null,2]}'), false);
  assert.equal(logic.hasDuplicateJsonKeys('{invalid'), false);
  const deeplyNested = '['.repeat(130) + '0' + ']'.repeat(130);
  assert.equal(logic.hasDuplicateJsonKeys(deeplyNested), true);
});


test('repeat metadata matches the shared Android/web validation contract', () => {
  const fixturePath = path.join(__dirname, '..', 'contracts', 'task-repeat-validation.tsv');
  const lines = fs.readFileSync(fixturePath, 'utf8').split(/\r?\n/);
  let cases = 0;
  for (const [index, line] of lines.entries()) {
    if (!line || line.startsWith('#')) continue;
    const fields = line.split('\t');
    assert.equal(fields.length, 4, 'repeat validation fixture line ' + (index + 1) + ' must have four columns');
    const [dueDate, repeatRule, anchorText, expectedText] = fields;
    const candidate = task('repeat-' + index, 'Repeat validation', {
      dueDate: dueDate === '-' ? null : dueDate
    });
    if (repeatRule !== '-') candidate.repeat = repeatRule;
    if (anchorText !== '-') candidate.repeatDayOfMonth = Number(anchorText);
    assert.equal(logic.isValidTask(candidate), expectedText === 'true',
      'repeat metadata validation must match fixture line ' + (index + 1));
    cases += 1;
  }
  assert.equal(cases, 19, 'shared repeat validation fixture covers every boundary case');
  const dated = task('repeat-string-anchor', 'Monthly task', { dueDate: '2026-02-28' });
  dated.repeat = 'monthly';
  dated.repeatDayOfMonth = '31';
  assert.equal(logic.isValidTask(dated), false, 'string anchors are not silently coerced');
  assert.equal(logic.isValidTask({ ...dated, repeatDayOfMonth: 31 }), true,
    'a numeric month-end anchor is valid after date clamping');
  assert.equal(logic.isValidTask({ ...dated, repeat: '', repeatDayOfMonth: null }), true,
    'the legacy empty repeat sentinel is treated as absent');
});
test('task ordering compares createdAt instants rather than their offset-bearing strings', () => {
  const earlier = task('earlier', 'Earlier instant', { createdAt: '2026-11-10T10:00:00+01:00' });
  const later = task('later', 'Later instant', { createdAt: '2026-11-10T09:30:00Z' });
  assert.deepEqual(logic.getFilteredTasks([later, earlier], 'all', '', TODAY).map((item) => item.id),
    ['earlier', 'later']);
});



test('expanded Java Instant years remain valid and sort without Date range loss', () => {
  const archiveMaximum = '+999999999-12-31T23:59:59.999999999+18:00';
  const sameLocalUtc = '+999999999-12-31T23:59:59.999999999Z';
  assert.equal(logic.isValidInstant(archiveMaximum), true);
  assert.equal(logic.isValidInstant('+1000000000-12-31T23:59:59.999999999Z'), true);
  assert.equal(logic.isValidInstant('+1000000001-01-01T00:00:00+18:00'), true);
  assert.equal(logic.isValidInstant('+1000000001-01-01T23:59:59+18:00'), false);
  assert.equal(logic.compareInstants(archiveMaximum, sameLocalUtc), -1);
  assert.equal(logic.compareInstants(
    '+1000000001-01-01T00:00:00+18:00',
    '+1000000000-12-31T06:00:00Z'), 0);
  assert.equal(logic.compareInstants(
    '-1000000001-12-31T23:59:59-18:00',
    '-1000000000-01-01T17:59:59Z'), 0);

  const tasks = [
    task('later-expanded', 'Later expanded year', { createdAt: sameLocalUtc }),
    task('archive-maximum', 'Portable backup maximum', { createdAt: archiveMaximum })
  ];
  assert.deepEqual(logic.getFilteredTasks(tasks, 'all', '', TODAY).map((item) => item.id),
    ['archive-maximum', 'later-expanded']);
  assert.equal(logic.isValidTask(tasks[1]), true);
});
