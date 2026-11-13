'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const importer = require('../import-logic.js');
const logic = require('../task-logic.js');
const ui = require('../import-ui.js');
const taskMutation = require('../task-mutation-logic.js');

const NOW = '2026-11-09T05:00:00.000Z';

function freshCtx() {
  let n = 0;
  return { now: NOW, makeId: () => 'gen-' + String(++n) };
}

const googleLikeIcs = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Example Corp//Calendar//EN',
  'BEGIN:VTODO',
  'UID:todo-1@example.com',
  'SUMMARY:Submit tax paperwork',
  'DUE;VALUE=DATE:20261123',
  'DESCRIPTION:Bring the folder\\, ID card\\; keep it ready\\nDo not forget the stapler.',
  'CATEGORIES:admin,finance',
  'PRIORITY:2',
  'END:VTODO',
  'BEGIN:VEVENT',
  'UID:event-1@example.com',
  'SUMMARY:Team sync',
  'DTSTART;TZID=Asia/Kolkata:20261110T093000',
  'RRULE:FREQ=WEEKLY;COUNT=10',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-2@example.com',
  'SUMMARY:Dentist appointment',
  'DTSTART:20261112T143000Z',
  'STATUS:CONFIRMED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-3@example.com',
  'SUMMARY:Cancelled standup',
  'DTSTART;VALUE=DATE:20261111',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-4@example.com',
  'SUMMARY:Alarm carrier',
  'DTSTART;VALUE=DATE:20261113',
  'BEGIN:VALARM',
  'SUMMARY:This alarm summary must never become a task',
  'ACTION:DISPLAY',
  'TRIGGER:-PT15M',
  'END:VALARM',
  'END:VEVENT',
  'END:VCALENDAR',
  ''
].join('\r\n');

test('file-name detection routes .ics files to the calendar importer', () => {
  assert.equal(importer.isFormat('ics'), true);
  assert.equal(importer.formatFromFileName('calendar.ICS'), 'ics');
  assert.equal(importer.formatFromFileName('plan.ics'), 'ics');
  assert.equal(importer.formatFromFileName('daymark-tasks.json'), null, 'JSON backups stay with app.js');
  assert.equal(importer.formatFromFileName('backup'), null);
});

test('RFC 5545 line unfolding joins continuations and strips CR', () => {
  const lines = importer.unfoldIcsLines('SUMMARY:One very long\\n line that \r\n is folded here\r\nDESCRIPTION:Short');
  assert.deepEqual(lines, ['SUMMARY:One very long\\n line that is folded here', 'DESCRIPTION:Short']);
});

test('RFC 5545 text escaping is undone for commas, semicolons, backslashes and newlines', () => {
  assert.equal(importer.icsUnescape('a\\,b\\;c\\\\d\\ne\\Nf'), 'a,b;c\\d\ne\nf');
  assert.equal(importer.icsUnescape('keep \\x unknown escapes'), 'keep \\x unknown escapes');
});

test('quoted property parameters do not break the content colon', () => {
  const prop = importer.icsProperty('DTSTART;TZID="US/Pacific":20261110T090000');
  assert.equal(prop.name, 'DTSTART');
  assert.equal(prop.params.TZID, 'US/Pacific');
  assert.equal(prop.value, '20261110T090000');
});

test('parseIcs collects VTODO and VEVENT components and skips nested alarms', () => {
  const parsed = importer.parseIcs(googleLikeIcs);
  assert.equal(parsed.hasCalendar, true);
  assert.equal(parsed.components.length, 5);
  const types = parsed.components.map((c) => c.type);
  assert.deepEqual(types, ['VTODO', 'VEVENT', 'VEVENT', 'VEVENT', 'VEVENT']);
  const alarmCarrier = parsed.components[4];
  const names = alarmCarrier.props.map((p) => p.name);
  assert.equal(names.includes('SUMMARY'), true);
  assert.equal(names.filter((n) => n === 'ACTION').length, 0, 'VALARM properties must not leak into the event');
});

