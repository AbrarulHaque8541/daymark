'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const importer = require('../import-logic.js');
const exporter = require('../export-logic.js');
const logic = require('../task-logic.js');

const NOW = '2026-11-07T05:00:00.000Z';

function freshCtx() {
  let n = 0;
  return { now: NOW, makeId: () => 'gen-' + String(++n), hasDuplicateJsonKeys: logic.hasDuplicateJsonKeys };
}

const sampleTasks = [
  {
    id: 't1',
    title: 'Ship *v1.6* now',
    dueDate: '2026-11-30',
    dueTime: '09:30',
    priority: 'high',
    completed: false,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-02T11:00:00.000Z',
    notes: 'Two lines\nof notes',
    repeat: 'monthly',
    repeatDayOfMonth: 31,
    tags: ['work', 'release'],
    subtasks: [{ id: 's1', title: 'Push the tag', done: true }]
  },
  {
    id: 't2',
    title: 'Back\\slash old thing',
    dueDate: '2026-10-02',
    dueTime: null,
    priority: 'low',
    completed: true,
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    notes: '',
    repeat: null,
    tags: [],
    subtasks: []
  }
];

test('the module exposes its API', () => {
  assert.equal(typeof importer.fromCsv, 'function');
  assert.equal(typeof importer.fromMarkdown, 'function');
  assert.equal(typeof importer.mergeTasks, 'function');
  assert.equal(importer.LEGACY_CSV_HEADER, 'id,title,dueDate,dueTime,priority,completed,repeat,tags,notes,subtasks,createdAt,updatedAt');
  assert.equal(importer.STORAGE_KEY, undefined);
  assert.deepEqual(importer.FORMATS, ['csv', 'markdown', 'ics']);
  assert.equal(importer.CSV_HEADER, exporter.CSV_HEADER,
    'import and export must agree on the CSV header');
  assert.equal(typeof globalThis.DaymarkImport, 'object');
});

test('parseCsv handles quotes, escapes, CR/LF ends and drops blank rows', () => {
  const rows = importer.parseCsv('a,b,c\r\"x,y\",,z\r\r\"q\"\"r\",s,t\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x,y', '', 'z'], ['q\"r', 's', 't']]);
  assert.throws(() => importer.parseCsv('\"unterminated,b'), /unterminated/);
  assert.throws(() => importer.parseCsv('x'.repeat(importer.MAX_IMPORT_CHARS + 1)), /safe size limit/);
  assert.throws(() => importer.parseCsv(42), /must be a string/);
});

test('CSV export output round-trips through fromCsv unchanged', () => {
  const csv = exporter.toCsv(sampleTasks, { generatedAt: NOW });
  const result = importer.fromCsv(csv, freshCtx());
  assert.equal(result.skippedRows, 0);
  assert.deepEqual(result.tasks, exporter.sortTasks(sampleTasks));
});

test('markdown export output round-trips through fromMarkdown', () => {
  const md = exporter.toMarkdown(sampleTasks, { generatedAt: NOW });
  const result = importer.fromMarkdown(md, freshCtx());
  assert.equal(result.skippedRows, 0);
  assert.equal(result.tasks.length, 2);
  const first = result.tasks[0];
  assert.equal(first.title, 'Ship *v1.6* now');
  assert.equal(first.dueDate, '2026-11-30');
  assert.equal(first.dueTime, '09:30');
  assert.equal(first.priority, 'high');
  assert.equal(first.completed, false);
  assert.equal(first.repeat, 'monthly');
  assert.equal(first.repeatDayOfMonth, 31, 'clamped monthly anchor survives Markdown round-trip');
  assert.deepEqual(first.tags, ['work', 'release']);
  assert.equal(first.notes, 'Two lines\nof notes');
  assert.deepEqual(first.subtasks.map((sub) => sub.title), ['Push the tag']);
  assert.equal(first.subtasks[0].done, true);
  assert.match(first.id, /^gen-/, 'markdown tasks get fresh ids');
  assert.equal(first.createdAt, NOW, 'markdown carries no timestamps, so now() is used');
  assert.equal(first.updatedAt, NOW);
  const second = result.tasks[1];
  assert.equal(second.title, 'Back\\slash old thing');
  assert.equal(second.completed, true);
  assert.equal(second.dueDate, '2026-10-02');
});

