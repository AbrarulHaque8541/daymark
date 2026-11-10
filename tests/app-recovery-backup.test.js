const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const logic = require('../task-logic.js');
const feedLogic = require('../feed-logic.js');
const focusLogic = require('../focus-logic.js');
const mutation = require('../task-mutation-logic.js');
const focusMutation = require('../focus-mutation-logic.js');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const STORAGE_KEY = 'daymark.tasks.v1';
const BACKUP_KEY = `${STORAGE_KEY}.backup`;
const FOCUS_BACKUP_KEY = 'daymark.focus.v1.backup';
const FEED_KEY = 'daymark.feed.v1';
const FEED_XML = '<rss version="2.0"><channel><title>Example feed</title><item><title>Offline story</title><link>https://example.com/story</link></item></channel></rss>';

function streamedFeedResponse() {
  const bytes = new TextEncoder().encode(FEED_XML);
  let offset = 0;
  const reader = {
    async read() {
      if (offset >= bytes.length) return { done: true };
      const end = Math.min(offset + 16, bytes.length);
      const value = bytes.slice(offset, end);
      offset = end;
      return { done: false, value };
    },
    cancel() {
      offset = bytes.length;
      return Promise.resolve();
    },
    releaseLock() {}
  };
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-length' ? String(bytes.length) : null;
      }
    },
    body: { getReader: () => reader },
    text() {
      throw new Error('Briefing fixture must use the bounded streaming feed reader');
    }
  };
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

