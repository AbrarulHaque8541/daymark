const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const logic = require('../task-logic.js');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const STORAGE_KEY = 'daymark.tasks.v1';
const BACKUP_KEY = `${STORAGE_KEY}.backup`;

function bootApp({ savedValue, failBackup = false, confirmResult = true, confirmThrows = false }) {
  const elements = new Map();
  const classSets = new Map();
  const listeners = new Map();
  const confirmMessages = [];
  let fileReadCount = 0;
  const storedValues = new Map([[STORAGE_KEY, savedValue]]);

  function element(selector) {
    if (!elements.has(selector)) {
      const attributes = new Map();
      const classes = new Set();
      classSets.set(selector, classes);
      elements.set(selector, {
        textContent: '',
        value: '',
        hidden: false,
        innerHTML: '',
        open: false,
        dataset: {},
        classList: {
          add: (name) => classes.add(name),
          remove: (name) => classes.delete(name),
          contains: (name) => classes.has(name),
          toggle: (name, force) => {
            const enabled = force === undefined ? !classes.has(name) : force;
            if (enabled) classes.add(name);
            else classes.delete(name);
            return enabled;
          }
        },
        addEventListener(type, handler) {
          const key = `${selector}:${type}`;
          const handlers = listeners.get(key) || [];
          handlers.push(handler);
          listeners.set(key, handlers);
        },
        setAttribute: (name, value) => attributes.set(name, value),
        removeAttribute: (name) => attributes.delete(name),
        querySelector: (childSelector) => element(`${selector} ${childSelector}`),
        focus() {},
        showModal() { this.open = true; },
        close() { this.open = false; }
      });
    }
    return elements.get(selector);
  }

  const localStorage = {
    getItem(key) {
      return storedValues.has(key) ? storedValues.get(key) : null;
    },
    setItem(key, value) {
      if (key === BACKUP_KEY && failBackup) throw new Error('Quota exceeded');
      storedValues.set(key, String(value));
    }
  };
  const document = {
    hidden: false,
    querySelector: element,
    querySelectorAll: () => [],
    addEventListener() {}
  };
  const window = {
    DaymarkLogic: logic,
    confirm(message) {
      confirmMessages.push(String(message));
      if (confirmThrows) throw new Error('confirmation unavailable');
      return confirmResult;
    },
    addEventListener() {}
  };
  class TestFileReader {
    readAsText(file) {
      fileReadCount += 1;
      this.result = file.content;
      if (typeof this.onload === 'function') this.onload();
    }
  }

  element('#storage-status').classList.add('is-checking');

  vm.runInNewContext(APP_SOURCE, {
    Date,
    Intl,
    Math,
    console: { warn() {} },
    document,
    localStorage,
    window,
    FileReader: TestFileReader,
    clearTimeout() {},
    setTimeout: () => 1,
    setInterval: () => 1
  }, { filename: 'app.js' });

  return {
    elements,
    storedValues,
    classSets,
    listeners,
    confirmMessages,
    get fileReadCount() { return fileReadCount; }
  };
}


