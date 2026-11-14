'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const importer = require('../import-logic.js');
const exporter = require('../export-logic.js');
const logic = require('../task-logic.js');
const ui = require('../import-ui.js');
const mutation = require('../task-mutation-logic.js');
const fs = require('node:fs');
const path = require('node:path');
const taskMutation = require('../task-mutation-logic.js');

const NOW = '2026-11-07T05:00:00.000Z';

const sampleTasks = [
  { id: 'old-1', title: 'Existing task', dueDate: null, priority: 'medium', completed: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
];

function fakeElement(tag) {
  return {
    tagName: tag,
    id: '',
    className: '',
    value: '',
    textContent: '',
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; }
  };
}

function makeLockManager() {
  const tails = new Map();
  return {
    request(name, options, callback) {
      assert.equal(options.mode, 'exclusive');
      const previous = tails.get(name) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      tails.set(name, previous.then(() => gate));
      return previous.then(callback).finally(release);
    }
  };
}

function readValidTasks(raw) {
  if (raw === null) return { ok: true, tasks: [] };
  if (typeof raw !== 'string' || raw.length === 0 || logic.hasDuplicateJsonKeys(raw)) {
    return { ok: false, reason: 'invalid-current' };
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch (error) {
    return { ok: false, reason: 'invalid-current' };
  }
  if (!Array.isArray(parsed)) return { ok: false, reason: 'invalid-current' };
  const validated = logic.validateStoredTasks(parsed);
  if (validated.rejectedCount > 0) return { ok: false, reason: 'invalid-current' };
  return { ok: true, tasks: validated.tasks };
}

function fakeEnv(options) {
  const opts = options || {};
  const listeners = [];
  const created = [];
  const elements = {
    'import-file': Object.assign(fakeElement('input'), { id: 'import-file', value: 'stale', files: opts.files || [] })
  };
  const doc = {
    readyState: 'complete',
    body: { appendChild(el) { created.push(el); return el; } },
    getElementById(id) { return elements[id] || null; },
    createElement(tag) {
      const el = fakeElement(tag);
      created.push(el);
      return el;
    },
    addEventListener(type, handler, capture) { listeners.push({ type, handler, capture }); },
    removeEventListener(type, handler, capture) {
      const index = listeners.findIndex((l) => l.type === type && l.handler === handler && l.capture === capture);
      if (index !== -1) listeners.splice(index, 1);
    }
  };
  const storageData = opts.storageData || {};
  const writes = [];
  const locks = opts.locks === false ? null : (opts.lockManager || makeLockManager());
  if (opts.stored !== undefined) storageData[ui.STORAGE_KEY] = opts.stored;
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { writes.push({ key, value: String(value) }); storageData[key] = String(value); },
    removeItem(key) { delete storageData[key]; }
  };
  const tails = new Map();
  const lockManager = {
    request(name, options, callback) {
      const previous = tails.get(name) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const tail = previous.then(() => gate);
      tails.set(name, tail);
      return previous.then(() => callback({ name, mode: options && options.mode || 'exclusive' }))
        .finally(() => {
          release();
          if (tails.get(name) === tail) tails.delete(name);
        });
    }
  };
  const dispatched = [];
  class MockStorageEvent {
    constructor(type, init) { this.type = type; this.key = init && init.key; }
  }
  const win = {
    navigator: locks ? { locks } : {},
    StorageEvent: MockStorageEvent,
    navigator: { locks: lockManager },
    dispatchEvent(event) { dispatched.push(event); return true; }
  };
  return {
    env: {
      document: doc,
      window: win,
      localStorage: storage,
      taskMutationApi: taskMutation,
      lockManager,
      importApi: importer,
      logic,
      taskMutation: mutation,
      lockManager: locks,
      now: () => NOW
    },
    elements,
    created,
    listeners,
    storageData,
    storage,
    locks,
    writes,
    dispatched
  };
}

function changeEvent(target) {
  const event = {
    target,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; }
  };
  return event;
}

function csvFile(content) {
  return { name: 'daymark-tasks-2026-11-07.csv', size: content.length, text: async () => content };
}

test('registers a capture-phase change listener on the document', () => {
  const { env, listeners } = fakeEnv();
  const handle = ui.attachImportUi(env);
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].type, 'change');
  assert.equal(listeners[0].capture, true);
  handle.detach();
  assert.equal(listeners.length, 0);
});

