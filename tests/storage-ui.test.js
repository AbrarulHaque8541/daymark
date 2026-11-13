'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const storageApi = require('../storage-logic.js');
const ui = require('../storage-ui.js');
const taskMutation = require('../task-mutation-logic.js');

function createLockManager() {
  const tails = new Map();
  return {
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
}

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

function fakeEnv(options) {
  const opts = options || {};
  const elements = {
    'data-list': Object.assign(fakeElement('div'), { id: 'data-list' }),
    'data-status': Object.assign(fakeElement('p'), { id: 'data-status' }),
    'data-refresh': Object.assign(fakeElement('button'), { id: 'data-refresh' }),
    'data-clear-all': Object.assign(fakeElement('button'), { id: 'data-clear-all' })
  };
  const storageData = Object.assign({}, opts.data || {});
  const readFailures = new Set(opts.readFailures || []);
  const storage = {
    getItem(key) {
      if (readFailures.has(key)) throw new Error('Read access failure');
      return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null;
    },
    setItem(key, value) { storageData[key] = String(value); },
    removeItem(key) { delete storageData[key]; }
  };
  const confirmations = [];
  const lockManager = createLockManager();
  const webhookUi = {
    prepareForClearAll() { return { reset: true, legacyConfigCleared: true }; },
    async clearQueue() {
      const delivery = await lockManager.request(taskMutation.WEBHOOK_DELIVERY_LOCK_NAME, { mode: 'exclusive' },
        () => lockManager.request(taskMutation.WEBHOOK_QUEUE_LOCK_NAME, { mode: 'exclusive' }, () => {
          storage.removeItem('daymark.webhook.queue.v1');
          return { cleared: true };
        }));
      return delivery && delivery.cleared ? delivery : { cleared: false };
    }
  };
  const telegramUi = { resetForClearAll() {} };
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
    window: { addEventListener() {} },
    localStorage: storage,
    storageApi,
    taskMutationApi: taskMutation,
    lockManager,
    webhookUi,
    telegramUi,
    confirm(message) {
      confirmations.push(String(message));
      if (confirmState.throws) throw new Error('confirmation unavailable');
      return confirmState.result;
    },
    now: () => '2026-11-04T12:00:00.000Z'
  };
  return { env, elements, storageData, confirmations, confirmState };
}

test('the module exposes its API and stays inert under Node', () => {
  assert.equal(typeof ui.attachStorageUi, 'function');
  assert.equal(typeof globalThis.DaymarkStorageUi, 'object');
});

test('attach without any stored data lists every category with honest sizes', () => {
  const { env, elements } = fakeEnv({});
  ui.attachStorageUi(env);
  const rows = elements['data-list'].children;
  assert.equal(rows.length, storageApi.CATEGORIES.length, 'every category is explained even when empty');
  const clearButtons = rows.map((row) => row.children.find((child) => child.tagName === 'button'));
  assert.ok(clearButtons.every((button) => button.disabled === true), 'nothing can be cleared when nothing is stored');
  assert.match(elements['data-status'].textContent, /No local data is stored yet/);
  assert.equal(elements['data-clear-all'].disabled, true, 'clear-all is disabled with an empty store');
});

test('attach with data reports category counts, sizes, and enables clearing', () => {
  const { env, elements } = fakeEnv({
    data: {
      'daymark.tasks.v1': JSON.stringify([{ id: 't1', title: 'Task' }]),
      'daymark.weather.v1': JSON.stringify({ version: 1, place: { name: 'Kolkata' } })
    }
  });
  ui.attachStorageUi(env);
  assert.match(elements['data-status'].textContent, /2 of \d+ categories hold data/);
  const rows = elements['data-list'].children;
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
  assert.equal(elements['data-clear-all'].disabled, false);
});