function bootApp(storedValues, failWrites = new Set(), failExport = false, supportBlob = true, failReads = new Set(), focusApi = null, lockManager = makeLockManager()) {
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
    getItem(key) {
      if (failReads.has(key)) throw new Error('SecurityError: storage read blocked');
      return storedValues.has(key) ? storedValues.get(key) : null;
    },
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
  const windowListeners = new Map();
  const window = {
    DaymarkTaskMutation: mutation,
    DaymarkFocusMutation: focusMutation,
    navigator: { locks: lockManager },
    DaymarkLogic: logic,
    DaymarkFeed: feedLogic,
    DaymarkFocus: focusApi,
    requestAnimationFrame(callback) { animationFrames.push(callback); return animationFrames.length; },
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    dispatchEvent(event) {
      (windowListeners.get(event.type) || []).forEach((listener) => listener(event));
      return true;
    }
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
    fetch: async () => streamedFeedResponse(),
    clearTimeout(id) { timers.delete(id); },
    setTimeout(callback, delay = 0) {
      const id = nextTimerId++;
      timers.set(id, { callback, delay });
      return id;
    },
    setInterval: () => 1,
    clearInterval() {}
  }, { filename: 'app.js' });

  return {
    elements,
    lockManager,
    dispatchWindow(event) { return window.dispatchEvent(event); },
    settle() { return new Promise((resolve) => setImmediate(resolve)); },
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

test('partially rejected saved tasks survive a subsequent edit and page reload', async () => {
  const original = JSON.stringify([
    validTask('valid-1', 'Keep valid task'),
    validTask('invalid-1', 'x'.repeat(170))
  ]);
  const storedValues = new Map([[STORAGE_KEY, original]]);
  const first = bootApp(storedValues);
  await first.settle();

  assert.equal(storedValues.get(BACKUP_KEY), original,
    'the full original payload is backed up when validation rejects a record');

  first.elements.get('#new-title').value = 'New task';
  await first.elements.get('#add-form').dispatch('submit');
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

test('a new partial recovery backup preserves earlier rejected task records', async () => {
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
  await first.settle();
  const bundle = JSON.parse(storedValues.get(BACKUP_KEY));
  assert.equal(bundle.format, 'daymark-recovery-bundle-v1');
  assert.deepEqual(bundle.payloads, [earlier, current],
    'backing up a new rejected payload must not overwrite the previous recovery source');

  first.elements.get('#new-title').value = 'Another task';
  await first.elements.get('#add-form').dispatch('submit');
  assert.deepEqual(JSON.parse(storedValues.get(BACKUP_KEY)).payloads, [earlier, current],
    'subsequent saves must retain all recovery sources');

  bootApp(storedValues);
  assert.deepEqual(JSON.parse(storedValues.get(BACKUP_KEY)).payloads, [earlier, current],
    'reload must recognize the recovery bundle and retain it');
});

test('an opaque prior backup survives when a new partially invalid task payload is backed up', async () => {
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
  await app.settle();

  const backup = JSON.parse(storedValues.get(BACKUP_KEY));
  assert.equal(backup.format, 'daymark-recovery-bundle-v1');
  assert.ok(backup.payloads.includes(priorOpaqueBackup),
    'opaque previous recovery bytes must be retained verbatim');
  assert.ok(backup.payloads.includes(original),
    'the newly rejected primary payload must also be retained');

  app.elements.get('#new-title').value = 'Safe follow-up edit';
  await app.elements.get('#add-form').dispatch('submit');
  const afterSave = JSON.parse(storedValues.get(BACKUP_KEY));
  assert.ok(afterSave.payloads.includes(priorOpaqueBackup),
    'ordinary saves must not drop the opaque older recovery source');
  assert.ok(afterSave.payloads.includes(original),
    'ordinary saves must not drop the rejected task source');
});

test('an opaque backup is retained when the primary task store is healthy', () => {
  const opaque = '{previously unreadable recovery bytes';
  const storedValues = new Map([
    [STORAGE_KEY, JSON.stringify([validTask('valid-1', 'Healthy task')])],
    [BACKUP_KEY, opaque]
  ]);
  const app = bootApp(storedValues);
  assert.equal(storedValues.get(BACKUP_KEY), opaque,
    'healthy primary data does not prove opaque backup bytes are redundant');
  assert.match(app.elements.get('#storage-status span').textContent, /recovery backup retained for manual review/);
});

test('a different valid task backup is retained when the primary task store is healthy', async () => {
  const older = JSON.stringify([validTask('older-task', 'Older recoverable task')]);
  const primary = JSON.stringify([validTask('current-task', 'Current task')]);
  const storedValues = new Map([[STORAGE_KEY, primary], [BACKUP_KEY, older]]);
  const app = bootApp(storedValues);
  assert.equal(storedValues.get(BACKUP_KEY), older,
    'a different valid backup may contain tasks absent from the primary payload');
  app.elements.get('#new-title').value = 'Follow-up edit';
  await app.elements.get('#add-form').dispatch('submit');
  assert.equal(storedValues.get(BACKUP_KEY), older,
    'a later save must not erase the distinct older recovery copy');
});

test('an exact byte-identical valid backup is the only healthy backup cleared automatically', async () => {
  const primary = JSON.stringify([validTask('same-task', 'Same task')]);
  const storedValues = new Map([[STORAGE_KEY, primary], [BACKUP_KEY, primary]]);
  const app = bootApp(storedValues);
  await app.settle();
  assert.equal(storedValues.has(BACKUP_KEY), false,
    'the backup is redundant only when its exact bytes match the healthy primary');
});


test('empty backup bytes and empty recovery bundles remain opaque recovery data', () => {
  const healthyPrimary = JSON.stringify([validTask('healthy-1', 'Healthy primary task')]);
  const emptyBundle = JSON.stringify({ format: 'daymark-recovery-bundle-v1', payloads: [] });
  for (const priorBackup of ['', emptyBundle]) {
    const storedValues = new Map([[STORAGE_KEY, healthyPrimary], [BACKUP_KEY, priorBackup]]);
    const app = bootApp(storedValues);
    assert.equal(storedValues.get(BACKUP_KEY), priorBackup,
      'present empty/unknown recovery bytes must not be cleared');
    assert.match(app.elements.get('#storage-status span').textContent, /recovery backup retained for manual review/);
  }
});

test('empty prior recovery sources survive when a new partial task payload is backed up', async () => {
  const emptyBundle = JSON.stringify({ format: 'daymark-recovery-bundle-v1', payloads: [] });
  const current = JSON.stringify([
    validTask('current-valid', 'Current task'),
    validTask('current-invalid', 'x'.repeat(170))
  ]);
  for (const priorBackup of ['', emptyBundle]) {
    const storedValues = new Map([[STORAGE_KEY, current], [BACKUP_KEY, priorBackup]]);
    const app = bootApp(storedValues);
    await app.settle();
    const merged = JSON.parse(storedValues.get(BACKUP_KEY));
    assert.equal(merged.format, 'daymark-recovery-bundle-v1');
    assert.deepEqual(merged.payloads, [priorBackup, current],
      'new recovery bundles must retain exact prior empty/unknown bytes');
  }
});

test('primary task JSON with duplicate keys is preserved byte-for-byte for manual recovery', async () => {
  const ambiguous = '[{"id":"primary-duplicate","title":"Original title","title":"Overwritten title","dueDate":null,"priority":"medium","completed":false,"createdAt":"2026-11-09T05:00:00.000Z","updatedAt":"2026-11-09T05:00:00.000Z","subtasks":[{"id":"step-1","title":"Original step","title":"Overwritten step","done":false}]}]';
  const storedValues = new Map([[STORAGE_KEY, ambiguous]]);
  const app = bootApp(storedValues);
  await app.settle();

  assert.equal(storedValues.get(STORAGE_KEY), ambiguous,
    'JSON.parse must not silently choose one duplicate field and rewrite the primary');
  assert.equal(storedValues.get(BACKUP_KEY), ambiguous,
    'the exact ambiguous task/subtask bytes must be preserved in recovery storage');
  assert.match(app.elements.get('#storage-status span').textContent, /Saved data could not be read/);
  assert.equal(app.elements.get('#toast-action').hidden, false,
    'the preserved ambiguous payload remains available for manual export');
});

test('failed recovery backup creation never overwrites the only original task payload', async () => {
  const original = JSON.stringify([
    validTask('valid-1', 'Keep valid task'),
    validTask('invalid-1', 'x'.repeat(170))
  ]);
  const storedValues = new Map([[STORAGE_KEY, original]]);
  const failWrites = new Set([BACKUP_KEY]);
  const app = bootApp(storedValues, failWrites);
  await app.settle();

  assert.equal(storedValues.get(STORAGE_KEY), original,
    'the primary remains byte-for-byte intact when backup creation fails');
  assert.equal(storedValues.has(BACKUP_KEY), false);
  assert.match(app.elements.get('#storage-status span').textContent,
    /Recovery backup could not be created/);

  app.elements.get('#new-title').value = 'First unsaved edit';
  await app.elements.get('#add-form').dispatch('submit');
  assert.equal(storedValues.get(STORAGE_KEY), original,
    'a later task save must not overwrite the only original copy');

  failWrites.delete(BACKUP_KEY);
  app.elements.get('#new-title').value = 'Retry after freeing storage';
  await app.elements.get('#add-form').dispatch('submit');

  assert.equal(storedValues.get(BACKUP_KEY), original,
    'retry must create the recovery backup before changing primary storage');
  const saved = JSON.parse(storedValues.get(STORAGE_KEY));
  assert.ok(saved.some((task) => task.title === 'First unsaved edit'));
  assert.ok(saved.some((task) => task.title === 'Retry after freeing storage'));
});

test('recovery backup export preserves a second user gesture for browser download', async () => {
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
  await app.settle();

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


test('recovery export releases its prepared object URL when the action expires', async () => {
  const original = JSON.stringify([
    validTask('valid-1', 'Keep valid task'),
    validTask('invalid-1', 'x'.repeat(170))
  ]);
  const storedValues = new Map([[STORAGE_KEY, original]]);
  const app = bootApp(storedValues);
  await app.settle();
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


test('recovery export reports Blob preparation failure without offering a broken download', async () => {
  const original = JSON.stringify([
    validTask('valid-1', 'Keep valid task'),
    validTask('invalid-1', 'x'.repeat(170))
  ]);
  const storedValues = new Map([[STORAGE_KEY, original]]);
  const app = bootApp(storedValues, new Set(), true);
  await app.settle();
  const action = app.elements.get('#toast-action');

  action.dispatch('click');
  const status = app.elements.get('#toast');
  assert.equal(status.textContent, 'Recovery backup export is not available in this browser.');
  assert.equal(action.hidden, true,
    'a failed Blob preparation must not expose a Download now action');
  assert.equal(app.elements.has('#download-link'), false,
    'failed preparation must not create or click a download link');
});



test('recovery export uses encoded data URL when Blob URL APIs are unavailable', async () => {
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
  await app.settle();
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

test('a valid task recovery backup is surfaced when the primary task key is absent', () => {
  const backup = JSON.stringify([validTask('backup-task', 'Recover this task')]);
  const storedValues = new Map([[BACKUP_KEY, backup]]);
  const app = bootApp(storedValues);
  const action = app.elements.get('#toast-action');

  assert.equal(storedValues.has(STORAGE_KEY), false,
    'the absent primary key must not be created or auto-restored');
  assert.equal(action.hidden, false, 'a readable backup must expose manual export');
  assert.equal(action.textContent, 'Export recovery');
  assert.match(app.elements.get('#storage-status span').textContent,
    /recovery backup available for manual export/i);
  action.dispatch('click');
  assert.equal(app.getLastBlob().parts[0], backup,
    'manual export must preserve the exact original backup bytes');
  assert.equal(storedValues.get(BACKUP_KEY), backup,
    'surfacing/exporting recovery data must not mutate the backup');
});

test('empty and malformed task backups remain exportable when the primary key is absent', () => {
  for (const backup of ['', '{opaque recovery bytes']) {
    const storedValues = new Map([[BACKUP_KEY, backup]]);
    const app = bootApp(storedValues);
    const action = app.elements.get('#toast-action');

    assert.equal(storedValues.has(STORAGE_KEY), false,
      'opaque recovery data must never be auto-restored into the primary key');
    assert.equal(action.hidden, false,
      'a present zero-byte or malformed backup is still a recovery source');
    action.dispatch('click');
    assert.equal(app.getLastBlob().parts[0], backup,
      'manual export must preserve opaque bytes exactly');
    assert.equal(storedValues.get(BACKUP_KEY), backup,
      'the original opaque backup must remain unchanged');
  }
});

test('unreadable task backup is reported as unknown when the primary key is absent', () => {
  const focusBackup = '{independent focus recovery bytes';
  const storedValues = new Map([[FOCUS_BACKUP_KEY, focusBackup]]);
  const app = bootApp(storedValues, new Set(), false, true, new Set([BACKUP_KEY]));
  const action = app.elements.get('#toast-action');

  assert.equal(storedValues.has(STORAGE_KEY), false);
  assert.match(app.elements.get('#storage-status span').textContent,
    /recovery backup status unknown/i);
  assert.equal(action.hidden, false,
    'an independently readable Focus backup remains exportable');
  action.dispatch('click');
  assert.equal(app.getLastBlob().parts[0], focusBackup);
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), focusBackup);
});

test('an empty task backup remains exportable when the primary task read throws', () => {
  const storedValues = new Map([[BACKUP_KEY, '']]);
  const app = bootApp(storedValues, new Set(), false, true, new Set([STORAGE_KEY]));
  const action = app.elements.get('#toast-action');

  assert.equal(action.hidden, false,
    'a readable zero-byte task backup is still present when the primary key is unreadable');
  action.dispatch('click');
  assert.equal(app.getLastBlob().parts[0], '',
    'manual recovery export must preserve the exact zero-byte task backup');
  assert.equal(storedValues.get(BACKUP_KEY), '',
    'the zero-byte recovery source must remain unchanged');
});

test('an empty primary task value is preserved as opaque recovery data', async () => {
  const storedValues = new Map([[STORAGE_KEY, '']]);
  const app = bootApp(storedValues);
  await app.settle();
  const action = app.elements.get('#toast-action');

  assert.equal(storedValues.get(STORAGE_KEY), '',
    'the empty primary task bytes must not be rewritten');
  assert.equal(storedValues.get(BACKUP_KEY), '',
    'the exact empty primary task bytes must be retained as a recovery backup');
  assert.equal(action.hidden, false);
  action.dispatch('click');
  assert.equal(app.getLastBlob().parts[0], '',
    'the recovery export must preserve the exact empty task bytes');
});

test('an empty Focus backup remains exportable when the primary Focus read throws', () => {
  const storedValues = new Map([[FOCUS_BACKUP_KEY, '']]);
  const app = bootApp(storedValues, new Set(), false, true, new Set(['daymark.focus.v1']), focusLogic);
  const action = app.elements.get('#toast-action');

  assert.equal(action.hidden, false,
    'a readable zero-byte Focus backup must not be reported as absent');
  action.dispatch('click');
  assert.equal(app.getLastBlob().parts[0], '',
    'manual recovery export must preserve the exact zero-byte Focus backup');
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), '',
    'the zero-byte Focus recovery source must remain unchanged');
});

test('an empty primary Focus value is preserved as opaque recovery data', async () => {
  const storedValues = new Map([['daymark.focus.v1', '']]);
  const app = bootApp(storedValues, new Set(), false, true, new Set(), focusLogic);
  await app.settle();
  const action = app.elements.get('#toast-action');

  assert.equal(storedValues.get('daymark.focus.v1'), '',
    'the unreadable zero-byte primary must not be rewritten');
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), '',
    'the exact zero-byte primary must be retained as a recovery backup');
  assert.equal(action.hidden, false);
  action.dispatch('click');
  assert.equal(app.getLastBlob().parts[0], '',
    'the recovery export must preserve the exact primary bytes');
});

test('an empty primary Focus value does not overwrite an older opaque recovery source', async () => {
  const prior = '{older Focus recovery bytes';
  const storedValues = new Map([
    ['daymark.focus.v1', ''],
    [FOCUS_BACKUP_KEY, prior]
  ]);
  const app = bootApp(storedValues, new Set(), false, true, new Set(), focusLogic);
  await app.settle();
  const backup = JSON.parse(storedValues.get(FOCUS_BACKUP_KEY));

  assert.equal(storedValues.get('daymark.focus.v1'), '',
    'the empty primary Focus bytes must remain unchanged');
  assert.equal(backup.format, 'daymark-focus-recovery-bundle-v1');
  assert.deepEqual(backup.payloads, [prior, ''],
    'the older opaque backup and the empty primary bytes must both remain recoverable');
  const action = app.elements.get('#toast-action');
  assert.equal(action.hidden, false);
  action.dispatch('click');
  assert.equal(app.getLastBlob().parts[0], storedValues.get(FOCUS_BACKUP_KEY),
    'manual export must preserve the complete combined Focus recovery source');
});

test('empty strings are malformed recovery payloads, not absent recovery sources', () => {
  const taskStart = APP_SOURCE.indexOf('function readTaskRecoveryPayloads(raw) {');
  const focusStart = APP_SOURCE.indexOf('function readFocusRecoveryStates(raw) {');
  const importStart = APP_SOURCE.indexOf('async function applyImportedRecovery(');
  assert.ok(taskStart >= 0 && focusStart > taskStart && importStart > focusStart,
    'task and Focus recovery parser sections must exist');
  const taskParser = APP_SOURCE.slice(taskStart, focusStart);
  const focusParser = APP_SOURCE.slice(focusStart, importStart);
  assert.match(taskParser, /if \(raw\.length === 0\) \{ result\.malformedCount = 1; return result; \}/);
  assert.match(focusParser, /if \(raw\.length === 0\) \{ result\.malformedCount = 1; return result; \}/);
  const focusLoaderStart = APP_SOURCE.indexOf('function loadFocusState() {');
  const focusPersistStart = APP_SOURCE.indexOf('function persistFocusState() {', focusLoaderStart);
  const focusLoader = APP_SOURCE.slice(focusLoaderStart, focusPersistStart);
  assert.match(focusLoader, /if \(saved === null\)/);
  assert.doesNotMatch(focusLoader, /if \(!saved\)/);
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


test('an empty opaque task backup remains available as a zero-byte export', () => {
  const storedValues = new Map([
    [STORAGE_KEY, JSON.stringify([validTask('primary', 'Healthy primary task')])],
    [BACKUP_KEY, '']
  ]);
  const app = bootApp(storedValues);
  const action = app.elements.get('#toast-action');

  assert.equal(action.hidden, false,
    'a readable empty-string backup is still a present opaque recovery source');
  assert.equal(action.textContent, 'Export recovery');
  action.dispatch('click');
  assert.equal(app.getLastBlob().parts[0], '',
    'the export preserves the exact zero-byte backup payload');
  assert.match(app.elements.get('#toast').textContent, /Recovery backup prepared/);
  action.dispatch('click');
  assert.equal(app.elements.get('#download-link').clicked, true,
    'the user can download the zero-byte recovery file');
  assert.equal(storedValues.get(BACKUP_KEY), '',
    'export never mutates the original empty backup');
});

test('an empty task backup is included when the independent Focus backup is exported', () => {
  const focusBackup = '{opaque focus recovery bytes';
  const storedValues = new Map([
    [STORAGE_KEY, JSON.stringify([validTask('primary', 'Healthy primary task')])],
    [BACKUP_KEY, ''],
    [FOCUS_BACKUP_KEY, focusBackup]
  ]);
  const app = bootApp(storedValues);
  const action = app.elements.get('#toast-action');

  assert.equal(action.hidden, false);
  action.dispatch('click');
  assert.equal(app.getLastBlob().parts[0], JSON.stringify({
    format: 'daymark-combined-recovery-v1',
    taskBackup: '',
    focusBackup
  }), 'the combined export preserves both independent recovery sources exactly');
});

test('recovery export includes task and focus backup sources together without modifying either', async () => {
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
  await app.settle();
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


test('task recovery backup remains exportable when the Focus backup key is unreadable', () => {
  const taskBackup = JSON.stringify([validTask('task-backup', 'Task backup remains readable')]);
  const focusBackup = JSON.stringify({ session: null, log: [] });
  const storedValues = new Map([[BACKUP_KEY, taskBackup], [FOCUS_BACKUP_KEY, focusBackup]]);
  const app = bootApp(storedValues, new Set(), false, true, new Set([STORAGE_KEY, FOCUS_BACKUP_KEY]));

  const action = app.elements.get('#toast-action');
  assert.equal(action.hidden, false, 'a readable task backup must still expose the export action');
  assert.equal(action.textContent, 'Export recovery');
  action.dispatch('click');
  assert.equal(app.getLastBlob().parts[0], taskBackup, 'the export contains the readable task backup bytes');
  assert.equal(storedValues.get(BACKUP_KEY), taskBackup, 'the original task backup remains untouched');
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), focusBackup, 'the unreadable Focus key is not overwritten');
});

test('unreadable Focus backup is reported as unknown when the primary Focus key is absent', () => {
  const storedValues = new Map([[STORAGE_KEY, '[]']]);
  const app = bootApp(storedValues, new Set(), false, true, new Set([FOCUS_BACKUP_KEY]), focusLogic);

  assert.match(app.elements.get('#storage-status span').textContent, /Focus recovery backup status unknown/i);
  assert.equal(storedValues.has('daymark.focus.v1'), false, 'an absent primary Focus key remains absent');
  assert.equal(storedValues.has(FOCUS_BACKUP_KEY), false, 'the unreadable recovery key is never recreated or removed');
  assert.notEqual(app.elements.get('#toast-action').textContent, 'Export recovery', 'no export action is offered when neither backup can be read');
});

test('unreadable Focus backup is reported as unknown when a valid primary Focus state exists', () => {
  const primaryFocus = JSON.stringify({ session: null, log: [] });
  const storedValues = new Map([[STORAGE_KEY, '[]'], ['daymark.focus.v1', primaryFocus]]);
  const app = bootApp(storedValues, new Set(), false, true, new Set([FOCUS_BACKUP_KEY]), focusLogic);

  assert.match(app.elements.get('#storage-status span').textContent, /Focus recovery backup status unknown/i);
  assert.equal(storedValues.get('daymark.focus.v1'), primaryFocus, 'the readable primary Focus bytes remain unchanged');
  assert.equal(storedValues.has(FOCUS_BACKUP_KEY), false, 'the unreadable backup is not replaced with an empty value');
});

test('a readable task backup remains exportable when the Focus backup is unreadable and its primary is absent', () => {
  const taskBackup = JSON.stringify([validTask('independent-task-backup', 'Keep independent task backup')]);
  const storedValues = new Map([[STORAGE_KEY, '[]'], [BACKUP_KEY, taskBackup]]);
  const app = bootApp(storedValues, new Set(), false, true, new Set([FOCUS_BACKUP_KEY]), focusLogic);

  assert.match(app.elements.get('#storage-status span').textContent, /Focus recovery backup status unknown/i);
  const action = app.elements.get('#toast-action');
  assert.equal(action.hidden, false, 'the independently readable task backup still exposes export');
  assert.equal(action.textContent, 'Export recovery');
  action.dispatch('click');
  assert.equal(app.getLastBlob().parts[0], taskBackup, 'the export contains only the readable task backup bytes');
  assert.equal(storedValues.get(BACKUP_KEY), taskBackup, 'the original task backup remains untouched');
  assert.equal(storedValues.has(FOCUS_BACKUP_KEY), false, 'the unreadable Focus backup is not recreated or overwritten');
});

test('Focus recovery backup remains exportable when the task backup key is unreadable', () => {
  const focusBackup = JSON.stringify({ session: null, log: [{ id: 'focus-backup', kind: 'focus', finalElapsedMs: 1000 }] });
  const storedValues = new Map([[STORAGE_KEY, '[]'], [FOCUS_BACKUP_KEY, focusBackup]]);
  const app = bootApp(storedValues, new Set(), false, true, new Set([BACKUP_KEY]));

  const action = app.elements.get('#toast-action');
  assert.equal(action.hidden, false, 'a readable Focus backup must still expose the export action');
  assert.equal(action.textContent, 'Export recovery');
  action.dispatch('click');
  assert.equal(app.getLastBlob().parts[0], focusBackup, 'the export contains the readable Focus backup bytes');
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), focusBackup, 'the original Focus backup remains untouched');
  assert.equal(storedValues.has(BACKUP_KEY), false, 'the unreadable task backup is not recreated as an empty value');
});

test('duplicate keys in a task recovery backup remain opaque and are never auto-cleared', () => {
  const record = JSON.stringify(validTask('backup-duplicate', 'Original title'))
    .replace('"title":"Original title"', '"title":"Original title","title":"Overwritten title"');
  const ambiguousBackup = '[' + record + ']';
  const storedValues = new Map([
    [STORAGE_KEY, JSON.stringify([validTask('primary', 'Healthy primary')])],
    [BACKUP_KEY, ambiguousBackup]
  ]);
  bootApp(storedValues);
  assert.equal(storedValues.get(BACKUP_KEY), ambiguousBackup);
});

test('duplicate keys in primary Focus state are backed up without rewriting the primary', async () => {
  const ambiguous = '{"session":null,"session":{"id":"ambiguous-session"},"log":[]}';
  const storedValues = new Map([['daymark.focus.v1', ambiguous]]);
  const app = bootApp(storedValues, new Set(), false, true, new Set(), focusLogic);
  await app.settle();
  assert.equal(storedValues.get('daymark.focus.v1'), ambiguous);
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), ambiguous);
  assert.match(app.elements.get('#storage-status span').textContent, /Focus data recovery backup retained/);
});



test('a valid primary Focus state still exposes a readable opaque recovery backup', () => {
  const primary = JSON.stringify({ session: null, log: [] });
  const backup = '{opaque Focus recovery bytes';
  const storedValues = new Map([
    [STORAGE_KEY, '[]'],
    ['daymark.focus.v1', primary],
    [FOCUS_BACKUP_KEY, backup]
  ]);
  const app = bootApp(storedValues, new Set(), false, true, new Set(), focusLogic);

  assert.equal(app.elements.get('#toast-action').hidden, false,
    'a present Focus backup must remain exportable even when the primary state is valid');
  assert.equal(app.elements.get('#toast-action').textContent, 'Export recovery');
  assert.match(app.elements.get('#storage-status span').textContent,
    /Focus data recovery backup retained/);
  app.elements.get('#toast-action').dispatch('click');
  assert.ok(app.getLastBlob().parts[0].includes(backup),
    'the manual recovery export must include the exact opaque Focus backup bytes');
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), backup,
    'loading and exporting must not alter the original backup');
});



