'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const storageApi = require('../storage-logic.js');
const ui = require('../storage-ui.js');
const mutation = require('../task-mutation-logic.js');
const focusMutation = require('../focus-mutation-logic.js');

function fakeElement(tag) {
  const el = {
    tagName: tag,
    id: '',
    disabled: false,
    textContent: '',
    children: [],
    listeners: [],
    classList: {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      toggle(c, force) {
        if (force === true) this.classes.add(c);
        else if (force === false) this.classes.delete(c);
        else this.classes.has(c) ? this.classes.delete(c) : this.classes.add(c);
        return this.classes.has(c);
      },
      contains(c) { return this.classes.has(c); }
    },
    addEventListener(type, handler) { this.listeners.push({ type, handler }); },
    setAttribute(name, value) { this[name] = value; },
    removeAttribute() {},
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      return child;
    },
    get firstChild() { return this.children[0] || null; }
  };
  return el;
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

function fakeEnv(options) {
  const opts = options || {};
  const elements = {
    'storage-list': Object.assign(fakeElement('div'), { id: 'storage-list' }),
    'storage-status-line': Object.assign(fakeElement('p'), { id: 'storage-status-line' }),
    'storage-check': Object.assign(fakeElement('button'), { id: 'storage-check' }),
    'storage-clear': Object.assign(fakeElement('button'), { id: 'storage-clear' }),
    'storage-clear-all': Object.assign(fakeElement('button'), { id: 'storage-clear-all' })
  };
  const storageData = Object.assign({}, opts.data || {});
  const dispatched = [];
  const locks = opts.locks === false ? null : (opts.lockManager || makeLockManager());
  const readFailures = new Set(opts.readFailures || []);
  const writeFailures = new Set(opts.writeFailures || []);
  const removeFailures = new Set(opts.removeFailures || []);
  const readKeys = [];
  const removedKeys = [];
  const storage = {
    getItem(key) {
      readKeys.push(key);
      if (readFailures.has(key)) throw new Error('Read access failure');
      return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null;
    },
    setItem(key, value) {
      if (writeFailures.has(key)) throw new Error('Write access failure');
      storageData[key] = String(value);
    },
    removeItem(key) {
      removedKeys.push(key);
      if (removeFailures.has(key)) throw new Error('Remove access failure');
      delete storageData[key];
    }
  };
  const confirmations = [];
  const confirmState = {
    result: opts.confirmResult !== false,
    throws: false
  };
  const env = {
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; },
      createElement(tag) { return fakeElement(tag); }
    },
    window: {
      navigator: locks ? { locks } : {},
      CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
      StorageEvent: class { constructor(type, init) { this.type = type; this.key = init && init.key; } },
      dispatchEvent(event) { dispatched.push(event); return true; },
      addEventListener() {}
    },
    localStorage: storage,
    storageApi,
    taskMutation: mutation,
    focusMutation,
    webhookUi: opts.webhookUi,
    lockManager: locks,
    confirm(message) {
      confirmations.push(String(message));
      if (confirmState.throws) throw new Error('confirmation unavailable');
      return confirmState.result;
    },
    now: () => '2026-11-04T12:00:00.000Z'
  };
  return { env, elements, storageData, confirmations, confirmState, readKeys, removedKeys, locks, dispatched };
}

test('the module exposes its API and stays inert under Node', () => {
  assert.equal(typeof ui.attachStorageUi, 'function');
  assert.equal(typeof globalThis.DaymarkStorageUi, 'object');
});

test('webhook queue category clear acquires task, delivery and queue locks before removal', async () => {
  const calls = [];
  let lockDepth = 0;
  let resetWhileLocked = false;
  const locks = {
    request(name, options, callback) {
      calls.push(name);
      lockDepth += 1;
      return Promise.resolve().then(callback).finally(() => { lockDepth -= 1; });
    }
  };
  let resetCount = 0;
  const { env, storageData, dispatched } = fakeEnv({
    data: { 'daymark.webhook.queue.v1': '[]' },
    webhookUi: { resetQueueAfterExternalClear() { resetCount += 1; resetWhileLocked = lockDepth === 4; } },
    lockManager: locks
  });
  await ui.attachStorageUi(env).onClearCategory('webhook-queue');
  assert.deepEqual(calls, mutation.CLEAR_ALL_LOCK_ORDER);
  assert.equal(storageData['daymark.webhook.queue.v1'], undefined);
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].key, 'daymark.webhook.queue.v1');
  assert.equal(resetCount, 1, 'same-tab memory-only webhook events are cleared too');
  assert.equal(resetWhileLocked, true, 'the in-memory queue reset happens before the shared locks are released');
});