test('clearing one category asks for confirmation and removes only its keys', async () => {
  const { env, elements, storageData, confirmations } = fakeEnv({
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
  assert.equal(storageData['daymark.tasks.v1.backup'], '[]', 'the recovery backup keeps its own category');
  assert.equal(storageData['daymark.webhook.v1'] !== undefined, true, 'webhook settings are untouched');
  assert.match(elements['data-status'].textContent, /Cleared Tasks \(1 item\(s\) removed\)/);
  assert.match(elements['data-status'].textContent, /Nothing else was touched/);
});

test('declining the confirmation changes nothing and says so', () => {
  const { env, elements, storageData, confirmState } = fakeEnv({ data: { 'daymark.currency.v1': '{}' } });
  const handle = ui.attachStorageUi(env);
  confirmState.result = false;
  handle.onClearCategory('currency');
  assert.equal(storageData['daymark.currency.v1'], '{}');
  assert.match(elements['data-status'].textContent, /Cancelled\. Nothing was cleared/);
});

test('a throwing confirmation fails closed without touching data', () => {
  const { env, elements, storageData, confirmState } = fakeEnv({ data: { 'daymark.feed.v1': '{}' } });
  const handle = ui.attachStorageUi(env);
  confirmState.throws = true;
  handle.onClearCategory('briefing');
  assert.equal(storageData['daymark.feed.v1'], '{}');
  assert.match(elements['data-status'].textContent, /Could not ask for confirmation\. Nothing was cleared/);
});

test('clear-all confirms once, removes everything, and leaves foreign keys alone', async () => {
  const { env, elements, storageData, confirmations } = fakeEnv({
    data: {
      'daymark.tasks.v1': '[]',
      'daymark.focus.v1': '{}',
      'daymark.webhook.queue.v1': '[]',
      'unrelated.other.key': 'keep me'
    }
  });
  const handle = ui.attachStorageUi(env);
  await handle.onClearAll();
  assert.equal(confirmations.length, 1);
  assert.match(confirmations[0], /Clear all managed Daymark data/);
  assert.match(confirmations[0], /Telegram chat target/,
    'clear-all confirmation must disclose the remembered Telegram preference');
  assert.match(confirmations[0], /legacy secret-bearing webhook endpoint is never inspected/,
    'the card must disclose its intentional secret-key exclusion');
  assert.equal(storageData['daymark.tasks.v1'], undefined);
  assert.equal(storageData['daymark.focus.v1'], undefined);
  assert.equal(storageData['daymark.webhook.queue.v1'], undefined);
  assert.equal(storageData['unrelated.other.key'], 'keep me');
  assert.match(elements['data-status'].textContent, /Cleared all 3 stored item\(s\)/);
  assert.match(elements['data-status'].textContent, /Nothing outside this browser was affected/);
  assert.equal(elements['data-clear-all'].disabled, true, 'clear-all disables after the store is empty');
});

test('a failed removal during clear-all is reported honestly', async () => {
  const { env, elements } = fakeEnv({ data: { 'daymark.tasks.v1': '[]' } });
  const handle = ui.attachStorageUi(env);
  env.localStorage.removeItem = () => { throw new Error('blocked'); };
  await handle.onClearAll();
  assert.match(elements['data-status'].textContent, /could not be removed by the browser/);
});

test('unavailable storage keeps the card honest and never clears anything', () => {
  const { env, elements } = fakeEnv({});
  env.localStorage = null;
  ui.attachStorageUi(env);
  assert.match(elements['data-status'].textContent, /Could not read local data: Browser storage is unavailable/);
});

test('an explicit refresh retries a previously throwing localStorage getter', () => {
  const { env, elements, storageData } = fakeEnv({
    data: { 'daymark.tasks.v1': '[]' }
  });
  const storage = env.localStorage;
  delete env.localStorage;
  let attempts = 0;
  Object.defineProperty(env.window, 'localStorage', {
    configurable: true,
    get() {
      attempts += 1;
      if (attempts === 1) throw new Error('storage access denied on first attempt');
      return storage;
    }
  });

  ui.attachStorageUi(env);
  assert.equal(attempts, 1, 'initial access is attempted once');
  assert.match(elements['data-status'].textContent,
    /Browser storage could not be accessed\. Local data status is unknown/);
  assert.equal(elements['data-clear-all'].disabled, true);

  const refresh = elements['data-refresh'].listeners.find((entry) => entry.type === 'click');
  assert.ok(refresh, 'the explicit refresh action remains available');
  refresh.handler();

  assert.equal(attempts, 2, 'refresh reacquires the window storage object');
  assert.match(elements['data-status'].textContent, /1 of \d+ categories hold data/);
  assert.equal(elements['data-clear-all'].disabled, false,
    'destructive controls become available only after storage access succeeds');
  assert.equal(storageData['daymark.tasks.v1'], '[]',
    'retrying storage access does not mutate user data');
});

test('the production boot access-failure flag retries window.localStorage only after refresh', () => {
  const { env, elements, storageData } = fakeEnv({
    data: { 'daymark.tasks.v1': '[]' }
  });
  const storage = env.localStorage;
  env.localStorage = null;
  env.storageAccessFailed = true;
  let attempts = 0;
  Object.defineProperty(env.window, 'localStorage', {
    configurable: true,
    get() {
      attempts += 1;
      return storage;
    }
  });

  ui.attachStorageUi(env);
  assert.equal(attempts, 0,
    'the boot adapter’s already-observed getter failure is not immediately retried');
  assert.match(elements['data-status'].textContent,
    /Browser storage could not be accessed\. Local data status is unknown/);

  const refresh = elements['data-refresh'].listeners.find((entry) => entry.type === 'click');
  refresh.handler();
  assert.equal(attempts, 1, 'refresh performs the first explicit retry');
  assert.match(elements['data-status'].textContent, /1 of \d+ categories hold data/);
  assert.equal(storageData['daymark.tasks.v1'], '[]');
});

test('the refresh button rescans without confirmation and without changing data', () => {
  const { env, elements, storageData, confirmations } = fakeEnv({ data: { 'daymark.feed.v1': '{}' } });
  ui.attachStorageUi(env);
  env.localStorage.setItem('daymark.weather.v1', '{}');
  const refresh = elements['data-refresh'].listeners.find((entry) => entry.type === 'click');
  assert.ok(refresh, 'the refresh button is wired');
  refresh.handler();
  assert.match(elements['data-status'].textContent, /2 of \d+ categories hold data/);
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
    const clearAll = elements['data-clear-all'];
    const list = elements['data-list'];
    if (clearAll.disabled && clearAll.classList.contains('is-busy') && list['aria-busy'] === 'true') {
      sawBusy = true;
    }
    return originalClear.apply(this, args);
  };
  const handle = ui.attachStorageUi(env);
  await handle.onClearCategory('tasks');
  assert.equal(sawBusy, true, 'busy state is active during clear');
  // After, busy should be cleared
  assert.equal(elements['data-list']['aria-busy'], 'false');
});


test('unreadable category data is shown as unknown and an explicit retry fails closed', async () => {
  const { env, elements, storageData, confirmations } = fakeEnv({
    data: { 'daymark.tasks.v1': '[]' },
    readFailures: ['daymark.tasks.v1']
  });
  const handle = ui.attachStorageUi(env);
  const taskRow = elements['data-list'].children.find((row) =>
    row.children.some((child) => child.tagName === 'span' && child.textContent.startsWith('Tasks —')));
  const taskTitle = taskRow.children.find((child) => child.tagName === 'span');
  const taskButton = taskRow.children.find((child) => child.tagName === 'button');

  assert.match(taskTitle.textContent, /Tasks — status unknown/);
  assert.equal(taskButton.disabled, false, 'an unreadable category offers an explicit retry');
  assert.match(elements['data-status'].textContent, /1 category could not be checked/);
  assert.equal(elements['data-clear-all'].disabled, true,
    'clear-all is blocked while any category is unreadable');

  await handle.onClearCategory('tasks');
  assert.equal(confirmations.length, 1, 'the retry remains explicitly user-confirmed');
  assert.equal(storageData['daymark.tasks.v1'], '[]',
    'a failed preflight read never removes the unreadable task key');
  assert.match(elements['data-status'].textContent, /Nothing was cleared/);
});

test('all unreadable categories never produce an empty-store claim or mutate data', () => {
  const keys = storageApi.CATEGORIES.flatMap((category) => category.keys);
  const data = Object.fromEntries(keys.map((key) => [key, 'still stored']));
  const { env, elements, storageData } = fakeEnv({ data, readFailures: keys });
  ui.attachStorageUi(env);

  assert.match(elements['data-status'].textContent, /No readable local data was found/);
  assert.match(elements['data-status'].textContent, /categories could not be checked/);
  assert.doesNotMatch(elements['data-status'].textContent, /No local data is stored yet/);
  assert.equal(elements['data-clear-all'].disabled, true);
  const buttons = elements['data-list'].children.map((row) =>
    row.children.find((child) => child.tagName === 'button'));
  assert.ok(buttons.every((button) => button && button.disabled === false),
    'unknown categories allow explicit per-category retry, not automatic clearing');
  assert.ok(Object.values(storageData).every((value) => value === 'still stored'),
    'an incomplete scan must not mutate any stored value');
});

test('clear-all preflights every key and changes nothing when any key is unreadable', async () => {
  const { env, elements, storageData, confirmations } = fakeEnv({
    data: {
      'daymark.tasks.v1': '[]',
      'daymark.weather.v1': '{}'
    },
    readFailures: ['daymark.tasks.v1']
  });
  const handle = ui.attachStorageUi(env);
  assert.equal(elements['data-clear-all'].disabled, true,
    'the visible clear-all action is blocked while a key is unreadable');

  await handle.onClearAll();
  assert.equal(confirmations.length, 1, 'direct clear-all still requires explicit confirmation');
  assert.equal(storageData['daymark.tasks.v1'], '[]');
  assert.equal(storageData['daymark.weather.v1'], '{}',
    'the preflight failure prevents partial deletion of readable categories');
  assert.match(elements['data-status'].textContent, /Nothing was cleared/);
});

test('a throwing localStorage getter leaves every category unknown and destructive actions disabled', () => {
  const { env, elements, storageData, confirmations } = fakeEnv({
    data: { 'daymark.tasks.v1': '[]' }
  });
  delete env.localStorage;
  Object.defineProperty(env.window, 'localStorage', {
    configurable: true,
    get() { throw new Error('storage access denied'); }
  });

  const handle = ui.attachStorageUi(env);
  assert.match(elements['data-status'].textContent, /Browser storage could not be accessed/);
  assert.equal(elements['data-clear-all'].disabled, true);

  handle.onClearAll();
  handle.onClearCategory('tasks');
  assert.equal(confirmations.length, 0, 'no destructive confirmation is offered without storage access');
  assert.equal(storageData['daymark.tasks.v1'], '[]', 'a throwing storage getter never clears data');
});

// --- Issue #740: the live storage card binds a dedicated destructive control ---

const fs = require('node:fs');
const path = require('node:path');

function fakePageEnv(options) {
  const opts = options || {};
  const pageElements = {
    'storage-list': Object.assign(fakeElement('div'), { id: 'storage-list' }),
    'storage-status-line': Object.assign(fakeElement('p'), { id: 'storage-status-line' }),
    'storage-check': Object.assign(fakeElement('button'), { id: 'storage-check' }),
    'storage-clear': Object.assign(fakeElement('button'), { id: 'storage-clear' }),
    'storage-clear-all': Object.assign(fakeElement('button'), { id: 'storage-clear-all' })
  };
  const pageStorage = Object.assign({}, opts.data || {});
  const pageConfirmations = [];
  const dispatched = [];
  const pageLocks = createLockManager();
  const pageLocalStorage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(pageStorage, key) ? pageStorage[key] : null; },
    setItem(key, value) { pageStorage[key] = String(value); },
    removeItem(key) { delete pageStorage[key]; }
  };
  class PageStorageEvent { constructor(type, init) { this.type = type; this.key = init && init.key; this.newValue = init && init.newValue; } }
  const pageWindow = {
    StorageEvent: PageStorageEvent,
    navigator: { locks: pageLocks },
    addEventListener() {},
    dispatchEvent(event) { dispatched.push(event); return true; }
  };
  const pageEnv = {
    document: {
      readyState: 'complete',
      getElementById(id) { return pageElements[id] || null; },
      createElement(tag) { return fakeElement(tag); }
    },
    window: pageWindow,
    localStorage: pageLocalStorage,
    taskMutationApi: taskMutation,
    lockManager: pageLocks,
    webhookUi: { prepareForClearAll() { return { reset: true, legacyConfigCleared: true }; } },
    telegramUi: { resetForClearAll() {} },
    storageApi,
    confirm(message) { pageConfirmations.push(String(message)); return true; }
  };
  return { env: pageEnv, elements: pageElements, storageData: pageStorage, confirmations: pageConfirmations, dispatched };
}

