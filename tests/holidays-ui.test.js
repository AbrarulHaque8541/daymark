'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const holidaysApi = require('../holidays-logic.js');
const ui = require('../holidays-ui.js');
const fs = require('node:fs');
const path = require('node:path');
const { createLockManager, deferred, clearKeys, taskMutation } = require('./task-clear-race-helpers.js');

const FROZEN_NOW = '2026-11-06T12:00:00.000Z';

const FETCH_BODY = JSON.stringify([
  { date: '2026-12-25', localName: 'Christmas Day', name: 'Christmas Day', countryCode: 'IN', global: true },
  { date: '2026-11-14', localName: 'दीवाली', name: 'Diwali', countryCode: 'IN', global: false }
]);

function fakeElement(tag) {
  const el = {
    tagName: tag,
    id: '',
    disabled: false,
    value: '',
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
    removeAttribute(name) { delete this[name]; },
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

function makeCache(holidays) {
  return {
    version: 1,
    countryCode: 'IN',
    year: 2026,
    holidays,
    fetchedAt: '2026-11-02T09:30:00.000Z'
  };
}

function fakeEnv(options) {
  const opts = options || {};
  const elements = {
    'holiday-country': Object.assign(fakeElement('select'), { id: 'holiday-country', value: opts.country || 'IN' }),
    'holiday-refresh': Object.assign(fakeElement('button'), { id: 'holiday-refresh', type: 'submit' }),
    'holiday-form': Object.assign(fakeElement('form'), { id: 'holiday-form' }),
    'holiday-status': Object.assign(fakeElement('p'), { id: 'holiday-status' }),
    'holiday-list': Object.assign(fakeElement('div'), { id: 'holiday-list' }),
    'holiday-clear': Object.assign(fakeElement('button'), { id: 'holiday-clear', type: 'button' })
  };
  const storageData = {};
  if (opts.stored !== undefined) storageData[ui.STORAGE_KEY] = opts.stored;
  if (opts.prefs !== undefined) storageData[ui.PREFS_KEY] = opts.prefs;
  const storage = opts.storage || {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { storageData[key] = String(value); },
    removeItem(key) { delete storageData[key]; }
  };
  const lockManager = createLockManager();
  const env = {
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; },
      createElement(tag) { return fakeElement(tag); }
    },
    window: {},
    localStorage: storage,
    holidaysApi: opts.holidaysApi || holidaysApi,
    taskMutationApi: taskMutation,
    lockManager,
    fetch: opts.fetch,
    now: () => FROZEN_NOW
  };
  return { env, elements, storageData, storage, lockManager };
}

function streamResponse(body) {
  const bytes = new TextEncoder().encode(body);
  let offset = 0;
  const reader = {
    async read() {
      if (offset >= bytes.length) return { done: true, value: undefined };
      const chunk = bytes.slice(offset, offset + 1024);
      offset += chunk.length;
      return { done: false, value: chunk };
    },
    cancel() { return Promise.resolve(); },
    releaseLock() {}
  };
  return {
    ok: true,
    status: 200,
    headers: { get() { return null; } },
    body: { getReader() { return reader; } },
    text() { throw new Error('bounded response reader must not call response.text()'); }
  };
}

function okFetch(routes) {
  const seen = [];
  const impl = (url) => {
    seen.push(url);
    const route = routes.find((r) => url.startsWith(r.prefix));
    if (!route) return Promise.reject(new Error('unexpected url'));
    const body = typeof route.body === 'function' ? route.body(url) : route.body;
    if (typeof body === 'string') return Promise.resolve(streamResponse(body));
    return Promise.resolve(body);
  };
  impl.seen = seen;
  return impl;
}

function rowTexts(listEl) {
  return listEl.children.map((row) => row.children.map((child) => child.textContent));
}

