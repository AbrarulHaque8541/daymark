const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const logic = require('../task-logic.js');
const focus = require('../focus-logic.js');
const repeat = require('../repeat-logic.js');
const taskMutation = require('../task-mutation-logic.js');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const STORAGE_KEY = 'daymark.tasks.v1';
const BACKUP_KEY = `${STORAGE_KEY}.backup`;
const FOCUS_KEY = 'daymark.focus.v1';
const FOCUS_BACKUP_KEY = `${FOCUS_KEY}.backup`;
function makeLockManager() {
  const tails = new Map();
  const pending = new Set();
  return {
    request(name, options, callback) {
      const previous = tails.get(name) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const tail = previous.then(() => gate);
      tails.set(name, tail);
      const request = previous.then(() => callback({ name, mode: options && options.mode || 'exclusive' }))
        .finally(() => {
          release();
          if (tails.get(name) === tail) tails.delete(name);
        });
      pending.add(request);
      return request.finally(() => pending.delete(request));
    },
    async settle() {
      while (pending.size) await Promise.all(Array.from(pending));
      await Promise.resolve();
    }
  };
}

function bootApp({ savedValue, savedFocusValue = null, savedBackupValue = null, savedFocusBackupValue = null, failBackup = false, failPrimarySave = false, failFocusSave = false, failPrimaryRead = false, failBackupRead = false, failFocusPrimaryRead = false, failFocusBackupRead = false, confirmResult = true, confirmThrows = false, fixedToday = null, dateNow = null }) {
  const elements = new Map();
  const classSets = new Map();
  const listeners = new Map();
  const windowListeners = new Map();
  const confirmMessages = [];
  const intervalCallbacks = [];
  const clock = dateNow === null ? null : { value: new Date(dateNow).getTime() };
  const AppDate = clock ? class extends Date {
    constructor(...args) {
      if (args.length === 0) super(clock.value);
      else super(...args);
    }
    static now() { return clock.value; }
  } : Date;
  let fileReadCount = 0;
  let toastWriteCount = 0;
  const storedValues = new Map([[STORAGE_KEY, savedValue], [FOCUS_KEY, savedFocusValue]]);
  if (savedBackupValue !== null) storedValues.set(BACKUP_KEY, savedBackupValue);
  if (savedFocusBackupValue !== null) storedValues.set(FOCUS_BACKUP_KEY, savedFocusBackupValue);

  function element(selector) {
    if (!elements.has(selector)) {
      const attributes = new Map();
      const classes = new Set();
      classSets.set(selector, classes);
      elements.set(selector, {
        get textContent() { return this._textContent ?? ''; },
        set textContent(value) {
          this._textContent = value;
          if (selector === '#toast') toastWriteCount += 1;
        },
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
        reset() {
          if (selector !== '#add-form') return;
          ['#new-title', '#new-due-date', '#new-due-time', '#new-reminder', '#new-repeat']
            .forEach((fieldSelector) => { element(fieldSelector).value = ''; });
        },
        showModal() { this.open = true; },
        close() { this.open = false; }
      });
    }
    return elements.get(selector);
  }

  const localStorage = {
    getItem(key) {
      if ((key === STORAGE_KEY && failPrimaryRead) || (key === BACKUP_KEY && failBackupRead) || (key === FOCUS_KEY && failFocusPrimaryRead) || (key === FOCUS_BACKUP_KEY && failFocusBackupRead)) {
        throw new Error('SecurityError: storage read blocked');
      }
      return storedValues.has(key) ? storedValues.get(key) : null;
    },
    setItem(key, value) {
      if ((key === BACKUP_KEY && failBackup) || (key === STORAGE_KEY && failPrimarySave) || (key === FOCUS_KEY && failFocusSave)) throw new Error('Quota exceeded');
      storedValues.set(key, String(value));
    },
    removeItem(key) {
      storedValues.delete(key);
    }
  };
  const document = {
    hidden: false,
    querySelector: element,
    querySelectorAll: () => [],
    addEventListener(type, handler) {
      const handlers = windowListeners.get(type) || [];
      handlers.push(handler);
      windowListeners.set(type, handlers);
    },
    dispatchEvent(event) {
      for (const handler of (windowListeners.get(event.type) || []).slice()) handler(event);
      return true;
    }
  };
  const appLogic = fixedToday
    ? Object.assign({}, logic, {
      localDateString: (date) => date === undefined ? fixedToday : logic.localDateString(date)
    })
    : logic;
  class TestStorageEvent {
    constructor(type, init) { this.type = type; this.key = init && init.key; this.newValue = init && init.newValue; }
  }
  const appLockManager = makeLockManager();
  const window = {
    DaymarkLogic: appLogic,
    DaymarkFocus: focus,
    DaymarkRepeat: repeat,
    DaymarkTaskMutation: taskMutation,
    StorageEvent: TestStorageEvent,
    navigator: { locks: appLockManager },
    confirm(message) {
      confirmMessages.push(String(message));
      if (confirmThrows) throw new Error('confirmation unavailable');
      return confirmResult;
    },
    addEventListener(type, handler) {
      const handlers = windowListeners.get(type) || [];
      handlers.push(handler);
      windowListeners.set(type, handlers);
    },
    dispatchEvent(event) {
      for (const handler of (windowListeners.get(event.type) || []).slice()) handler(event);
      return true;
    }
  };
  class TestFileReader {
    readAsText(file) {
      fileReadCount += 1;
      this.result = file.content;
      if (typeof this.onload === 'function') this.onload();
    }
  }

  element('#new-date-only-reminder-hint').hidden = true;
  element('#edit-date-only-reminder-hint').hidden = true;
  element('#storage-status').classList.add('is-checking');

  vm.runInNewContext(APP_SOURCE, {
    Date: AppDate,
    Intl,
    Math,
    console: { warn() {} },
    document,
    localStorage,
    window,
    FileReader: TestFileReader,
    clearTimeout() {},
    setTimeout: () => 1,
    setInterval: (callback, delay) => {
      intervalCallbacks.push({ callback, delay });
      return intervalCallbacks.length;
    }
  }, { filename: 'app.js' });

  return {
    elements,
    storedValues,
    localStorage,
    window,
    classSets,
    listeners,
    confirmMessages,
    intervalCallbacks,
    get toastWriteCount() { return toastWriteCount; },
    setNow(value) {
      if (!clock) throw new Error('This app instance does not have a controlled clock.');
      clock.value = new Date(value).getTime();
    },
    get fileReadCount() { return fileReadCount; },
    async settle() { await appLockManager.settle(); await new Promise((resolve) => setImmediate(resolve)); await appLockManager.settle(); }
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

function makeFocusLogEntry(id, taskId = null) {
  const endedAt = new Date().toISOString();
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  return { id, taskId, kind: 'focus', durationMinutes: 25, startedAt, endedAt, elapsedMs: 60_000, completed: true };
}

function makeFocusSession(id) {
  return focus.createSession({ id, kind: 'focus', durationMinutes: 25 }, Date.now());
}
function triggerTaskCompletion(app, taskId) {
  const handlers = app.listeners.get('#task-list:click') || [];
  const button = {
    dataset: { action: 'toggle' },
    closest(selector) {
      return selector === '[data-task-id]' ? { dataset: { taskId } } : null;
    }
  };
  const target = {
    closest(selector) {
      return selector === 'button[data-action]' ? button : null;
    }
  };
  return Promise.all(handlers.map((handler) => handler({ target })));
}

function triggerFormInput(app, selector, value) {
  const input = app.elements.get(selector);
  input.value = value;
  const handlers = app.listeners.get(`${selector}:input`) || [];
  return Promise.all(handlers.map((handler) => handler({ currentTarget: input })));
}

function triggerFormSubmit(app, selector) {
  const form = app.elements.get(selector);
  const handlers = app.listeners.get(`${selector}:submit`) || [];
  return Promise.all(handlers.map((handler) => handler({ currentTarget: form, preventDefault() {} })));
}

function triggerTaskEdit(app, taskId) {
  const handlers = app.listeners.get('#task-list:click') || [];
  const button = {
    dataset: { action: 'edit' },
    closest(selector) {
      return selector === '[data-task-id]' ? { dataset: { taskId } } : null;
    }
  };
  const target = {
    closest(selector) {
      return selector === 'button[data-action]' ? button : null;
    }
  };
  for (const handler of handlers) handler({ target });
}

function triggerTaskImport(app, file) {
  const input = app.elements.get('#import-file');
  input.files = [file];
  const handlers = app.listeners.get('#import-file:change') || [];
  return Promise.all(handlers.map((handler) => handler({ currentTarget: input })));
}

test('monthly task completed on a clamped date retains its original day anchor', async () => {
  const recurring = makeImportTask('monthly-31', 'Month-end task');
  recurring.dueDate = '2026-02-28';
  recurring.repeat = 'monthly';
  recurring.repeatDayOfMonth = 31;
  const app = bootApp({ savedValue: JSON.stringify([recurring]), fixedToday: '2026-02-28' });

  await triggerTaskCompletion(app, recurring.id);

  const saved = JSON.parse(app.storedValues.get(STORAGE_KEY));
  assert.equal(saved.length, 2);
  assert.equal(saved[0].completed, true);
  assert.equal(saved[1].dueDate, '2026-03-31', 'the next occurrence returns to day 31 after February');
  assert.equal(saved[1].repeatDayOfMonth, 31, 'the recurring series anchor is carried forward');
});

test('task import previews additions, duplicates and invalid rows before appending', async () => {
  const existing = makeImportTask('same-id', 'Original task');
  const savedValue = JSON.stringify([existing]);
  const app = bootApp({ savedValue });
  const importText = JSON.stringify([
    makeImportTask('same-id', 'Imported duplicate must not overwrite'),
    makeImportTask('new-id', 'New task'),
    { id: 'invalid-id', title: '', priority: 'medium', completed: false }
  ]);

  await triggerTaskImport(app, { size: Buffer.byteLength(importText), content: importText });

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

test('declining task import confirmation leaves storage unchanged', async () => {
  const existing = makeImportTask('existing-id', 'Keep this task');
  const savedValue = JSON.stringify([existing]);
  const app = bootApp({ savedValue, confirmResult: false });
  const importText = JSON.stringify([makeImportTask('incoming-id', 'Do not add')]);

  await triggerTaskImport(app, { size: Buffer.byteLength(importText), content: importText });

  assert.equal(app.confirmMessages.length, 1);
  assert.equal(app.storedValues.get(STORAGE_KEY), savedValue);
  assert.match(app.elements.get('#toast').textContent, /Import cancelled\. Nothing was changed/);
});

test('confirmation failure fails closed without mutating imported tasks', async () => {
  const existing = makeImportTask('existing-id', 'Keep this task');
  const savedValue = JSON.stringify([existing]);
  const app = bootApp({ savedValue, confirmThrows: true });
  const importText = JSON.stringify([makeImportTask('incoming-id', 'Do not add')]);

  await triggerTaskImport(app, { size: Buffer.byteLength(importText), content: importText });

  assert.equal(app.confirmMessages.length, 1);
  assert.equal(app.storedValues.get(STORAGE_KEY), savedValue);
  assert.match(app.elements.get('#toast').textContent, /confirmation could not be displayed/);
});

test('failed task import save rolls back in-memory state and reports no import', async () => {
  const existing = makeImportTask('existing-id', 'Keep this task');
  const savedValue = JSON.stringify([existing]);
  const app = bootApp({ savedValue, failPrimarySave: true });
  const importText = JSON.stringify([makeImportTask('incoming-id', 'Do not add')]);

  await triggerTaskImport(app, { size: Buffer.byteLength(importText), content: importText });

  assert.equal(app.confirmMessages.length, 1, 'the preview and confirmation still happen before saving');
  assert.equal(app.storedValues.get(STORAGE_KEY), savedValue, 'failed storage write must preserve the original payload');
  assert.doesNotMatch(app.elements.get('#task-list').innerHTML, /Do not add/, 'failed import must roll back the visible in-memory state');
  assert.match(app.elements.get('#toast').textContent, /No tasks were imported/);
});

test('oversized task backup is rejected before FileReader allocation', async () => {
  const app = bootApp({ savedValue: JSON.stringify([]) });
  await triggerTaskImport(app, { size: 8 * 1024 * 1024 + 1, content: '[]' });

  assert.equal(app.fileReadCount, 0, 'oversized files must be rejected before reading into memory');
  assert.equal(app.confirmMessages.length, 0);
  assert.match(app.elements.get('#toast').textContent, /maximum 8 MiB/);
});

test('combined recovery import appends task and Focus logs while preserving current session', async () => {
  const existingTask = makeImportTask('task-existing', 'Existing task');
  const incomingTask = makeImportTask('task-new', 'Recovered task');
  const existingLog = makeFocusLogEntry('focus-log-existing');
  const incomingLog = makeFocusLogEntry('focus-log-new');
  const currentSession = makeFocusSession('current-focus-session');
  const incomingSession = makeFocusSession('recovered-focus-session');
  const taskBackup = JSON.stringify({
    format: 'daymark-recovery-bundle-v1',
    payloads: [JSON.stringify([existingTask, incomingTask])]
  });
  const focusBackup = JSON.stringify({
    format: 'daymark-focus-recovery-bundle-v1',
    payloads: [JSON.stringify({ session: incomingSession, log: [existingLog, incomingLog] })]
  });
  const combined = JSON.stringify({ format: 'daymark-combined-recovery-v1', taskBackup, focusBackup });
  const app = bootApp({
    savedValue: JSON.stringify([existingTask]),
    savedFocusValue: JSON.stringify({ session: currentSession, log: [existingLog] })
  });

  await triggerTaskImport(app, { size: Buffer.byteLength(combined), content: combined });

  assert.equal(app.confirmMessages.length, 1);
  assert.match(app.confirmMessages[0], /1 new task will be added/);
  assert.match(app.confirmMessages[0], /1 duplicate task ID will be skipped/);
  assert.match(app.confirmMessages[0], /1 new log entry will be added/);
  assert.match(app.confirmMessages[0], /current session/);
  const tasks = JSON.parse(app.storedValues.get(STORAGE_KEY));
  assert.deepEqual(tasks.map((task) => task.id), ['task-existing', 'task-new']);
  const focusState = JSON.parse(app.storedValues.get(FOCUS_KEY));
  assert.equal(focusState.session.id, 'current-focus-session', 'an active local session must never be replaced');
  assert.deepEqual(focusState.log.map((entry) => entry.id), ['focus-log-existing', 'focus-log-new']);
});

test('Focus-only recovery import restores a session when no current session exists', async () => {
  const recoveredSession = makeFocusSession('recover-focus-session');
  const focusBackup = JSON.stringify({ session: recoveredSession, log: [] });
  const app = bootApp({ savedValue: JSON.stringify([]), savedFocusValue: JSON.stringify({ session: null, log: [] }) });

  await triggerTaskImport(app, { size: Buffer.byteLength(focusBackup), content: focusBackup });

  assert.equal(app.confirmMessages.length, 1);
  assert.match(app.confirmMessages[0], /One Focus session will be restored/);
  const restored = JSON.parse(app.storedValues.get(FOCUS_KEY));
  assert.equal(restored.session.id, 'recover-focus-session');
});

test('declining combined recovery import leaves task and Focus storage unchanged', async () => {
  const savedTasks = JSON.stringify([makeImportTask('keep-task', 'Keep task')]);
  const savedFocus = JSON.stringify({ session: null, log: [makeFocusLogEntry('keep-focus-log')] });
  const incoming = JSON.stringify({
    format: 'daymark-combined-recovery-v1',
    taskBackup: JSON.stringify([makeImportTask('incoming-task', 'Do not add')]),
    focusBackup: JSON.stringify({ session: null, log: [makeFocusLogEntry('incoming-focus-log')] })
  });
  const app = bootApp({ savedValue: savedTasks, savedFocusValue: savedFocus, confirmResult: false });

  await triggerTaskImport(app, { size: Buffer.byteLength(incoming), content: incoming });

  assert.equal(app.confirmMessages.length, 1);
  assert.equal(app.storedValues.get(STORAGE_KEY), savedTasks);
  assert.equal(app.storedValues.get(FOCUS_KEY), savedFocus);
  assert.match(app.elements.get('#toast').textContent, /Recovery import cancelled/);
});

test('Focus recovery storage failure rolls back in-memory history and preserves saved data', async () => {
  const savedFocus = JSON.stringify({ session: null, log: [] });
  const incoming = JSON.stringify({ session: null, log: [makeFocusLogEntry('incoming-focus-log')] });
  const app = bootApp({ savedValue: JSON.stringify([]), savedFocusValue: savedFocus, failFocusSave: true });

  await triggerTaskImport(app, { size: Buffer.byteLength(incoming), content: incoming });

  assert.equal(app.confirmMessages.length, 1);
  assert.equal(app.storedValues.get(FOCUS_KEY), savedFocus, 'failed Focus write must preserve original storage');
  assert.match(app.elements.get('#toast').textContent, /Focus log restore failed; current history was kept/);
});

test('malformed combined recovery bundle fails closed without prompting or mutation', async () => {
  const savedTasks = JSON.stringify([makeImportTask('keep-task', 'Keep task')]);
  const savedFocus = JSON.stringify({ session: null, log: [] });
  const malformed = JSON.stringify({ format: 'daymark-combined-recovery-v1', taskBackup: '{bad', focusBackup: '{bad' });
  const app = bootApp({ savedValue: savedTasks, savedFocusValue: savedFocus });

  await triggerTaskImport(app, { size: Buffer.byteLength(malformed), content: malformed });

  assert.equal(app.confirmMessages.length, 0);
  assert.equal(app.storedValues.get(STORAGE_KEY), savedTasks);
  assert.equal(app.storedValues.get(FOCUS_KEY), savedFocus);
  assert.match(app.elements.get('#toast').textContent, /No valid recovery data/);
});

test('opaque task recovery backup survives healthy primary load and later save', async () => {
  const existing = makeImportTask('existing-task', 'Existing task');
  const savedValue = JSON.stringify([existing]);
  const opaqueBackup = '{legacy recovery bytes that are not parseable JSON';
  const recoveryBundle = JSON.stringify({ format: 'daymark-recovery-bundle-v1', payloads: [opaqueBackup] });
  const app = bootApp({ savedValue, savedBackupValue: recoveryBundle });

  assert.equal(app.storedValues.get(BACKUP_KEY), recoveryBundle, 'explicit recovery bundle must survive healthy primary data at startup');
  const incoming = JSON.stringify([makeImportTask('new-task', 'Imported task')]);
  await triggerTaskImport(app, { size: Buffer.byteLength(incoming), content: incoming });

  assert.equal(app.storedValues.get(BACKUP_KEY), recoveryBundle, 'a successful save must not clear an opaque payload inside a recovery bundle');
  assert.equal(JSON.parse(app.storedValues.get(STORAGE_KEY)).length, 2);
});

test('healthy task-array backup is cleared as stale when primary is healthy', async () => {
  const primary = JSON.stringify([makeImportTask('primary-task', 'Primary task')]);
  const staleBackup = JSON.stringify([makeImportTask('old-task', 'Old backup task')]);
  const app = bootApp({ savedValue: primary, savedBackupValue: staleBackup });
  await app.settle();

  assert.equal(app.storedValues.has(BACKUP_KEY), false, 'a backup with only fully valid task arrays is stale and can be cleared');
});

test('corrupt saved data is copied to a browser backup and reported as preserved', async () => {
  const corruptData = '{not valid JSON';
  const app = bootApp({ savedValue: corruptData });
  const { elements, storedValues } = app;
  await app.settle();

  assert.equal(storedValues.get(BACKUP_KEY), corruptData);
  assert.match(elements.get('#toast').textContent, /kept in a browser (?:recovery )?backup/);
});

test('backup failure is reported honestly and leaves the original entry untouched', async () => {
  const corruptData = '{not valid JSON';
  const app = bootApp({ savedValue: corruptData, failBackup: true });
  const { elements, storedValues } = app;
  await app.settle();

  assert.equal(storedValues.has(BACKUP_KEY), false);
  assert.equal(storedValues.get(STORAGE_KEY), corruptData);
  assert.match(elements.get('#toast').textContent, /recovery backup could not be created/i);
});


test('simultaneous reminders are summarized in one toast instead of overwriting each other', async () => {
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
  const app = bootApp({ savedValue: JSON.stringify(tasks) });
  const { elements, storedValues } = app;
  await app.settle();

  const toast = elements.get('#toast').textContent;
  assert.match(toast, /First reminder/);
  assert.match(toast, /Second reminder/);
  const savedTasks = JSON.parse(storedValues.get(STORAGE_KEY));
  assert.equal(savedTasks.filter((task) => typeof task.reminderShownFire === 'string').length, 2);
});

test('date-only reminder helper uses accessible live-status markup in both forms', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const id of ['new-date-only-reminder-hint', 'edit-date-only-reminder-hint']) {
    const match = indexSource.match(new RegExp(`<p id="${id}"[^>]*>Date-only reminders use 9:00 AM local time\\.</p>`));
    assert.ok(match, `${id} should contain the date-only reminder disclosure`);
    assert.match(match[0], /role="status"/);
    assert.match(match[0], /aria-live="polite"/);
    assert.match(match[0], /aria-atomic="true"/);
    assert.match(match[0], /\shidden>/);
  }
});

test('add form shows date-only reminder guidance only for a date with no time and saves null time with the selected lead', async () => {
  const app = bootApp({ savedValue: JSON.stringify([]) });
  const hint = app.elements.get('#new-date-only-reminder-hint');
  assert.equal(hint.hidden, true);

  triggerFormInput(app, '#new-due-date', '2026-11-20');
  assert.equal(hint.hidden, false, 'a selected date with a blank time shows the guidance');
  triggerFormInput(app, '#new-due-time', '09:30');
  assert.equal(hint.hidden, true, 'entering a time hides the guidance');
  triggerFormInput(app, '#new-due-time', '');
  assert.equal(hint.hidden, false, 'clearing the time shows the guidance again');
  triggerFormInput(app, '#new-due-date', '');
  assert.equal(hint.hidden, true, 'clearing the date hides the guidance');
  assert.equal(app.elements.get('#new-due-time').value, '', 'clearing the date also clears the time input');

  triggerFormInput(app, '#new-due-date', '2026-11-20');
  app.elements.get('#new-title').value = 'Date-only reminder';
  app.elements.get('#new-reminder').value = '60';
  await triggerFormSubmit(app, '#add-form');

  const saved = JSON.parse(app.storedValues.get(STORAGE_KEY));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].dueDate, '2026-11-20');
  assert.equal(saved[0].dueTime, null, 'the 9:00 AM disclosure must not be written as a due time');
  assert.equal(saved[0].reminderLeadMinutes, 60, 'the selected reminder lead is preserved');
  assert.equal(hint.hidden, true, 'the helper hides after the add form resets');
});