test('json backups pass through to the built-in app.js handler', async () => {
  const { env, elements, storageData } = fakeEnv({
    stored: JSON.stringify(sampleTasks),
    files: [{ name: 'daymark-backup.json', size: 10, text: async () => '[]' }]
  });
  const handle = ui.attachImportUi(env);
  const event = changeEvent(elements['import-file']);
  await handle.onChange(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.propagationStopped, false);
  assert.equal(elements['import-file'].value, 'stale', 'the input is left for app.js');
  assert.equal(storageData[ui.STORAGE_KEY], JSON.stringify(sampleTasks));
});

test('a csv file is intercepted, merged and saved with a status line', async () => {
  const csv = exporter.toCsv([
    { id: 'new-1', title: 'Fresh from csv', dueDate: '2026-11-09', dueTime: '09:30', priority: 'high', completed: false, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', notes: 'hello', repeat: 'weekly', tags: ['work'], subtasks: [] },
    { id: 'old-1', title: 'Same id as stored', dueDate: null, priority: 'low', completed: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', notes: '', repeat: null, tags: [], subtasks: [] }
  ], { generatedAt: NOW });
  const { env, elements, created, storageData, dispatched } = fakeEnv({
    stored: JSON.stringify(sampleTasks),
    files: [csvFile(csv)]
  });
  const handle = ui.attachImportUi(env);
  const event = changeEvent(elements['import-file']);
  await handle.onChange(event);
  assert.equal(event.defaultPrevented, true, 'app.js JSON import must not also run');
  assert.equal(event.propagationStopped, true);
  assert.equal(elements['import-file'].value, '', 'the file input is reset');
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.equal(saved.length, 2, 'one new task appended');
  assert.equal(saved[0].title, 'Existing task', 'existing tasks keep their position and data');
  assert.equal(saved[1].title, 'Fresh from csv');
  assert.equal(dispatched.length, 1, 'a storage event asks app.js to reload');
  assert.equal(dispatched[0].key, ui.STORAGE_KEY);
  const status = created.find((el) => el.id === 'import-status');
  assert.ok(status, 'a status element exists');
  assert.match(status.textContent, /Imported 1 task from daymark-tasks-2026-11-07\.csv\./);
  assert.match(status.textContent, /1 duplicate skipped\./);
});

test('CSV rows with duplicate subtask JSON keys are skipped without changing stored tasks', async () => {
  const cell = (value) => {
    const text = String(value);
    const cr = String.fromCharCode(13);
    const lf = String.fromCharCode(10);
    return text.includes('"') || text.includes(',') || text.includes(cr) || text.includes(lf)
      ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  const row = [
    'duplicate-subtask', 'Do not drop ambiguous steps', '', '', 'medium', 'false',
    '', '', '', '[{"id":"s1","title":"Original","title":"Overwritten","done":false}]', NOW, NOW
  ].map(cell).join(',');
  const crlf = String.fromCharCode(13, 10);
  const csv = importer.CSV_HEADER + crlf + row + crlf;
  const original = JSON.stringify(sampleTasks);
  const { env, elements, storageData, writes, created } = fakeEnv({
    stored: original,
    files: [csvFile(csv)]
  });
  const handle = ui.attachImportUi(env);
  await handle.onChange(changeEvent(elements['import-file']));
  assert.equal(storageData[ui.STORAGE_KEY], original, 'existing tasks remain byte-for-byte unchanged');
  assert.equal(writes.length, 0, 'an ambiguous row never triggers a storage write');
  const status = created.find((el) => el.id === 'import-status');
  assert.ok(status.textContent.includes('1 malformed row skipped.'));
});

test('a markdown file imports with generated ids', async () => {
  const md = exporter.toMarkdown([
    { id: 'ignored', title: 'From markdown', dueDate: null, priority: 'medium', completed: false, createdAt: NOW, updatedAt: NOW, notes: '', repeat: null, tags: [], subtasks: [] }
  ], { generatedAt: NOW });
  const { env, elements, created, storageData } = fakeEnv({
    stored: JSON.stringify(sampleTasks),
    files: [{ name: 'notes.md', size: md.length, text: async () => md }]
  });
  const handle = ui.attachImportUi(env);
  await handle.onChange(changeEvent(elements['import-file']));
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.equal(saved.length, 2);
  assert.equal(saved[1].title, 'From markdown');
  assert.match(saved[1].id, /^import-/, 'markdown imports get generated ids');
  const status = created.find((el) => el.id === 'import-status');
  assert.match(status.textContent, /Imported 1 task from notes\.md\./);
});

test('oversize and unreadable files fail closed without touching storage', async () => {
  const original = JSON.stringify(sampleTasks);
  const big = fakeEnv({ stored: original, files: [{ name: 'huge.csv', size: ui.MAX_IMPORT_FILE_BYTES + 1, text: async () => 'x' }] });
  await ui.attachImportUi(big.env).onChange(changeEvent(big.elements['import-file']));
  assert.equal(big.storageData[ui.STORAGE_KEY], original);
  assert.match(big.created.find((el) => el.id === 'import-status').textContent, /Import failed: .*8 MB import limit/);

  const broken = fakeEnv({
    stored: original,
    files: [{ name: 'wrong.csv', size: 4, text: async () => 'no,header\r\n1,2' }]
  });
  await ui.attachImportUi(broken.env).onChange(changeEvent(broken.elements['import-file']));
  assert.equal(broken.storageData[ui.STORAGE_KEY], original);
  assert.match(broken.created.find((el) => el.id === 'import-status').textContent, /Import failed: CSV header does not match/);
});

test('empty task storage is corruption and cannot be replaced by an import', async () => {
  const csv = exporter.toCsv([
    { id: 'new-1', title: 'Must not replace unknown data', dueDate: null, priority: 'medium',
      completed: false, createdAt: NOW, updatedAt: NOW, notes: '', repeat: null, tags: [], subtasks: [] }
  ], { generatedAt: NOW });
  let fileRead = false;
  const { env, elements, created, storageData, writes, dispatched } = fakeEnv({
    stored: '',
    files: [{ name: 'tasks.csv', size: csv.length, text: async () => { fileRead = true; return csv; } }]
  });
  await ui.attachImportUi(env).onChange(changeEvent(elements['import-file']));
  assert.equal(storageData[ui.STORAGE_KEY], '', 'empty corrupt task data is preserved');
  assert.equal(fileRead, false, 'the selected file is not read when the existing store is corrupt');
  assert.equal(writes.length, 0, 'failed import does not write the task store');
  assert.equal(dispatched.length, 0, 'failed import does not signal a successful task-store update');
  assert.match(created.find((el) => el.id === 'import-status').textContent,
    /Import failed: .*Nothing was changed\./);
});

test('mixed valid and malformed existing tasks block import without sanitizing the raw store', async () => {
  const malformed = { ...sampleTasks[0], id: 'broken', title: '' };
  const duplicate = { ...sampleTasks[0], title: 'Duplicate existing id' };
  const raw = JSON.stringify([sampleTasks[0], malformed, duplicate]);
  const csv = exporter.toCsv([
    { id: 'new-2', title: 'New imported task', dueDate: null, priority: 'medium',
      completed: false, createdAt: NOW, updatedAt: NOW, notes: '', repeat: null, tags: [], subtasks: [] }
  ], { generatedAt: NOW });
  let fileRead = false;
  const { env, elements, created, storageData, writes, dispatched } = fakeEnv({
    stored: raw,
    files: [{ name: 'tasks.csv', size: csv.length, text: async () => { fileRead = true; return csv; } }]
  });

  await ui.attachImportUi(env).onChange(changeEvent(elements['import-file']));

  assert.equal(storageData[ui.STORAGE_KEY], raw, 'the original mixed-valid/invalid JSON is preserved byte-for-byte');
  assert.equal(fileRead, false, 'the selected file is not read after existing-record validation fails');
  assert.equal(writes.length, 0, 'no replacement task-store write occurs');
  assert.equal(dispatched.length, 0, 'no successful storage event is dispatched');
  assert.match(created.find((el) => el.id === 'import-status').textContent,
    /invalid or duplicate record/);
});

test('FileReader fallback reads files without file.text()', async () => {
  const csv = exporter.toCsv([
    { id: 'fr-1', title: 'Reader path', dueDate: null, priority: 'medium', completed: false, createdAt: NOW, updatedAt: NOW, notes: '', repeat: null, tags: [], subtasks: [] }
  ], { generatedAt: NOW });
  const { env, elements, storageData } = fakeEnv({
    stored: JSON.stringify(sampleTasks),
    files: [{ name: 'reader.csv', size: csv.length }]
  });
  env.window.FileReader = class {
    constructor() { this.onload = null; this.onerror = null; this.result = ''; }
    readAsText(file) {
      this.result = csv;
      this.onload({ target: this });
    }
  };
  const handle = ui.attachImportUi(env);
  await handle.onChange(changeEvent(elements['import-file']));
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.equal(saved.length, 2);
  assert.equal(saved[1].title, 'Reader path');
});

test('auto-boot stays inert under Node (no window) and the module exposes its API', () => {
  assert.equal(typeof ui.attachImportUi, 'function');
  assert.equal(ui.STORAGE_KEY, 'daymark.tasks.v1');
  assert.equal(ui.MAX_IMPORT_FILE_BYTES, 8 * 1024 * 1024);
  assert.equal(typeof globalThis.DaymarkImportUi, 'object');
});


test('blocked storage getter keeps the import handler attached and changes no task data', async () => {
  const original = JSON.stringify(sampleTasks);
  const { env, elements, created, storageData } = fakeEnv({
    stored: original,
    files: [{ name: 'tasks.csv', size: 10, text: async () => 'should not be read' }]
  });
  delete env.localStorage;
  Object.defineProperty(env.window, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('storage access blocked');
    }
  });
  const handle = ui.attachImportUi(env);
  await handle.onChange(changeEvent(elements['import-file']));
  assert.equal(storageData[ui.STORAGE_KEY], original, 'the existing task store is untouched');
  const status = created.find((el) => el.id === 'import-status');
  assert.match(status.textContent, /Import failed: browser storage is unavailable; nothing was changed/);
});

test('a task-store write failure preserves the original data and sends no refresh event', async () => {
  const original = JSON.stringify(sampleTasks);
  const csv = exporter.toCsv([
    { id: 'write-failure-1', title: 'Must not replace saved data', dueDate: null, priority: 'medium',
      completed: false, createdAt: NOW, updatedAt: NOW, notes: '', repeat: null, tags: [], subtasks: [] }
  ], { generatedAt: NOW });
  const { env, elements, created, storageData, writes, dispatched } = fakeEnv({
    stored: original,
    files: [csvFile(csv)]
  });
  env.localStorage.setItem = () => {
    throw new Error('quota exceeded');
  };

  await ui.attachImportUi(env).onChange(changeEvent(elements['import-file']));

  assert.equal(storageData[ui.STORAGE_KEY], original, 'the original task bytes remain unchanged');
  assert.equal(writes.length, 0, 'a failed setItem is not recorded as a successful write');
  assert.equal(dispatched.length, 0, 'no refresh event is sent after a failed save');
  assert.match(created.find((el) => el.id === 'import-status').textContent,
    /Import failed: browser storage rejected the task write.*Nothing was changed/);
});

test('open-format import merges a normal task write completed while the file is being read', async () => {
  const csv = exporter.toCsv([
    { id: 'ignored', title: 'From concurrent import', dueDate: null, priority: 'medium',
      completed: false, createdAt: NOW, updatedAt: NOW, notes: '', repeat: null, tags: [], subtasks: [] }
  ], { generatedAt: NOW });
  let releaseFile;
  const pendingFileText = new Promise((resolve) => { releaseFile = resolve; });
  const file = { name: 'racing.csv', size: csv.length, text: () => pendingFileText };
  const { env, elements, storageData, storage, locks, dispatched } = fakeEnv({
    stored: JSON.stringify(sampleTasks),
    files: [file]
  });
  const handle = ui.attachImportUi(env);
  const importPromise = handle.onChange(changeEvent(elements['import-file']));

  const normalTask = {
    id: 'normal-tab-task',
    title: 'Normal tab task',
    dueDate: null,
    priority: 'medium',
    completed: false,
    createdAt: NOW,
    updatedAt: NOW
  };
  const normalSave = await mutation.commitTaskSnapshot({
    lockManager: locks,
    storage,
    key: ui.STORAGE_KEY,
    baseTasks: sampleTasks,
    desiredTasks: sampleTasks.concat(normalTask),
    expectedGeneration: 0,
    readCurrent: readValidTasks
  });
  assert.equal(normalSave.ok, true);
  releaseFile(csv);
  await importPromise;

  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.ok(saved.some((task) => task.title === 'Normal tab task'));
  assert.ok(saved.some((task) => task.title === 'From concurrent import'));
  assert.equal(dispatched.length, 1, 'the successful import signals the same-tab refresh');
});

test('two open-format imports with a same-id different-value race fail closed', async () => {
  const makeCsv = (title) => exporter.toCsv([
    { id: 'ignored', title, dueDate: null, priority: 'medium', completed: false,
      createdAt: NOW, updatedAt: NOW, notes: '', repeat: null, tags: [], subtasks: [] }
  ], { generatedAt: NOW });
  const sharedStorage = { [ui.STORAGE_KEY]: JSON.stringify(sampleTasks) };
  const sharedLocks = makeLockManager();
  const first = fakeEnv({
    stored: JSON.stringify(sampleTasks),
    storageData: sharedStorage,
    lockManager: sharedLocks,
    files: [csvFile(makeCsv('First imported value'))]
  });
  const second = fakeEnv({
    stored: JSON.stringify(sampleTasks),
    storageData: sharedStorage,
    lockManager: sharedLocks,
    files: [csvFile(makeCsv('Conflicting imported value'))]
  });
  const firstHandle = ui.attachImportUi(first.env);
  const secondHandle = ui.attachImportUi(second.env);

  await Promise.all([
    firstHandle.onChange(changeEvent(first.elements['import-file'])),
    secondHandle.onChange(changeEvent(second.elements['import-file']))
  ]);

  const saved = JSON.parse(sharedStorage[ui.STORAGE_KEY]);
  assert.equal(saved.filter((task) => task.id === 'ignored').length, 1);
  const titles = saved.filter((task) => task.id === 'ignored').map((task) => task.title);
  assert.ok(titles[0] === 'First imported value' || titles[0] === 'Conflicting imported value');
  const statuses = [
    first.created.find((el) => el.id === 'import-status').textContent,
    second.created.find((el) => el.id === 'import-status').textContent
  ];
  assert.equal(statuses.filter((value) => /Imported 1 task/.test(value)).length, 1);
  assert.equal(statuses.filter((value) => /conflicts with a newer task/.test(value)).length, 1);
});

test('open-format imports fail closed when Web Locks are unavailable', async () => {
  const csv = exporter.toCsv([
    { id: 'ignored', title: 'Must not save without a lock', dueDate: null, priority: 'medium',
      completed: false, createdAt: NOW, updatedAt: NOW, notes: '', repeat: null, tags: [], subtasks: [] }
  ], { generatedAt: NOW });
  const original = JSON.stringify(sampleTasks);
  const { env, elements, storageData, writes, dispatched, created } = fakeEnv({
    stored: original,
    files: [csvFile(csv)],
    locks: false
  });
  await ui.attachImportUi(env).onChange(changeEvent(elements['import-file']));
  assert.equal(storageData[ui.STORAGE_KEY], original);
  assert.equal(writes.length, 0);
  assert.equal(dispatched.length, 0);
  assert.match(created.find((el) => el.id === 'import-status').textContent,
    /safe cross-tab task coordination is unavailable/);
});

test('import auto-boot does not eagerly evaluate window.localStorage', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'import-ui.js'), 'utf8');
  assert.doesNotMatch(source, /localStorage:\s*window\.localStorage/,
    'boot must pass window and let attachImportUi guard the storage getter');
});

