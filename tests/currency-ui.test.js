'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const currencyApi = require('../currency-logic.js');
const ui = require('../currency-ui.js');

const RATES_BODY = JSON.stringify({
  amount: 1.0,
  base: 'USD',
  date: '2026-11-02',
  rates: { INR: 94.91 }
});

function fakeElement(tag) {
  return {
    tagName: tag,
    id: '',
    disabled: false,
    value: '',
    textContent: '',
    listeners: [],
    addEventListener(type, handler) { this.listeners.push({ type, handler }); },
    dispatchEvent(event) {
      for (const listener of this.listeners) {
        if (listener.type === event.type) listener.handler(event);
      }
      return !event.defaultPrevented;
    },
    click() {
      const clickEvent = { type: 'click', defaultPrevented: false };
      this.dispatchEvent(clickEvent);
      if (this.tagName !== 'button' || this.type !== 'submit' || !this.form) return clickEvent;
      this.form.submitCount += 1;
      const submitEvent = {
        type: 'submit',
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }
      };
      this.form.dispatchEvent(submitEvent);
      if (!submitEvent.defaultPrevented) this.form.navigationCount += 1;
      return submitEvent;
    }
  };
}

function fakeEnv(options) {
  const opts = options || {};
  const elements = {
    'currency-amount': Object.assign(fakeElement('input'), { id: 'currency-amount', value: opts.amount || '1' }),
    'currency-from': Object.assign(fakeElement('select'), { id: 'currency-from', value: opts.from || 'USD' }),
    'currency-to': Object.assign(fakeElement('select'), { id: 'currency-to', value: opts.to || 'INR' }),
    'currency-refresh': Object.assign(fakeElement('button'), { id: 'currency-refresh' }),
    'currency-swap': Object.assign(fakeElement('button'), { id: 'currency-swap' }),
    'currency-form': Object.assign(fakeElement('form'), { id: 'currency-form' }),
    'currency-status': Object.assign(fakeElement('p'), { id: 'currency-status' }),
    'currency-now': Object.assign(fakeElement('div'), { id: 'currency-now' }),
    'currency-copy': Object.assign(fakeElement('button'), { id: 'currency-copy', hidden: true }),
    'currency-clear': Object.assign(fakeElement('button'), { id: 'currency-clear' })
  };
  elements['currency-refresh'].type = 'submit';
  elements['currency-refresh'].form = elements['currency-form'];
  elements['currency-form'].submitCount = 0;
  elements['currency-form'].navigationCount = 0;
  const storageData = {};
  if (opts.stored !== undefined) storageData[ui.STORAGE_KEY] = opts.stored;
  const defaultStorage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { storageData[key] = String(value); },
    removeItem(key) { delete storageData[key]; }
  };
  const storage = opts.storage || defaultStorage;
  const env = {
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; }
    },
    window: {},
    localStorage: storage,
    currencyApi,
    fetch: opts.fetch,
    now: () => '2026-11-03T12:00:00.000Z'
  };
  if (opts.omitLocalStorage) delete env.localStorage;
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
    body: { getReader() { return reader; }, cancel() { return reader.cancel(); } },
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

const STORED = JSON.stringify({
  version: 1,
  from: 'USD',
  to: 'INR',
  rate: 94.91,
  asOfDate: '2026-11-02',
  fetchedAt: '2026-11-02T09:30:00.000Z'
});

test('attach renders a cached rate with a cached note', () => {
  const { env, elements } = fakeEnv({ stored: STORED });
  const handle = ui.attachCurrencyUi(env);
  assert.equal(elements['currency-now'].textContent,
    '1 USD = 94.91 INR · 1 USD = 94.91 INR · ECB reference rates, as of 2026-11-02');
  assert.ok(elements['currency-status'].textContent.startsWith('Cached · updated 2026-11-02 09:30 UTC'));
  assert.equal(typeof handle.onRefresh, 'function');
});