test('fromCsv skips malformed rows and fills lenient defaults', () => {
  const rows = [
    ['', '', '', '', '', 'false', '', '', '', '[]', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', ''],
    ['k1', 'Foreign row', 'not-a-date', '25:99', 'urgent', '1', 'sometimes', 'bad-tag! GoodTag', 'x', '[]', '', '', '']
  ];
  const csv = importer.CSV_HEADER + '\r\n'
    + rows.map((row) => row.join(',')).join('\r\n') + '\r\n'
    + 'short,row\r\n';
  const result = importer.fromCsv(csv, freshCtx());
  assert.equal(result.skippedRows, 2, 'blank title and wrong width rows are skipped');
  assert.equal(result.tasks.length, 1);
  const task = result.tasks[0];
  assert.equal(task.id, 'k1');
  assert.equal(task.title, 'Foreign row');
  assert.equal(task.dueDate, null, 'invalid date becomes no due date');
  assert.equal(task.dueTime, null, 'a due time without a valid due date is dropped');
  assert.equal(task.priority, 'medium', 'unknown priority falls back to medium');
  assert.equal(task.completed, true, 'completed accepts 1 as well as true');
  assert.equal(task.repeat, 'sometimes', 'unknown repeat metadata is preserved for validation rather than silently dropped');
  assert.equal(importer.mergeTasks([], [task], logic).invalid, 1, 'invalid recurrence metadata is rejected before storage');
  assert.deepEqual(task.tags, ['goodtag'], 'invalid tags are dropped, valid ones kept');
  assert.equal(task.createdAt, NOW, 'an empty createdAt falls back to now()');
});

test('fromCsv preserves explicit malformed timestamps for shared validation instead of replacing them', () => {
  const invalidCreatedAt = 'not-a-date';
  const invalidUpdatedAt = '2026-11-10 10:00:00Z';
  const row = (id, title, createdAt, updatedAt) => [
    id, title, '', '', 'medium', 'false', '', '', '', '[]', createdAt, updatedAt, ''
  ].join(',');
  const csv = importer.CSV_HEADER + '\n'
    + row('bad-created', 'Bad created timestamp', invalidCreatedAt, NOW) + '\n'
    + row('bad-updated', 'Bad updated timestamp', NOW, invalidUpdatedAt);
  const parsed = importer.fromCsv(csv, freshCtx());

  assert.equal(parsed.skippedRows, 0);
  assert.equal(parsed.tasks.length, 2);
  assert.equal(parsed.tasks[0].createdAt, invalidCreatedAt);
  assert.equal(parsed.tasks[1].updatedAt, invalidUpdatedAt);

  const merged = importer.mergeTasks([], parsed.tasks, logic);
  assert.equal(merged.invalid, 2, 'the shared strict validator rejects both explicit malformed instants');
  assert.equal(merged.added.length, 0, 'invalid timestamps never enter the stored task list');
});

test('mergeTasks requires the shared task validator and fails closed when it is absent', () => {
  assert.throws(() => importer.mergeTasks([], []), /shared task validator/);
  assert.throws(() => importer.mergeTasks([], [], {}), /shared task validator/);
});

test('fromCsv skips malformed or duplicate-key subtask JSON instead of silently dropping subtasks', () => {
  const cell = (value) => {
    const text = String(value);
    const cr = String.fromCharCode(13);
    const lf = String.fromCharCode(10);
    return text.includes('"') || text.includes(',') || text.includes(cr) || text.includes(lf)
      ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  const row = (id, title, subtasks) => [
    id, title, '', '', 'medium', 'false', '', '', '', subtasks, NOW, NOW, ''
  ].map(cell).join(',');
  const duplicate = '[{"id":"s1","title":"First","title":"Overwritten","done":false}]';
  const malformed = '[{"id":"s2"';
  const valid = '[{"id":"s3","title":"Keep me","done":false}]';
  const crlf = String.fromCharCode(13, 10);
  const csv = [
    importer.CSV_HEADER,
    row('duplicate-subtask', 'Duplicate subtask keys', duplicate),
    row('malformed-subtask', 'Malformed subtask JSON', malformed),
    row('valid-subtask', 'Valid subtasks', valid)
  ].join(crlf) + crlf;
  const result = importer.fromCsv(csv, freshCtx());
  assert.equal(result.skippedRows, 2, 'ambiguous or malformed nested JSON skips the whole CSV row');
  assert.equal(result.tasks.length, 1);
  assert.deepEqual(result.tasks[0].subtasks.map((subtask) => subtask.title), ['Keep me']);
});

test('fromCsv rejects a wrong header instead of guessing columns', () => {
  assert.throws(() => importer.fromCsv('id,title\r\n1,2', freshCtx()), /does not match the Daymark export header/);
  assert.throws(() => importer.fromCsv('', freshCtx()), /empty/);
});

test('fromMarkdown parses notes, subtasks and ignores unknown parts', () => {
  const md = '# Daymark tasks\n_Exported ' + NOW + ' · 1 task_\n\n'
    + '- [ ] **Just a title** · medium priority · unknown part\n'
    + '  First note\n'
    + '  - [x] Step one\n'
    + '  - [ ] Step two\n';
  const result = importer.fromMarkdown(md, freshCtx());
  assert.equal(result.skippedRows, 0);
  assert.equal(result.tasks.length, 1);
  const task = result.tasks[0];
  assert.equal(task.title, 'Just a title');
  assert.equal(task.priority, 'medium');
  assert.equal(task.notes, 'First note');
  assert.deepEqual(task.subtasks.map((sub) => sub.done), [true, false]);
  assert.deepEqual(task.subtasks.map((sub) => sub.title), ['Step one', 'Step two']);
});

test('mdUnescape reverses the export escapes', () => {
  assert.equal(importer.mdUnescape('a\\*b\\\\c'), 'a*b\\c');
  assert.equal(importer.mdUnescape('plain'), 'plain');
});

test('mergeTasks keeps existing ids, skips duplicates and invalid tasks', () => {
  const existing = [{ id: 't1', title: 'Existing one', dueDate: null, priority: 'medium', completed: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }];
  const imported = exporter.sortTasks(sampleTasks);
  const result = importer.mergeTasks(existing, imported, logic);
  assert.equal(result.added.length, 1, 't2 is new');
  assert.equal(result.duplicates, 1, 't1 already exists and is never overwritten');
  assert.equal(result.invalid, 0);
  assert.equal(result.merged.length, 2);
  assert.equal(result.merged[0].title, 'Existing one');

  const broken = [{ id: 'x', title: 'Bad createdAt', dueDate: null, priority: 'medium', completed: false, createdAt: 'nope', updatedAt: 'nope' }];
  const invalid = importer.mergeTasks([], broken, logic);
  assert.equal(invalid.invalid, 1);
  assert.equal(invalid.added.length, 0);

  assert.throws(() => importer.mergeTasks(null, [], logic), /array of existing/);
  assert.throws(() => importer.mergeTasks([], null, logic), /array of imported/);
});

test('file-name detection routes only open formats to the importer', () => {
  assert.equal(importer.formatFromFileName('daymark-tasks-2026-11-07.csv'), 'csv');
  assert.equal(importer.formatFromFileName('plan.MD'), 'markdown');
  assert.equal(importer.formatFromFileName('notes.markDown'), 'markdown');
  assert.equal(importer.formatFromFileName('daymark-tasks.json'), null);
  assert.equal(importer.formatFromFileName('backup'), null);
  assert.equal(importer.isFormat('csv'), true);
  assert.equal(importer.isFormat('json'), false);
});


test('legacy CSV headers remain importable and derive the monthly anchor', () => {
  const row = ['legacy-monthly', 'Month end', '2026-11-30', '', 'medium', 'false',
    'monthly', '', '', '[]', NOW, NOW];
  const csv = [importer.LEGACY_CSV_HEADER, row.join(',')].join('\r\n') + '\r\n';
  const result = importer.fromCsv(csv, freshCtx());
  assert.equal(result.skippedRows, 0);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].repeatDayOfMonth, 30);
  assert.equal(logic.isValidTask(result.tasks[0]), true);
});

test('Markdown repeat-day metadata preserves a clamped monthly anchor', () => {
  const md = [
    '# Daymark tasks',
    '_Exported ' + NOW + ' · 1 task_',
    '',
    '- [ ] **Month end** · due 2026-11-30 · medium priority · repeats monthly · repeat day 31',
    ''
  ].join('\n');
  const result = importer.fromMarkdown(md, freshCtx());
  assert.equal(result.skippedRows, 0);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].repeat, 'monthly');
  assert.equal(result.tasks[0].repeatDayOfMonth, 31);
  assert.equal(logic.isValidTask(result.tasks[0]), true);
});