test('clear-all acquires the global task/delivery/queue lock order before deleting data', async () => {
  const calls = [];
  let lockDepth = 0;
  let resetWhileLocked = false;
  const locks = {
    request(name, options, callback) {
      calls.push(name);
      lockDepth += 1;
      return Promise.resolve().then(callback).finally(() => { lockDepth -= 1; });
    }
  };
  let resetCount = 0;
  const { env, storageData } = fakeEnv({
    data: {
      'daymark.tasks.v1': '[]',
      'daymark.webhook.queue.v1': '[]',
      'daymark.focus.v1': '{}'
    },
    webhookUi: { resetQueueAfterExternalClear() { resetCount += 1; resetWhileLocked = lockDepth === 4; } },
    lockManager: locks
  });
  await ui.attachStorageUi(env).onClearAll();
  assert.deepEqual(calls, mutation.CLEAR_ALL_LOCK_ORDER);
  assert.equal(storageData['daymark.tasks.v1'], undefined);
  assert.equal(storageData['daymark.webhook.queue.v1'], undefined);
  assert.equal(resetCount, 1, 'Clear All also clears the same tab memory-only queue');
  assert.equal(resetWhileLocked, true, 'Clear All resets the in-memory queue before releasing its locks');
});

test('webhook queue and Clear All fail closed at every ordered lock position', async () => {
  for (const action of ['webhook-queue', 'all']) {
    for (const failedLock of mutation.CLEAR_ALL_LOCK_ORDER) {
      const calls = [];
      const locks = {
        request(name, options, callback) {
          calls.push(name);
          if (name === failedLock) return Promise.reject(new Error('lock unavailable'));
          return Promise.resolve().then(callback);
        }
      };
      const queueBytes = '[{"id":"pending"}]';
      const { env, storageData, elements, removedKeys } = fakeEnv({
        data: { 'daymark.tasks.v1': '[]', 'daymark.webhook.queue.v1': queueBytes },
        lockManager: locks
      });
      const handle = ui.attachStorageUi(env);
      if (action === 'all') await handle.onClearAll();
      else await handle.onClearCategory('webhook-queue');
      assert.deepEqual(removedKeys, [], 'a lock failure prevents every storage removal');
      assert.equal(storageData['daymark.tasks.v1'], '[]');
      assert.equal(storageData['daymark.webhook.queue.v1'], queueBytes);
      assert.match(elements['storage-status-line'].textContent, /Nothing was cleared/);
      const failedIndex = mutation.CLEAR_ALL_LOCK_ORDER.indexOf(failedLock);
      assert.deepEqual(calls, mutation.CLEAR_ALL_LOCK_ORDER.slice(0, failedIndex + 1));
    }
  }
});


test('failed Focus removal still rebases the same tab to the new generation', async () => {
  const original = '{"session":null,"log":[]}';
  const { env, storageData, dispatched, elements } = fakeEnv({
    data: { 'daymark.focus.v1': original },
    removeFailures: ['daymark.focus.v1']
  });
  await ui.attachStorageUi(env).onClearCategory('focus');
  assert.equal(storageData['daymark.focus.v1'], original,
    'a refused browser removal preserves the original Focus bytes');
  assert.equal(storageData[focusMutation.FOCUS_GENERATION_KEY], '1',
    'the failed clear attempt still advanced the shared generation under lock');
  assert.ok(dispatched.some((event) => event.type === 'daymark:focus-storage-cleared'
    && event.detail.categoryId === 'focus'),
    'same-tab app state must rebase to the still-persisted snapshot and new generation');
  assert.match(elements['storage-status-line'].textContent, /Could not clear Focus timer/);
});

test('Focus category clear advances the generation while holding the Focus lock', async () => {
  const calls = [];
  const locks = {
    request(name, options, callback) {
      calls.push(name);
      return Promise.resolve().then(callback);
    }
  };
  const { env, storageData, dispatched } = fakeEnv({
    data: { 'daymark.focus.v1': '{"session":null,"log":[]}' },
    lockManager: locks
  });
  await ui.attachStorageUi(env).onClearCategory('focus');
  assert.deepEqual(calls, [focusMutation.FOCUS_MUTATION_LOCK]);
  assert.equal(storageData['daymark.focus.v1'], undefined);
  assert.equal(storageData[focusMutation.FOCUS_GENERATION_KEY], '1');
  assert.ok(dispatched.some((event) => event.type === 'daymark:focus-storage-cleared'
    && event.detail.categoryId === 'focus'));
});