test('attach with no cache prompts the user to pick currencies', () => {
  const { env, elements } = fakeEnv({});
  ui.attachCurrencyUi(env);
  assert.equal(elements['currency-now'].textContent, '');
  assert.equal(elements['currency-status'].textContent, 'Pick two currencies and tap Refresh.');
});

test('form submission prevents navigation and refreshes the selected conversion', async () => {
  const fetchImpl = okFetch([{ prefix: currencyApi.RATES_ENDPOINT, body: RATES_BODY }]);
  const { env, elements } = fakeEnv({ amount: '10', fetch: fetchImpl });
  ui.attachCurrencyUi(env);
  const submit = elements['currency-form'].listeners.find((listener) => listener.type === 'submit');
  assert.ok(submit, 'currency form should handle native submit events');
  let prevented = false;
  await submit.handler({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'native form navigation should be prevented');
  assert.equal(fetchImpl.seen.length, 1);
  assert.ok(elements['currency-now'].textContent.startsWith('10 USD = 949.1 INR'));
  assert.equal(elements['currency-status'].textContent, 'Updated · 2026-11-03 12:00 UTC');
});

test('activating the Refresh submit button sends one form event, refreshes once, and prevents navigation', async () => {
  const fetchImpl = okFetch([{ prefix: currencyApi.RATES_ENDPOINT, body: RATES_BODY }]);
  const { env, elements } = fakeEnv({ amount: '10', fetch: fetchImpl });
  ui.attachCurrencyUi(env);
  const submitEvent = elements['currency-refresh'].click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements['currency-form'].submitCount, 1);
  assert.equal(submitEvent.defaultPrevented, true);
  assert.equal(elements['currency-form'].navigationCount, 0);
  assert.equal(fetchImpl.seen.length, 1);
  assert.ok(elements['currency-now'].textContent.startsWith('10 USD = 949.1 INR'));
});

test('Enter refresh prevents default and a concurrent submit cannot duplicate the request', async () => {
  const fetchImpl = okFetch([{ prefix: currencyApi.RATES_ENDPOINT, body: RATES_BODY }]);
  const { env, elements } = fakeEnv({ amount: '10', fetch: fetchImpl });
  ui.attachCurrencyUi(env);
  const enter = elements['currency-amount'].listeners.find((listener) => listener.type === 'keydown');
  assert.ok(enter, 'amount input should handle Enter');
  const enterEvent = {
    key: 'Enter',
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }
  };
  enter.handler(enterEvent);
  assert.equal(enterEvent.defaultPrevented, true, 'Enter must suppress the browser default form submit');
  assert.equal(fetchImpl.seen.length, 1);

  const duplicateSubmit = {
    type: 'submit',
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }
  };
  elements['currency-form'].dispatchEvent(duplicateSubmit);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(duplicateSubmit.defaultPrevented, true);
  assert.equal(fetchImpl.seen.length, 1, 'the busy guard must prevent a duplicate refresh');
  assert.equal(elements['currency-form'].navigationCount, 0);
  assert.ok(elements['currency-now'].textContent.startsWith('10 USD = 949.1 INR'));
});

test('a corrupt cache is ignored instead of crashing', () => {
  const { env, elements } = fakeEnv({ stored: '{not json' });
  ui.attachCurrencyUi(env);
  assert.equal(elements['currency-now'].textContent, '');
  assert.equal(elements['currency-status'].textContent,
    'Pick two currencies and tap Refresh. · saved currency data is unreadable and was preserved');
});