test('an expired Focus session can be finalized without hiding an existing recovery backup', async () => {
  const now = Date.now();
  const expired = focusLogic.createSession({ kind: 'focus', durationMinutes: 1 }, now - 2 * 60 * 1000);
  const primary = JSON.stringify({ session: focusLogic.serialize(expired), log: [] });
  const backup = '{older opaque Focus recovery bytes';
  const storedValues = new Map([
    [STORAGE_KEY, '[]'],
    ['daymark.focus.v1', primary],
    [FOCUS_BACKUP_KEY, backup]
  ]);
  const app = bootApp(storedValues, new Set(), false, true, new Set(), focusLogic);
  await app.settle();
  const saved = JSON.parse(storedValues.get('daymark.focus.v1'));

  assert.equal(saved.session, null, 'an expired running session is finalized on reload');
  assert.equal(saved.log.length, 1, 'the completed session is added to the Focus log');
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), backup,
    'finalizing a session must retain the older recovery bytes');
  assert.equal(app.elements.get('#toast-action').hidden, false,
    'the retained backup remains available for manual export');
  assert.match(app.elements.get('#storage-status span').textContent,
    /Focus data recovery backup retained/);
});

test('a normal Focus save succeeds when no recovery backup exists', async () => {
  const primary = JSON.stringify({ session: null, log: [] });
  const storedValues = new Map([[ 'daymark.focus.v1', primary ]]);
  const app = bootApp(storedValues, new Set(), false, true, new Set(), focusLogic);

  await app.elements.get('#focus-start').dispatch('click');

  const saved = JSON.parse(storedValues.get('daymark.focus.v1'));
  assert.ok(saved.session, 'the new running Focus session is persisted');
  assert.match(app.elements.get('#toast').textContent, /Focus started — 25:00 on the clock/,
    'the UI reports success after the primary Focus write succeeds');
  assert.doesNotMatch(app.elements.get('#toast').textContent, /could not be saved/,
    'an absent recovery backup is not a save failure');
});