test('edit form shows date-only reminder guidance and saves a null time with its selected lead', async () => {
  const task = makeImportTask('date-only-edit', 'Edit reminder');
  task.dueDate = '2026-11-21';
  task.dueTime = '14:30';
  task.reminderLeadMinutes = 30;
  const app = bootApp({ savedValue: JSON.stringify([task]) });
  const hint = app.elements.get('#edit-date-only-reminder-hint');

  triggerTaskEdit(app, task.id);
  assert.equal(hint.hidden, true, 'an existing timed task does not show the guidance');
  triggerFormInput(app, '#edit-due-time', '');
  assert.equal(hint.hidden, false, 'removing the due time shows the guidance');
  triggerFormInput(app, '#edit-due-time', '11:15');
  assert.equal(hint.hidden, true, 'entering a due time hides the guidance');
  triggerFormInput(app, '#edit-due-date', '');
  assert.equal(hint.hidden, true, 'removing the due date hides the guidance');
  assert.equal(app.elements.get('#edit-due-time').value, '', 'removing the due date clears the time input');
  triggerFormInput(app, '#edit-due-date', '2026-11-21');
  assert.equal(hint.hidden, false);
  app.elements.get('#edit-due-time').value = '';
  app.elements.get('#edit-reminder').value = '60';
  await triggerFormSubmit(app, '#edit-form');

  const saved = JSON.parse(app.storedValues.get(STORAGE_KEY));
  assert.equal(saved[0].dueTime, null, 'date-only edit keeps the saved time null');
  assert.equal(saved[0].reminderLeadMinutes, 60, 'date-only edit preserves the selected reminder lead');
});

