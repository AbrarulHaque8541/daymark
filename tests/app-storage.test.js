const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const logic = require('../task-logic.js');
const focus = require('../focus-logic.js');
const focusMutation = require('../focus-mutation-logic.js');
const repeat = require('../repeat-logic.js');
const mutation = require('../task-mutation-logic.js');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const STORAGE_KEY = 'daymark.tasks.v1';
const BACKUP_KEY = `${STORAGE_KEY}.backup`;
const FOCUS_KEY = 'daymark.focus.v1';
const FOCUS_BACKUP_KEY = `${FOCUS_KEY}.backup`;

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

function makeObservedLockManager() {
  const tails = new Map();
  let held = false;
  return {
    isHeld() { return held; },
    request(name, options, callback) {
      assert.equal(options.mode, 'exclusive');
      const previous = tails.get(name) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      tails.set(name, previous.then(() => gate));
      return previous.then(async () => {
        held = true;
        try { return await callback(); }
        finally { held = false; }
      }).finally(release);
    }
  };
}

function bootApp({ savedValue, savedFocusValue = null, savedBackupValue = null, savedFocusBackupValue = null, failBackup = false, failPrimarySave = false, failFocusSave = false, failPrimaryRead = false, failBackupRead = false, failFocusPrimaryRead = false, failFocusBackupRead = false, confirmResult = true, confirmThrows = false, fixedToday = null, dateNow = null, webhookUi = null, storageData = null, lockManager = null }) {
  const elements = new Map();
  const classSets = new Map();
  const listeners = new Map();
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
  const storedValues = storageData || new Map([[STORAGE_KEY, savedValue], [FOCUS_KEY, savedFocusValue]]);
  if (!storageData && savedBackupValue !== null) storedValues.set(BACKUP_KEY, savedBackupValue);
  if (!storageData && savedFocusBackupValue !== null) storedValues.set(FOCUS_BACKUP_KEY, savedFocusBackupValue);
  const effectiveLocks = lockManager === false ? null : (lockManager || makeLockManager());

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
    addEventListener() {}
  };
  const appLogic = fixedToday
    ? Object.assign({}, logic, {
      localDateString: (date) => date === undefined ? fixedToday : logic.localDateString(date)
    })
    : logic;
  const window = {
    DaymarkTaskMutation: mutation,
    navigator: effectiveLocks ? { locks: effectiveLocks } : {},
    DaymarkWebhookUi: webhookUi,
    DaymarkLogic: appLogic,
    DaymarkFocus: focus,
    DaymarkFocusMutation: focusMutation,
    DaymarkRepeat: repeat,
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
      if (file && typeof file.readAsText === 'function') {
        file.readAsText(this);
        return;
      }
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
    },
    clearInterval() {}
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
    settle() { return new Promise((resolve) => setImmediate(resolve)); }
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
async function triggerTaskCompletion(app, taskId) {
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
  for (const handler of handlers) await handler({ target });
}

function triggerFormInput(app, selector, value) {
  const input = app.elements.get(selector);
  input.value = value;
  const handlers = app.listeners.get(`${selector}:input`) || [];
  for (const handler of handlers) handler({ currentTarget: input });
}