test('attach renders a cached holiday list with a cached note', () => {
  const stored = JSON.stringify(makeCache([
    { date: '2026-10-02', name: 'Gandhi Jayanti', localName: 'Gandhi Jayanti', global: true },
    { date: '2026-12-25', name: 'Christmas Day', localName: 'Christmas Day', global: true }
  ]));
  const { env, elements } = fakeEnv({ stored });
  const handle = ui.attachHolidaysUi(env);
  const rows = rowTexts(elements['holiday-list']);
  assert.equal(rows.length, 1, 'past holidays are not shown');
  assert.equal(rows[0][0], '2026-12-25 · in 49 days');
  assert.equal(rows[0][1], 'Christmas Day');
  assert.equal(rows[0][2], 'Nationwide public holiday');
  assert.ok(elements['holiday-status'].textContent.startsWith('Cached · updated 2026-11-02 09:30 UTC'));
  assert.equal(elements['holiday-country'].value, 'IN');
  assert.equal(typeof handle.onRefresh, 'function');
});

test('a cached list shows local names and regional scope honestly', () => {
  const stored = JSON.stringify(makeCache([
    { date: '2026-11-14', name: 'Diwali', localName: 'दीवाली', global: false }
  ]));
  const { env, elements } = fakeEnv({ stored });
  ui.attachHolidaysUi(env);
  const rows = rowTexts(elements['holiday-list']);
  assert.equal(rows[0][1], 'Diwali · दीवाली');
  assert.equal(rows[0][2], 'Locally: दीवाली · Regional holiday');
});

test('attach with no cache prompts the user to choose a country', () => {
  const { env, elements } = fakeEnv({});
  ui.attachHolidaysUi(env);
  assert.equal(elements['holiday-list'].children.length, 0);
  assert.equal(elements['holiday-status'].textContent, 'Choose a country and tap Refresh.');
});

test('a corrupt cache is preserved and reported instead of crashing', () => {
  const { env, elements } = fakeEnv({ stored: '{not json' });
  ui.attachHolidaysUi(env);
  assert.equal(elements['holiday-list'].children.length, 0);
  assert.match(elements['holiday-status'].textContent, /^Choose a country and tap Refresh\./);
  assert.match(elements['holiday-status'].textContent, /saved holiday cache is unreadable and was preserved/);
});

test('a cache whose year has no holidays left says so instead of showing nothing', () => {
  const stored = JSON.stringify(makeCache([
    { date: '2026-01-26', name: 'Republic Day', localName: 'Republic Day', global: true }
  ]));
  const { env, elements } = fakeEnv({ stored });
  ui.attachHolidaysUi(env);
  const rows = rowTexts(elements['holiday-list']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], 'No more public holidays in 2026 for this country.');
  assert.equal(rows[0][1], 'Tap Refresh next year, or choose another country.');
});

test('refresh fetches, renders, and persists the result and preference', async () => {
  const fetchImpl = okFetch([
    { prefix: holidaysApi.ENDPOINT, body: FETCH_BODY }
  ]);
  const { env, elements, storageData } = fakeEnv({ country: 'IN', fetch: fetchImpl });
  const handle = ui.attachHolidaysUi(env);
  await handle.onRefresh();
  assert.equal(fetchImpl.seen.length, 1);
  assert.equal(fetchImpl.seen[0], 'https://date.nager.at/api/v3/PublicHolidays/2026/IN');
  const rows = rowTexts(elements['holiday-list']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][0], '2026-11-14 · in 8 days');
  assert.equal(rows[0][1], 'Diwali · दीवाली');
  assert.equal(rows[1][0], '2026-12-25 · in 49 days');
  assert.equal(elements['holiday-status'].textContent, 'Updated · 2026-11-06 12:00 UTC');
  assert.equal(elements['holiday-refresh'].disabled, false);
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.ok(holidaysApi.validateHolidayCache(saved));
  assert.equal(saved.countryCode, 'IN');
  assert.equal(saved.holidays.length, 2);
  const prefs = JSON.parse(storageData[ui.PREFS_KEY]);
  assert.equal(prefs.countryCode, 'IN');
});

test('a deferred holiday response cannot recreate its absent cache or preference after Clear All', async () => {
  const waiting = deferred();
  const started = deferred();
  const result = makeCache([{ date: '2026-12-25', name: 'Christmas Day', localName: 'Christmas Day', global: true }]);
  const delayedApi = Object.assign({}, holidaysApi, {
    fetchHolidays() { started.resolve(); return waiting.promise; }
  });
  const { env, storage, storageData, lockManager } = fakeEnv({ country: 'IN', holidaysApi: delayedApi, fetch: () => Promise.resolve({}) });
  const handle = ui.attachHolidaysUi(env);
  assert.equal(storage.getItem(ui.STORAGE_KEY), null, 'the cache is absent before fetch begins');
  const refreshing = handle.onRefresh();
  await started.promise;
  await clearKeys(storage, [ui.STORAGE_KEY, ui.PREFS_KEY], lockManager);
  waiting.resolve(result);
  await refreshing;
  assert.equal(storageData[ui.STORAGE_KEY], undefined);
  assert.equal(storageData[ui.PREFS_KEY], undefined);
});