async function withTimeZone(timeZone, run) {
  const originalTimeZone = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return await run();
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
}

function makeDateOnlyReminderTask(id, dueDate, reminderLeadMinutes, reminderShownFire) {
  const task = makeImportTask(id, `Reminder ${id}`);
  task.dueDate = dueDate;
  task.dueTime = null;
  task.reminderLeadMinutes = reminderLeadMinutes;
  if (reminderShownFire) task.reminderShownFire = reminderShownFire;
  return task;
}

test('date-only reminder persists with null dueTime and fires once at the disclosed 9 AM local time', async () => withTimeZone('America/New_York', async () => {
  const first = bootApp({
    savedValue: JSON.stringify([]),
    dateNow: '2026-11-20T13:59:00.000Z'
  });
  triggerFormInput(first, '#new-due-date', '2026-11-20');
  first.elements.get('#new-title').value = 'Date-only add form reminder';
  first.elements.get('#new-reminder').value = '0';
  await triggerFormSubmit(first, '#add-form');
  const firstSavedTasks = JSON.parse(first.storedValues.get(STORAGE_KEY));
  assert.equal(firstSavedTasks.length, 1, 'the Add form stores the new reminder');
  assert.equal(firstSavedTasks[0].dueDate, '2026-11-20');
  assert.equal(firstSavedTasks[0].dueTime, null, 'the Add form leaves the disclosed time out of storage');
  assert.equal(firstSavedTasks[0].reminderLeadMinutes, 0, 'the selected lead is saved with the date-only task');
  assert.equal(first.intervalCallbacks[0].delay, 30000, 'the app continues checking reminders on its existing interval');
  assert.equal(firstSavedTasks[0].reminderShownFire, undefined,
    '08:59 local is before the date-only 09:00 fire time');

  const reloaded = bootApp({
    savedValue: first.storedValues.get(STORAGE_KEY),
    dateNow: '2026-11-20T13:59:00.000Z'
  });
  const reloadedTask = JSON.parse(reloaded.storedValues.get(STORAGE_KEY))[0];
  assert.equal(reloadedTask.dueDate, '2026-11-20');
  assert.equal(reloadedTask.dueTime, null, 'the disclosed time is not persisted as a due time');
  assert.equal(reloadedTask.reminderLeadMinutes, 0, 'the selected lead survives reload');

  reloaded.setNow('2026-11-20T14:00:00.000Z');
  await reloaded.intervalCallbacks[0].callback();
  let savedTask = JSON.parse(reloaded.storedValues.get(STORAGE_KEY))[0];
  assert.equal(savedTask.dueTime, null);
  assert.equal(savedTask.reminderShownFire, '2026-11-20T14:00:00.000Z', '09:00 EST is recorded as the actual local fire instant');
  assert.match(reloaded.elements.get('#toast').textContent, /Reminder: “Date-only add form reminder” is due\./);

  const toastWritesAfterFirstFire = reloaded.toastWriteCount;
  assert.equal(toastWritesAfterFirstFire, 1, 'the reminder emits one visible toast when it first fires');
  await reloaded.intervalCallbacks[0].callback();
  savedTask = JSON.parse(reloaded.storedValues.get(STORAGE_KEY))[0];
  assert.equal(savedTask.reminderShownFire, '2026-11-20T14:00:00.000Z', 'the same fire instant is not shown twice');
  assert.equal(reloaded.toastWriteCount, toastWritesAfterFirstFire, 'the repeated interval check does not write/show another toast');
}));

