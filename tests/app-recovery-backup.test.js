const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const logic = require('../task-logic.js');
const feedLogic = require('../feed-logic.js');
const focus = require('../focus-logic.js');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const STORAGE_KEY = 'daymark.tasks.v1';
const BACKUP_KEY = `${STORAGE_KEY}.backup`;
const FEED_KEY = 'daymark.feed.v1';
const FOCUS_KEY = 'daymark.focus.v1';
const FOCUS_BACKUP_KEY = `${FOCUS_KEY}.backup`;
const FEED_XML = '<rss version="2.0"><channel><title>Example feed</title><item><title>Offline story</title><link>https://example.com/story</link></item></channel></rss>';

function bootApp(storedValues, failWrites = new Set(), failExport = false, supportBlob = true, failReads = new Set(), webhookUi = null, onStorageWrite = null) {
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
          if (listener) return listener({
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
    getItem: (key) => {
      if (failReads.has(key)) throw new Error('SecurityError');
      return storedValues.has(key) ? storedValues.get(key) : null;
    },
    setItem: (key, value) => {
      if (failWrites.has(key)) throw new Error('QuotaExceededError');
      storedValues.set(key, String(value));
      if (typeof onStorageWrite === 'function') onStorageWrite(key, String(value));
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
    DaymarkFeed: feedLogic,
    DaymarkFocus: focus,
    DaymarkWebhookUi: webhookUi,
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
    Blob: supportBlob ? MockBlob : undefined,
    URL: supportBlob ? mockURL : { revokeObjectURL(url) { revokedObjectUrls.push(url); } },
    fetch: async () => ({ ok: true, status: 200, text: async () => FEED_XML }),
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


function dispatchTaskToggle(app, taskId) {
  const row = { dataset: { taskId } };
  const button = {
    dataset: { action: 'toggle' },
    closest(selector) { return selector === '[data-task-id]' ? row : null; }
  };
  const target = {
    closest(selector) { return selector === 'button[data-action]' ? button : null; }
  };
  app.elements.get('#task-list').dispatch('click', { target });
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



test('recovery export uses encoded data URL when Blob URL APIs are unavailable', () => {
  const priorOpaque = '{older opaque + recovery bytes\\nनमस्ते';
  const primary = JSON.stringify([
    validTask('valid-1', 'Keep valid task'),
    validTask('invalid-1', 'x'.repeat(170))
  ]);
  const storedValues = new Map([
    [STORAGE_KEY, primary],
    [BACKUP_KEY, priorOpaque]
  ]);
  const app = bootApp(storedValues, new Set(), false, false);
  const raw = storedValues.get(BACKUP_KEY);
  const action = app.elements.get('#toast-action');

  assert.equal(action.hidden, false);
  assert.equal(action.textContent, 'Export recovery');
  action.dispatch('click');

  const status = app.elements.get('#toast');
  assert.match(status.textContent, /Recovery backup prepared\. Tap Download now to save the file\./);
  assert.equal(action.textContent, 'Download now');
  assert.equal(app.getLastBlob(), null, 'fallback must not depend on Blob support');

  action.dispatch('click');
  const link = app.elements.get('#download-link');
  assert.equal(link.clicked, true);
  assert.equal(link.download, 'daymark-recovery-backup.txt');
  assert.equal(link.href, 'data:text/plain;charset=utf-8,' + encodeURIComponent(raw),
    'fallback URI must preserve the exact Unicode and punctuation payload');
  assert.equal(app.getPendingTimeouts().some((timer) => timer.delay === 1000), false,
    'data URLs do not need object-URL revocation');
});

test('unreadable task primary remains read-only after a user attempts to add a task', () => {
  const backup = JSON.stringify([validTask('recovered-task', 'Recovered task')]);
  const storedValues = new Map([[BACKUP_KEY, backup]]);
  const failReads = new Set([STORAGE_KEY]);
  const app = bootApp(storedValues, new Set(), false, true, failReads);

  app.elements.get('#new-title').value = 'Session-only task';
  app.elements.get('#add-form').dispatch('submit');

  assert.equal(storedValues.has(STORAGE_KEY), false,
    'a later setItem must not replace a primary key whose read failed');
  assert.equal(storedValues.get(BACKUP_KEY), backup,
    'the readable recovery backup remains byte-for-byte unchanged');
  assert.match(app.elements.get('#storage-status span').textContent,
    /Cannot save tasks safely: primary task data is unreadable/);
});

test('unreadable Focus primary remains read-only after a user starts a session', () => {
  const backup = JSON.stringify({ session: null, log: [] });
  const storedValues = new Map([[FOCUS_BACKUP_KEY, backup]]);
  const failReads = new Set([FOCUS_KEY]);
  const app = bootApp(storedValues, new Set(), false, true, failReads);

  assert.match(app.elements.get('#storage-status span').textContent,
    /Focus data unreadable; recovery backup available/);
  app.elements.get('#focus-start').dispatch('click');

  assert.equal(storedValues.has(FOCUS_KEY), false,
    'starting a timer must not overwrite an unreadable Focus primary');
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), backup,
    'the readable Focus backup remains byte-for-byte unchanged');
  assert.match(app.elements.get('#storage-status span').textContent,
    /Cannot save Focus data safely: primary Focus data is unreadable/);
});

test('unreadable task and Focus primaries with unreadable backups remain unchanged after attempted writes', () => {
  const storedValues = new Map();
  const failReads = new Set([STORAGE_KEY, BACKUP_KEY, FOCUS_KEY, FOCUS_BACKUP_KEY]);
  const app = bootApp(storedValues, new Set(), false, true, failReads);

  app.elements.get('#new-title').value = 'Must not overwrite task primary';
  app.elements.get('#add-form').dispatch('submit');
  assert.equal(storedValues.has(STORAGE_KEY), false);
  assert.equal(storedValues.has(BACKUP_KEY), false);
  assert.match(app.elements.get('#storage-status span').textContent,
    /Cannot save tasks safely: primary task data is unreadable/);

  app.elements.get('#focus-start').dispatch('click');
  assert.equal(storedValues.has(FOCUS_KEY), false);
  assert.equal(storedValues.has(FOCUS_BACKUP_KEY), false);
  assert.match(app.elements.get('#storage-status span').textContent,
    /Cannot save Focus data safely: primary Focus data is unreadable/);
});

test('unreadable task and Focus primaries with no backups do not create replacement primaries', () => {
  const storedValues = new Map();
  const failReads = new Set([STORAGE_KEY, FOCUS_KEY]);
  const app = bootApp(storedValues, new Set(), false, true, failReads);

  assert.match(app.elements.get('#storage-status span').textContent,
    /Focus data unreadable; no recovery backup found/);
  app.elements.get('#new-title').value = 'Session-only task';
  app.elements.get('#add-form').dispatch('submit');
  assert.equal(storedValues.has(STORAGE_KEY), false);
  assert.equal(storedValues.has(BACKUP_KEY), false);

  app.elements.get('#focus-start').dispatch('click');
  assert.equal(storedValues.has(FOCUS_KEY), false);
  assert.equal(storedValues.has(FOCUS_BACKUP_KEY), false);
});

test('app.js parses before browser runtime boot', () => {
  try {
    new vm.Script(APP_SOURCE, { filename: 'app.js' });
  } catch (error) {
    assert.fail(`app.js syntax error: ${error.stack || error.message}`);
  }
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


test('recovery export includes task and focus backup sources together without modifying either', () => {
  const taskPrimary = JSON.stringify([
    validTask('valid-1', 'Keep valid task'),
    validTask('invalid-1', 'x'.repeat(170))
  ]);
  const focusBackup = '{opaque focus recovery + bytes\\nनमस्ते';
  const storedValues = new Map([
    [STORAGE_KEY, taskPrimary],
    ['daymark.focus.v1.backup', focusBackup]
  ]);
  const app = bootApp(storedValues);
  const taskBackup = storedValues.get(BACKUP_KEY);
  const expected = JSON.stringify({
    format: 'daymark-combined-recovery-v1',
    taskBackup,
    focusBackup
  });

  const action = app.elements.get('#toast-action');
  assert.equal(action.hidden, false);
  action.dispatch('click');
  assert.equal(app.getLastBlob().parts[0], expected,
    'the exported envelope must contain both exact recovery payload strings');
  assert.equal(storedValues.get(BACKUP_KEY), taskBackup);
  assert.equal(storedValues.get('daymark.focus.v1.backup'), focusBackup);

  action.dispatch('click');
  assert.equal(app.elements.get('#download-link').clicked, true);
  assert.equal(app.elements.get('#download-link').download, 'daymark-recovery-backup.txt');
  assert.equal(storedValues.get(BACKUP_KEY), taskBackup,
    'export does not mutate the task recovery backup');
  assert.equal(storedValues.get('daymark.focus.v1.backup'), focusBackup,
    'export does not mutate the focus recovery backup');
});

test('Briefing reports when browser storage cannot persist the offline cache', async () => {
  const storedValues = new Map();
  const failWrites = new Set([FEED_KEY]);
  const app = bootApp(storedValues, failWrites);
  app.elements.get('#feed-url').value = 'https://example.com/feed.xml';

  await app.elements.get('#feed-form').dispatch('submit');

  assert.equal(storedValues.has(FEED_KEY), false, 'quota failure must not claim a saved cache');
  assert.match(app.elements.get('#feed-status').textContent,
    /browser storage could not save an offline copy/,
    'the status must distinguish a successful fetch from a durable offline save');
  assert.match(app.elements.get('#feed-list').innerHTML, /Offline story/,
    'the fetched items remain available in the current page session');
});

test('Briefing confirms when its cache was persisted for offline reading', async () => {
  const storedValues = new Map();
  const app = bootApp(storedValues);
  app.elements.get('#feed-url').value = 'https://example.com/feed.xml';

  await app.elements.get('#feed-form').dispatch('submit');

  assert.ok(storedValues.has(FEED_KEY), 'successful localStorage write stores the validated cache');
  assert.match(app.elements.get('#feed-status').textContent,
    /Saved for offline reading/,
    'the status only promises offline availability after persistence succeeds');
});


test('unreadable primary task key surfaces readable recovery backup without mutation', () => {
  const backup = JSON.stringify([validTask('recovered-1', 'Recovered task')]);
  const storedValues = new Map([
    [BACKUP_KEY, backup]
  ]);
  const failReads = new Set([STORAGE_KEY]);
  const app = bootApp(storedValues, new Set(), false, true, failReads);

  assert.match(app.elements.get('#storage-status span').textContent,
    /Primary task data unreadable; recovery backup available/);
  const action = app.elements.get('#toast-action');
  assert.equal(action.hidden, false);
  assert.equal(storedValues.get(BACKUP_KEY), backup, 'backup must remain untouched');
  assert.equal(storedValues.has(STORAGE_KEY), false, 'primary must not be written');
});

test('unreadable primary and unreadable backup reports unknown recovery status', () => {
  const storedValues = new Map();
  const failReads = new Set([STORAGE_KEY, BACKUP_KEY]);
  const app = bootApp(storedValues, new Set(), false, true, failReads);

  assert.match(app.elements.get('#storage-status span').textContent,
    /Primary task data unreadable; recovery status unknown/);
  assert.equal(app.elements.get('#toast-action').hidden, true);
});

test('unreadable primary with no backup reports no recovery backup found', () => {
  const storedValues = new Map();
  const failReads = new Set([STORAGE_KEY]);
  const app = bootApp(storedValues, new Set(), false, true, failReads);

  assert.match(app.elements.get('#storage-status span').textContent,
    /Primary task data unreadable; no recovery backup found/);
});




test('recovery export preserves readable task backup when Focus backup read is unknown', () => {
  const backup = JSON.stringify([validTask('task-backup', 'Keep readable task backup')]);
  const storedValues = new Map([[BACKUP_KEY, backup]]);
  const failReads = new Set([STORAGE_KEY, FOCUS_BACKUP_KEY]);
  const app = bootApp(storedValues, new Set(), false, true, failReads);
  const action = app.elements.get('#toast-action');

  assert.equal(action.hidden, false, 'a readable task backup remains exportable');
  assert.match(app.elements.get('#toast').textContent, /Another recovery key could not be read/);
  action.dispatch('click');

  const exported = JSON.parse(app.getLastBlob().parts[0]);
  assert.equal(exported.format, 'daymark-partial-recovery-v1');
  assert.equal(exported.taskBackup, backup, 'the task backup bytes are preserved exactly');
  assert.equal(exported.taskBackupStatus, 'available');
  assert.equal(exported.focusBackup, null);
  assert.equal(exported.focusBackupStatus, 'unknown',
    'an unreadable Focus backup is not misreported as absent');
  assert.equal(storedValues.get(BACKUP_KEY), backup);
  assert.equal(storedValues.has(STORAGE_KEY), false);
});

test('recovery export preserves readable Focus backup when task backup read is unknown', () => {
  const backup = JSON.stringify({ session: null, log: [{ id: 'focus-log', duration: 25 }] });
  const storedValues = new Map([[FOCUS_BACKUP_KEY, backup]]);
  const failReads = new Set([BACKUP_KEY, FOCUS_KEY]);
  const app = bootApp(storedValues, new Set(), false, true, failReads);
  const action = app.elements.get('#toast-action');

  assert.equal(action.hidden, false, 'a readable Focus backup remains exportable');
  assert.match(app.elements.get('#toast').textContent, /Another recovery key could not be read/);
  action.dispatch('click');

  const exported = JSON.parse(app.getLastBlob().parts[0]);
  assert.equal(exported.format, 'daymark-partial-recovery-v1');
  assert.equal(exported.taskBackup, null);
  assert.equal(exported.taskBackupStatus, 'unknown',
    'an unreadable task backup is not misreported as absent');
  assert.equal(exported.focusBackup, backup, 'the Focus backup bytes are preserved exactly');
  assert.equal(exported.focusBackupStatus, 'available');
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), backup);
  assert.equal(storedValues.has(FOCUS_KEY), false);
});



test('task-completion webhook is not queued when task persistence fails', () => {
  const original = JSON.stringify([validTask('webhook-task', 'Persist before webhook')]);
  const storedValues = new Map([[STORAGE_KEY, original]]);
  const notifications = [];
  const webhookUi = {
    notifyTaskCompleted(task) {
      notifications.push(task.id);
      return Promise.resolve({ queued: true });
    }
  };
  const app = bootApp(storedValues, new Set([STORAGE_KEY]), false, true, new Set(), webhookUi);

  dispatchTaskToggle(app, 'webhook-task');

  assert.deepEqual(notifications, [],
    'an external completion event must not be queued when the local primary write fails');
  assert.equal(storedValues.get(STORAGE_KEY), original,
    'failed persistence leaves the original task bytes unchanged');
});

test('task-completion webhook is queued only after a successful new completion write', () => {
  const original = JSON.stringify([validTask('webhook-task', 'Persist before webhook')]);
  const storedValues = new Map([[STORAGE_KEY, original]]);
  const order = [];
  const webhookUi = {
    notifyTaskCompleted(task) {
      order.push({ type: 'webhook', completed: task.completed });
      return Promise.resolve({ queued: true });
    }
  };
  const app = bootApp(storedValues, new Set(), false, true, new Set(), webhookUi,
    (key) => { if (key === STORAGE_KEY) order.push({ type: 'persist' }); });

  dispatchTaskToggle(app, 'webhook-task');
  assert.deepEqual(order, [
    { type: 'persist' },
    { type: 'webhook', completed: true }
  ], 'the task write must complete before the webhook notification');

  dispatchTaskToggle(app, 'webhook-task');
  assert.equal(order.filter((entry) => entry.type === 'webhook').length, 1,
    'reopening a task must not emit a completion webhook');
  assert.equal(JSON.parse(storedValues.get(STORAGE_KEY))[0].completed, false);
});


test('recovery bundles with unknown top-level fields remain opaque during healthy-primary cleanup', () => {
  const healthyPrimary = JSON.stringify([validTask('valid-1', 'Healthy task')]);
  const backupWithMetadata = JSON.stringify({
    format: 'daymark-recovery-bundle-v1',
    payloads: [healthyPrimary],
    legacyMetadata: { source: 'older recovery writer', revision: 2 }
  });
  const storedValues = new Map([
    [STORAGE_KEY, healthyPrimary],
    [BACKUP_KEY, backupWithMetadata]
  ]);
  const app = bootApp(storedValues);

  assert.equal(storedValues.get(BACKUP_KEY), backupWithMetadata,
    'unknown top-level metadata makes the whole envelope opaque, even when payload bytes match');
  assert.match(app.elements.get('#storage-status span').textContent,
    /recovery backup retained for manual review/);
});

test('unknown recovery-bundle fields survive when a new partial primary is backed up', () => {
  const olderPayload = JSON.stringify([
    validTask('older-valid', 'Older valid task'),
    validTask('older-invalid', 'x'.repeat(170))
  ]);
  const backupWithMetadata = JSON.stringify({
    format: 'daymark-recovery-bundle-v1',
    payloads: [olderPayload],
    legacyMetadata: { source: 'older recovery writer', revision: 2 }
  });
  const currentPrimary = JSON.stringify([
    validTask('current-valid', 'Current valid task'),
    validTask('current-invalid', 'y'.repeat(170))
  ]);
  const storedValues = new Map([
    [STORAGE_KEY, currentPrimary],
    [BACKUP_KEY, backupWithMetadata]
  ]);

  bootApp(storedValues);

  const merged = JSON.parse(storedValues.get(BACKUP_KEY));
  assert.equal(merged.format, 'daymark-recovery-bundle-v1');
  assert.deepEqual(merged.payloads, [backupWithMetadata, currentPrimary],
    'the exact prior envelope must be retained as an opaque payload');
  assert.deepEqual(JSON.parse(merged.payloads[0]).legacyMetadata,
    { source: 'older recovery writer', revision: 2 },
    'unknown metadata must survive byte-for-byte inside the retained envelope');
});

test('duplicate-key recovery bundles remain opaque instead of losing overwritten values', () => {
  const healthyPrimary = JSON.stringify([validTask('valid-1', 'Healthy task')]);
  const primaryValue = JSON.stringify(healthyPrimary);
  const ambiguousBackups = [
    '{"format":"legacy-recovery-v0","format":"daymark-recovery-bundle-v1","payloads":[' + primaryValue + ']}',
    '{"format":"daymark-recovery-bundle-v1","payloads":["older-payload"],"payloads":[' + primaryValue + ']}'
  ];

  for (const ambiguousBackup of ambiguousBackups) {
    const storedValues = new Map([
      [STORAGE_KEY, healthyPrimary],
      [BACKUP_KEY, ambiguousBackup]
    ]);
    const app = bootApp(storedValues);

    assert.equal(storedValues.get(BACKUP_KEY), ambiguousBackup,
      'duplicate keys make the parsed envelope ambiguous; original bytes must remain untouched');
    assert.match(app.elements.get('#storage-status span').textContent,
      /recovery backup retained for manual review/);
  }
});

test('a malformed backup is retained for manual recovery when the primary task store is healthy', () => {
  const healthyPrimary = JSON.stringify([validTask('valid-1', 'Healthy task')]);
  const opaqueBackup = '{previously unreadable}';
  const storedValues = new Map([
    [STORAGE_KEY, healthyPrimary],
    [BACKUP_KEY, opaqueBackup]
  ]);
  bootApp(storedValues);
  assert.equal(storedValues.get(BACKUP_KEY), opaqueBackup,
    'a healthy primary does not prove opaque backup bytes are redundant');
});

test('empty backup bytes and empty recovery bundles remain opaque recovery data', () => {
  const healthyPrimary = JSON.stringify([validTask('healthy-1', 'Healthy primary task')]);
  const emptyBundle = JSON.stringify({ format: 'daymark-recovery-bundle-v1', payloads: [] });
  const priorBackups = [
    ['empty string backup', ''],
    ['empty recovery bundle', emptyBundle]
  ];

  for (const [label, priorBackup] of priorBackups) {
    const storedValues = new Map([
      [STORAGE_KEY, healthyPrimary],
      [BACKUP_KEY, priorBackup]
    ]);
    const app = bootApp(storedValues);

    assert.equal(storedValues.get(BACKUP_KEY), priorBackup,
      label + ' must not be deleted merely because it contains no parseable task payload');
    assert.match(app.elements.get('#storage-status span').textContent,
      /recovery backup retained for manual review/,
      label + ' must be disclosed as retained recovery data');
  }
});

test('empty prior recovery sources survive when a new partial task payload is backed up', () => {
  const emptyBundle = JSON.stringify({ format: 'daymark-recovery-bundle-v1', payloads: [] });
  const priorBackups = ['', emptyBundle];
  const current = JSON.stringify([
    validTask('current-valid', 'Current valid task'),
    validTask('current-invalid', 'x'.repeat(170))
  ]);

  for (const priorBackup of priorBackups) {
    const storedValues = new Map([
      [STORAGE_KEY, current],
      [BACKUP_KEY, priorBackup]
    ]);
    bootApp(storedValues);

    const merged = JSON.parse(storedValues.get(BACKUP_KEY));
    assert.equal(merged.format, 'daymark-recovery-bundle-v1');
    assert.deepEqual(merged.payloads, [priorBackup, current],
      'the new recovery bundle must retain the exact prior empty/unknown source bytes');
  }
});



test('empty task recovery backup remains exportable when primary storage is unreadable', () => {
  const storedValues = new Map([[BACKUP_KEY, '']]);
  const failReads = new Set([STORAGE_KEY]);
  const app = bootApp(storedValues, new Set(), false, true, failReads);

  const action = app.elements.get('#toast-action');
  assert.equal(action.hidden, false, 'an empty but present task backup remains exportable');
  action.dispatch('click');

  const exported = JSON.parse(app.getLastBlob().parts[0]);
  assert.equal(exported.format, 'daymark-partial-recovery-v1');
  assert.equal(exported.taskBackup, '');
  assert.equal(exported.taskBackupStatus, 'available');
  assert.equal(exported.focusBackupStatus, 'absent');
  assert.equal(storedValues.get(BACKUP_KEY), '');
  assert.equal(storedValues.has(STORAGE_KEY), false);
});

test('empty Focus recovery backup remains exportable when primary storage is unreadable', () => {
  const storedValues = new Map([[FOCUS_BACKUP_KEY, '']]);
  const failReads = new Set([FOCUS_KEY]);
  const app = bootApp(storedValues, new Set(), false, true, failReads);

  const action = app.elements.get('#toast-action');
  assert.equal(action.hidden, false, 'an empty but present Focus backup remains exportable');
  action.dispatch('click');

  const exported = JSON.parse(app.getLastBlob().parts[0]);
  assert.equal(exported.format, 'daymark-partial-recovery-v1');
  assert.equal(exported.taskBackupStatus, 'absent');
  assert.equal(exported.focusBackup, '');
  assert.equal(exported.focusBackupStatus, 'available');
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), '');
  assert.equal(storedValues.has(FOCUS_KEY), false);
});

test('empty Focus primary payload is backed up as opaque data before any Focus save', () => {
  const storedValues = new Map([[FOCUS_KEY, '']]);
  const app = bootApp(storedValues);

  assert.equal(storedValues.get(FOCUS_KEY), '', 'the original empty primary bytes remain unchanged');
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), '', 'the exact empty payload is retained as a backup');
  assert.equal(app.elements.get('#toast-action').hidden, false,
    'the present empty backup remains available for manual export');
});



