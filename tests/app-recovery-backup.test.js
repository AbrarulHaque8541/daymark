const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const logic = require('../task-logic.js');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const STORAGE_KEY = 'daymark.tasks.v1';
const BACKUP_KEY = `${STORAGE_KEY}.backup`;

function bootApp(storedValues, failWrites = new Set(), failExport = false) {
  const elements = new Map();

  function element(selector) {
    if (!elements.has(selector)) {
      const classes = new Set();
      const listeners = new Map();
      const item = {
        value: '',
        textContent: '',
        innerHTML: '',
        hidden: false,
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
        addEventListener: (type, listener) => listeners.set(type, listener),
        dispatch: (type, event = {}) => {
          const listener = listeners.get(type);
          if (listener) listener({
            preventDefault() {},
            currentTarget: item,
            target: item,
            ...event
          });
        },
        reset() {},
        attributes: new Map(),
        getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        removeAttribute(name) { this.attributes.delete(name); },
        querySelector: (child) => element(`${selector} ${child}`),
        focus() {},
        showModal() { this.open = true; },
        close() { this.open = false; },
        click() { this.clicked = true; },
        remove() {}
      };
      elements.set(selector, item);
    }
    return elements.get(selector);
  }

  let lastBlob = null;
  const revokedObjectUrls = [];
  const timers = new Map();
  let nextTimerId = 1;
  class MockBlob {
    constructor(parts, options = {}) {
      this.parts = parts;
      this.type = options.type || '';
    }
  }
  const mockURL = {
    createObjectURL(blob) {
      if (failExport) throw new Error('Blob URL creation failed');
      lastBlob = blob;
      return 'blob:daymark-recovery-test';
    },
    revokeObjectURL(url) { revokedObjectUrls.push(url); }
  };

  const localStorage = {
    getItem: (key) => storedValues.has(key) ? storedValues.get(key) : null,
    setItem: (key, value) => {
      if (failWrites.has(key)) throw new Error('QuotaExceededError');
      storedValues.set(key, String(value));
    },
    removeItem: (key) => storedValues.delete(key)
  };
  const document = {
    hidden: false,
    querySelector: element,
    querySelectorAll: () => [],
    createElement: () => element('#download-link'),
    body: { appendChild() {} },
    addEventListener() {}
  };
  const animationFrames = [];
  const window = {
    DaymarkLogic: logic,
    requestAnimationFrame(callback) { animationFrames.push(callback); return animationFrames.length; },
    addEventListener() {}
  };

  vm.runInNewContext(APP_SOURCE, {
    Date,
    Intl,
    Math,
    console: { warn() {} },
    document,
    localStorage,
    window,
    Blob: MockBlob,
    URL: mockURL,
    clearTimeout(id) { timers.delete(id); },
    setTimeout(callback, delay = 0) {
      const id = nextTimerId++;
      timers.set(id, { callback, delay });
      return id;
    },
    setInterval: () => 1
  }, { filename: 'app.js' });

  return {
    elements,
    getLastBlob: () => lastBlob,
    getRevokedObjectUrls: () => revokedObjectUrls.slice(),
    getPendingTimeouts: () => Array.from(timers.entries()).map(([id, timer]) => ({ id, delay: timer.delay })),
    lastTimeoutId: () => nextTimerId - 1,
    runTimeout(id) {
      const timer = timers.get(id);
      if (!timer) return;
      timers.delete(id);
      timer.callback();
    },
    flushAnimationFrame() {
      const callback = animationFrames.shift();
      if (callback) callback();
    }
  };
}

function validTask(id, title) {
  const timestamp = new Date().toISOString();
  return {
    id, title, dueDate: null, priority: 'medium', completed: false,
    createdAt: timestamp, updatedAt: timestamp
  };
}

test('partially rejected saved tasks survive a subsequent edit and page reload', () => {
  const original = JSON.stringify([
    validTask('valid-1', 'Keep valid task'),
    validTask('invalid-1', 'x'.repeat(170))
  ]);
  const storedValues = new Map([[STORAGE_KEY, original]]);
  const first = bootApp(storedValues);

  assert.equal(storedValues.get(BACKUP_KEY), original,
    'the full original payload is backed up when validation rejects a record');

  first.elements.get('#new-title').value = 'New task';
  first.elements.get('#add-form').dispatch('submit');
  assert.equal(first.elements.get('#storage-status span').textContent,
    'Saved on this device; ignored originals remain in a recovery backup');
  assert.equal(storedValues.get(BACKUP_KEY), original,
    'saving valid tasks must not delete the backup containing rejected records');

  const saved = JSON.parse(storedValues.get(STORAGE_KEY));
  assert.deepEqual(saved.map((task) => task.title), ['Keep valid task', 'New task']);

  const second = bootApp(storedValues);
  assert.equal(storedValues.get(BACKUP_KEY), original,
    'reload must retain the partial-recovery backup after the primary store becomes valid');
  assert.match(second.elements.get('#storage-status span').textContent,
    /ignored originals remain in a recovery backup/);
});