test('a Focus save succeeds but reports unknown when the recovery backup is unreadable', async () => {
  const primary = JSON.stringify({ session: null, log: [] });
  const storedValues = new Map([[ 'daymark.focus.v1', primary ]]);
  const app = bootApp(storedValues, new Set(), false, true, new Set([FOCUS_BACKUP_KEY]), focusLogic);

  await app.elements.get('#focus-start').dispatch('click');

  const saved = JSON.parse(storedValues.get('daymark.focus.v1'));
  assert.ok(saved.session, 'the valid primary Focus state is saved');
  assert.match(app.elements.get('#storage-status span').textContent,
    /Focus recovery backup status unknown/i,
    'the app must disclose that the independent backup could not be inspected');
  assert.match(app.elements.get('#toast').textContent, /Focus started — 25:00 on the clock/,
    'an unreadable backup does not falsely report that the primary save failed');
  assert.equal(storedValues.has(FOCUS_BACKUP_KEY), false,
    'the unreadable backup key is not recreated or overwritten');
});


test('same-tab Focus clear event invalidates the old session before a fresh session can save', async () => {
  const oldSession = focusLogic.createSession({ kind: 'focus', durationMinutes: 25 }, Date.now());
  const oldRaw = JSON.stringify({
    session: focusLogic.serialize(oldSession),
    log: [{ id: 'old-log', elapsedMs: 1000 }]
  });
  const storedValues = new Map([['daymark.focus.v1', oldRaw]]);
  const locks = makeLockManager();
  const app = bootApp(storedValues, new Set(), false, true, new Set(), focusLogic, locks);
  await app.settle();

  const storage = {
    getItem(key) { return storedValues.has(key) ? storedValues.get(key) : null; },
    setItem(key, value) { storedValues.set(key, String(value)); },
    removeItem(key) { storedValues.delete(key); }
  };
  await focusMutation.withFocusMutationLock(locks, () => {
    const generation = focusMutation.incrementFocusGeneration(storage);
    assert.equal(generation.ok, true);
    storage.removeItem('daymark.focus.v1');
  });
  app.dispatchWindow({ type: 'daymark:focus-storage-cleared', detail: { categoryId: 'focus' } });

  await app.elements.get('#focus-start').dispatch('click');
  const saved = JSON.parse(storedValues.get('daymark.focus.v1'));
  assert.notEqual(saved.session.id, oldSession.id, 'a new session, not the cleared in-memory session, is saved');
  assert.deepEqual(saved.log, [], 'the cleared Focus history is not restored from stale memory');
});