async function triggerFormSubmit(app, selector) {
  const form = app.elements.get(selector);
  const handlers = app.listeners.get(`${selector}:submit`) || [];
  for (const handler of handlers) await handler({ currentTarget: form, preventDefault() {} });
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

async function triggerClick(app, selector) {
  const target = app.elements.get(selector);
  const handlers = app.listeners.get(`${selector}:click`) || [];
  for (const handler of handlers) await handler({ currentTarget: target, target, preventDefault() {} });
}

async function triggerTaskImport(app, file) {
  const input = app.elements.get('#import-file');
  input.files = [file];
  const handlers = app.listeners.get('#import-file:change') || [];
  for (const handler of handlers) await handler({ currentTarget: input });
}

test('undo waits for lock-backed persistence before reporting a restored task', async () => {
  const completed = makeImportTask('completed-undo', 'Completed task');
  completed.completed = true;
  const app = bootApp({ savedValue: JSON.stringify([completed]) });
  await app.settle();

  await triggerClick(app, '#clear-completed');
  assert.deepEqual(JSON.parse(app.storedValues.get(STORAGE_KEY)), [],
    'the completed task is cleared before Undo is offered');
  await triggerClick(app, '#toast-action');

  assert.deepEqual(JSON.parse(app.storedValues.get(STORAGE_KEY)), [completed],
    'Undo waits for the shared lock and persists the restored task');
  assert.match(app.elements.get('#toast').textContent, /Completed tasks restored/);
});

test('two tabs completing the same recurring occurrence create one deterministic next task', async () => {
  const recurring = makeImportTask('cross-tab-repeat-source', 'Daily recurring task');
  recurring.dueDate = '2026-11-10';
  recurring.repeat = 'daily';
  recurring.subtasks = [{ id: 'review-subtask', title: 'Review report', done: false }];
  const sharedStorage = new Map([[STORAGE_KEY, JSON.stringify([recurring])], [FOCUS_KEY, null]]);
  const sharedLocks = makeLockManager();
  const notifications = [];
  const webhookUi = {
    async notifyTaskCompleted(candidate) {
      notifications.push(candidate.id);
      return { queued: true, reason: 'queued' };
    }
  };
  const options = {
    storageData: sharedStorage,
    lockManager: sharedLocks,
    fixedToday: '2026-11-10',
    dateNow: '2026-11-10T04:00:00.123Z',
    webhookUi
  };
  const first = bootApp(options);
  const second = bootApp(options);

  await Promise.all([
    triggerTaskCompletion(first, recurring.id),
    triggerTaskCompletion(second, recurring.id)
  ]);

  const saved = JSON.parse(sharedStorage.get(STORAGE_KEY));
  const next = saved.filter((task) => task.id.startsWith('repeat-v1-'));
  assert.equal(saved.length, 2, 'the original occurrence and exactly one next occurrence are persisted');
  assert.equal(saved[0].completed, true);
  assert.equal(next.length, 1, 'the same source occurrence must not create two random-ID successors');
  assert.equal(next[0].dueDate, '2026-11-11');
  assert.match(next[0].id, /^repeat-v1-[0-9a-f]{32}$/);
  assert.match(next[0].subtasks[0].id, /^repeat-subtask-v1-[0-9a-f]{32}$/);
  assert.deepEqual(notifications, [recurring.id],
    'the second tab must not enqueue a duplicate completion webhook');
});

test('two tabs adding different tasks preserve both committed mutations', async () => {
  const initial = makeImportTask('existing', 'Existing');
  const sharedStorage = new Map([[STORAGE_KEY, JSON.stringify([initial])], [FOCUS_KEY, null]]);
  const sharedLocks = makeLockManager();
  const first = bootApp({ storageData: sharedStorage, lockManager: sharedLocks });
  const second = bootApp({ storageData: sharedStorage, lockManager: sharedLocks });

  first.elements.get('#new-title').value = 'Created in tab A';
  second.elements.get('#new-title').value = 'Created in tab B';
  await Promise.all([
    triggerFormSubmit(first, '#add-form'),
    triggerFormSubmit(second, '#add-form')
  ]);

  const saved = JSON.parse(sharedStorage.get(STORAGE_KEY));
  assert.deepEqual(saved.map((task) => task.title).sort(),
    ['Created in tab A', 'Created in tab B', 'Existing']);
});

test('task completion webhook is durably queued inside the task mutation lock after the task write', async () => {
  const task = makeImportTask('completion-webhook-lock', 'Complete under shared lock');
  const lockManager = makeObservedLockManager();
  const sharedStorage = new Map([[STORAGE_KEY, JSON.stringify([task])], [FOCUS_KEY, null]]);
  let observed = null;
  const webhookUi = {
    async notifyTaskCompleted(committedTask, options) {
      observed = {
        held: lockManager.isHeld(),
        committed: JSON.parse(sharedStorage.get(STORAGE_KEY)).find((item) => item.id === committedTask.id),
        options
      };
      return { queued: true, reason: 'queued' };
    }
  };
  const app = bootApp({ storageData: sharedStorage, lockManager, webhookUi });
  await triggerTaskCompletion(app, task.id);
  assert.equal(observed.held, true, 'the webhook append callback runs before the task lock is released');
  assert.equal(observed.committed.completed, true, 'the task write is durable before notification');
  assert.equal(observed.options.deferDelivery, true, 'network delivery is deferred outside the task lock callback');
});

test('task writes fail closed when Web Locks are unavailable', async () => {
  const app = bootApp({ savedValue: JSON.stringify([]), lockManager: false });
  app.elements.get('#new-title').value = 'Must not be falsely saved';
  await triggerFormSubmit(app, '#add-form');

  assert.deepEqual(JSON.parse(app.storedValues.get(STORAGE_KEY)), []);
  assert.match(app.elements.get('#storage-status span').textContent, /coordination is unavailable/i);
  assert.match(app.elements.get('#toast').textContent, /Could not save/i);
});

test('a stale tab does not recreate a task list removed by another context', async () => {
  const existing = makeImportTask('existing-before-removal', 'Existing before removal');
  const sharedStorage = new Map([[STORAGE_KEY, JSON.stringify([existing])], [FOCUS_KEY, null]]);
  const app = bootApp({ storageData: sharedStorage });
  sharedStorage.delete(STORAGE_KEY);

  app.elements.get('#new-title').value = 'Do not overwrite removal';
  await triggerFormSubmit(app, '#add-form');

  assert.equal(sharedStorage.has(STORAGE_KEY), false);
  assert.match(app.elements.get('#storage-status span').textContent, /removed by another context/i);
});

test('an unreadable replacement is backed up and never replaces a known task baseline', async () => {
  const existing = makeImportTask('existing-before-corruption', 'Existing before corruption');
  const sharedStorage = new Map([[STORAGE_KEY, JSON.stringify([existing])], [FOCUS_KEY, null]]);
  const app = bootApp({ storageData: sharedStorage });
  sharedStorage.set(STORAGE_KEY, '{broken replacement');

  app.elements.get('#new-title').value = 'Do not erase known tasks';
  await triggerFormSubmit(app, '#add-form');

  assert.equal(sharedStorage.get(STORAGE_KEY), '{broken replacement');
  assert.equal(sharedStorage.get(BACKUP_KEY), '{broken replacement');
  assert.match(app.elements.get('#storage-status span').textContent, /unreadable value/i);
});

test('a corrupt startup payload is preserved before a new task list is saved', async () => {
  const corrupt = '{broken startup payload';
  const app = bootApp({ savedValue: corrupt });
  app.elements.get('#new-title').value = 'New task after backup';
  await triggerFormSubmit(app, '#add-form');

  assert.equal(app.storedValues.get(BACKUP_KEY), corrupt);
  assert.equal(JSON.parse(app.storedValues.get(STORAGE_KEY))[0].title, 'New task after backup');
});

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

test('a JSON recovery import started before Clear All cannot restore tasks or Focus data afterward', async () => {
  const existingTask = makeImportTask('before-clear', 'Existing task');
  const incomingTask = makeImportTask('recovered-after-clear', 'Must stay cleared');
  const incomingFocus = makeFocusLogEntry('recovered-focus-after-clear');
  const taskBackup = JSON.stringify({ format: 'daymark-recovery-bundle-v1', payloads: [JSON.stringify([incomingTask])] });
  const focusBackup = JSON.stringify({ format: 'daymark-focus-recovery-bundle-v1', payloads: [JSON.stringify({ session: null, log: [incomingFocus] })] });
  const combined = JSON.stringify({ format: 'daymark-combined-recovery-v1', taskBackup, focusBackup });
  const app = bootApp({
    savedValue: JSON.stringify([existingTask]),
    savedFocusValue: JSON.stringify({ session: null, log: [] })
  });
  let releaseRead;
  let markReadStarted;
  const readStarted = new Promise((resolve) => { markReadStarted = resolve; });
  const file = {
    size: Buffer.byteLength(combined),
    readAsText(reader) {
      markReadStarted();
      releaseRead = () => {
        reader.result = combined;
        void reader.onload();
      };
    }
  };
  const importing = triggerTaskImport(app, file);
  await readStarted;

  const taskGeneration = mutation.incrementTaskGeneration(app.localStorage);
  const focusGeneration = focusMutation.incrementFocusGeneration(app.localStorage);
  assert.equal(taskGeneration.value, 1);
  assert.equal(focusGeneration.value, 1);
  app.localStorage.removeItem(STORAGE_KEY);
  app.localStorage.removeItem(FOCUS_KEY);

  releaseRead();
  await importing;

  assert.equal(app.storedValues.has(STORAGE_KEY), false,
    'the stale recovery import cannot recreate the task list after Clear All');
  assert.equal(app.storedValues.has(FOCUS_KEY), false,
    'the stale recovery import cannot recreate Focus data after Clear All');
  assert.equal(app.storedValues.get(mutation.TASK_GENERATION_KEY), '1');
  assert.equal(app.storedValues.get(focusMutation.FOCUS_GENERATION_KEY), '1');
  assert.match(app.elements.get('#toast').textContent, /Recovery import failed/);
});

test('a recovery import captured before Clear All cannot recreate cleared task or Focus records', async () => {
  const existingTask = makeImportTask('existing-before-clear', 'Existing task');
  const incomingTask = makeImportTask('incoming-after-clear', 'Must remain absent');
  const incomingLog = makeFocusLogEntry('incoming-focus-after-clear');
  const taskBackup = JSON.stringify({ format: 'daymark-recovery-bundle-v1', payloads: [JSON.stringify([incomingTask])] });
  const focusBackup = JSON.stringify({ format: 'daymark-focus-recovery-bundle-v1', payloads: [JSON.stringify({ session: null, log: [incomingLog] })] });
  const combined = JSON.stringify({ format: 'daymark-combined-recovery-v1', taskBackup, focusBackup });
  const app = bootApp({ savedValue: JSON.stringify([existingTask]), savedFocusValue: JSON.stringify({ session: null, log: [] }) });
  let releaseRead;
  let markReadStarted;
  const readStarted = new Promise((resolve) => { markReadStarted = resolve; });
  const file = {
    size: Buffer.byteLength(combined),
    readAsText(reader) {
      markReadStarted();
      releaseRead = () => { reader.result = combined; void reader.onload(); };
    }
  };
  const pendingImport = triggerTaskImport(app, file);
  await readStarted;

  const taskGeneration = mutation.incrementTaskGeneration(app.localStorage);
  const focusGeneration = focusMutation.incrementFocusGeneration(app.localStorage);
  assert.equal(taskGeneration.value, 1);
  assert.equal(focusGeneration.value, 1);
  app.localStorage.removeItem(STORAGE_KEY);
  app.localStorage.removeItem(FOCUS_KEY);

  releaseRead();
  await pendingImport;

  assert.equal(app.storedValues.has(STORAGE_KEY), false,
    'the queued task recovery cannot recreate the cleared task key');
  assert.equal(app.storedValues.has(FOCUS_KEY), false,
    'the queued Focus recovery cannot recreate the cleared Focus key');
  assert.equal(app.storedValues.get(mutation.TASK_GENERATION_KEY), '1');
  assert.equal(app.storedValues.get(focusMutation.FOCUS_GENERATION_KEY), '1');
  assert.match(app.elements.get('#toast').textContent, /Recovery import failed/);
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

test('byte-identical healthy task-array backup is cleared only while holding the shared task lock', async () => {
  const primary = JSON.stringify([makeImportTask('primary-task', 'Primary task')]);
  const locks = makeObservedLockManager();
  const storageData = new Map([[STORAGE_KEY, primary], [BACKUP_KEY, primary], [FOCUS_KEY, null]]);
  const removals = [];
  const originalDelete = storageData.delete.bind(storageData);
  storageData.delete = (key) => {
    removals.push({ key, lockHeld: locks.isHeld() });
    return originalDelete(key);
  };
  const app = bootApp({ storageData, lockManager: locks });
  await app.settle();

  assert.equal(app.storedValues.has(BACKUP_KEY), false,
    'only a byte-identical fully valid backup is redundant with the healthy primary');
  assert.deepEqual(removals.filter((entry) => entry.key === BACKUP_KEY),
    [{ key: BACKUP_KEY, lockHeld: true }],
    'startup cleanup must reread and remove recovery data inside the shared lock');
});

test('corrupt startup data is copied byte-for-byte under the shared task lock', async () => {
  const corruptData = '{not valid JSON';
  const locks = makeObservedLockManager();
  const storageData = new Map([[STORAGE_KEY, corruptData], [FOCUS_KEY, null]]);
  const writes = [];
  const originalSet = storageData.set.bind(storageData);
  storageData.set = (key, value) => {
    writes.push({ key, lockHeld: locks.isHeld() });
    return originalSet(key, value);
  };
  const app = bootApp({ storageData, lockManager: locks });
  await app.settle();

  assert.equal(app.storedValues.get(BACKUP_KEY), corruptData);
  assert.equal(app.storedValues.get(STORAGE_KEY), corruptData,
    'startup recovery maintenance never overwrites the unreadable primary');
  assert.deepEqual(writes.filter((entry) => entry.key === BACKUP_KEY),
    [{ key: BACKUP_KEY, lockHeld: true }],
    'recovery backup creation must happen inside the shared task lock');
  assert.match(app.elements.get('#toast').textContent, /kept in a browser backup/);
});

test('backup failure is reported honestly and leaves the original entry untouched', async () => {
  const corruptData = '{not valid JSON';
  const app = bootApp({ savedValue: corruptData, failBackup: true });
  await app.settle();

  assert.equal(app.storedValues.has(BACKUP_KEY), false);
  assert.equal(app.storedValues.get(STORAGE_KEY), corruptData);
  assert.match(app.elements.get('#toast').textContent, /Recovery backup could not be created/);
});

test('partially valid startup tasks are backed up byte-for-byte under the shared task lock', async () => {
  const valid = makeImportTask('valid-task', 'Valid task');
  const raw = JSON.stringify([valid, { id: 'invalid-task' }]);
  const locks = makeObservedLockManager();
  const storageData = new Map([[STORAGE_KEY, raw], [FOCUS_KEY, null]]);
  const writes = [];
  const originalSet = storageData.set.bind(storageData);
  storageData.set = (key, value) => {
    writes.push({ key, lockHeld: locks.isHeld() });
    return originalSet(key, value);
  };
  const app = bootApp({ storageData, lockManager: locks });
  await app.settle();

  assert.equal(app.storedValues.get(BACKUP_KEY), raw);
  assert.equal(app.storedValues.get(STORAGE_KEY), raw,
    'startup validation must not replace the original partially valid payload');
  assert.deepEqual(writes.filter((entry) => entry.key === BACKUP_KEY),
    [{ key: BACKUP_KEY, lockHeld: true }]);
});

test('clearing the task recovery backup does not let queued maintenance recreate it', async () => {
  const malformedPrimary = '{opaque original task bytes';
  const app = bootApp({ savedValue: malformedPrimary });
  await app.settle();
  assert.equal(typeof app.storedValues.get(BACKUP_KEY), 'string',
    'startup recovery maintenance first preserves the unreadable primary bytes');

  await mutation.withTaskMutationLock(app.window.navigator.locks, () => {
    const generation = mutation.incrementTaskGeneration(app.localStorage, 'task-backup');
    assert.deepEqual(generation, { ok: true, value: 1 });
    app.localStorage.removeItem(BACKUP_KEY);
  });
  app.window.dispatchEvent(new app.window.StorageEvent('storage', {
    key: mutation.TASK_GENERATION_KEY
  }));
  await app.settle();

  assert.equal(app.storedValues.get(STORAGE_KEY), malformedPrimary,
    'clearing the backup never overwrites the unreadable primary bytes');
  assert.equal(app.storedValues.has(BACKUP_KEY), false,
    'the explicit recovery-backup clear is not undone by automatic maintenance');
  assert.equal(app.storedValues.get(mutation.TASK_GENERATION_KEY), '1:task-backup');
});

test('startup recovery backup fails closed when Web Locks are unavailable', async () => {
  const corruptData = '{not valid JSON';
  const app = bootApp({ savedValue: corruptData, lockManager: false });
  await app.settle();

  assert.equal(app.storedValues.has(BACKUP_KEY), false);
  assert.equal(app.storedValues.get(STORAGE_KEY), corruptData,
    'the unreadable primary remains byte-for-byte untouched without coordination');
  assert.match(app.elements.get('#storage-status span').textContent, /safe cross-tab coordination/);
  assert.match(app.elements.get('#toast').textContent, /coordination is unavailable/);
});

test('startup recovery backup fails closed when the Web Lock request rejects', async () => {
  const corruptData = '{not valid JSON';
  const lockManager = { request: () => Promise.reject(new Error('lock unavailable')) };
  const app = bootApp({ savedValue: corruptData, lockManager });
  await app.settle();

  assert.equal(app.storedValues.has(BACKUP_KEY), false);
  assert.equal(app.storedValues.get(STORAGE_KEY), corruptData);
  assert.match(app.elements.get('#storage-status span').textContent, /shared task lock/);
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
  await app.settle();
  const { elements, storedValues } = app;

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

test('date-only reminder persists with null dueTime and fires once at the disclosed 9 AM local time', () => withTimeZone('America/New_York', async () => {
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

test('editing a date-only reminder reschedules it without changing null-time or lead semantics', () => withTimeZone('America/New_York', async () => {
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

test('date-only reminders recalculate their 9 AM instant after a timezone change', () => withTimeZone('America/Los_Angeles', async () => {
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

test('date-only 9 AM scheduling stays local across the spring DST transition', () => withTimeZone('America/New_York', async () => {
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

test('present opaque Focus backup is surfaced when the primary Focus key is absent', () => {
  for (const backup of ['', '{"session":', 'null']) {
    const app = bootApp({
      savedValue: JSON.stringify([]),
      savedFocusValue: null,
      savedFocusBackupValue: backup
    });
    const action = app.elements.get('#toast-action');

    assert.equal(app.storedValues.get(FOCUS_KEY), null);
    assert.equal(app.storedValues.get(FOCUS_BACKUP_KEY), backup,
      'the original empty or malformed backup bytes must remain unchanged');
    assert.equal(action.hidden, false,
      'a present opaque backup must be offered even when no payload can be parsed');
    assert.equal(action.textContent, 'Export recovery');
    assert.match(app.elements.get('#storage-status span').textContent,
      /Focus data recovery backup retained/);
  }
});

test('empty Focus recovery backup bytes survive a malformed-primary backup write', async () => {
  const malformedPrimary = '{"session":';
  const app = bootApp({
    savedValue: JSON.stringify([]),
    savedFocusValue: malformedPrimary,
    savedFocusBackupValue: ''
  });
  await app.settle();

  const storedBackup = app.storedValues.get(FOCUS_BACKUP_KEY);
  const bundle = JSON.parse(storedBackup);
  assert.equal(bundle.format, 'daymark-focus-recovery-bundle-v1');
  assert.deepEqual(bundle.payloads, ['', malformedPrimary],
    'the empty prior backup and malformed primary must both remain byte-for-byte recoverable');
});

test('completion webhook runs once and only after the completed task is persisted', async () => {
  const task = makeImportTask('webhook-order-success', 'Persist before notifying');
  const notifications = [];
  let app;
  const webhookUi = {
    notifyTaskCompleted(candidate) {
      const persisted = JSON.parse(app.storedValues.get(STORAGE_KEY))
        .find((item) => item.id === candidate.id);
      notifications.push({ taskId: candidate.id, persistedCompleted: persisted?.completed });
      return Promise.resolve();
    }
  };
  app = bootApp({ savedValue: JSON.stringify([task]), webhookUi });

  await triggerTaskCompletion(app, task.id);
  assert.deepEqual(notifications, [{ taskId: task.id, persistedCompleted: true }],
    'the webhook callback must observe the successfully persisted completed task');

  await triggerTaskCompletion(app, task.id);
  assert.equal(notifications.length, 1, 'reopening a task must not emit another completion event');
});

test('failed task persistence never emits a completion webhook', async () => {
  const task = makeImportTask('webhook-order-failure', 'Do not notify an unsaved completion');
  let notifications = 0;
  const app = bootApp({
    savedValue: JSON.stringify([task]),
    failPrimarySave: true,
    webhookUi: {
      notifyTaskCompleted() {
        notifications += 1;
        return Promise.resolve();
      }
    }
  });

  await triggerTaskCompletion(app, task.id);
  assert.equal(notifications, 0, 'a failed local save must not emit an external completion event');
  assert.equal(JSON.parse(app.storedValues.get(STORAGE_KEY))[0].completed, false,
    'the original persisted task remains open');
  assert.match(app.elements.get('#toast').textContent, /Could not save to this browser/,
    'the user is told that the local completion did not persist');
});