test('a new partial recovery backup preserves earlier rejected task records', () => {
  const earlier = JSON.stringify([
    validTask('earlier-valid', 'Earlier valid task'),
    validTask('earlier-invalid', 'x'.repeat(170))
  ]);
  const current = JSON.stringify([
    validTask('current-valid', 'Current valid task'),
    validTask('current-invalid', 'y'.repeat(170))
  ]);
  const storedValues = new Map([
    [STORAGE_KEY, current],
    [BACKUP_KEY, earlier]
  ]);

  const first = bootApp(storedValues);
  const bundle = JSON.parse(storedValues.get(BACKUP_KEY));
  assert.equal(bundle.format, 'daymark-recovery-bundle-v1');
  assert.deepEqual(bundle.payloads, [earlier, current],
    'backing up a new rejected payload must not overwrite the previous recovery source');

  first.elements.get('#new-title').value = 'Another task';
  first.elements.get('#add-form').dispatch('submit');
  assert.deepEqual(JSON.parse(storedValues.get(BACKUP_KEY)).payloads, [earlier, current],
    'subsequent saves must retain all recovery sources');

  bootApp(storedValues);
  assert.deepEqual(JSON.parse(storedValues.get(BACKUP_KEY)).payloads, [earlier, current],
    'reload must recognize the recovery bundle and retain it');
});

test('an opaque prior backup survives when a new partially invalid task payload is backed up', () => {
  const priorOpaqueBackup = '{older recovery bytes that are not parseable JSON';
  const original = JSON.stringify([
    validTask('valid-1', 'Keep valid task'),
    validTask('invalid-1', 'x'.repeat(170))
  ]);
  const storedValues = new Map([
    [STORAGE_KEY, original],
    [BACKUP_KEY, priorOpaqueBackup]
  ]);
  const app = bootApp(storedValues);

  const backup = JSON.parse(storedValues.get(BACKUP_KEY));
  assert.equal(backup.format, 'daymark-recovery-bundle-v1');
  assert.ok(backup.payloads.includes(priorOpaqueBackup),
    'opaque previous recovery bytes must be retained verbatim');
  assert.ok(backup.payloads.includes(original),
    'the newly rejected primary payload must also be retained');

  app.elements.get('#new-title').value = 'Safe follow-up edit';
  app.elements.get('#add-form').dispatch('submit');
  const afterSave = JSON.parse(storedValues.get(BACKUP_KEY));
  assert.ok(afterSave.payloads.includes(priorOpaqueBackup),
    'ordinary saves must not drop the opaque older recovery source');
  assert.ok(afterSave.payloads.includes(original),
    'ordinary saves must not drop the rejected task source');
});

test('a stale malformed backup is still cleared when the primary task store is healthy', () => {
  const storedValues = new Map([
    [STORAGE_KEY, JSON.stringify([validTask('valid-1', 'Healthy task')])],
    [BACKUP_KEY, '{previously unreadable}']
  ]);
  bootApp(storedValues);
  assert.equal(storedValues.has(BACKUP_KEY), false);
});


test('failed recovery backup creation never overwrites the only original task payload', () => {
  const original = JSON.stringify([
    validTask('valid-1', 'Keep valid task'),
    validTask('invalid-1', 'x'.repeat(170))
  ]);
  const storedValues = new Map([[STORAGE_KEY, original]]);
  const failWrites = new Set([BACKUP_KEY]);
  const app = bootApp(storedValues, failWrites);

  assert.equal(storedValues.get(STORAGE_KEY), original,
    'the primary remains byte-for-byte intact when backup creation fails');
  assert.equal(storedValues.has(BACKUP_KEY), false);
  assert.match(app.elements.get('#storage-status span').textContent,
    /recovery backup could not be created/);

  app.elements.get('#new-title').value = 'First unsaved edit';
  app.elements.get('#add-form').dispatch('submit');
  assert.equal(storedValues.get(STORAGE_KEY), original,
    'a later task save must not overwrite the only original copy');

  failWrites.delete(BACKUP_KEY);
  app.elements.get('#new-title').value = 'Retry after freeing storage';
  app.elements.get('#add-form').dispatch('submit');

  assert.equal(storedValues.get(BACKUP_KEY), original,
    'retry must create the recovery backup before changing primary storage');
  const saved = JSON.parse(storedValues.get(STORAGE_KEY));
  assert.ok(saved.some((task) => task.title === 'First unsaved edit'));
  assert.ok(saved.some((task) => task.title === 'Retry after freeing storage'));
});