test('import merges a non-conflicting task added by another tab while the file is read', async () => {
  const original = JSON.stringify(sampleTasks);
  const changedByOtherTab = JSON.stringify(sampleTasks.concat([{
    id: 'other-tab-1', title: 'Saved in another tab', dueDate: null, priority: 'medium',
    completed: false, createdAt: NOW, updatedAt: NOW, notes: '', repeat: null, tags: [], subtasks: []
  }]));
  const csv = exporter.toCsv([
    { id: 'import-after-read', title: 'Imported task', dueDate: null, priority: 'medium',
      completed: false, createdAt: NOW, updatedAt: NOW, notes: '', repeat: null, tags: [], subtasks: [] }
  ], { generatedAt: NOW });
  let fileRead = false;
  const { env, elements, created, storageData, writes, dispatched } = fakeEnv({
    stored: original,
    files: [{
      name: 'tasks.csv',
      size: csv.length,
      text: async () => {
        fileRead = true;
        storageData[ui.STORAGE_KEY] = changedByOtherTab;
        return csv;
      }
    }]
  });

  await ui.attachImportUi(env).onChange(changeEvent(elements['import-file']));

  assert.equal(fileRead, true, 'the selected file is read before the locked merge');
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.ok(saved.some((task) => task.id === 'other-tab-1'),
    'the newer task written by another tab is preserved');
  assert.ok(saved.some((task) => task.id === 'import-after-read'),
    'the imported task is added without replacing the newer task');
  assert.equal(writes.length, 1, 'the merged snapshot is written once under the shared lock');
  assert.equal(dispatched.length, 1, 'the successful merge announces a same-tab refresh');
  assert.match(created.find((el) => el.id === 'import-status').textContent,
    /Imported 1 task from tasks\.csv/);
});