test('Focus backup and preset clears share the same lock and generation boundary', async () => {
  for (const [categoryId, key] of [
    ['focus-backup', 'daymark.focus.v1.backup'],
    ['focus-preset', 'daymark.focus.preset.v1']
  ]) {
    const calls = [];
    const locks = {
      request(name, options, callback) {
        calls.push(name);
        return Promise.resolve().then(callback);
      }
    };
    const { env, storageData, dispatched } = fakeEnv({
      data: { [key]: 'opaque-or-preference' },
      lockManager: locks
    });
    await ui.attachStorageUi(env).onClearCategory(categoryId);
    assert.deepEqual(calls, [focusMutation.FOCUS_MUTATION_LOCK]);
    assert.equal(storageData[key], undefined);
    assert.equal(storageData[focusMutation.FOCUS_GENERATION_KEY], '1');
    assert.ok(dispatched.some((event) => event.type === 'daymark:focus-storage-cleared'
      && event.detail.categoryId === categoryId));
  }
});

test('Clear All retains only the non-personal task and Focus generation counters', async () => {
  const { env, storageData } = fakeEnv({
    data: { 'daymark.tasks.v1': '[]', 'daymark.focus.v1': '{"session":null,"log":[]}' }
  });
  await ui.attachStorageUi(env).onClearAll();
  assert.equal(storageData['daymark.tasks.v1'], undefined);
  assert.equal(storageData['daymark.focus.v1'], undefined);
  assert.equal(storageData[mutation.TASK_GENERATION_KEY], '1:all');
  assert.equal(storageData[focusMutation.FOCUS_GENERATION_KEY], '1');
});

test('Clear All fails closed when the Focus lock cannot be acquired', async () => {
  const calls = [];
  const locks = {
    request(name, options, callback) {
      calls.push(name);
      if (name === focusMutation.FOCUS_MUTATION_LOCK) return Promise.reject(new Error('Focus lock unavailable'));
      return Promise.resolve().then(callback);
    }
  };
  const originalFocus = '{"session":null,"log":[]}';
  const { env, storageData, removedKeys } = fakeEnv({
    data: { 'daymark.tasks.v1': '[]', 'daymark.focus.v1': originalFocus },
    lockManager: locks
  });
  await ui.attachStorageUi(env).onClearAll();
  assert.deepEqual(removedKeys, []);
  assert.equal(storageData['daymark.tasks.v1'], '[]');
  assert.equal(storageData['daymark.focus.v1'], originalFocus);
  assert.equal(storageData[focusMutation.FOCUS_GENERATION_KEY], undefined);
  assert.deepEqual(calls, mutation.CLEAR_ALL_LOCK_ORDER);
});

test('a webhook queue clear waits for an in-flight task completion transaction', async () => {
  const locks = makeLockManager();
  let releaseTask;
  let started;
  const isStarted = new Promise((resolve) => { started = resolve; });
  const taskHeld = locks.request(mutation.TASK_MUTATION_LOCK, { mode: 'exclusive' }, () =>
    new Promise((resolve) => { releaseTask = resolve; started(); }));
  await isStarted;
  const { env, storageData } = fakeEnv({
    data: { 'daymark.webhook.queue.v1': '[]' },
    lockManager: locks
  });
  const clear = ui.attachStorageUi(env).onClearCategory('webhook-queue');
  await Promise.resolve();
  assert.equal(storageData['daymark.webhook.queue.v1'], '[]', 'clear waits while a task completion holds the task lock');
  releaseTask();
  await taskHeld;
  await clear;
  assert.equal(storageData['daymark.webhook.queue.v1'], undefined);
});

test('clearing only task recovery backups refreshes recovery status under the shared lock', async () => {
  const { env, elements, storageData, dispatched } = fakeEnv({
    data: {
      'daymark.tasks.v1': '[]',
      'daymark.tasks.v1.backup': 'opaque backup'
    }
  });
  const handle = ui.attachStorageUi(env);
  await handle.onClearCategory('task-backup');
  assert.equal(storageData['daymark.tasks.v1'], '[]', 'primary tasks remain untouched');
  assert.equal(storageData['daymark.tasks.v1.backup'], undefined, 'only the recovery backup is cleared');
  assert.equal(storageData[mutation.TASK_GENERATION_KEY], '1:task-backup', 'pending backup-maintenance writes are fenced');
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].key, null, 'the app reloads recovery metadata after backup removal');
});