test('refresh failure keeps the cached list visible', async () => {
  const stored = JSON.stringify(makeCache([
    { date: '2026-12-25', name: 'Christmas Day', localName: 'Christmas Day', global: true }
  ]));
  const failing = () => Promise.reject(new Error('offline'));
  const { env, elements } = fakeEnv({ country: 'IN', stored, fetch: failing });
  const handle = ui.attachHolidaysUi(env);
  await handle.onRefresh();
  assert.ok(elements['holiday-status'].textContent.includes('Could not refresh: offline — showing cached holidays.'));
  const rows = rowTexts(elements['holiday-list']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], '2026-12-25 · in 49 days');
  assert.equal(elements['holiday-refresh'].disabled, false);
});

test('refresh failure with no cache reports the error plainly', async () => {
  const failing = () => Promise.reject(new Error('offline'));
  const { env, elements } = fakeEnv({ country: 'IN', fetch: failing });
  const handle = ui.attachHolidaysUi(env);
  await handle.onRefresh();
  assert.equal(elements['holiday-status'].textContent, 'Could not refresh: offline');
  assert.equal(elements['holiday-list'].children.length, 0);
});

test('missing fetch support is reported instead of throwing', async () => {
  const { env, elements } = fakeEnv({ country: 'IN' });
  const handle = ui.attachHolidaysUi(env);
  await handle.onRefresh();
  assert.ok(elements['holiday-status'].textContent.includes('fetch is unavailable'));
});