test('editing a date-only reminder reschedules it without changing null-time or lead semantics', async () => withTimeZone('America/New_York', async () => {
  const task = makeDateOnlyReminderTask('date-only-reschedule', '2026-11-20', 0, '2026-11-20T14:00:00.000Z');
  const app = bootApp({
    savedValue: JSON.stringify([task]),
    dateNow: '2026-11-20T14:05:00.000Z'
  });
  triggerTaskEdit(app, task.id);
  triggerFormInput(app, '#edit-due-date', '2026-11-21');
  await triggerFormSubmit(app, '#edit-form');

  let savedTask = JSON.parse(app.storedValues.get(STORAGE_KEY))[0];
  assert.equal(savedTask.dueDate, '2026-11-21');
  assert.equal(savedTask.dueTime, null, 'rescheduling does not materialize the helper time');
  assert.equal(savedTask.reminderLeadMinutes, 0);
  assert.equal(savedTask.reminderShownFire, '2026-11-20T14:00:00.000Z', 'the previous fire marker remains attached to its old instant');

  app.setNow('2026-11-21T14:00:00.000Z');
  await app.intervalCallbacks[0].callback();
  savedTask = JSON.parse(app.storedValues.get(STORAGE_KEY))[0];
  assert.equal(savedTask.reminderShownFire, '2026-11-21T14:00:00.000Z', 'the rescheduled local 09:00 fire is delivered and persisted');
  assert.match(app.elements.get('#toast').textContent, /Reminder: “Reminder date-only-reschedule” is due\./);
}));