test('the live storage card renders through the page ids and keeps Clear status read-only', async () => {
  const { env, elements, storageData, confirmations, dispatched } = fakePageEnv({
    data: { 'daymark.tasks.v1': '[]', 'daymark.weather.v1': '{}' }
  });
  const handle = ui.attachStorageUi(env);
  assert.match(elements['storage-status-line'].textContent, /2 of .* categories hold data/);
  assert.equal(elements['storage-clear-all'].disabled, false,
    'the dedicated Clear all control is enabled when readable data exists');

  const clearStatus = elements['storage-clear'].listeners.find((entry) => entry.type === 'click');
  assert.ok(clearStatus, 'Clear status is wired');
  clearStatus.handler();
  assert.equal(confirmations.length, 0, 'Clear status never raises the destructive confirmation');
  assert.equal(elements['storage-status-line'].textContent, '', 'Clear status empties only the status line');
  assert.equal(storageData['daymark.tasks.v1'], '[]', 'Clear status never removes stored data');
  assert.equal(storageData['daymark.weather.v1'], '{}', 'Clear status never removes stored data');

  const clearAll = elements['storage-clear-all'].listeners.find((entry) => entry.type === 'click');
  assert.ok(clearAll, 'Clear all local data is wired');
  await clearAll.handler();
  assert.equal(confirmations.length, 1, 'Clear all still requires the explicit confirmation');
  assert.equal(storageData['daymark.tasks.v1'], undefined, 'the dedicated control clears managed data');
  assert.equal(storageData['daymark.weather.v1'], undefined, 'the dedicated control clears managed data');
  assert.ok(dispatched.some((event) => event.key === taskMutation.GENERATION_KEY),
    'same-tab task listeners receive the new clear generation');
  assert.equal(typeof handle.onClearAll, 'function');
});