test('task recovery notice remains visible when a Focus backup is also present', () => {
  const corruptTask = '{not valid task JSON';
  const focusBackup = JSON.stringify({ session: null, log: [{ id: 'focus-backup', durationMinutes: 25 }] });
  const storedValues = new Map([[STORAGE_KEY, corruptTask], [FOCUS_BACKUP_KEY, focusBackup]]);
  const app = bootApp(storedValues);

  assert.match(app.elements.get('#toast').textContent, /original data was kept in a browser backup/i,
    'the Focus loader must not replace the more urgent task-recovery notice');
  const action = app.elements.get('#toast-action');
  assert.equal(action.hidden, false);
  action.dispatch('click');

  const exported = JSON.parse(app.getLastBlob().parts[0]);
  assert.equal(exported.format, 'daymark-combined-recovery-v1');
  assert.equal(exported.taskBackup, storedValues.get(BACKUP_KEY));
  assert.equal(exported.focusBackup, focusBackup);
  assert.equal(storedValues.get(STORAGE_KEY), corruptTask);
});



test('Focus backup remains exportable when task recovery backup creation fails', () => {
  const corruptTask = '{not valid task JSON';
  const focusBackup = JSON.stringify({ session: null, log: [{ id: 'focus-only', durationMinutes: 25 }] });
  const storedValues = new Map([[STORAGE_KEY, corruptTask], [FOCUS_BACKUP_KEY, focusBackup]]);
  const app = bootApp(storedValues, new Set([BACKUP_KEY]));

  const action = app.elements.get('#toast-action');
  assert.equal(action.hidden, false,
    'a readable Focus backup remains exportable even when task backup creation fails');
  action.dispatch('click');

  assert.equal(app.getLastBlob().parts[0], focusBackup,
    'the exact readable Focus backup is exported without inventing task backup bytes');
  assert.equal(storedValues.get(STORAGE_KEY), corruptTask,
    'the unreadable task primary is unchanged');
  assert.equal(storedValues.has(BACKUP_KEY), false,
    'failed backup creation does not write a placeholder task backup');
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), focusBackup);
});