test('fromIcs maps a realistic calendar export onto stored tasks with honest counts', () => {
  const result = importer.fromIcs(googleLikeIcs, freshCtx());
  assert.equal(result.tasks.length, 4, 'CANCELLED is skipped, the alarm carrier still imports');
  assert.equal(result.cancelled, 1);
  assert.equal(result.recurring, 1);
  assert.equal(result.timezoneDropped, 2, 'TZID event and Z-suffix event both count');
  assert.equal(result.skippedRows, 0);

  const todo = result.tasks[0];
  assert.equal(todo.id, 'todo-1@example.com');
  assert.equal(todo.title, 'Submit tax paperwork');
  assert.equal(todo.dueDate, '2026-11-23');
  assert.equal(todo.dueTime, null);
  assert.equal(todo.priority, 'high', 'PRIORITY 2 maps to high');
  assert.equal(todo.completed, false);
  assert.equal(todo.notes, 'Bring the folder, ID card; keep it ready\nDo not forget the stapler.');
  assert.deepEqual(todo.tags, ['admin', 'finance']);

  const event = result.tasks[1];
  assert.equal(event.title, 'Team sync');
  assert.equal(event.dueDate, '2026-11-10');
  assert.equal(event.dueTime, '09:30', 'the written clock time is kept as written');
  assert.equal(event.repeat, null, 'recurrence rules import once, never expanded');

  const utcEvent = result.tasks[2];
  assert.equal(event.priority, 'medium', 'no PRIORITY property falls back to medium');
  assert.equal(utcEvent.dueTime, '14:30');
});

test('imported calendar tasks pass the same validation as stored tasks', () => {
  const result = importer.fromIcs(googleLikeIcs, freshCtx());
  for (const task of result.tasks) {
    assert.equal(logic.isValidTask(task), true, task.title + ' must be a valid stored task');
  }
  const merge = importer.mergeTasks([], result.tasks, logic);
  assert.equal(merge.added.length, 4);
  assert.equal(merge.invalid, 0);
  assert.equal(merge.duplicates, 0);
  const second = importer.mergeTasks(merge.merged, result.tasks, logic);
  assert.equal(second.added.length, 0, 'UID-based ids make a re-import idempotent');
  assert.equal(second.duplicates, 4);
});

test('a component without a usable SUMMARY is counted as a skipped row', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x@example.com\r\nDTSTART;VALUE=DATE:20261115\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:  \\n  \r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
  const result = importer.fromIcs(ics, freshCtx());
  assert.equal(result.tasks.length, 0);
  assert.equal(result.skippedRows, 2);
});

test('STATUS COMPLETED and the COMPLETED property both mark tasks done', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VTODO',
    'SUMMARY:Done by status',
    'STATUS:COMPLETED',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:Done by completion date',
    'COMPLETED:20261108T100000Z',
    'END:VTODO',
    'END:VCALENDAR',
    ''
  ].join('\n');
  const result = importer.fromIcs(ics, freshCtx());
  assert.equal(result.tasks.length, 2);
  assert.equal(result.tasks[0].completed, true);
  assert.equal(result.tasks[1].completed, true);
});

test('calendar input without a VCALENDAR block fails closed', () => {
  assert.throws(() => importer.fromIcs('SUMMARY:no calendar wrapper', freshCtx()), /does not contain a VCALENDAR block/);
  assert.throws(() => importer.fromIcs('', freshCtx()), /does not contain a VCALENDAR block/);
});

test('oversized calendar input is rejected by the shared size guard', () => {
  const big = 'BEGIN:VCALENDAR\n' + 'BEGIN:VEVENT\nSUMMARY:' + 'x'.repeat(100) + '\nEND:VEVENT\nEND:VCALENDAR\n';
  const huge = big.repeat(Math.ceil((importer.MAX_IMPORT_CHARS + 1) / big.length));
  assert.throws(() => importer.fromIcs(huge, freshCtx()), /safe size limit/);
});