test('refresh fetches, renders, and persists the result', async () => {
  const fetchImpl = okFetch([{ prefix: currencyApi.RATES_ENDPOINT, body: RATES_BODY }]);
  const { env, elements, storageData } = fakeEnv({ amount: '100', fetch: fetchImpl });
  const handle = ui.attachCurrencyUi(env);
  await handle.onRefresh();
  assert.equal(fetchImpl.seen.length, 1);
  assert.equal(fetchImpl.seen[0], 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR');
  assert.equal(elements['currency-now'].textContent,
    '100 USD = 9491 INR · 1 USD = 94.91 INR · ECB reference rates, as of 2026-11-02');
  assert.equal(elements['currency-status'].textContent, 'Updated · 2026-11-03 12:00 UTC');
  assert.equal(elements['currency-refresh'].disabled, false);
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.ok(currencyApi.validateCurrencyCache(saved));
  assert.equal(saved.rate, 94.91);
  assert.equal(saved.from, 'USD');
  assert.equal(saved.to, 'INR');
});

test('an invalid amount is rejected before any network call', async () => {
  const fetchImpl = okFetch([{ prefix: currencyApi.RATES_ENDPOINT, body: RATES_BODY }]);
  const { env, elements } = fakeEnv({ amount: '-4', fetch: fetchImpl });
  const handle = ui.attachCurrencyUi(env);
  await handle.onRefresh();
  assert.equal(fetchImpl.seen.length, 0);
  assert.equal(elements['currency-status'].textContent, 'Enter a positive amount to convert.');
});

test('identical currencies are rejected before any network call', async () => {
  const fetchImpl = okFetch([{ prefix: currencyApi.RATES_ENDPOINT, body: RATES_BODY }]);
  const { env, elements } = fakeEnv({ to: 'USD', fetch: fetchImpl });
  const handle = ui.attachCurrencyUi(env);
  await handle.onRefresh();
  assert.equal(fetchImpl.seen.length, 0);
  assert.equal(elements['currency-status'].textContent, 'Choose two different currencies.');
});

test('refresh failure keeps a matching cached rate visible', async () => {
  const failing = () => Promise.reject(new Error('offline'));
  const { env, elements } = fakeEnv({ amount: '1', stored: STORED, fetch: failing });
  const handle = ui.attachCurrencyUi(env);
  await handle.onRefresh();
  assert.ok(elements['currency-status'].textContent.includes('Could not refresh: offline — showing the cached rate.'));
  assert.equal(elements['currency-now'].textContent,
    '1 USD = 94.91 INR · 1 USD = 94.91 INR · ECB reference rates, as of 2026-11-02');
  assert.equal(elements['currency-refresh'].disabled, false);
});

test('refresh failure with a mismatched cache reports the error plainly', async () => {
  const failing = () => Promise.reject(new Error('offline'));
  const { env, elements } = fakeEnv({ from: 'EUR', stored: STORED, fetch: failing });
  const handle = ui.attachCurrencyUi(env);
  await handle.onRefresh();
  assert.equal(elements['currency-status'].textContent, 'Could not refresh: offline');
  assert.equal(elements['currency-now'].textContent, '1 USD = 94.91 INR · 1 USD = 94.91 INR · ECB reference rates, as of 2026-11-02');
});

test('missing fetch support is reported instead of throwing', async () => {
  const { env, elements } = fakeEnv({});
  const handle = ui.attachCurrencyUi(env);
  await handle.onRefresh();
  assert.ok(elements['currency-status'].textContent.includes('fetch is unavailable'));
});

test('the module exposes its API and stays inert under Node', () => {
  assert.equal(typeof ui.attachCurrencyUi, 'function');
  assert.equal(ui.STORAGE_KEY, 'daymark.currency.v1');
  assert.equal(ui.DEFAULT_FROM, 'USD');
  assert.equal(ui.DEFAULT_TO, 'INR');
  assert.equal(typeof globalThis.DaymarkCurrencyUi, 'object');
});

test('swap shows inverse of cached reverse pair without a network call', () => {
  const { env, elements } = fakeEnv({ from: 'USD', to: 'INR', stored: STORED });
  ui.attachCurrencyUi(env);
  // Initial render is the cached USD→INR
  assert.ok(elements['currency-now'].textContent.includes('1 USD = 94.91 INR'));
  const swap = elements['currency-swap'];
  const click = { preventDefault() {}, defaultPrevented: false };
  swap.listeners.find((l) => l.type === 'click').handler(click);
  assert.equal(elements['currency-from'].value, 'INR');
  assert.equal(elements['currency-to'].value, 'USD');
  // Inverse of 94.91 ≈ 0.010536 — rendered offline, no fetch call.
  assert.ok(elements['currency-now'].textContent.includes('INR'), 'should show inverted pair');
  assert.ok(elements['currency-now'].textContent.includes('USD'));
  assert.ok(elements['currency-status'].textContent.includes('Inverse of cached rate'));
  assert.ok(elements['currency-status'].textContent.includes('official ECB rate'));
});

test('swap button exchanges from/to and updates status without auto-refresh', () => {
  const { env, elements } = fakeEnv({ from: 'USD', to: 'INR' });
  const handle = ui.attachCurrencyUi(env);
  const swap = elements['currency-swap'];
  assert.ok(swap.listeners.some((l) => l.type === 'click'), 'swap button should listen for clicks');
  const click = { preventDefault() { click.prevented = true; }, defaultPrevented: false };
  swap.listeners.find((l) => l.type === 'click').handler(click);
  assert.equal(elements['currency-from'].value, 'INR');
  assert.equal(elements['currency-to'].value, 'USD');
  assert.ok(elements['currency-status'].textContent.includes('swapped'), 'status should mention swap');
  assert.equal(click.prevented, true);
});


test('amount input live-updates the display from a matching cached rate', () => {
  const { env, elements } = fakeEnv({ stored: STORED, amount: '1' });
  ui.attachCurrencyUi(env);
  assert.ok(elements['currency-now'].textContent.startsWith('1 USD = 94.91 INR'));
  const inputListeners = elements['currency-amount'].listeners.filter((l) => l.type === 'input');
  const live = inputListeners[inputListeners.length - 1];
  assert.ok(live, 'amount field should listen for input');
  elements['currency-amount'].value = '10';
  live.handler();
  assert.ok(elements['currency-now'].textContent.startsWith('10 USD = 949.1 INR'), 'display should update from cache without refresh');
  assert.ok(elements['currency-status'].textContent.startsWith('Cached'), 'status remains the cached note');
});

test('restores last amount and currency pair from localStorage prefs', () => {
  const prefs = JSON.stringify({ amount: '25', from: 'EUR', to: 'GBP' });
  const { env, elements, storageData } = fakeEnv({});
  storageData[ui.PREFS_KEY] = prefs;
  ui.attachCurrencyUi(env);
  assert.equal(elements['currency-amount'].value, '25');
  assert.equal(elements['currency-from'].value, 'EUR');
  assert.equal(elements['currency-to'].value, 'GBP');
});

test('persists prefs on swap and on input change', () => {
  const { env, elements, storageData } = fakeEnv({ from: 'USD', to: 'INR', amount: '5' });
  ui.attachCurrencyUi(env);
  // simulate input
  elements['currency-amount'].value = '42';
  const inputListener = elements['currency-amount'].listeners.find((l) => l.type === 'input');
  if (inputListener) inputListener.handler({});
  let saved = JSON.parse(storageData[ui.PREFS_KEY] || '{}');
  assert.equal(saved.amount, '42');
  assert.equal(saved.from, 'USD');

  // swap
  const swap = elements['currency-swap'];
  const click = { preventDefault() {}, defaultPrevented: false };
  swap.listeners.find((l) => l.type === 'click').handler(click);
  saved = JSON.parse(storageData[ui.PREFS_KEY] || '{}');
  assert.equal(saved.from, 'INR');
  assert.equal(saved.to, 'USD');
});

test('copy button copies the main conversion line and updates status', async () => {
  const { env, elements } = fakeEnv({ stored: STORED });
  let copied = null;
  env.clipboard = { writeText: async (text) => { copied = text; } };
  const handle = ui.attachCurrencyUi(env);
  const copy = elements['currency-copy'];
  assert.ok(copy.listeners.some((l) => l.type === 'click'), 'copy button should listen for clicks');
  assert.equal(copy.hidden, false, 'copy button should be visible when a result is shown');
  const click = { preventDefault() { click.prevented = true; }, defaultPrevented: false };
  await copy.listeners.find((l) => l.type === 'click').handler(click);
  assert.equal(copied, '1 USD = 94.91 INR');
  assert.ok(elements['currency-status'].textContent.includes('Copied'));
  assert.equal(click.prevented, true);
});


test('auto-boot does not eagerly read a blocked localStorage getter', () => {
  const source = fs.readFileSync(require.resolve('../currency-ui.js'), 'utf8');
  const elements = {
    'currency-amount': fakeElement('input'),
    'currency-from': fakeElement('select'),
    'currency-to': fakeElement('select'),
    'currency-refresh': fakeElement('button'),
    'currency-swap': fakeElement('button'),
    'currency-form': fakeElement('form'),
    'currency-status': fakeElement('p'),
    'currency-now': fakeElement('div'),
    'currency-copy': fakeElement('button'),
    'currency-clear': fakeElement('button')
  };
  const doc = { readyState: 'complete', getElementById(id) { return elements[id] || null; } };
  const win = {};
  Object.defineProperty(win, 'localStorage', { get() { throw new Error('storage is blocked'); } });
  const context = { window: win, document: doc };
  context.globalThis = context;
  assert.doesNotThrow(() => vm.runInNewContext(source, context));
  assert.match(elements['currency-status'].textContent, /browser storage is unavailable/);
});

test('storage read failure preserves unknown cache and preferences while refresh still renders', async () => {
  let writes = 0;
  const storage = {
    getItem() { throw new Error('storage read denied'); },
    setItem() { writes += 1; }
  };
  const fetchImpl = okFetch([{ prefix: currencyApi.RATES_ENDPOINT, body: RATES_BODY }]);
  const { env, elements } = fakeEnv({ amount: '10', fetch: fetchImpl, storage });
  const handle = ui.attachCurrencyUi(env);
  await handle.onRefresh();
  assert.equal(fetchImpl.seen.length, 1);
  assert.match(elements['currency-now'].textContent, /^10 USD = 949.1 INR/);
  assert.match(elements['currency-status'].textContent, /^Updated · .*browser storage could not be read/);
  assert.equal(writes, 0, 'unknown cache and preference values must not be overwritten');
});

test('a corrupt currency cache is preserved after a successful refresh', async () => {
  const corrupt = '{broken currency cache';
  const fetchImpl = okFetch([{ prefix: currencyApi.RATES_ENDPOINT, body: RATES_BODY }]);
  const { env, elements, storageData } = fakeEnv({ amount: '10', stored: corrupt, fetch: fetchImpl });
  const handle = ui.attachCurrencyUi(env);
  await handle.onRefresh();
  assert.equal(storageData[ui.STORAGE_KEY], corrupt);
  assert.match(elements['currency-now'].textContent, /^10 USD = 949.1 INR/);
  assert.match(elements['currency-status'].textContent, /saved currency data is unreadable and was preserved/);
});

test('Clear button removes cache and prefs and resets the view', () => {
  const prefs = JSON.stringify({ amount: '25', from: 'EUR', to: 'GBP' });
  const { env, elements, storageData } = fakeEnv({ stored: STORED });
  storageData[ui.PREFS_KEY] = prefs;
  const handle = ui.attachCurrencyUi(env);
  assert.ok(elements['currency-now'].textContent.includes('USD'));
  const clear = elements['currency-clear'];
  assert.ok(clear.listeners.some((l) => l.type === 'click'), 'Clear button should listen for clicks');
  clear.listeners.find((l) => l.type === 'click').handler({});
  assert.equal(elements['currency-now'].textContent, '');
  assert.equal(elements['currency-amount'].value, '1');
  assert.equal(elements['currency-from'].value, 'USD');
  assert.equal(elements['currency-to'].value, 'INR');
  assert.ok(elements['currency-status'].textContent.includes('Currency cleared'));
  assert.equal(storageData[ui.STORAGE_KEY], undefined);
  assert.equal(storageData[ui.PREFS_KEY], undefined);
});