test('date-only reminders recalculate their 9 AM instant after a timezone change', async () => withTimeZone('America/Los_Angeles', async () => {
  const task = makeDateOnlyReminderTask('date-only-timezone', '2026-11-06', 0);
  const app = bootApp({ savedValue: JSON.stringify([task]), dateNow: '2026-11-06T14:00:00.000Z' });
  assert.equal(JSON.parse(app.storedValues.get(STORAGE_KEY))[0].reminderShownFire, undefined,
    'the same instant is 06:00 in Los Angeles, before the disclosed local time');
  process.env.TZ = 'America/New_York';
  await app.intervalCallbacks[0].callback();
  const savedTask = JSON.parse(app.storedValues.get(STORAGE_KEY))[0];
  assert.equal(savedTask.dueTime, null);
  assert.equal(savedTask.reminderShownFire, '2026-11-06T14:00:00.000Z',
    'the same instant is 09:00 in New York and becomes due without changing stored fields');
}));

test('date-only 9 AM scheduling stays local across the spring DST transition', async () => withTimeZone('America/New_York', async () => {
  const task = makeDateOnlyReminderTask('date-only-dst', '2026-03-08', 1440);
  const app = bootApp({ savedValue: JSON.stringify([task]), dateNow: '2026-03-07T13:59:00.000Z' });
  assert.equal(JSON.parse(app.storedValues.get(STORAGE_KEY))[0].reminderShownFire, undefined,
    '08:59 EST on the preceding local day is before the one-day reminder');

  app.setNow('2026-03-07T14:00:00.000Z');
  await app.intervalCallbacks[0].callback();
  const savedTask = JSON.parse(app.storedValues.get(STORAGE_KEY))[0];
  assert.equal(savedTask.reminderShownFire, '2026-03-07T14:00:00.000Z', 'the 24-hour lead fires at 09:00 EST on the preceding date');
  assert.equal(savedTask.dueTime, null);
  assert.equal(Date.parse('2026-03-08T13:00:00.000Z') - Date.parse(savedTask.reminderShownFire), 23 * 60 * 60 * 1000,
    '09:00 local on the due date is only 23 elapsed hours later across the spring-forward transition');
}));