test('the import UI intercepts .ics files, saves them, and discloses the simplifications', async () => {
  const stored = JSON.stringify([
    { id: 'old-1', title: 'Existing task', dueDate: null, priority: 'medium', completed: false, createdAt: NOW, updatedAt: NOW }
  ]);
  const storageData = {};
  storageData[ui.STORAGE_KEY] = stored;
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { storageData[key] = String(value); },
    removeItem(key) { delete storageData[key]; }
  };
  const created = [];
  const element = {
    id: 'import-file', value: 'stale', files: [{ name: 'calendar.ics', size: googleLikeIcs.length, text: async () => googleLikeIcs }],
    textContent: ''
  };
  const doc = {
    readyState: 'complete',
    body: { appendChild(el) { created.push(el); return el; } },
    getElementById(id) { return id === 'import-file' ? element : null; },
    createElement(tag) {
      const el = { tagName: tag, id: '', className: '', textContent: '', setAttribute() {} };
      created.push(el);
      return el;
    },
    addEventListener() {},
    removeEventListener() {}
  };
  const win = { StorageEvent: class { constructor(type, init) { this.type = type; this.key = init && init.key; } }, dispatchEvent() { return true; } };
  const lockManager = { request(name, options, callback) { return Promise.resolve().then(() => callback({ name, mode: options.mode })); } };
  const handle = ui.attachImportUi({
    document: doc, window: win, localStorage: storage,
    importApi: importer, logic, taskMutationApi: taskMutation, lockManager, now: () => NOW
  });
  const event = {
    target: element,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; }
  };
  await handle.onChange(event);
  assert.equal(event.defaultPrevented, true, 'the .ics file never reaches the JSON handler');
  assert.equal(event.propagationStopped, true);
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.equal(saved.length, 5, 'the existing task plus four imported calendar tasks');
  assert.equal(saved[0].title, 'Existing task', 'existing tasks keep their position and data');
  assert.equal(saved[1].title, 'Submit tax paperwork');
  const status = created.find((el) => el.id === 'import-status');
  assert.ok(status, 'a status element exists');
  assert.match(status.textContent, /Imported 4 tasks from calendar\.ics\./);
  assert.match(status.textContent, /1 recurring item imported once as a one-time task\./);
  assert.match(status.textContent, /Times were kept as written; time zones were not applied\./);
  assert.match(status.textContent, /1 cancelled item skipped\./);
});

test('index.html offers the calendar format in the import file picker', () => {
  const markup = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(markup, /<input id="import-file" type="file" accept="application\/json,\.json,text\/csv,\.csv,text\/markdown,\.md,\.markdown,text\/calendar,\.ics" hidden>/,
    'the accept list must offer .ics alongside JSON, CSV and Markdown');
});

test('CATEGORIES splits on unescaped commas and semicolons; escaped delimiters stay inside values', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VTODO',
    'UID:cats@example.com',
    'SUMMARY:Tagged',
    'CATEGORIES:work,personal\\,private;urgent',
    'END:VTODO',
    'END:VCALENDAR'
  ].join('\n');
  const result = importer.fromIcs(ics, freshCtx());
  assert.equal(result.tasks.length, 1);
  assert.deepEqual(result.tasks[0].tags, ['work', 'urgent'], "escaped comma stays inside a value that fails the tag contract and is safely omitted");
});

test('skipped recurring components do not inflate the recurrence or timezone counts', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:bad@example.com',
    'SUMMARY:',
    'RRULE:FREQ=DAILY',
    'DTSTART;TZID=America/New_York:20261110T090000',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:good@example.com',
    'SUMMARY:Valid',
    'RDATE:20261111T100000Z',
    'DTSTART:20261111T100000Z',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\n');
  const result = importer.fromIcs(ics, freshCtx());
  assert.equal(result.tasks.length, 1);
  assert.equal(result.skippedRows, 1);
  assert.equal(result.recurring, 1, 'only the successfully imported RDATE item is counted');
  assert.equal(result.timezoneDropped, 1, 'only the successful item with Z is counted');
});

test('RDATE and RECURRENCE-ID are recognized as recurrence-bearing', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:rid@example.com',
    'SUMMARY:Instance',
    'RECURRENCE-ID:20261112T090000',
    'DTSTART;VALUE=DATE:20261112',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\n');
  const result = importer.fromIcs(ics, freshCtx());
  assert.equal(result.tasks.length, 1);
  assert.equal(result.recurring, 1);
});

test('invalid clock times are dropped without counting a timezone simplification', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:badtime@example.com',
    'SUMMARY:Bad time',
    'DTSTART;TZID=UTC:20261110T256000',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\n');
  const result = importer.fromIcs(ics, freshCtx());
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].dueDate, '2026-11-10');
  assert.equal(result.tasks[0].dueTime, null);
  assert.equal(result.timezoneDropped, 0);
});