test('duplicate-key task storage blocks import before reading the selected file', async () => {
  const ambiguous = '[{"id":"t1","title":"Original","title":"Overwritten","dueDate":null,"priority":"medium","completed":false,"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}]';
  let fileRead = false;
  const file = { name: 'tasks.csv', size: 1, text: async () => { fileRead = true; return 'title\\nNew task'; } };
  const { env, elements, storageData, writes, dispatched, created } = fakeEnv({
    stored: ambiguous,
    files: [file]
  });
  const handle = ui.attachImportUi(env);
  const event = changeEvent(elements['import-file']);
  await handle.onChange(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(storageData[ui.STORAGE_KEY], ambiguous,
    'ambiguous existing task bytes are not normalized or overwritten');
  assert.equal(writes.length, 0);
  assert.equal(dispatched.length, 0);
  assert.equal(fileRead, false, 'the selected file is not read when existing storage is ambiguous');
  const status = created.find((el) => el.id === 'import-status');
  assert.match(status.textContent, /duplicate JSON keys/);
});

test('an import started before Clear All cannot recreate the cleared task list', async () => {
  const original = JSON.stringify(sampleTasks);
  const csv = exporter.toCsv([
    { id: 'stale-import', title: 'Must remain cleared', dueDate: null, priority: 'medium',
      completed: false, createdAt: NOW, updatedAt: NOW, notes: '', repeat: null, tags: [], subtasks: [] }
  ], { generatedAt: NOW });
  let resolveText;
  let markReadStarted;
  const readStarted = new Promise((resolve) => { markReadStarted = resolve; });
  const file = {
    name: 'tasks.csv',
    size: csv.length,
    text: () => new Promise((resolve) => { resolveText = resolve; markReadStarted(); })
  };
  const { env, elements, storageData, storage, writes, dispatched, created, locks } = fakeEnv({
    stored: original,
    files: [file]
  });
  const pending = ui.attachImportUi(env).onChange(changeEvent(elements['import-file']));
  await readStarted;
  await mutation.withTaskMutationLock(locks, () => {
    const generation = mutation.incrementTaskGeneration(storage);
    assert.deepEqual(generation, { ok: true, value: 1 });
    storage.removeItem(ui.STORAGE_KEY);
  });
  writes.length = 0;
  resolveText(csv);
  await pending;

  assert.equal(storageData[ui.STORAGE_KEY], undefined,
    'the file selected before Clear All cannot recreate the task key');
  assert.equal(storageData[mutation.TASK_GENERATION_KEY], '1');
  assert.equal(writes.length, 0, 'a stale import performs no task write');
  assert.equal(dispatched.length, 0, 'a rejected import does not announce a save');
  assert.match(created.find((el) => el.id === 'import-status').textContent,
    /Tasks were cleared while this file was being read/);
});

test('a fresh import using the retained post-clear generation succeeds', async () => {
  const csv = exporter.toCsv([
    { id: 'fresh-import', title: 'Fresh after clear', dueDate: null, priority: 'medium',
      completed: false, createdAt: NOW, updatedAt: NOW, notes: '', repeat: null, tags: [], subtasks: [] }
  ], { generatedAt: NOW });
  const { env, elements, storageData, created } = fakeEnv({
    storageData: { [mutation.TASK_GENERATION_KEY]: '1' },
    files: [csvFile(csv)]
  });
  await ui.attachImportUi(env).onChange(changeEvent(elements['import-file']));
  assert.deepEqual(JSON.parse(storageData[ui.STORAGE_KEY]).map((task) => task.id), ['fresh-import']);
  assert.equal(storageData[mutation.TASK_GENERATION_KEY], '1');
  assert.match(created.find((el) => el.id === 'import-status').textContent,
    /Imported 1 task/);
});

test('production HTML loads the shared task coordinator before app and import UI', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const coordinatorAt = html.indexOf('task-mutation-logic.js');
  assert.ok(coordinatorAt >= 0, 'the shared task coordinator is present');
  assert.ok(coordinatorAt < html.indexOf('app.js'), 'the coordinator loads before app.js');
  assert.ok(coordinatorAt < html.indexOf('import-ui.js'), 'the coordinator loads before import-ui.js');
});