test('the storage card Check control rescans through the page ids without confirmation', () => {
  const { env, elements, storageData, confirmations, dispatched } = fakePageEnv({
    data: { 'daymark.feed.v1': '{}' }
  });
  ui.attachStorageUi(env);
  env.localStorage.setItem('daymark.weather.v1', '{}');
  const check = elements['storage-check'].listeners.find((entry) => entry.type === 'click');
  assert.ok(check, 'Check is wired as the rescan control');
  check.handler();
  assert.match(elements['storage-status-line'].textContent, /2 of .* categories hold data/);
  assert.equal(confirmations.length, 0, 'a read-only scan never asks for confirmation');
  assert.equal(storageData['daymark.feed.v1'], '{}');
});

test('markup and source pins: destructive label and handler agree, no Clear status fallback', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const formStart = indexSource.indexOf('id="storage-form"');
  const formEnd = indexSource.indexOf('id="storage-status-line"');
  assert.ok(formStart >= 0 && formEnd > formStart, 'the storage card form must exist');
  const storageForm = indexSource.slice(formStart, formEnd);
  assert.ok(storageForm.includes('id="storage-clear-all"'), 'the card has a dedicated Clear all control');
  assert.ok(storageForm.includes('Clear all local data'), 'the destructive control is clearly labeled');
  assert.ok(storageForm.includes('id="storage-clear"'), 'Clear status remains available');
  assert.ok(storageForm.includes('>Clear status<'), 'Clear status keeps its non-destructive label');
  assert.ok(storageForm.includes('id="storage-check"'), 'Check remains available');

  const uiSource = fs.readFileSync(path.join(__dirname, '..', 'storage-ui.js'), 'utf8');
  const resolutionStart = uiSource.indexOf('const clearAllEl');
  const resolutionEnd = uiSource.indexOf('function status(');
  assert.ok(resolutionStart >= 0 && resolutionEnd > resolutionStart, 'the destructive resolution must exist');
  const resolution = uiSource.slice(resolutionStart, resolutionEnd);
  assert.ok(resolution.includes("element('storage-clear-all')"), 'the destructive handler binds the dedicated control');
  assert.ok(!resolution.includes("element('storage-clear')"), 'Clear status is never a destructive fallback');
});