test('same-tab Focus preset clear resets the in-memory preset before the next session', async () => {
  const presetKey = 'daymark.focus.preset.v1';
  const storedValues = new Map([[presetKey, JSON.stringify({ preset: 'long-break' })]]);
  const locks = makeLockManager();
  const app = bootApp(storedValues, new Set(), false, true, new Set(), focusLogic, locks);
  await app.settle();

  const storage = {
    getItem(key) { return storedValues.has(key) ? storedValues.get(key) : null; },
    setItem(key, value) { storedValues.set(key, String(value)); },
    removeItem(key) { storedValues.delete(key); }
  };
  await focusMutation.withFocusMutationLock(locks, () => {
    const generation = focusMutation.incrementFocusGeneration(storage);
    assert.equal(generation.ok, true);
    storage.removeItem(presetKey);
  });
  app.dispatchWindow({ type: 'daymark:focus-storage-cleared', detail: { categoryId: 'focus-preset' } });

  await app.elements.get('#focus-start').dispatch('click');
  const saved = JSON.parse(storedValues.get('daymark.focus.v1'));
  assert.equal(saved.session.durationMinutes, focusLogic.presetMinutes('focus'));
  assert.equal(storedValues.has(presetKey), false, 'the stale preset is not recreated');
});

test('duplicate keys in a Focus recovery envelope remain opaque and exportable', () => {
  const ambiguous = '{"format":"daymark-focus-recovery-bundle-v1","payloads":[],"payloads":["{}"]}';
  const storedValues = new Map([
    [STORAGE_KEY, JSON.stringify([validTask('primary', 'Healthy primary')])],
    [FOCUS_BACKUP_KEY, ambiguous]
  ]);
  const app = bootApp(storedValues);
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), ambiguous);
  assert.equal(app.elements.get('#toast-action').hidden, false);
});


test('strict instant rejection preserves the exact original task payload for recovery', async () => {
  const invalidCreatedAt = { ...validTask('invalid-created-at', 'Invalid createdAt'),
    createdAt: '2026-02-30T00:00:00Z' };
  const invalidUpdatedAt = { ...validTask('invalid-updated-at', 'Invalid updatedAt'),
    updatedAt: '2026-11-10T10:00:00' };
  const invalidReminderFire = { ...validTask('invalid-reminder-fire', 'Invalid reminderShownFire'),
    reminderShownFire: '2026-11-10T10:00:00.1234567890Z' };
  const original = JSON.stringify([invalidCreatedAt, invalidUpdatedAt, invalidReminderFire]);
  const storedValues = new Map([[STORAGE_KEY, original]]);
  const app = bootApp(storedValues);
  await app.settle();

  assert.equal(storedValues.get(STORAGE_KEY), original,
    'startup validation must not rewrite the original primary bytes');
  assert.equal(storedValues.get(BACKUP_KEY), original,
    'the complete rejected payload must be retained byte-for-byte in the recovery backup');
});