function makeImportTask(id, title) {
  const timestamp = new Date().toISOString();
  return {
    id,
    title,
    dueDate: null,
    priority: 'medium',
    completed: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function triggerTaskImport(app, file) {
  const input = app.elements.get('#import-file');
  input.files = [file];
  const handlers = app.listeners.get('#import-file:change') || [];
  for (const handler of handlers) handler({ currentTarget: input });
}

test('task import previews additions, duplicates and invalid rows before appending', () => {
  const existing = makeImportTask('same-id', 'Original task');
  const savedValue = JSON.stringify([existing]);
  const app = bootApp({ savedValue });
  const importText = JSON.stringify([
    makeImportTask('same-id', 'Imported duplicate must not overwrite'),
    makeImportTask('new-id', 'New task'),
    { id: 'invalid-id', title: '', priority: 'medium', completed: false }
  ]);

  triggerTaskImport(app, { size: Buffer.byteLength(importText), content: importText });

  assert.equal(app.confirmMessages.length, 1, 'the user must see a preview before data changes');
  assert.match(app.confirmMessages[0], /1 new task will be added/);
  assert.match(app.confirmMessages[0], /1 duplicate task will be skipped/);
  assert.match(app.confirmMessages[0], /1 invalid record will be skipped/);
  assert.match(app.confirmMessages[0], /current tasks will not be replaced/);

  const saved = JSON.parse(app.storedValues.get(STORAGE_KEY));
  assert.equal(saved.length, 2);
  assert.equal(saved[0].title, 'Original task', 'existing data must never be overwritten by an imported duplicate');
  assert.equal(saved[1].id, 'new-id');
  assert.equal(saved[1].title, 'New task');
});

test('declining task import confirmation leaves storage unchanged', () => {
  const existing = makeImportTask('existing-id', 'Keep this task');
  const savedValue = JSON.stringify([existing]);
  const app = bootApp({ savedValue, confirmResult: false });
  const importText = JSON.stringify([makeImportTask('incoming-id', 'Do not add')]);

  triggerTaskImport(app, { size: Buffer.byteLength(importText), content: importText });

  assert.equal(app.confirmMessages.length, 1);
  assert.equal(app.storedValues.get(STORAGE_KEY), savedValue);
  assert.match(app.elements.get('#toast').textContent, /Import cancelled\. Nothing was changed/);
});

test('confirmation failure fails closed without mutating imported tasks', () => {
  const existing = makeImportTask('existing-id', 'Keep this task');
  const savedValue = JSON.stringify([existing]);
  const app = bootApp({ savedValue, confirmThrows: true });
  const importText = JSON.stringify([makeImportTask('incoming-id', 'Do not add')]);

  triggerTaskImport(app, { size: Buffer.byteLength(importText), content: importText });

  assert.equal(app.confirmMessages.length, 1);
  assert.equal(app.storedValues.get(STORAGE_KEY), savedValue);
  assert.match(app.elements.get('#toast').textContent, /confirmation could not be displayed/);
});

test('oversized task backup is rejected before FileReader allocation', () => {
  const app = bootApp({ savedValue: JSON.stringify([]) });
  triggerTaskImport(app, { size: 8 * 1024 * 1024 + 1, content: '[]' });

  assert.equal(app.fileReadCount, 0, 'oversized files must be rejected before reading into memory');
  assert.equal(app.confirmMessages.length, 0);
  assert.match(app.elements.get('#toast').textContent, /maximum 8 MiB/);
});

test('corrupt saved data is copied to a browser backup and reported as preserved', () => {
  const corruptData = '{not valid JSON';
  const { elements, storedValues } = bootApp({ savedValue: corruptData });

  assert.equal(storedValues.get(BACKUP_KEY), corruptData);
  assert.match(elements.get('#toast').textContent, /kept in a browser backup/);
});

test('backup failure is reported honestly and leaves the original entry untouched', () => {
  const corruptData = '{not valid JSON';
  const { elements, storedValues } = bootApp({ savedValue: corruptData, failBackup: true });

  assert.equal(storedValues.has(BACKUP_KEY), false);
  assert.equal(storedValues.get(STORAGE_KEY), corruptData);
  assert.match(elements.get('#toast').textContent, /could not create a recovery backup/);
});


test('simultaneous reminders are summarized in one toast instead of overwriting each other', () => {
  const now = new Date();
  const fireTime = new Date(now.getTime() - 60_000);
  const dueDate = logic.localDateString(fireTime);
  const dueTime = `${String(fireTime.getHours()).padStart(2, '0')}:${String(fireTime.getMinutes()).padStart(2, '0')}`;
  const timestamp = now.toISOString();
  const tasks = ['First reminder', 'Second reminder'].map((title, index) => ({
    id: `reminder-${index}`,
    title,
    dueDate,
    dueTime,
    priority: 'medium',
    completed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    reminderLeadMinutes: 0
  }));
  const { elements, storedValues } = bootApp({ savedValue: JSON.stringify(tasks) });

  const toast = elements.get('#toast').textContent;
  assert.match(toast, /First reminder/);
  assert.match(toast, /Second reminder/);
  const savedTasks = JSON.parse(storedValues.get(STORAGE_KEY));
  assert.equal(savedTasks.filter((task) => typeof task.reminderShownFire === 'string').length, 2);
});


test('initial loading indicators clear only when the real app render and storage check finish', () => {
  const { classSets } = bootApp({ savedValue: null });

  assert.equal(classSets.get('#task-list').has('is-ready'), true,
    'render marks the task list ready');
  assert.equal(classSets.get('#storage-status').has('is-checking'), false,
    'storage status update clears its checking indicator');

  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.equal(indexSource.includes('}, 120);'), false,
    'index must not hide loading indicators after an arbitrary timeout');
});