test('holiday form submission prevents navigation and refreshes', async () => {
  const fetchImpl = okFetch([
    { prefix: holidaysApi.ENDPOINT, body: FETCH_BODY }
  ]);
  const { env, elements } = fakeEnv({ country: 'IN', fetch: fetchImpl });
  ui.attachHolidaysUi(env);
  const submit = elements['holiday-form'].listeners.find((listener) => listener.type === 'submit');
  assert.ok(submit, 'holiday form should handle native submit events');
  let prevented = false;
  await submit.handler({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'native form navigation should be prevented');
  assert.equal(fetchImpl.seen.length, 1);
  assert.equal(elements['holiday-list'].children.length, 2);
});

test('clear removes the cached list, preference, and resets the country choice', () => {
  const stored = JSON.stringify(makeCache([
    { date: '2026-12-25', name: 'Christmas Day', localName: 'Christmas Day', global: true }
  ]));
  const prefs = JSON.stringify({ countryCode: 'DE' });
  const { env, elements, storageData } = fakeEnv({ stored, prefs });
  elements['holiday-country'].value = 'DE';
  const handle = ui.attachHolidaysUi(env);
  assert.equal(typeof handle.onClear, 'function');
  handle.onClear();
  assert.equal(elements['holiday-list'].children.length, 0);
  assert.equal(elements['holiday-country'].value, 'IN');
  assert.equal(storageData[ui.STORAGE_KEY], undefined);
  assert.equal(storageData[ui.PREFS_KEY], undefined);
  assert.equal(elements['holiday-status'].textContent,
    'Holidays cleared on this device. Choose a country and tap Refresh.');
});

test('clear is safe when nothing was cached', () => {
  const { env, elements } = fakeEnv({});
  const handle = ui.attachHolidaysUi(env);
  handle.onClear();
  assert.equal(elements['holiday-list'].children.length, 0);
  assert.equal(elements['holiday-status'].textContent,
    'Holidays cleared on this device. Choose a country and tap Refresh.');
});

test('clicking the Clear button clears the card', () => {
  const stored = JSON.stringify(makeCache([
    { date: '2026-12-25', name: 'Christmas Day', localName: 'Christmas Day', global: true }
  ]));
  const { env, elements, storageData } = fakeEnv({ stored });
  ui.attachHolidaysUi(env);
  const clearBtn = elements['holiday-clear'];
  const click = clearBtn.listeners.find((l) => l.type === 'click');
  assert.ok(click, 'clear click listener registered');
  click.handler();
  assert.equal(storageData[ui.STORAGE_KEY], undefined);
  assert.equal(elements['holiday-list'].children.length, 0);
  assert.equal(elements['holiday-status'].textContent,
    'Holidays cleared on this device. Choose a country and tap Refresh.');
});

test('restores last country preference when no cache is present', () => {
  const prefs = JSON.stringify({ countryCode: 'US' });
  const { env, elements } = fakeEnv({ prefs });
  ui.attachHolidaysUi(env);
  assert.equal(elements['holiday-country'].value, 'US');
  assert.equal(elements['holiday-status'].textContent, 'Last country restored. Tap Refresh for upcoming holidays.');
  assert.equal(elements['holiday-list'].children.length, 0);
});

test('country change persists the preference immediately', async () => {
  const { env, elements, storageData } = fakeEnv({});
  ui.attachHolidaysUi(env);
  const countryEl = elements['holiday-country'];
  countryEl.value = 'GB';
  const change = countryEl.listeners.find((l) => l.type === 'change');
  assert.ok(change, 'change listener registered');
  await change.handler();
  const prefs = JSON.parse(storageData[ui.PREFS_KEY]);
  assert.equal(prefs.countryCode, 'GB');
});

test('cache country overrides preference on load', () => {
  const stored = JSON.stringify(makeCache([
    { date: '2026-12-25', name: 'Christmas Day', localName: 'Christmas Day', global: true }
  ]));
  const prefs = JSON.stringify({ countryCode: 'DE' });
  const { env, elements } = fakeEnv({ stored, prefs });
  ui.attachHolidaysUi(env);
  assert.equal(elements['holiday-country'].value, 'IN'); // from cache
  assert.ok(elements['holiday-status'].textContent.startsWith('Cached ·'));
});

test('the module exposes its API and stays inert under Node', () => {
  assert.equal(typeof ui.attachHolidaysUi, 'function');
  assert.equal(ui.STORAGE_KEY, 'daymark.holidays.v1');
  assert.equal(ui.PREFS_KEY, 'daymark.holidays.prefs.v1');
  assert.equal(typeof globalThis.DaymarkHolidaysUi, 'object');
});


test('a blocked window.localStorage getter does not prevent the holidays card from attaching', () => {
  const { env, elements } = fakeEnv({});
  delete env.localStorage;
  Object.defineProperty(env.window, 'localStorage', {
    configurable: true,
    get() { throw new Error('storage access blocked'); }
  });
  const handle = ui.attachHolidaysUi(env);
  assert.equal(typeof handle.onRefresh, 'function');
  assert.ok(elements['holiday-form'].listeners.some((listener) => listener.type === 'submit'));
  assert.match(elements['holiday-status'].textContent, /browser storage is unavailable/);
});

test('a failed cache read is not treated as absent and Clear does not remove unknown data', () => {
  let writes = 0;
  let removes = 0;
  const storage = {
    getItem() { throw new Error('storage read blocked'); },
    setItem() { writes += 1; },
    removeItem() { removes += 1; }
  };
  const { env, elements } = fakeEnv({ storage });
  const handle = ui.attachHolidaysUi(env);
  assert.match(elements['holiday-status'].textContent, /saved holiday data could not be read/);
  handle.onClear();
  assert.equal(writes, 0);
  assert.equal(removes, 0);
  assert.match(elements['holiday-status'].textContent, /nothing was cleared/);
});

test('a successful refresh remains visible when cache and preference writes fail', async () => {
  let writes = 0;
  const storage = {
    getItem() { return null; },
    setItem() { writes += 1; throw new Error('quota exceeded'); },
    removeItem() {}
  };
  const fetchImpl = okFetch([{ prefix: holidaysApi.ENDPOINT, body: FETCH_BODY }]);
  const { env, elements } = fakeEnv({ storage, fetch: fetchImpl });
  const handle = ui.attachHolidaysUi(env);
  await handle.onRefresh();
  assert.equal(elements['holiday-list'].children.length, 2, 'fresh results render even when persistence fails');
  assert.equal(writes, 2, 'cache and country preference writes are attempted independently');
  assert.match(elements['holiday-status'].textContent, /^Updated ·/);
  assert.match(elements['holiday-status'].textContent, /changes could not be saved/);
  assert.doesNotMatch(elements['holiday-status'].textContent, /Could not refresh/);
});

test('a partial Clear failure restores saved cache and preference and keeps the visible list', () => {
  const cacheRaw = JSON.stringify(makeCache([
    { date: '2026-12-25', name: 'Christmas Day', localName: 'Christmas Day', global: true }
  ]));
  const prefsRaw = JSON.stringify({ countryCode: 'DE' });
  const data = { [ui.STORAGE_KEY]: cacheRaw, [ui.PREFS_KEY]: prefsRaw };
  let removeCalls = 0;
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) {
      removeCalls += 1;
      if (removeCalls === 2) throw new Error('storage blocked the second removal');
      delete data[key];
    }
  };
  const { env, elements } = fakeEnv({ storage });
  const handle = ui.attachHolidaysUi(env);
  assert.equal(elements['holiday-list'].children.length, 1);
  handle.onClear();
  assert.equal(data[ui.STORAGE_KEY], cacheRaw, 'the original cache is restored');
  assert.equal(data[ui.PREFS_KEY], prefsRaw, 'the original preference is preserved');
  assert.equal(elements['holiday-list'].children.length, 1, 'visible data remains after failed Clear');
  assert.equal(elements['holiday-country'].value, 'IN', 'the selected country is not reset');
  assert.match(elements['holiday-status'].textContent, /previous saved data was restored where possible/);
  assert.match(elements['holiday-status'].textContent, /saved holiday data could not be removed/);
  assert.doesNotMatch(elements['holiday-status'].textContent, /changes could not be saved/);
  assert.doesNotMatch(elements['holiday-status'].textContent, /^Holidays cleared/);
});