test('recovery backup export preserves a second user gesture for browser download', () => {
  const opaque = '{older opaque recovery bytes';
  const original = JSON.stringify([
    validTask('valid-1', 'Keep valid task'),
    validTask('invalid-1', 'x'.repeat(170))
  ]);
  const storedValues = new Map([
    [STORAGE_KEY, original],
    [BACKUP_KEY, opaque]
  ]);
  const app = bootApp(storedValues);

  const backupRaw = storedValues.get(BACKUP_KEY);
  const action = app.elements.get('#toast-action');
  assert.equal(action.hidden, false, 'recovery toast exposes an export action');
  assert.equal(action.textContent, 'Export recovery');

  // First tap prepares the Blob but does not attempt a delayed download.
  action.dispatch('click');
  const status = app.elements.get('#toast');
  assert.match(status.textContent, /Recovery backup prepared\. Tap Download now to save the file\./);
  assert.equal(action.hidden, false);
  assert.equal(action.textContent, 'Download now');
  assert.equal(app.elements.has('#download-link'), false,
    'preparation must not consume the first tap by starting a download');
  assert.equal(app.getLastBlob().parts[0], backupRaw,
    'prepared Blob contains the exact retained recovery bytes');

  // Second tap is a real user gesture and triggers anchor.click() synchronously.
  action.dispatch('click');
  const link = app.elements.get('#download-link');
  assert.equal(link.clicked, true, 'download starts from the explicit second user gesture');
  assert.equal(link.download, 'daymark-recovery-backup.txt');
  assert.equal(link.href, 'blob:daymark-recovery-test');
  assert.match(status.textContent, /Recovery backup exported/);
  const revokeTimer = app.getPendingTimeouts().find((timer) => timer.delay === 1000);
  assert.ok(revokeTimer, 'successful download schedules object URL cleanup');
  app.runTimeout(revokeTimer.id);
  assert.deepEqual(app.getRevokedObjectUrls(), ['blob:daymark-recovery-test'],
    'object URL is revoked after the browser has had time to consume the download');
});


test('recovery export releases its prepared object URL when the action expires', () => {
  const original = JSON.stringify([
    validTask('valid-1', 'Keep valid task'),
    validTask('invalid-1', 'x'.repeat(170))
  ]);
  const storedValues = new Map([[STORAGE_KEY, original]]);
  const app = bootApp(storedValues);
  const action = app.elements.get('#toast-action');

  action.dispatch('click');
  assert.equal(app.getRevokedObjectUrls().length, 0,
    'the prepared URL remains available while the explicit download action is visible');
  const expiryTimer = app.lastTimeoutId();
  app.runTimeout(expiryTimer);

  assert.deepEqual(app.getRevokedObjectUrls(), ['blob:daymark-recovery-test'],
    'ignoring Download now must revoke the prepared object URL');
  assert.match(app.elements.get('#toast').textContent, /Recovery export expired/);
  assert.equal(action.hidden, true,
    'the expired download action must no longer be available');
});


test('recovery export reports Blob preparation failure without offering a broken download', () => {
  const original = JSON.stringify([
    validTask('valid-1', 'Keep valid task'),
    validTask('invalid-1', 'x'.repeat(170))
  ]);
  const storedValues = new Map([[STORAGE_KEY, original]]);
  const app = bootApp(storedValues, new Set(), true);
  const action = app.elements.get('#toast-action');

  action.dispatch('click');
  const status = app.elements.get('#toast');
  assert.equal(status.textContent, 'Recovery backup export is not available in this browser.');
  assert.equal(action.hidden, true,
    'a failed Blob preparation must not expose a Download now action');
  assert.equal(app.elements.has('#download-link'), false,
    'failed preparation must not create or click a download link');
});


test('app.js integrity guard rejects placeholder or truncated application source', () => {
  assert.ok(APP_SOURCE.length >= 50000,
    `app.js must retain the complete task/focus application (got ${APP_SOURCE.length} bytes)`);
  for (const marker of [
    'function loadTasks(',
    'function render(',
    'function exportRecoveryBackup(',
    'function loadFocusState('
  ]) {
    assert.ok(APP_SOURCE.includes(marker), `app.js is missing core behavior: ${marker}`);
  }
  assert.doesNotMatch(APP_SOURCE, /PLACEHOLDER_FULL_CONTENT|full content would be here|\$\(cat \/tmp\/app\.js\)/,
    'app.js must never be replaced with a placeholder or shell substitution');
});
