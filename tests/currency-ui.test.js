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
  assert.equal(saved.from, 'USD');
  assert.equal(saved.to, 'INR');
  assert.equal(saved.rate, 94.91);
});

test('swap button exchanges from and to and updates status', () => {
  const { env, elements } = fakeEnv({ from: 'USD', to: 'INR' });
  ui.attachCurrencyUi(env);
  const swap = elements['currency-swap'].listeners.find((listener) => listener.type === 'click');
  assert.ok(swap, 'swap button should handle click');
  swap.handler({ preventDefault() {} });
  assert.equal(elements['currency-from'].value, 'INR');
  assert.equal(elements['currency-to'].value, 'USD');
  assert.ok(elements['currency-status'].textContent.includes('swapped'));
});
