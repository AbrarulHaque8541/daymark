'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const exporter = require('../export-logic.js');

const fixturePath = path.join(__dirname, '..', 'contracts', 'task-export-fixture.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function baseTask(overrides) {
  return Object.assign({
    id: 'task-1',
    title: 'Write tests',
    dueDate: null,
    dueTime: null,
    priority: 'medium',
    completed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    notes: '',
    repeat: null,
    repeatDayOfMonth: null,
    tags: [],
    subtasks: []
  }, overrides);
}

test('fixture: web export matches the shared Android/web contract byte for byte', () => {
  assert.equal(fixture.version, 1);
  const meta = { generatedAt: fixture.generatedAt };
  assert.equal(exporter.render('markdown', fixture.tasks, meta), fixture.expected.markdown);
  assert.equal(exporter.render('csv', fixture.tasks, meta), fixture.expected.csv);
  assert.equal(exporter.render('ics', fixture.tasks, meta), fixture.expected.ics);
});

test('formats, extensions, and mime types', () => {
  assert.deepEqual(exporter.FORMATS, ['markdown', 'csv', 'ics']);
  assert.ok(exporter.isFormat('markdown'));
  assert.ok(!exporter.isFormat('json'));
  assert.equal(exporter.extension('markdown'), 'md');
  assert.equal(exporter.extension('csv'), 'csv');
  assert.equal(exporter.extension('ics'), 'ics');
  assert.equal(exporter.mimeType('markdown'), 'text/markdown;charset=utf-8');
  assert.equal(exporter.mimeType('csv'), 'text/csv;charset=utf-8');
  assert.equal(exporter.mimeType('ics'), 'text/calendar;charset=utf-8');
  assert.equal(exporter.fileName('ics', '2026-11-02'), 'daymark-tasks-2026-11-02.ics');
  assert.equal(exporter.fileName('csv', 'nope'), 'daymark-tasks-undated.csv');
  assert.throws(() => exporter.render('json', [], { generatedAt: '2026-01-01T00:00:00.000Z' }), /Unsupported export format/);
  assert.throws(() => exporter.extension('pdf'), /Unsupported export format/);
});

