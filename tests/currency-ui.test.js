'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
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
    'currency-now': Object.assign(fakeElement('div'), { id: 'currency-now' })
  };
  elements['currency-refresh'].type = 'submit';
  elements['currency-refresh'].form = elements['currency-form'];
  elements['currency-form'].submitCount = 0;
  elements['currency-form'].navigationCount = 0;
  const storageData = {};
  if (opts.stored !== undefined) storageData[ui.STORAGE_KEY] = opts.stored;
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { storageData[key] = String(value); }
  };
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
  return { env, elements, storageData };
}

function okFetch(routes) {
  const seen = [];
  const impl = (url) => {
    seen.push(url);
    const route = routes.find((r) => url.startsWith(r.prefix));
    if (!route) return Promise.reject(new Error('unexpected url'));
    const body = typeof route.body === 'function' ? route.body(url) : route.body;
    if (typeof body === 'string') {
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) });
    }
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
  assert.equal(elements['currency-status'].textContent, 'Pick two currencies and tap Refresh.');
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
  // Inverse of 94.91 ≈ 0.010536
  assert.ok(elements['currency-now'].textContent.includes('INR'), 'should show inverted pair');
  assert.ok(elements['currency-now'].textContent.includes('USD'));
  assert.ok(elements['currency-status'].textContent.includes('Inverse of cached rate'));
  assert.ok(elements['currency-status'].textContent.includes('official ECB rate'));
});