test('task category clear fails closed when the retained generation cannot be written', async () => {
  const { env, storageData, elements } = fakeEnv({
    data: { 'daymark.tasks.v1': '[]' },
    writeFailures: [mutation.TASK_GENERATION_KEY]
  });
  await ui.attachStorageUi(env).onClearCategory('tasks');
  assert.equal(storageData['daymark.tasks.v1'], '[]');
  assert.equal(storageData[mutation.TASK_GENERATION_KEY], undefined);
  assert.match(elements['storage-status-line'].textContent, /task-generation fence or shared task lock failed/i);
});

test('Clear All fails before deleting any data when the task generation cannot be retained', async () => {
  const { env, storageData, removedKeys, elements } = fakeEnv({
    data: { 'daymark.tasks.v1': '[]', 'daymark.focus.v1': '{"session":null,"log":[]}' },
    writeFailures: [mutation.TASK_GENERATION_KEY]
  });
  await ui.attachStorageUi(env).onClearAll();
  assert.deepEqual(removedKeys, []);
  assert.equal(storageData['daymark.tasks.v1'], '[]');
  assert.equal(storageData['daymark.focus.v1'], '{"session":null,"log":[]}');
  assert.equal(storageData[focusMutation.FOCUS_GENERATION_KEY], undefined);
  assert.match(elements['storage-status-line'].textContent, /shared lock or storage operation failed/i);
});

test('task and clear-all deletion fail closed when the shared lock is unavailable', async () => {
  const original = '[]';
  const { env, elements, storageData, confirmations, dispatched } = fakeEnv({
    data: { 'daymark.tasks.v1': original },
    locks: false
  });
  const handle = ui.attachStorageUi(env);

  await handle.onClearCategory('tasks');
  assert.equal(storageData['daymark.tasks.v1'], original);
  assert.match(elements['storage-status-line'].textContent, /cross-tab coordination is unavailable/i);
  await handle.onClearAll();
  assert.equal(storageData['daymark.tasks.v1'], original);
  assert.equal(confirmations.length, 2, 'both explicit destructive actions still require confirmation');
  assert.equal(dispatched.length, 0, 'a blocked action never announces a clear');
});

test('the production HTML storage controls match the UI wiring', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const coordinatorAt = html.indexOf('task-mutation-logic.js');
  assert.ok(coordinatorAt >= 0, 'the shared task coordinator is loaded in production');
  for (const dependentScript of ['storage-ui.js', 'app.js', 'import-ui.js']) {
    assert.ok(coordinatorAt < html.indexOf(dependentScript),
      'the task coordinator must execute before ' + dependentScript);
  }
  for (const id of ['storage-check', 'storage-clear', 'storage-status-line', 'storage-list']) {
    const matches = html.match(new RegExp('id="' + id + '"', 'g')) || [];
    assert.equal(matches.length, 1, id + ' appears exactly once in production HTML');
  }
  const { env, elements } = fakeEnv({});
  ui.attachStorageUi(env);
  for (const id of ['storage-check', 'storage-clear', 'storage-clear-all']) {
    assert.ok(elements[id].listeners.some((entry) => entry.type === 'click'), id + ' has a click handler');
  }
});

test('Clear status only clears the message and never clears stored data', () => {
  const { env, elements, storageData } = fakeEnv({ data: { 'daymark.tasks.v1': '[]' } });
  let clearAllCalls = 0;
  const originalClearAll = env.storageApi.clearAll;
  env.storageApi.clearAll = function(...args) {
    clearAllCalls += 1;
    return originalClearAll.apply(this, args);
  };
  ui.attachStorageUi(env);
  elements['storage-status-line'].textContent = 'previous status';
  const clear = elements['storage-clear'].listeners.find((entry) => entry.type === 'click');
  assert.ok(clear, 'Clear status is wired');
  clear.handler();
  assert.equal(elements['storage-status-line'].textContent, '');
  assert.equal(storageData['daymark.tasks.v1'], '[]');
  assert.equal(clearAllCalls, 0, 'Clear status never calls clearAll');
});

