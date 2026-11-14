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

function makeLockManager() {
  const tails = new Map();
  return {
    request(name, options, callback) {
      const previous = tails.get(name) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      tails.set(name, previous.then(() => gate));
      return previous.then(callback).finally(release);
    }
  };
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
  'DTSTART;TZID=Asia/Kolkata:20261110T093045',
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
  assert.equal(result.secondsDropped, 1, 'non-zero seconds are truncated and counted');
  assert.equal(result.invalidCompletion, 0);
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

test('valid VTODO COMPLETED timestamps mark tasks done independently of STATUS', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VTODO',
    'SUMMARY:Done by status',
    'STATUS:COMPLETED',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:Done by completion date',
    'STATUS:COMPLETED',
    'COMPLETED;VALUE=DATE-TIME:20261108T100000Z',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:Completion date without status (RFC 5545 example)',
    'STATUS:NEEDS-ACTION',
    'COMPLETED:20261108T100000Z',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:Completion date while in progress',
    'STATUS:IN-PROCESS',
    'COMPLETED:20261108T100000Z',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:Malformed completion',
    'COMPLETED:garbage',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:Empty completion',
    'COMPLETED:',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:Invalid clock completion',
    'COMPLETED:20261108T256000Z',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:Local completion without UTC',
    'COMPLETED:20261108T100000',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:Completion with explicitly empty VALUE',
    'COMPLETED;VALUE=:20261108T100000Z',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:Completion with explicitly empty TZID',
    'COMPLETED;VALUE=DATE-TIME;TZID=:20261108T100000Z',
    'END:VTODO',
    'BEGIN:VEVENT',
    'SUMMARY:Event status is not completion',
    'STATUS:COMPLETED',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:Event completion property is invalid',
    'COMPLETED:20261108T100000Z',
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  ].join('\n');
  const result = importer.fromIcs(ics, freshCtx());
  assert.equal(result.tasks.length, 12);
  assert.deepEqual(result.tasks.map((task) => task.completed),
    [true, true, true, true, false, false, false, false, false, false, false, false]);
  assert.equal(result.invalidCompletion, 8,
    'malformed VTODO metadata and VEVENT completion misuse are disclosed, not trusted');
});

test('calendar input without a VCALENDAR block fails closed', () => {
  assert.throws(() => importer.fromIcs('SUMMARY:no calendar wrapper', freshCtx()), /does not contain a VCALENDAR block/);
  assert.throws(() => importer.fromIcs('', freshCtx()), /does not contain a VCALENDAR block/);
});


test('iCalendar requires one balanced VCALENDAR envelope and direct task components', () => {
  const task = 'BEGIN:VTODO\\nSUMMARY:Orphan task\\nEND:VTODO\\n';
  const malformed = [
    ['task before the calendar root', task + 'BEGIN:VCALENDAR\\nEND:VCALENDAR\\n'],
    ['task after the calendar root', 'BEGIN:VCALENDAR\\nEND:VCALENDAR\\n' + task],
    ['unclosed calendar root', 'BEGIN:VCALENDAR\\nBEGIN:VEVENT\\nSUMMARY:Open event\\nEND:VEVENT\\n'],
    ['nested calendar root', 'BEGIN:VCALENDAR\\nBEGIN:VCALENDAR\\nEND:VCALENDAR\\nEND:VCALENDAR\\n'],
    ['mismatched component end', 'BEGIN:VCALENDAR\\nBEGIN:VEVENT\\nSUMMARY:Mismatch\\nEND:VTODO\\nEND:VCALENDAR\\n'],
    ['unclosed task component', 'BEGIN:VCALENDAR\\nBEGIN:VTODO\\nSUMMARY:Open task\\nEND:VCALENDAR\\n'],
    ['unmatched component end', 'BEGIN:VCALENDAR\\nEND:VEVENT\\nEND:VCALENDAR\\n'],
    ['duplicate calendar roots', 'BEGIN:VCALENDAR\\nEND:VCALENDAR\\nBEGIN:VCALENDAR\\nEND:VCALENDAR\\n'],
    ['nested task component', 'BEGIN:VCALENDAR\\nBEGIN:VTODO\\nSUMMARY:Outer\\nBEGIN:VEVENT\\nSUMMARY:Nested\\nEND:VEVENT\\nEND:VTODO\\nEND:VCALENDAR\\n']
  ];
  for (const [label, input] of malformed) {
    assert.throws(() => importer.fromIcs(input, freshCtx()), /VCALENDAR|component|BEGIN|END/i, label);
  }
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
  assert.match(status.textContent, /Time zones were not converted; the written hour and minute values were kept\./);
  assert.match(status.textContent, /1 imported time had non-zero seconds; seconds were truncated to minute precision\./);
  assert.match(status.textContent, /1 cancelled item skipped\./);
});