test('refresh preserves corrupt cache bytes and reports that the new result is not cached', async () => {
  const corrupt = '{not valid json';
  const data = { [ui.STORAGE_KEY]: corrupt };
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; }
  };
  const fetchImpl = okFetch([{ prefix: holidaysApi.ENDPOINT, body: FETCH_BODY }]);
  const { env, elements } = fakeEnv({ storage, fetch: fetchImpl });
  const handle = ui.attachHolidaysUi(env);
  await handle.onRefresh();
  assert.equal(data[ui.STORAGE_KEY], corrupt, 'corrupt original bytes are never silently overwritten');
  assert.equal(elements['holiday-list'].children.length, 2, 'fresh results remain available in memory');
  assert.match(elements['holiday-status'].textContent, /Updated ·/);
  assert.match(elements['holiday-status'].textContent, /saved holiday cache is unreadable and was preserved/);
});

test('a cache changed by another tab is not overwritten by a refresh', async () => {
  const original = JSON.stringify(makeCache([
    { date: '2026-12-25', name: 'Christmas Day', localName: 'Christmas Day', global: true }
  ]));
  const external = JSON.stringify(makeCache([
    { date: '2026-12-26', name: 'Boxing Day', localName: 'Boxing Day', global: true }
  ]));
  const data = { [ui.STORAGE_KEY]: original };
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; }
  };
  const fetchImpl = okFetch([{ prefix: holidaysApi.ENDPOINT, body: FETCH_BODY }]);
  const { env, elements } = fakeEnv({ storage, fetch: fetchImpl });
  const handle = ui.attachHolidaysUi(env);
  data[ui.STORAGE_KEY] = external;
  await handle.onRefresh();
  assert.equal(data[ui.STORAGE_KEY], external, 'the other tab\'s value wins');
  assert.equal(elements['holiday-list'].children.length, 2, 'the freshly fetched result still renders');
  assert.match(elements['holiday-status'].textContent, /saved data changed elsewhere and was preserved/);
});

test('auto-boot lets attachHolidaysUi guard the storage getter instead of reading it eagerly', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'holidays-ui.js'), 'utf8');
  assert.doesNotMatch(source, /localStorage:\s*window\.localStorage/,
    'the DOMContentLoaded callback must not evaluate window.localStorage before guarded attachment');
});