test('attach without any stored data lists every category with honest sizes', () => {
  const { env, elements } = fakeEnv({});
  ui.attachStorageUi(env);
  const rows = elements['storage-list'].children;
  assert.equal(rows.length, storageApi.CATEGORIES.length, 'every category is explained even when empty');
  const clearButtons = rows.map((row) => row.children.find((child) => child.tagName === 'button'));
  assert.ok(clearButtons.every((button) => button.disabled === true), 'nothing can be cleared when nothing is stored');
  assert.match(elements['storage-status-line'].textContent, /No local data is stored yet/);
  assert.equal(elements['storage-clear-all'].disabled, true, 'clear-all is disabled with an empty store');
});

test('attach with data reports category counts, sizes, and enables clearing', () => {
  const { env, elements } = fakeEnv({
    data: {
      'daymark.tasks.v1': JSON.stringify([{ id: 't1', title: 'Task' }]),
      'daymark.weather.v1': JSON.stringify({ version: 1, place: { name: 'Kolkata' } })
    }
  });
  ui.attachStorageUi(env);
  assert.match(elements['storage-status-line'].textContent, /2 of \d+ categories hold data/);
  const rows = elements['storage-list'].children;
  assert.ok(rows.some((row) => row.children.some((child) =>
    typeof child.textContent === 'string' && child.textContent.startsWith('Tasks — about '))));
  assert.ok(rows.some((row) => row.children.some((child) =>
    typeof child.textContent === 'string' && child.textContent.startsWith('Focus timer — not present'))));
  const buttons = rows.flatMap((row) => row.children.filter((child) => child.tagName === 'button'));
  const taskButton = buttons.find((button) => button['data-clear-category'] === 'tasks');
  const focusButton = buttons.find((button) => button['data-clear-category'] === 'focus');
  assert.equal(taskButton.disabled, false);
  assert.equal(focusButton.disabled, true, 'a category with no data cannot be cleared');
  assert.equal(taskButton['aria-label'], 'Clear Tasks from this browser');
  assert.equal(elements['storage-clear-all'].disabled, false);
});

test('clearing one category asks for confirmation and removes only its keys', async () => {
  const { env, elements, storageData, confirmations, dispatched } = fakeEnv({
    data: {
      'daymark.tasks.v1': '[]',
      'daymark.tasks.v1.backup': '[]',
      'daymark.webhook.v1': JSON.stringify({ version: 1, url: 'https://hooks.example.com/x' })
    }
  });
  const handle = ui.attachStorageUi(env);
  await handle.onClearCategory('tasks');
  assert.equal(confirmations.length, 1, 'a destructive action requires one confirmation');
  assert.match(confirmations[0], /Clear Tasks\?/);
  assert.match(confirmations[0], /This cannot be undone/);
  assert.equal(storageData['daymark.tasks.v1'], undefined, 'the task data is removed');
  assert.equal(storageData[mutation.TASK_GENERATION_KEY], '1:tasks', 'the task generation advances before removal');
  assert.equal(storageData['daymark.tasks.v1.backup'], '[]', 'the recovery backup keeps its own category');
  assert.equal(storageData['daymark.webhook.v1'] !== undefined, true, 'webhook settings are untouched');
  assert.equal(dispatched.length, 1, 'same-tab task state is notified after the locked clear');
  assert.equal(dispatched[0].key, 'daymark.tasks.v1');
  assert.match(elements['storage-status-line'].textContent, /Cleared Tasks \(1 item\(s\) removed\)/);
  assert.match(elements['storage-status-line'].textContent, /Nothing else was touched/);
});

test('declining the confirmation changes nothing and says so', () => {
  const { env, elements, storageData, confirmState } = fakeEnv({ data: { 'daymark.currency.v1': '{}' } });
  const handle = ui.attachStorageUi(env);
  confirmState.result = false;
  handle.onClearCategory('currency');
  assert.equal(storageData['daymark.currency.v1'], '{}');
  assert.match(elements['storage-status-line'].textContent, /Cancelled\. Nothing was cleared/);
});

test('a throwing confirmation fails closed without touching data', () => {
  const { env, elements, storageData, confirmState } = fakeEnv({ data: { 'daymark.feed.v1': '{}' } });
  const handle = ui.attachStorageUi(env);
  confirmState.throws = true;
  handle.onClearCategory('briefing');
  assert.equal(storageData['daymark.feed.v1'], '{}');
  assert.match(elements['storage-status-line'].textContent, /Could not ask for confirmation\. Nothing was cleared/);
});