test('a malformed calendar envelope cannot write or partially import existing tasks', async () => {
  const original = JSON.stringify([
    { id: 'keep-1', title: 'Keep existing task', dueDate: null, priority: 'medium', completed: false, createdAt: NOW, updatedAt: NOW }
  ]);
  const storageData = { [ui.STORAGE_KEY]: original };
  let writes = 0;
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { writes += 1; storageData[key] = String(value); },
    removeItem(key) { delete storageData[key]; }
  };
  const created = [];
  const malformed = [
    'BEGIN:VTODO',
    'UID:orphan@example.com',
    'SUMMARY:Must not be imported',
    'END:VTODO',
    'BEGIN:VCALENDAR',
    'END:VCALENDAR'
  ].join('\\n');
  const element = {
    id: 'import-file', value: '', files: [{ name: 'malformed.ics', size: malformed.length, text: async () => malformed }],
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
  const locks = makeLockManager();
  const win = {
    navigator: { locks },
    StorageEvent: class { constructor(type, init) { this.type = type; this.key = init && init.key; } },
    dispatchEvent() { return true; }
  };
  const handle = ui.attachImportUi({
    document: doc, window: win, localStorage: storage,
    importApi: importer, logic, taskMutation, lockManager: locks, now: () => NOW
  });
  const event = {
    target: element,
    preventDefault() {},
    stopPropagation() {}
  };
  await handle.onChange(event);
  assert.equal(writes, 0, 'invalid envelope is rejected before the task store is written');
  assert.equal(storageData[ui.STORAGE_KEY], original, 'existing task bytes remain unchanged');
  const status = created.find((el) => el.id === 'import-status');
  assert.ok(status);
  assert.match(status.textContent, /Import failed: Calendar component appears outside the VCALENDAR block\. Nothing was changed\./);
});

test('index.html offers the calendar format in the import file picker', () => {
  const markup = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(markup, /<input id="import-file" type="file" accept="application\/json,\.json,text\/csv,\.csv,text\/markdown,\.md,\.markdown,text\/calendar,\.ics" hidden>/,
    'the accept list must offer .ics alongside JSON, CSV and Markdown');
});

test('CATEGORIES splits only on unescaped commas; semicolons remain inside values', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VTODO',
    'UID:cats@example.com',
    'SUMMARY:Tagged',
    'CATEGORIES:work,personal\\,private;urgent,finance',
    'END:VTODO',
    'END:VCALENDAR'
  ].join('\n');
  const result = importer.fromIcs(ics, freshCtx());
  assert.equal(result.tasks.length, 1);
  assert.deepEqual(result.tasks[0].tags, ['work', 'finance'], 'the escaped comma and semicolon stay inside one unsupported value');
  assert.equal(result.categoriesDropped, 1, 'the unsupported category value is disclosed instead of silently lost');
});

test('repeated CATEGORIES properties are accumulated in order and deduplicated', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VTODO',
    'UID:repeated-categories@example.com',
    'SUMMARY:Repeated categories',
    'CATEGORIES:WORK,FINANCE',
    'CATEGORIES:TRAVEL,WORK',
    'CATEGORIES;LANGUAGE=en:PERSONAL,FINANCE',
    'END:VTODO',
    'END:VCALENDAR'
  ].join('\n');
  const result = importer.fromIcs(ics, freshCtx());
  assert.equal(result.tasks.length, 1);
  assert.deepEqual(result.tasks[0].tags, ['work', 'finance', 'travel', 'personal']);
});

test('calendar time seconds are validated and non-zero precision loss is counted', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VTODO',
    'SUMMARY:Whole minute',
    'DUE:20261109T091500',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:UTC seconds',
    'DUE:20261109T101530Z',
    'END:VTODO',
    'BEGIN:VEVENT',
    'SUMMARY:Local seconds',
    'DTSTART;TZID=Asia/Kolkata:20261109T111545',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:Invalid seconds',
    'DTSTART;TZID=UTC:20261109T121599',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\n');
  const result = importer.fromIcs(ics, freshCtx());
  assert.equal(result.tasks.length, 4);
  assert.deepEqual(result.tasks.map((task) => task.dueTime), ['09:15', '10:15', '11:15', null]);
  assert.equal(result.secondsDropped, 2);
  assert.equal(result.timezoneDropped, 2);
});

test('escaped RFC TEXT semicolons remain inside one CATEGORIES value', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VTODO',
    'UID:escaped-semicolon@example.com',
    'SUMMARY:Escaped semicolon',
    'CATEGORIES:work\\;urgent,finance',
    'END:VTODO',
    'END:VCALENDAR'
  ].join('\n');
  const result = importer.fromIcs(ics, freshCtx());
  assert.equal(result.tasks.length, 1);
  assert.deepEqual(result.tasks[0].tags, ['finance'],
    'the escaped semicolon is unescaped within one unsupported tag, not treated as a list separator');
  assert.equal(result.categoriesDropped, 1, 'the unrepresentable escaped-semicolon value is counted');
});

