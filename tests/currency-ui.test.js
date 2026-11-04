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
    attributes: {},
    classList: {
      tokens: new Set(),
      toggle(name, force) {
        if (force === true) this.tokens.add(name);
        else if (force === false) this.tokens.delete(name);
        else if (this.tokens.has(name)) this.tokens.delete(name);
        else this.tokens.add(name);
        return this.tokens.has(name);
      },
      contains(name) { return this.tokens.has(name); }
    },
    listeners: [],
    addEventListener(type, handler) { this.listeners.push({ type, handler }); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    },
    removeAttribute(name) { delete this.attributes[name]; },
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
  fetchedAt: '2026-11-02T18:00:00.000Z'
});

test('attach renders a cached rate with a cached note', () => {
  const { env, elements } = fakeEnv({ stored: STORED, amount: '10' });
  ui.attachCurrencyUi(env);
  assert.ok(elements['currency-now'].textContent.startsWith('10 USD = 949.1 INR'));
  assert.ok(elements['currency-status'].textContent.startsWith('Cached · updated'));
});

test('attach with no cache prompts the user to pick currencies', () => {
  const { env, elements } = fakeEnv();
  ui.attachCurrencyUi(env);
  assert.equal(elements['currency-status'].textContent, 'Pick two currencies and tap Refresh.');
});

test('form submission prevents navigation and refreshes the selected conversion', async () => {
  const fetchImpl = okFetch([{ prefix: currencyApi.RATES_ENDPOINT, body: RATES_BODY }]);
  const { env, elements } = fakeEnv({ amount: '10', fetch: fetchImpl });
  ui.attachCurrencyUi(env);
  const submitEvent = {
    type: 'submit',
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }
  };
  elements['currency-form'].dispatchEvent(submitEvent);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(submitEvent.defaultPrevented, true);
  assert.equal(elements['currency-form'].navigationCount, 0);
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
  assert.equal(elements['currency-status'].textContent, 'Pick two currencies and tap Refresh.');
});

test('refresh fetches, renders, and persists the result', async () => {
  const fetchImpl = okFetch([{ prefix: currencyApi.RATES_ENDPOINT, body: RATES_BODY }]);
  const { env, elements, storageData } = fakeEnv({ amount: '5', fetch: fetchImpl });
  const handle = ui.attachCurrencyUi(env);
  await handle.onRefresh();
  assert.equal(fetchImpl.seen.length, 1);
  assert.ok(elements['currency-now'].textContent.startsWith('5 USD = 474.55 INR'));
  assert.ok(storageData[ui.STORAGE_KEY]);
});

test('an invalid amount is rejected before any network call', async () => {
  const fetchImpl = okFetch([{ prefix: currencyApi.RATES_ENDPOINT, body: RATES_BODY }]);
  const { env, elements } = fakeEnv({ amount: 'not-a-number', fetch: fetchImpl });
  const handle = ui.attachCurrencyUi(env);
  await handle.onRefresh();
  assert.equal(fetchImpl.seen.length, 0);
  assert.equal(elements['currency-status'].textContent, 'Enter a positive amount to convert.');
});

test('identical currencies are rejected before any network call', async () => {
  const fetchImpl = okFetch([{ prefix: currencyApi.RATES_ENDPOINT, body: RATES_BODY }]);
  const { env, elements } = fakeEnv({ amount: '10', from: 'USD', to: 'USD', fetch: fetchImpl });
  const handle = ui.attachCurrencyUi(env);
  await handle.onRefresh();
  assert.equal(fetchImpl.seen.length, 0);
  assert.equal(elements['currency-status'].textContent, 'Choose two different currencies.');
});

test('refresh failure keeps a matching cached rate visible', async () => {
  const fetchImpl = () => Promise.reject(new Error('offline'));
  fetchImpl.seen = [];
  const { env, elements } = fakeEnv({ stored: STORED, amount: '10', fetch: fetchImpl });
  const handle = ui.attachCurrencyUi(env);
  await handle.onRefresh();
  assert.ok(elements['currency-now'].textContent.startsWith('10 USD = 949.1 INR'));
  assert.ok(elements['currency-status'].textContent.includes('showing the cached rate'));
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

test('busy refresh locks inputs, marks form aria-busy, and shows Updating status', async () => {
  let resolveFetch;
  const fetchImpl = () => new Promise((resolve) => {
    resolveFetch = () => resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(RATES_BODY)
    });
  });
  fetchImpl.seen = [];
  const { env, elements } = fakeEnv({ amount: '10', fetch: fetchImpl });
  ui.attachCurrencyUi(env);
  const submitEvent = {
    type: 'submit',
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }
  };
  elements['currency-form'].dispatchEvent(submitEvent);
  assert.equal(submitEvent.defaultPrevented, true);
  await Promise.resolve();
  assert.equal(elements['currency-refresh'].disabled, true);
  assert.equal(elements['currency-refresh'].classList.contains('is-busy'), true);
  assert.equal(elements['currency-refresh'].getAttribute('aria-busy'), 'true');
  assert.equal(elements['currency-amount'].disabled, true);
  assert.equal(elements['currency-from'].disabled, true);
  assert.equal(elements['currency-to'].disabled, true);
  assert.equal(elements['currency-form'].getAttribute('aria-busy'), 'true');
  assert.equal(elements['currency-status'].textContent, 'Updating…');
  resolveFetch();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements['currency-refresh'].disabled, false);
  assert.equal(elements['currency-refresh'].classList.contains('is-busy'), false);
  assert.equal(elements['currency-amount'].disabled, false);
  assert.equal(elements['currency-form'].getAttribute('aria-busy'), 'false');
  assert.ok(elements['currency-now'].textContent.startsWith('10 USD = 949.1 INR'));
  assert.ok(elements['currency-status'].textContent.startsWith('Updated ·'));
});

test('the module exposes its API and stays inert under Node', () => {
  assert.equal(ui.STORAGE_KEY, 'daymark.currency.v1');
  assert.equal(ui.DEFAULT_FROM, 'USD');
  assert.equal(ui.DEFAULT_TO, 'INR');
  assert.equal(typeof globalThis.DaymarkCurrencyUi, 'object');
});