test('country preference write failure is reported without throwing from the change handler', async () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error('quota exceeded'); },
    removeItem() {}
  };
  const { env, elements } = fakeEnv({ storage });
  ui.attachHolidaysUi(env);
  const country = elements['holiday-country'];
  country.value = 'GB';
  const change = country.listeners.find((listener) => listener.type === 'change');
  assert.ok(change, 'country preference listener is registered');
  await assert.doesNotReject(() => change.handler());
  assert.match(elements['holiday-status'].textContent, /Country preference was not saved/);
  assert.match(elements['holiday-status'].textContent, /changes could not be saved/);
});


test('a blocked storage getter still allows a successful refresh to render', async () => {
  const fetchImpl = okFetch([{ prefix: holidaysApi.ENDPOINT, body: FETCH_BODY }]);
  const { env, elements } = fakeEnv({ country: 'IN', fetch: fetchImpl });
  delete env.localStorage;
  Object.defineProperty(env.window, 'localStorage', {
    configurable: true,
    get() { throw new Error('storage getter blocked'); }
  });
  const handle = ui.attachHolidaysUi(env);
  assert.match(elements['holiday-status'].textContent, /browser storage is unavailable/);
  await handle.onRefresh();
  assert.equal(elements['holiday-list'].children.length, 2, 'fresh network results remain usable');
  assert.match(elements['holiday-status'].textContent, /^Updated ·/);
  assert.match(elements['holiday-status'].textContent, /browser storage is unavailable/);
});

test('a failed storage read does not block fresh results or overwrite an unreadable cache', async () => {
  const original = JSON.stringify(makeCache([
    { date: '2026-12-25', name: 'Christmas Day', localName: 'Christmas Day', global: true }
  ]));
  let writes = 0;
  const storage = {
    getItem() { throw new Error('storage read blocked'); },
    setItem() { writes += 1; },
    removeItem() {}
  };
  const fetchImpl = okFetch([{ prefix: holidaysApi.ENDPOINT, body: FETCH_BODY }]);
  const { env, elements } = fakeEnv({ storage, fetch: fetchImpl });
  const handle = ui.attachHolidaysUi(env);
  assert.match(elements['holiday-status'].textContent, /saved holiday data could not be read/);
  await handle.onRefresh();
  assert.equal(elements['holiday-list'].children.length, 2, 'fresh network results remain visible');
  assert.equal(writes, 0, 'unreadable records are never replaced');
  assert.match(elements['holiday-status'].textContent, /saved holiday data could not be read/);
  assert.equal(handle.readCache(), null);
});


test('Clear reports partial storage state when rollback cannot restore original bytes', () => {
  const cacheRaw = JSON.stringify(makeCache([
    { date: '2026-12-25', name: 'Christmas Day', localName: 'Christmas Day', global: true }
  ]));
  const prefsRaw = JSON.stringify({ countryCode: 'DE' });
  const data = { [ui.STORAGE_KEY]: cacheRaw, [ui.PREFS_KEY]: prefsRaw };
  let removeCalls = 0;
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) {
      if (key === ui.STORAGE_KEY) throw new Error('cache rollback blocked');
      data[key] = String(value);
    },
    removeItem(key) {
      removeCalls += 1;
      if (removeCalls === 2) throw new Error('preference removal blocked');
      delete data[key];
    }
  };
  const { env, elements } = fakeEnv({ storage });
  const handle = ui.attachHolidaysUi(env);
  assert.equal(elements['holiday-list'].children.length, 1);
  handle.onClear();
  assert.equal(data[ui.STORAGE_KEY], undefined, 'failed rollback is not falsely reported as restored');
  assert.equal(data[ui.PREFS_KEY], prefsRaw, 'the other original key is restored');
  assert.equal(elements['holiday-list'].children.length, 1, 'visible data remains for recovery');
  assert.match(elements['holiday-status'].textContent, /storage may be partially changed/);
  assert.match(elements['holiday-status'].textContent, /saved holiday data could not be removed/);
  assert.match(elements['holiday-status'].textContent, /changes could not be saved/);
  assert.doesNotMatch(elements['holiday-status'].textContent, /^Holidays cleared/);
});
