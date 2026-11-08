'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const holidaysApi = require('../holidays-logic.js');
const ui = require('../holidays-ui.js');

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
  const storage = {
    getItem(key) {
      if (opts.throwGetItem) throw new Error('storage read blocked');
      return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null;
    },
    setItem(key, value) {
      if (opts.throwSetItem) throw new Error('storage write blocked');
      storageData[key] = String(value);
    },
    removeItem(key) {
      if (opts.throwRemoveItem || opts.throwRemoveKey === key) throw new Error('storage remove blocked');
      delete storageData[key];
    }
  };
  const env = {
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; },
      createElement(tag) { return fakeElement(tag); }
    },
    window: {},
    localStorage: storage,
    holidaysApi,
    fetch: opts.fetch,
    now: () => FROZEN_NOW
  };
  return { env, elements, storageData };
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
    text() { return Promise.resolve(body); }
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

test('a corrupt cache is preserved and disclosed instead of treated as absent', () => {
  const { env, elements, storageData } = fakeEnv({ stored: '{not json' });
  ui.attachHolidaysUi(env);
  assert.equal(elements['holiday-list'].children.length, 0);
  assert.match(elements['holiday-status'].textContent, /invalid saved holiday data was left unchanged/);
  assert.equal(storageData[ui.STORAGE_KEY], '{not json');
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

test('country change persists the preference immediately', () => {
  const { env, elements, storageData } = fakeEnv({});
  ui.attachHolidaysUi(env);
  const countryEl = elements['holiday-country'];
  countryEl.value = 'GB';
  const change = countryEl.listeners.find((l) => l.type === 'change');
  assert.ok(change, 'change listener registered');
  change.handler();
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


test('blocked localStorage getter does not abort card boot or a successful refresh', async () => {
  const fetchImpl = okFetch([{ prefix: holidaysApi.ENDPOINT, body: FETCH_BODY }]);
  const { env, elements } = fakeEnv({ country: 'IN', fetch: fetchImpl });
  delete env.localStorage;
  Object.defineProperty(env.window, 'localStorage', {
    configurable: true,
    get() { throw new Error('storage getter blocked'); }
  });
  const handle = ui.attachHolidaysUi(env);
  assert.ok(elements['holiday-status'].textContent.includes('saved holiday data could not be read'));
  await handle.onRefresh();
  assert.equal(elements['holiday-list'].children.length, 2, 'fresh results remain usable without storage');
  assert.ok(elements['holiday-status'].textContent.startsWith('Updated ·'));
  assert.ok(elements['holiday-status'].textContent.includes('saved holiday data could not be read'));
  assert.equal(typeof handle.onClear, 'function');
});


test('refresh does not overwrite a corrupt saved cache', async () => {
  const raw = '{not json';
  const fetchImpl = okFetch([{ prefix: holidaysApi.ENDPOINT, body: FETCH_BODY }]);
  const { env, elements, storageData } = fakeEnv({ stored: raw, fetch: fetchImpl });
  const handle = ui.attachHolidaysUi(env);
  await handle.onRefresh();
  assert.equal(elements['holiday-list'].children.length, 2, 'fresh results remain visible');
  assert.equal(storageData[ui.STORAGE_KEY], raw, 'unknown cache bytes remain untouched');
  assert.ok(elements['holiday-status'].textContent.includes('invalid saved holiday data was left unchanged'));
  assert.equal(typeof handle.readCache(), 'object');
});

test('storage read exceptions preserve the unknown cache and do not block fresh results', async () => {
  const stored = JSON.stringify(makeCache([
    { date: '2026-12-25', name: 'Christmas Day', localName: 'Christmas Day', global: true }
  ]));
  const fetchImpl = okFetch([{ prefix: holidaysApi.ENDPOINT, body: FETCH_BODY }]);
  const { env, elements, storageData } = fakeEnv({ stored, fetch: fetchImpl, throwGetItem: true });
  const handle = ui.attachHolidaysUi(env);
  assert.ok(elements['holiday-status'].textContent.includes('saved holiday data could not be read'));
  await handle.onRefresh();
  assert.equal(elements['holiday-list'].children.length, 2);
  assert.equal(storageData[ui.STORAGE_KEY], stored, 'an unreadable cache must never be overwritten');
  assert.ok(elements['holiday-status'].textContent.includes('saved holiday data could not be read'));
  assert.equal(handle.readCache(), null);
});

test('storage write failures do not discard a successful network result', async () => {
  const fetchImpl = okFetch([{ prefix: holidaysApi.ENDPOINT, body: FETCH_BODY }]);
  const { env, elements } = fakeEnv({ country: 'IN', fetch: fetchImpl, throwSetItem: true });
  const handle = ui.attachHolidaysUi(env);
  await handle.onRefresh();
  assert.equal(elements['holiday-list'].children.length, 2);
  assert.ok(elements['holiday-status'].textContent.startsWith('Updated ·'));
  assert.ok(elements['holiday-status'].textContent.includes('saved holiday data could not be updated'));
  assert.equal(elements['holiday-refresh'].disabled, false);
});

test('failed two-key clear restores the first key and keeps the current list', () => {
  const stored = JSON.stringify(makeCache([
    { date: '2026-12-25', name: 'Christmas Day', localName: 'Christmas Day', global: true }
  ]));
  const prefs = JSON.stringify({ countryCode: 'DE' });
  const { env, elements, storageData } = fakeEnv({
    stored,
    prefs,
    throwRemoveKey: ui.PREFS_KEY
  });
  elements['holiday-country'].value = 'DE';
  const handle = ui.attachHolidaysUi(env);
  const cleared = handle.onClear();
  assert.equal(cleared, false);
  assert.equal(storageData[ui.STORAGE_KEY], stored, 'cache is restored after the second removal fails');
  assert.equal(storageData[ui.PREFS_KEY], prefs, 'preference remains unchanged');
  assert.equal(elements['holiday-list'].children.length, 1);
  assert.equal(elements['holiday-country'].value, 'DE');
  assert.ok(elements['holiday-status'].textContent.includes('Could not clear saved holiday data'));
});

test('country preference write failure is reported without throwing from change', () => {
  const { env, elements } = fakeEnv({ throwSetItem: true });
  ui.attachHolidaysUi(env);
  const countryEl = elements['holiday-country'];
  countryEl.value = 'GB';
  const change = countryEl.listeners.find((listener) => listener.type === 'change');
  assert.ok(change);
  assert.doesNotThrow(() => change.handler());
  assert.ok(elements['holiday-status'].textContent.includes('could not be saved'));
});

test('holiday auto-boot defers localStorage access until guarded attachment', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'holidays-ui.js'), 'utf8');
  assert.doesNotMatch(source, /localStorage:\s*window\.localStorage/,
    'boot must pass window and let attachHolidaysUi guard the storage getter');
});


test('the module exposes its API and stays inert under Node', () => {
  assert.equal(typeof ui.attachHolidaysUi, 'function');
  assert.equal(ui.STORAGE_KEY, 'daymark.holidays.v1');
  assert.equal(ui.PREFS_KEY, 'daymark.holidays.prefs.v1');
  assert.equal(typeof globalThis.DaymarkHolidaysUi, 'object');
});
