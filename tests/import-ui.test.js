'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const importer = require('../import-logic.js');
const exporter = require('../export-logic.js');
const logic = require('../task-logic.js');
const ui = require('../import-ui.js');
const mutation = require('../task-mutation-logic.js');

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
  if (opts.stored !== undefined) storageData[ui.STORAGE_KEY] = opts.stored;
  const locks = opts.locks === false ? null : (opts.lockManager || makeLockManager());
  const writes = [];
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { writes.push({ key, value: String(value) }); storageData[key] = String(value); },
    removeItem(key) { delete storageData[key]; }
  };
  const dispatched = [];
  class MockStorageEvent {
    constructor(type, init) { this.type = type; this.key = init && init.key; }
  }
  const win = {
    navigator: locks ? { locks } : {},
    StorageEvent: MockStorageEvent,
    dispatchEvent(event) { dispatched.push(event); return true; }
  };
  return {
    env: {
      document: doc,
      window: win,
      localStorage: storage,
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

test('an open-format import captured before Clear All cannot recreate the cleared task list', async () => {
  const original = JSON.stringify(sampleTasks);
  const csv = exporter.toCsv([
    { id: 'stale-open-format', title: 'Must remain cleared', dueDate: null, priority: 'medium',
      completed: false, createdAt: NOW, updatedAt: NOW, notes: '', repeat: null, tags: [], subtasks: [] }
  ], { generatedAt: NOW });
  let resolveText;
  let markReadStarted;
  const readStarted = new Promise((resolve) => { markReadStarted = resolve; });
  const file = {
    name: 'tasks.csv', size: csv.length,
    text: () => new Promise((resolve) => { resolveText = resolve; markReadStarted(); })
  };
  const { env, elements, storageData, storage, writes, dispatched, created, locks } = fakeEnv({
    stored: original, files: [file]
  });
  const pending = ui.attachImportUi(env).onChange(changeEvent(elements['import-file']));
  await readStarted;
  await mutation.withTaskMutationLock(locks, () => {
    assert.deepEqual(mutation.incrementTaskGeneration(storage), { ok: true, value: 1 });
    storage.removeItem(ui.STORAGE_KEY);
  });
  writes.length = 0;
  resolveText(csv);
  await pending;
  assert.equal(storageData[ui.STORAGE_KEY], undefined);
  assert.equal(storageData[mutation.TASK_GENERATION_KEY], '1');
  assert.equal(writes.length, 0);
  assert.equal(dispatched.length, 0);
  assert.match(created.find((el) => el.id === 'import-status').textContent,
    /Tasks were cleared while this file was being read/);
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