test('the app reloads task memory when Clear All advances the generation in this tab', async () => {
  const existing = makeImportTask('cleared-in-memory', 'Should disappear after Clear All');
  const app = bootApp({ savedValue: JSON.stringify([existing]) });
  await app.settle();

  app.localStorage.removeItem(STORAGE_KEY);
  const advanced = taskMutation.advanceClearEpoch(app.localStorage);
  assert.equal(advanced.ok, true);
  app.window.dispatchEvent(new app.window.StorageEvent('storage', {
    key: taskMutation.GENERATION_KEY,
    newValue: JSON.stringify(advanced.value)
  }));

  assert.doesNotMatch(app.elements.get('#task-list').innerHTML, /Should disappear after Clear All/);
  assert.equal(JSON.parse(app.storedValues.get(STORAGE_KEY) || '[]').length, 0);
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

test('unreadable primary task key with readable backup offers recovery without mutation', () => {
  const backup = JSON.stringify([{ id: 't1', title: 'Recovered', completed: false, priority: 'medium', createdAt: '2026-01-01T00:00:00.000Z' }]);
  const app = bootApp({ savedValue: null, savedBackupValue: backup, failPrimaryRead: true });
  assert.equal(app.storedValues.get(STORAGE_KEY), null, 'primary key must not be written or treated as absent');
  assert.equal(app.storedValues.get(BACKUP_KEY), backup, 'backup must remain untouched');
  assert.match(app.elements.get('#storage-status span').textContent, /Primary task data unreadable; recovery backup available/);
  assert.match(app.elements.get('#toast').textContent, /recovery backup is available/);
  assert.equal(app.elements.get('#toast-action').hidden, false);
  assert.equal(app.elements.get('#toast-action').textContent, 'Export recovery');
});

test('unreadable primary task key with unreadable backup reports unknown recovery status', () => {
  const app = bootApp({ savedValue: null, failPrimaryRead: true, failBackupRead: true });
  assert.match(app.elements.get('#storage-status span').textContent, /recovery status unknown/);
  assert.match(app.elements.get('#toast').textContent, /Recovery status is unknown/);
});

test('unreadable primary task key with no backup reports no recovery backup found', () => {
  const app = bootApp({ savedValue: null, failPrimaryRead: true });
  assert.match(app.elements.get('#storage-status span').textContent, /no recovery backup found/);
  assert.match(app.elements.get('#toast').textContent, /No recovery backup was found/);
});

test('unreadable primary focus key with readable backup offers recovery', () => {
  const focusBackup = JSON.stringify({ session: null, log: [{ id: 'f1', kind: 'focus', finalElapsedMs: 1000 }] });
  const app = bootApp({ savedValue: null, savedFocusBackupValue: focusBackup, failFocusPrimaryRead: true });
  assert.equal(app.storedValues.get(FOCUS_KEY), null);
  assert.equal(app.storedValues.get(FOCUS_BACKUP_KEY), focusBackup);
  assert.match(app.elements.get('#storage-status span').textContent, /Primary focus data unreadable; recovery backup available/);
});
