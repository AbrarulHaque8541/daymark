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
    addEventListener(type, handler) { this.listeners.push({ type, handler }); }
  };
}

function fakeEnv(options) {
  const opts = options || {};
  const elements = {
    'currency-amount': Object.assign(fakeElement('input'), { id: 'currency-amount', value: opts.amount || '1' }),
    'currency-from': Object.assign(fakeElement('select'), { id: 'currency-from', value: opts.from || 'USD' }),
    'currency-to': Object.assign(fakeElement('select'), { id: 'currency-to', value: opts.to || 'INR' }),
    'currency-refresh': Object.assign(fakeElement('button'), { id: 'currency-refresh' }),
    'currency-status': Object.assign(fakeElement('p'), { id: 'currency-status' }),
    'currency-now': Object.assign(fakeElement('div'), { id: 'currency-now' })
  };
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

test('swap button exchanges from/to and inverts a matching cached rate', () => {
  const { env, elements } = fakeEnv({ stored: STORED });
  // inject swap element
  elements['currency-swap'] = Object.assign(fakeElement('button'), { id: 'currency-swap' });
  const handle = ui.attachCurrencyUi(env);
  const swap = elements['currency-swap'];
  const listener = swap.listeners.find((l) => l.type === 'click');
  assert.ok(listener, 'swap click listener registered');
  // initial state
  assert.equal(elements['currency-from'].value, 'USD');
  assert.equal(elements['currency-to'].value, 'INR');
  listener.handler();
  assert.equal(elements['currency-from'].value, 'INR');
  assert.equal(elements['currency-to'].value, 'USD');
  assert.ok(elements['currency-status'].textContent.includes('inverted cached rate'));
  assert.ok(elements['currency-now'].textContent.includes('1 INR ='));
  assert.ok(elements['currency-now'].textContent.includes('USD'));
});

test('swap without a reverse cache clears the result and prompts for refresh', () => {
  const { env, elements } = fakeEnv({ from: 'EUR', to: 'GBP' });
  elements['currency-swap'] = Object.assign(fakeElement('button'), { id: 'currency-swap' });
  ui.attachCurrencyUi(env);
  const listener = elements['currency-swap'].listeners.find((l) => l.type === 'click');
  listener.handler();
  assert.equal(elements['currency-from'].value, 'GBP');
  assert.equal(elements['currency-to'].value, 'EUR');
  assert.equal(elements['currency-now'].textContent, '');
  assert.ok(elements['currency-status'].textContent.includes('tap Refresh'));
});