test('iCalendar categories beyond the five-tag storage limit are disclosed', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VTODO',
    'UID:category-limit@example.com',
    'SUMMARY:Too many categories',
    'CATEGORIES:one,two,three,four,five,six',
    'END:VTODO',
    'END:VCALENDAR'
  ].join('\n');
  const result = importer.fromIcs(ics, freshCtx());
  assert.deepEqual(result.tasks[0].tags, ['one', 'two', 'three', 'four', 'five']);
  assert.equal(result.categoriesDropped, 1, 'the sixth distinct category is reported as dropped');
});

test('import UI discloses invalid completion, invalid date values and ambiguous components', async () => {
  const storageData = {};
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { storageData[key] = String(value); },
    removeItem(key) { delete storageData[key]; }
  };
  const created = [];
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VTODO',
    'UID:invalid-completion-ui@example.com',
    'SUMMARY:Keep this task open',
    'COMPLETED:garbage',
    'DUE:20261109',
    'END:VTODO',
    'BEGIN:VTODO',
    'UID:invalid-date-ui@example.com',
    'SUMMARY:Keep task without impossible date',
    'DUE;VALUE=DATE:20260231',
    'END:VTODO',
    'BEGIN:VTODO',
    'UID:ambiguous-ui@example.com',
    'SUMMARY:First ambiguous title',
    'SUMMARY:Second ambiguous title',
    'END:VTODO',
    'END:VCALENDAR'
  ].join('\n');
  const element = {
    id: 'import-file', value: '', files: [{ name: 'invalid-completion.ics', size: ics.length, text: async () => ics }],
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
  const locks = makeLockManager();
  const win = {
    navigator: { locks },
    StorageEvent: class { constructor(type, init) { this.type = type; this.key = init && init.key; } },
    dispatchEvent() { return true; }
  };
  const handle = ui.attachImportUi({
    document: doc, window: win, localStorage: storage,
    importApi: importer,
    taskMutation,
    lockManager: locks,
    // The coordinator validates the base and desired snapshots through this hook, so it
    // must return the tasks it was given; a stub returning [] would make every commit
    // look like an empty merge and silently write nothing.
    logic: { validateStoredTasks: (tasks) => ({ tasks: (tasks || []).slice(), rejectedCount: 0 }), isValidTask: () => true, hasDuplicateJsonKeys: () => false },
    now: () => NOW
  });
  await handle.onChange({
    target: element,
    preventDefault() {},
    stopPropagation() {}
  });
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.equal(saved.length, 2);
  assert.equal(saved[0].completed, false);
  assert.equal(saved[1].dueDate, null, 'the impossible date is omitted while the task is retained');
  const status = created.find((el) => el.id === 'import-status');
  assert.ok(status);
  assert.match(status.textContent, /1 item had invalid completion metadata ignored; left open\./);
  assert.match(status.textContent, /1 date\/time field had incompatible DATE\/DATE-TIME or TZID parameters; the date\/time was omitted\./);
  assert.match(status.textContent, /1 invalid date\/time value omitted; affected tasks were kept without that date\/time\./);
  assert.match(status.textContent, /1 calendar component with duplicate singleton properties skipped as ambiguous\./);
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

test('impossible calendar dates, malformed DATE-TIME and invalid clock fields are counted without silent loss', () => {
  const blocks = [
    ['bad-date@example.com', 'Impossible DATE', 'DUE;VALUE=DATE:20260231'],
    ['valid-leap-day@example.com', 'Valid leap day', 'DUE;VALUE=DATE:20240229'],
    ['bad-month@example.com', 'Impossible month', 'DTSTART:20261301T091500'],
    ['bad-day@example.com', 'Impossible day', 'DTSTART:20260231T091500'],
    ['bad-hour@example.com', 'Invalid hour', 'DTSTART:20261110T256000'],
    ['bad-minute@example.com', 'Invalid minute', 'DTSTART:20261110T096000'],
    ['bad-seconds@example.com', 'Invalid seconds', 'DTSTART:20261110T091561'],
    ['malformed-datetime@example.com', 'Malformed DATE-TIME', 'DTSTART:20261110T0915'],
    ['leap-second@example.com', 'Valid leap second', 'DTSTART:20261110T091560'],
    ['valid-time@example.com', 'Valid DATE-TIME', 'DTSTART:20261110T091500']
  ];
  const lines = ['BEGIN:VCALENDAR'];
  for (const [uid, summary, dateLine] of blocks) {
    lines.push('BEGIN:VEVENT', 'UID:' + uid, 'SUMMARY:' + summary, dateLine, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const result = importer.fromIcs(lines.join('\n'), freshCtx());

  assert.equal(result.tasks.length, 10, 'invalid date/time metadata does not discard otherwise valid tasks');
  assert.equal(result.skippedRows, 0);
  assert.equal(result.invalidDateTimeValue, 7);
  assert.equal(result.invalidDateType, 0);
  assert.equal(result.timezoneDropped, 0);
  assert.equal(result.secondsDropped, 1, 'the RFC leap-second value is accepted but minute precision is disclosed');
  assert.deepEqual(result.tasks.map((task) => [task.dueDate, task.dueTime]), [
    [null, null],
    ['2024-02-29', null],
    [null, null],
    [null, null],
    ['2026-11-10', null],
    ['2026-11-10', null],
    ['2026-11-10', null],
    [null, null],
    ['2026-11-10', '09:15'],
    ['2026-11-10', '09:15']
  ]);
});

test('duplicate singleton iCalendar properties skip ambiguous components instead of silently choosing first', () => {
  const components = [
    ['summary@example.com', ['SUMMARY:First title', 'SUMMARY:Conflicting title'], 'DUE;VALUE=DATE:20261110'],
    ['due@example.com', ['SUMMARY:Duplicate due'], 'DUE;VALUE=DATE:20261110\nDUE;VALUE=DATE:20261111'],
    ['status@example.com', ['SUMMARY:Duplicate status', 'STATUS:NEEDS-ACTION', 'STATUS:COMPLETED'], null],
    ['completed@example.com', ['SUMMARY:Duplicate completion', 'COMPLETED:20261110T090000Z', 'COMPLETED:20261111T090000Z'], null],
    ['uid-first@example.com', ['SUMMARY:Duplicate UID', 'UID:uid-second@example.com'], null]
  ];
  const lines = ['BEGIN:VCALENDAR'];
  for (const [uid, properties, due] of components) {
    lines.push('BEGIN:VTODO', 'UID:' + uid, ...properties);
    if (due) lines.push(...due.split('\n'));
    lines.push('END:VTODO');
  }
  lines.push(
    'BEGIN:VTODO',
    'UID:valid-alternatives@example.com',
    'SUMMARY:Single DUE and DTSTART are not duplicates',
    'DTSTART;VALUE=DATE:20261109',
    'DUE;VALUE=DATE:20261110',
    'CATEGORIES:work',
    'CATEGORIES:travel,work',
    'END:VTODO',
    'END:VCALENDAR'
  );
  const result = importer.fromIcs(lines.join('\n'), freshCtx());

  assert.equal(result.tasks.length, 1);
  assert.equal(result.skippedRows, 0, 'ambiguous components have their own disclosure counter');
  assert.equal(result.ambiguousComponents, 5);
  assert.equal(result.tasks[0].dueDate, '2026-11-10', 'DUE remains the selected date when one DUE and one DTSTART are present');
  assert.deepEqual(result.tasks[0].tags, ['work', 'travel'], 'repeatable CATEGORIES remains accumulated and deduplicated');
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

test('DATE and DATE-TIME value types and TZID combinations are validated', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VTODO',
    'SUMMARY:Implicit date is not DATE',
    'DUE:20261109',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:DATE-TIME parameter with date value',
    'DUE;VALUE=DATE-TIME:20261110',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:DATE parameter with date-time value',
    'DUE;VALUE=DATE:20261111T091500',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:DATE cannot have TZID',
    'DUE;VALUE=DATE;TZID=Asia/Kolkata:20261112',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:UTC cannot have TZID',
    'DUE;TZID=UTC:20261113T091500Z',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:Explicitly empty VALUE is invalid',
    'DUE;VALUE=:20261117T091500',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:Valid DATE',
    'DUE;VALUE=DATE:20261114',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:Valid default DATE-TIME',
    'DUE:20261115T091500',
    'END:VTODO',
    'BEGIN:VTODO',
    'SUMMARY:Valid local DATE-TIME with TZID',
    'DUE;TZID=Asia/Kolkata:20261116T091500',
    'END:VTODO',
    'END:VCALENDAR'
  ].join('\n');
  const result = importer.fromIcs(ics, freshCtx());
  assert.equal(result.tasks.length, 9);
  assert.deepEqual(result.tasks.slice(0, 6).map((task) => [task.dueDate, task.dueTime]),
    [[null, null], [null, null], [null, null], [null, null], [null, null], [null, null]]);
  assert.deepEqual(result.tasks.slice(6).map((task) => [task.dueDate, task.dueTime]), [
    ['2026-11-14', null],
    ['2026-11-15', '09:15'],
    ['2026-11-16', '09:15']
  ]);
  assert.equal(result.invalidDateType, 6);
  assert.equal(result.timezoneDropped, 1);
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
  assert.equal(result.invalidDateTimeValue, 1, 'an invalid hour/minute value is explicitly counted');
});