test('clear-all confirms once, removes managed data, and never reads the legacy webhook secret', async () => {
  const legacySecret = 'https://hooks.example.com/x?token=legacy-secret';
  const { env, elements, storageData, confirmations, readKeys, removedKeys, dispatched } = fakeEnv({
    data: {
      'daymark.tasks.v1': '[]',
      'daymark.focus.v1': '{}',
      'daymark.webhook.v1': legacySecret,
      'daymark.webhook.queue.v1': '[]',
      'daymark.webhook.lock.v1': '12345|stale-owner',
      'unrelated.other.key': 'keep me'
    }
  });
  const handle = ui.attachStorageUi(env);
  await handle.onClearAll();
  assert.equal(confirmations.length, 1);
  assert.match(confirmations[0], /Clear ALL local Daymark data/);
  assert.equal(storageData['daymark.tasks.v1'], undefined);
  assert.equal(storageData['daymark.focus.v1'], undefined);
  assert.equal(storageData['daymark.webhook.queue.v1'], undefined);
  assert.equal(storageData['daymark.webhook.lock.v1'], undefined, 'legacy webhook lock is managed and cleared');
  assert.equal(storageData['daymark.webhook.v1'], legacySecret, 'the secret-bearing legacy endpoint is not touched');
  assert.equal(readKeys.includes('daymark.webhook.v1'), false, 'the storage UI never reads the endpoint');
  assert.equal(removedKeys.includes('daymark.webhook.v1'), false, 'the storage UI never removes the endpoint');
  assert.doesNotMatch(confirmations[0], /legacy webhook settings/i);
  assert.equal(storageData['unrelated.other.key'], 'keep me');
  assert.equal(dispatched.length, 2, 'clear-all notifies both Focus and task state in the same tab');
  assert.equal(dispatched[0].type, 'daymark:focus-storage-cleared');
  assert.equal(dispatched[0].detail.categoryId, 'all');
  assert.equal(dispatched[1].key, null, 'clear-all notification reloads the whole task state');
  assert.match(elements['storage-status-line'].textContent, /Cleared all 4 stored item\(s\)/);
  assert.match(elements['storage-status-line'].textContent, /Nothing outside this browser was affected/);
  assert.equal(elements['storage-clear-all'].disabled, true, 'clear-all disables after the store is empty');
});

test('a failed removal during clear-all is reported honestly', async () => {
  const { env, elements } = fakeEnv({ data: { 'daymark.tasks.v1': '[]' } });
  const handle = ui.attachStorageUi(env);
  env.localStorage.removeItem = () => { throw new Error('blocked'); };
  await handle.onClearAll();
  assert.match(elements['storage-status-line'].textContent, /could not be removed by the browser/);
});

test('a failed rescan clears stale rows and disables destructive controls', () => {
  const { env, elements, storageData } = fakeEnv({
    data: { 'daymark.tasks.v1': '[]', 'daymark.weather.v1': '{}' }
  });
  const original = env.storageApi;
  let scans = 0;
  env.storageApi = Object.assign({}, original, {
    scanStorage(storage) {
      scans += 1;
      if (scans === 1) return original.scanStorage(storage);
      throw new Error('storage scan became unavailable');
    }
  });
  const handle = ui.attachStorageUi(env);
  assert.ok(elements['storage-list'].children.length > 0, 'initial successful scan renders categories');
  assert.equal(elements['storage-clear-all'].disabled, false, 'known data enables clear-all initially');

  handle.render();

  assert.equal(elements['storage-list'].children.length, 0,
    'a failed rescan must not leave stale category sizes or clear buttons visible');
  assert.equal(elements['storage-clear-all'].disabled, true,
    'destructive clear-all is disabled while the latest scan is unknown');
  assert.equal(elements['storage-check'].disabled, false,
    'the read-only refresh remains available for a later retry');
  assert.match(elements['storage-status-line'].textContent,
    /Local data status is unknown; nothing was changed/);
  assert.equal(storageData['daymark.tasks.v1'], '[]');
  assert.equal(storageData['daymark.weather.v1'], '{}');
});