test('sort order: open before completed, due date/time nulls last, priority, created instant, id', () => {
  const tasks = [
    baseTask({ id: 'b-completed', completed: true, priority: 'high' }),
    baseTask({ id: 'c-no-due', priority: 'high' }),
    baseTask({ id: 'a-due', dueDate: '2026-03-01', priority: 'low' }),
    baseTask({ id: 'd-due-time', dueDate: '2026-03-01', dueTime: '09:00', priority: 'low' })
  ];
  assert.deepEqual(exporter.sortTasks(tasks).map((t) => t.id), ['d-due-time', 'a-due', 'c-no-due', 'b-completed']);
  // createdAt compared as an instant, not lexicographically
  const instants = [
    baseTask({ id: 'z', createdAt: '2026-01-01T00:00:00Z' }),
    baseTask({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' })
  ];
  const sorted = exporter.sortTasks(instants).map((t) => t.id);
  assert.deepEqual(sorted, ['a', 'z'], 'equal instants fall back to id order');
});

test('validation rejects malformed tasks and lone surrogates', () => {
  assert.throws(() => exporter.validateExportTasks('nope'), /array of tasks/);
  assert.throws(() => exporter.validateExportTasks([baseTask({ id: '' })]), /id must not be empty/);
  assert.throws(() => exporter.validateExportTasks([baseTask({ title: '   ' })]), /title must not be blank/);
  assert.throws(() => exporter.validateExportTasks([baseTask({ dueDate: '2026-02-30' })]), /YYYY-MM-DD/);
  assert.throws(() => exporter.validateExportTasks([baseTask({ dueTime: '25:00' })]), /HH:mm/);
  assert.throws(() => exporter.validateExportTasks([baseTask({ priority: 'urgent' })]), /low, medium or high/);
  assert.throws(() => exporter.validateExportTasks([baseTask({ completed: 'yes' })]), /boolean/);
  assert.throws(() => exporter.validateExportTasks([baseTask({ createdAt: 'not-a-date' })]), /createdAt/);
  assert.throws(() => exporter.validateExportTasks([baseTask({ tags: 'x' })]), /tags must be an array/);
  assert.throws(() => exporter.validateExportTasks([baseTask({ subtasks: [{ id: 's', title: 't', done: 'yes' }] })]), /done flag/);
  assert.throws(() => exporter.validateExportTasks([baseTask({ title: 'bad \uD800 surrogate' })]), /lone surrogate/);
  assert.throws(() => exporter.validateExportTasks([baseTask({ notes: 'x', tags: ['\uDC00'] })]), /lone surrogate/);
});

test('validation normalizes optional fields', () => {
  const [task] = exporter.validateExportTasks([{ id: 't', title: 'T', priority: 'low', completed: false, createdAt: '2026-01-01T00:00:00.000Z' }]);
  assert.equal(task.dueDate, null);
  assert.equal(task.dueTime, null);
  assert.equal(task.notes, '');
  assert.equal(task.repeat, null);
  assert.equal(task.repeatDayOfMonth, null);
  assert.deepEqual(task.tags, []);
  assert.deepEqual(task.subtasks, []);
  assert.equal(task.updatedAt, task.createdAt);
});

test('markdown escapes backslash and asterisk, renders checklist and notes', () => {
  assert.equal(exporter.mdEscape('a\\b*c'), 'a\\\\b\\*c');
  const out = exporter.toMarkdown([baseTask({
    id: 'm1',
    title: 'Star *task*',
    notes: 'line one\nline two',
    tags: ['work'],
    subtasks: [{ id: 's1', title: 'Sub \\one', done: true }]
  })], { generatedAt: '2026-11-02T12:00:00.000Z' });
  assert.ok(out.includes('- [ ] **Star \\*task\\*** · medium priority · #work'));
  assert.ok(out.includes('  line one\n  line two'));
  assert.ok(out.includes('  - [x] Sub \\\\one'));
  assert.ok(out.startsWith('# Daymark tasks\n_Exported 2026-11-02T12:00:00.000Z · 1 task_\n'));
});

test('markdown of zero tasks has a header only', () => {
  const out = exporter.toMarkdown([], { generatedAt: '2026-11-02T12:00:00.000Z' });
  assert.equal(out, '# Daymark tasks\n_Exported 2026-11-02T12:00:00.000Z · 0 tasks_\n');
});

test('csv quoting follows RFC 4180 and subtasks embed JSON', () => {
  assert.equal(exporter.csvQuote('plain'), 'plain');
  assert.equal(exporter.csvQuote('a,b'), '"a,b"');
  assert.equal(exporter.csvQuote('say "hi"'), '"say ""hi"""');
  assert.equal(exporter.csvQuote('a\r\nb'), '"a\r\nb"');
  assert.equal(exporter.subtasksJson([{ id: 's1', title: 'Do "it"\nnow', done: false }]),
    '[{"id":"s1","title":"Do \\"it\\"\\nnow","done":false}]');
  const out = exporter.toCsv([baseTask({ id: 'c1', title: 'A, B', notes: 'n1\nn2', tags: ['a', 'b'] })], { generatedAt: '2026-01-01T00:00:00.000Z' });
  const lines = out.split('\r\n');
  assert.equal(lines[0], exporter.CSV_HEADER);
  assert.ok(lines[1].startsWith('c1,"A, B",,'));
  assert.ok(lines[1].includes('"n1\nn2"'));
  assert.ok(lines[1].includes(',a b,'));
  assert.ok(out.endsWith('\r\n'));
});

test('ics escaping, date stamp, and DTSTART forms', () => {
  assert.equal(exporter.icsEscapeText('a\\b;c,d\ne\r\nf\rg'), 'a\\\\b\\;c\\,d\\ne\\nf\\ng');
  assert.equal(exporter.icsDateStamp('2026-11-02T12:00:00.000Z'), '20261102T120000Z');
  assert.equal(exporter.icsDateStamp('1999-01-05T01:02:03Z'), '19990105T010203Z');
  const withDate = exporter.toIcs([baseTask({ id: 'e1', dueDate: '2026-11-05' })], { generatedAt: '2026-11-02T12:00:00.000Z' });
  assert.ok(withDate.includes('DTSTART;VALUE=DATE:20261105\r\n'));
  const withTime = exporter.toIcs([baseTask({ id: 'e2', dueDate: '2026-11-05', dueTime: '14:30' })], { generatedAt: '2026-11-02T12:00:00.000Z' });
  assert.ok(withTime.includes('DTSTART:20261105T143000\r\n'));
  const done = exporter.toIcs([baseTask({ id: 'e3', completed: true })], { generatedAt: '2026-11-02T12:00:00.000Z' });
  assert.ok(done.includes('X-DAYMARK-COMPLETED:TRUE\r\n'));
  assert.ok(done.includes('UID:e3@daymark.export\r\n'));
  assert.ok(done.includes('DTSTAMP:20261102T120000Z\r\n'));
  assert.ok(done.endsWith('END:VCALENDAR\r\n'));
});

test('ics folding keeps every physical line within 75 UTF-8 octets and unfolds losslessly', () => {
  const emoji = '🎉';
  const longTitle = 'T'.repeat(70) + emoji + 'x'.repeat(40);
  const ics = exporter.toIcs([baseTask({ id: 'f1', title: longTitle, notes: 'n'.repeat(200) })], { generatedAt: '2026-11-02T12:00:00.000Z' });
  const physical = ics.split('\r\n');
  for (const line of physical.slice(0, -1)) {
    const octets = Array.from(line).reduce((sum, ch) => sum + exporter.utf8Octets(ch.codePointAt(0)), 0);
    assert.ok(octets <= 75, `line exceeds 75 octets: ${octets}`);
  }
  // unfolding (drop CRLF + single leading space) restores each logical line
  const unfolded = ics.slice(0, -2).replace(/\r\n /g, '');
  assert.ok(unfolded.includes('SUMMARY:' + exporter.icsEscapeText(longTitle)));
  assert.ok(physical.some((line) => line.length > 1 && line[0] === ' '), 'continuation lines start with a space');
  assert.deepEqual(exporter.foldLine('x'.repeat(75)), ['x'.repeat(75)]);
  assert.deepEqual(exporter.foldLine('x'.repeat(76)), ['x'.repeat(75), ' x']);
  // a 4-octet emoji is never split across a fold boundary
  const tricky = 'y'.repeat(73) + emoji + 'z'.repeat(10);
  const folded = exporter.foldLine(tricky);
  assert.ok(folded.every((line) => !line.includes('\uD83C') || line.includes(emoji)));
});

test('output size cap throws instead of producing a huge payload', () => {
  assert.equal(exporter.MAX_EXPORT_CHARS, 2000000);
  assert.equal(exporter.enforceCap('ok'), 'ok');
  assert.throws(() => exporter.enforceCap('x'.repeat(exporter.MAX_EXPORT_CHARS + 1)), /safe size limit/);
});

test('renderers enforce the cap on real output', () => {
  const meta = { generatedAt: '2026-01-01T00:00:00.000Z' };
  const huge = [baseTask({ id: 'huge', title: 'Big', notes: 'n'.repeat(4000) })];
  for (let i = 0; i < 520; i += 1) huge.push(baseTask({ id: 'huge-' + i, title: 't'.repeat(40), notes: 'n'.repeat(3900) }));
  assert.throws(() => exporter.toMarkdown(huge, meta), /safe size limit/);
  assert.throws(() => exporter.toCsv(huge, meta), /safe size limit/);
  assert.throws(() => exporter.toIcs(huge, meta), /safe size limit/);
});

test('generatedAt is required and must be a parseable instant', () => {
  assert.throws(() => exporter.toCsv([baseTask({})], {}), /generatedAt/);
  assert.throws(() => exporter.toIcs([baseTask({})], { generatedAt: 'yesterday' }), /generatedAt/);
  assert.throws(() => exporter.render('markdown', [baseTask({})], null), /generatedAt/);
});


test('monthly/yearly recurrence anchors validate and survive open-format export', () => {
  const meta = { generatedAt: '2026-11-02T12:00:00.000Z' };
  const clamped = baseTask({
    id: 'clamped-month',
    dueDate: '2026-11-30',
    repeat: 'monthly',
    repeatDayOfMonth: 31
  });
  const [normalized] = exporter.validateExportTasks([clamped]);
  assert.equal(normalized.repeatDayOfMonth, 31);
  assert.ok(exporter.toMarkdown([clamped], meta).includes('repeats monthly · repeat day 31'));
  const csv = exporter.toCsv([clamped], meta).split('\r\n');
  assert.equal(csv[0], exporter.CSV_HEADER);
  assert.equal(csv[1].split(',').at(-1), '31');
  assert.ok(exporter.toIcs([clamped], meta).includes('Repeats: monthly'));

  const legacy = baseTask({ dueDate: '2026-11-30', repeat: 'monthly' });
  assert.equal(exporter.validateExportTasks([legacy])[0].repeatDayOfMonth, 30,
    'legacy monthly records without an anchor derive it from the due date');
  assert.equal(exporter.validateExportTasks([baseTask({
    dueDate: '2025-02-28', repeat: 'yearly', repeatDayOfMonth: 29
  })])[0].repeatDayOfMonth, 29, 'a clamped February 29 yearly anchor is retained');

  assert.throws(() => exporter.validateExportTasks([baseTask({ dueDate: '2026-11-30', repeat: 'hourly' })]), /repeat rule/);
  assert.throws(() => exporter.validateExportTasks([baseTask({ dueDate: '2026-11-30', repeat: 'monthly', repeatDayOfMonth: 32 })]), /repeatDayOfMonth/);
  assert.throws(() => exporter.validateExportTasks([baseTask({ dueDate: '2024-02-28', repeat: 'yearly', repeatDayOfMonth: 29 })]), /yearly repeatDayOfMonth/);
  assert.throws(() => exporter.validateExportTasks([baseTask({ dueDate: '2026-11-30', repeatDayOfMonth: 31 })]), /requires a monthly or yearly/);
  assert.throws(() => exporter.validateExportTasks([baseTask({ repeat: 'daily' })]), /repeat rule/);
});


test('open-format export rejects task instants outside the shared contract', () => {
  assert.throws(() => exporter.validateExportTasks([baseTask({ createdAt: '2026-11-10T10:00:00' })]), /createdAt/);
  assert.throws(() => exporter.validateExportTasks([baseTask({ updatedAt: '2026-02-30T00:00:00Z' })]), /updatedAt/);
  assert.throws(() => exporter.validateExportTasks([
    baseTask({ reminderShownFire: '2026-11-10T10:00:00.1234567890Z' })
  ]), /reminderShownFire/);
  assert.equal(exporter.validateExportTasks([
    baseTask({ reminderShownFire: '2016-12-31T23:59:60Z' })
  ]).length, 1);
});

test('open-format export sorting preserves nanoseconds and Java leap-second ordering', () => {
  const precise = exporter.sortTasks([
    baseTask({ id: 'late', createdAt: '2026-11-10T10:00:00.000000002Z' }),
    baseTask({ id: 'early', createdAt: '2026-11-10T10:00:00.000000001Z' })
  ]);
  assert.deepEqual(precise.map((task) => task.id), ['early', 'late']);
  const equivalent = exporter.sortTasks([
    baseTask({ id: 'z-offset', createdAt: '2026-11-10T10:00:00+05:30' }),
    baseTask({ id: 'a-utc', createdAt: '2026-11-10T04:30:00Z' })
  ]);
  assert.deepEqual(equivalent.map((task) => task.id), ['a-utc', 'z-offset']);
  assert.equal(exporter.sortTasks([
    baseTask({ id: 'leap', createdAt: '2016-12-31T23:59:60Z' }),
    baseTask({ id: 'normal', createdAt: '2016-12-31T23:59:59Z' })
  ])[0].id, 'leap');
});

test('browser loads task logic before open-format export logic and export UI', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const taskLogic = html.indexOf('<script src="task-logic.js" defer></script>');
  const exportLogic = html.indexOf('<script src="export-logic.js" defer></script>');
  const exportUi = html.indexOf('<script src="export-ui.js" defer></script>');
  assert.ok(taskLogic >= 0 && exportLogic > taskLogic && exportUi > exportLogic);
});
