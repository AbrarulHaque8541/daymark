'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const storageApi = require('../storage-logic.js');
const ui = require('../storage-ui.js');

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
    'storage-list': Object.assign(fakeElement('div'), { id: 'storage-list' }),
    'storage-status-line': Object.assign(fakeElement('p'), { id: 'storage-status-line' }),
    'storage-check': Object.assign(fakeElement('button'), { id: 'storage-check' }),
    'storage-clear': Object.assign(fakeElement('button'), { id: 'storage-clear' }),
    'storage-clear-all': Object.assign(fakeElement('button'), { id: 'storage-clear-all' })
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

test('the production HTML storage controls match the UI wiring', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
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

test('clearing one category asks for confirmation and removes only its keys', () => {
  const { env, elements, storageData, confirmations } = fakeEnv({
    data: {
      'daymark.tasks.v1': '[]',
      'daymark.tasks.v1.backup': '[]',
      'daymark.webhook.v1': JSON.stringify({ version: 1, url: 'https://hooks.example.com/x' })
    }
  });
  const handle = ui.attachStorageUi(env);
  handle.onClearCategory('tasks');
  assert.equal(confirmations.length, 1, 'a destructive action requires one confirmation');
  assert.match(confirmations[0], /Clear Tasks\?/);
  assert.match(confirmations[0], /This cannot be undone/);
  assert.equal(storageData['daymark.tasks.v1'], undefined, 'the task data is removed');
  assert.equal(storageData['daymark.tasks.v1.backup'], '[]', 'the recovery backup keeps its own category');
  assert.equal(storageData['daymark.webhook.v1'] !== undefined, true, 'webhook settings are untouched');
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

test('clear-all confirms once, removes everything, and leaves foreign keys alone', () => {
  const { env, elements, storageData, confirmations } = fakeEnv({
    data: {
      'daymark.tasks.v1': '[]',
      'daymark.focus.v1': '{}',
      'daymark.webhook.queue.v1': '[]',
      'daymark.webhook.lock.v1': '12345|stale-owner',
      'unrelated.other.key': 'keep me'
    }
  });
  const handle = ui.attachStorageUi(env);
  handle.onClearAll();
  assert.equal(confirmations.length, 1);
  assert.match(confirmations[0], /Clear ALL local Daymark data/);
  assert.equal(storageData['daymark.tasks.v1'], undefined);
  assert.equal(storageData['daymark.focus.v1'], undefined);
  assert.equal(storageData['daymark.webhook.queue.v1'], undefined);
  assert.equal(storageData['daymark.webhook.lock.v1'], undefined, 'legacy webhook lock is managed and cleared');
  assert.equal(storageData['unrelated.other.key'], 'keep me');
  assert.match(elements['storage-status-line'].textContent, /Cleared all 4 stored item\(s\)/);
  assert.match(elements['storage-status-line'].textContent, /Nothing outside this browser was affected/);
  assert.equal(elements['storage-clear-all'].disabled, true, 'clear-all disables after the store is empty');
});

test('a failed removal during clear-all is reported honestly', () => {
  const { env, elements } = fakeEnv({ data: { 'daymark.tasks.v1': '[]' } });
  const handle = ui.attachStorageUi(env);
  env.localStorage.removeItem = () => { throw new Error('blocked'); };
  handle.onClearAll();
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

test('unreadable data is shown as unknown and clear-all fails closed', () => {
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

  handle.onClearCategory('tasks');
  assert.equal(storageData['daymark.tasks.v1'], '[]', 'failed reads must not delete the stored value');
  assert.match(elements['storage-status-line'].textContent, /could not be checked or removed\. Nothing was cleared/);
  handle.onClearAll();
  assert.equal(confirmations.length, 1, 'only the category retry was confirmed; clear-all was blocked');
  assert.equal(storageData['daymark.tasks.v1'], '[]', 'unknown data blocks clear-all deletion');
});

test('category clear reports a preflight read failure without claiming that anything was cleared', () => {
  const { env, elements, storageData } = fakeEnv({
    data: { 'daymark.tasks.v1': '[]' },
    readFailures: ['daymark.tasks.v1']
  });
  const handle = ui.attachStorageUi(env);

  handle.onClearCategory('tasks');

  assert.equal(storageData['daymark.tasks.v1'], '[]',
    'the preflight read failure must preserve the original task data');
  assert.match(elements['storage-status-line'].textContent,
    /Could not clear Tasks: 1 item\(s\) could not be checked or removed\. Nothing was cleared\./);
  assert.doesNotMatch(elements['storage-status-line'].textContent, /Cleared Tasks/);
});

test('category clear reports a storage race with no remaining key as no change', () => {
  const { env, elements, storageData } = fakeEnv({
    data: { 'daymark.tasks.v1': '[]' }
  });
  const handle = ui.attachStorageUi(env);
  delete storageData['daymark.tasks.v1'];

  handle.onClearCategory('tasks');

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

test('a throwing localStorage getter leaves every category unknown and fails closed', () => {
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

  handle.onClearAll();
  handle.onClearCategory('tasks');
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

test('clear actions set busy state (disabled + aria-busy + is-busy) while operating', () => {
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
  handle.onClearCategory('tasks');
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


test('clear-all confirmation discloses the remembered browser proxy profile', () => {
  const { env, confirmations, confirmState, storageData } = fakeEnv({
    data: { 'daymark.browser-proxy.last-profile': 'proxy.example:8080' },
    confirmResult: false
  });
  const handle = ui.attachStorageUi(env);
  handle.onClearAll();

  assert.equal(confirmations.length, 1);
  assert.match(confirmations[0], /saved browser proxy profile/i);
  assert.match(confirmations[0], /Focus Timer preset/i);
  assert.equal(storageData['daymark.browser-proxy.last-profile'], 'proxy.example:8080',
    'declining the confirmation must preserve the remembered profile');
  assert.equal(confirmState.result, false);
});