test('unreadable data is shown as unknown and clear-all fails closed', async () => {
  const { env, elements, storageData, confirmations } = fakeEnv({
    data: { 'daymark.tasks.v1': '[]' },
    readFailures: ['daymark.tasks.v1']
  });
  const handle = ui.attachStorageUi(env);
  const taskRow = elements['storage-list'].children.find((row) =>
    row.children.some((child) => child.textContent.startsWith('Tasks —')));
  const taskTitle = taskRow.children.find((child) => child.tagName === 'span');
  const taskButton = taskRow.children.find((child) => child.tagName === 'button');

  assert.match(taskTitle.textContent, /status unknown/);
  assert.equal(taskButton.disabled, false, 'an unreadable category allows an explicit retry');
  assert.equal(elements['storage-clear-all'].disabled, true, 'clear-all is blocked while any category is unreadable');
  assert.match(elements['storage-status-line'].textContent, /categories could not be checked/);
  assert.doesNotMatch(elements['storage-status-line'].textContent, /No local data is stored yet/);

  await handle.onClearCategory('tasks');
  assert.equal(storageData['daymark.tasks.v1'], '[]', 'failed reads must not delete the stored value');
  assert.match(elements['storage-status-line'].textContent, /could not be checked or removed\. Nothing was cleared/);
  await handle.onClearAll();
  assert.equal(confirmations.length, 1, 'only the category retry was confirmed; clear-all was blocked');
  assert.equal(storageData['daymark.tasks.v1'], '[]', 'unknown data blocks clear-all deletion');
});

test('category clear reports a preflight read failure without claiming that anything was cleared', async () => {
  const { env, elements, storageData } = fakeEnv({
    data: { 'daymark.tasks.v1': '[]' },
    readFailures: ['daymark.tasks.v1']
  });
  const handle = ui.attachStorageUi(env);

  await handle.onClearCategory('tasks');

  assert.equal(storageData['daymark.tasks.v1'], '[]',
    'the preflight read failure must preserve the original task data');
  assert.match(elements['storage-status-line'].textContent,
    /Could not clear Tasks: 1 item\(s\) could not be checked or removed\. Nothing was cleared\./);
  assert.doesNotMatch(elements['storage-status-line'].textContent, /Cleared Tasks/);
});

test('category clear reports a storage race with no remaining key as no change', async () => {
  const { env, elements, storageData } = fakeEnv({
    data: { 'daymark.tasks.v1': '[]' }
  });
  const handle = ui.attachStorageUi(env);
  delete storageData['daymark.tasks.v1'];

  await handle.onClearCategory('tasks');

  assert.match(elements['storage-status-line'].textContent,
    /No stored data was found for Tasks\. Nothing was changed\./);
  assert.doesNotMatch(elements['storage-status-line'].textContent, /Cleared Tasks/);
});

test('all unreadable categories never produce an empty-store claim', () => {
  const allKeys = storageApi.CATEGORIES.flatMap((category) => category.keys);
  const data = Object.fromEntries(allKeys.map((key) => [key, 'still stored']));
  const { env, elements, storageData } = fakeEnv({ data, readFailures: allKeys });
  ui.attachStorageUi(env);

  assert.match(elements['storage-status-line'].textContent, /No readable local data was found/);
  assert.match(elements['storage-status-line'].textContent, /categories could not be checked/);
  assert.doesNotMatch(elements['storage-status-line'].textContent, /No local data is stored yet/);
  assert.equal(elements['storage-clear-all'].disabled, true,
    'clear-all is blocked while every category is unreadable');
  assert.ok(Object.values(storageData).every((value) => value === 'still stored'),
    'rendering an incomplete scan must not mutate data');
});

test('unavailable storage keeps the card honest and never clears anything', () => {
  const { env, elements } = fakeEnv({});
  env.localStorage = null;
  ui.attachStorageUi(env);
  assert.match(elements['storage-status-line'].textContent, /Local data status is unknown; nothing was changed/);
});

test('a throwing localStorage getter leaves every category unknown and fails closed', async () => {
  const { env, elements, storageData, confirmations } = fakeEnv({
    data: { 'daymark.tasks.v1': 'keep this task data' }
  });
  delete env.localStorage;
  Object.defineProperty(env.window, 'localStorage', {
    configurable: true,
    get() { throw new Error('storage access denied'); }
  });

  const handle = ui.attachStorageUi(env);
  assert.match(elements['storage-status-line'].textContent,
    /Browser storage could not be accessed\. Local data status is unknown/);
  assert.equal(elements['storage-clear-all'].disabled, true,
    'clear-all is disabled when the storage object itself cannot be acquired');

  await handle.onClearAll();
  await handle.onClearCategory('tasks');
  assert.equal(confirmations.length, 0, 'no destructive confirmation is offered without storage access');
  assert.equal(storageData['daymark.tasks.v1'], 'keep this task data',
    'a throwing storage getter must never cause data to be cleared');
  assert.match(elements['storage-status-line'].textContent, /Browser storage is unavailable/);
});

test('the refresh button rescans without confirmation and without changing data', () => {
  const { env, elements, storageData, confirmations } = fakeEnv({ data: { 'daymark.feed.v1': '{}' } });
  ui.attachStorageUi(env);
  env.localStorage.setItem('daymark.weather.v1', '{}');
  const refresh = elements['storage-check'].listeners.find((entry) => entry.type === 'click');
  assert.ok(refresh, 'the refresh button is wired');
  refresh.handler();
  assert.match(elements['storage-status-line'].textContent, /2 of \d+ categories hold data/);
  assert.equal(confirmations.length, 0, 'a read-only scan never asks for confirmation');
  assert.equal(storageData['daymark.feed.v1'], '{}');
  assert.equal(storageData['daymark.weather.v1'], '{}');
});

test('clear actions set busy state (disabled + aria-busy + is-busy) while operating', async () => {
  const { env, elements } = fakeEnv({
    data: { 'daymark.tasks.v1': '[]' }
  });
  // Spy on clear to observe intermediate state
  const originalClear = env.storageApi.clearCategory;
  let sawBusy = false;
  env.storageApi.clearCategory = function(...args) {
    // During the call, buttons should be busy
    const clearAll = elements['storage-clear-all'];
    const list = elements['storage-list'];
    if (clearAll.disabled && clearAll.classList.contains('is-busy') && list['aria-busy'] === 'true') {
      sawBusy = true;
    }
    return originalClear.apply(this, args);
  };
  const handle = ui.attachStorageUi(env);
  await handle.onClearCategory('tasks');
  assert.equal(sawBusy, true, 'busy state is active during clear');
  // After, busy should be cleared
  assert.equal(elements['storage-list']['aria-busy'], 'false');
});


test('storage UI selectors stay connected to the production HTML contract', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'storage-ui.js'), 'utf8');
  const counts = new Map();
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
    counts.set(match[1], (counts.get(match[1]) || 0) + 1);
  }

  const referenced = [...new Set(
    [...source.matchAll(/\belement\('([^']+)'\)/g)].map((match) => match[1])
  )];
  const optional = new Set(['storage-clear-all']);
  const missing = referenced.filter((id) => !optional.has(id) && counts.get(id) !== 1);
  assert.deepEqual(missing, [],
    'every required storage-ui element lookup must resolve exactly once in index.html');

  for (const id of ['storage-list', 'storage-status-line', 'storage-check', 'storage-clear']) {
    assert.equal(counts.get(id), 1, id + ' must remain present exactly once');
  }

  const clearStatus = html.match(/<button\b(?=[^>]*\bid="storage-clear")(?=[^>]*\btype="button")[^>]*>([\s\S]*?)<\/button>/i);
  assert.ok(clearStatus, 'Clear status must remain a non-submitting button');
  assert.match(clearStatus[1], /Clear status/i);
});


test('clear-all confirmation discloses the remembered browser proxy profile', async () => {
  const { env, confirmations, confirmState, storageData } = fakeEnv({
    data: {
      'daymark.browser-proxy.last-profile': 'proxy.example:8080',
      'daymark.wiki.prefs.v1': '{"query":"offline"}',
      'daymark.browser-download.last-scenario': 'expired-link'
    },
    confirmResult: false
  });
  const handle = ui.attachStorageUi(env);
  await handle.onClearAll();

  assert.equal(confirmations.length, 1);
  assert.match(confirmations[0], /saved browser proxy profile/i);
  assert.match(confirmations[0], /Focus Timer preset/i);
  assert.match(confirmations[0], /saved Wikipedia\/weather\/holiday\/currency and browser-search preferences/i);
  assert.match(confirmations[0], /remembered browser download journey/i);
  assert.equal(storageData['daymark.wiki.prefs.v1'], '{"query":"offline"}', 'declining clear-all preserves saved search preferences');
  assert.equal(storageData['daymark.browser-download.last-scenario'], 'expired-link', 'declining clear-all preserves the download journey');
  assert.equal(storageData['daymark.browser-proxy.last-profile'], 'proxy.example:8080',
    'declining the confirmation must preserve the remembered profile');
  assert.equal(confirmState.result, false);
});
