'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const currency = require('../currency-logic.js');

const RATES_BODY = JSON.stringify({
  amount: 1.0,
  base: 'USD',
  date: '2026-11-02',
  rates: { INR: 94.91 }
});

function jsonResponse(body) {
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

function routeFetch(routes) {
  const seen = [];
  const impl = (url) => {
    seen.push(url);
    const route = routes.find((r) => url.startsWith(r.prefix));
    if (!route) return Promise.reject(new Error('unexpected url: ' + url));
    if (typeof route.body === 'function') return Promise.resolve(route.body(url));
    return Promise.resolve(jsonResponse(route.body));
  };
  impl.seen = seen;
  return impl;
}

test('currency codes are normalized and bounded', () => {
  assert.equal(currency.normalizeCurrencyCode('  usd '), 'USD');
  assert.equal(currency.normalizeCurrencyCode('inr'), 'INR');
  assert.equal(currency.normalizeCurrencyCode('us'), null);
  assert.equal(currency.normalizeCurrencyCode('USDD'), null);
  assert.equal(currency.normalizeCurrencyCode('123'), null);
  assert.equal(currency.normalizeCurrencyCode(42), null);
  assert.equal(currency.normalizeCurrencyCode('   '), null);
});

test('amounts are parsed tolerantly and bounded', () => {
  assert.equal(currency.normalizeAmount('1'), 1);
  assert.equal(currency.normalizeAmount('  2,500.50 '), 2500.5);
  assert.equal(currency.normalizeAmount(7.25), 7.25);
  assert.equal(currency.normalizeAmount('0'), null);
  assert.equal(currency.normalizeAmount('-5'), null);
  assert.equal(currency.normalizeAmount('abc'), null);
  assert.equal(currency.normalizeAmount(''), null);
  assert.equal(currency.normalizeAmount('1e12'), null);
  assert.equal(currency.normalizeAmount(null), null);
});

test('the endpoint is an https-only Frankfurter URL', () => {
  assert.equal(currency.RATES_ENDPOINT, 'https://api.frankfurter.dev/v1/latest');
  const url = currency.buildRatesUrl('usd', 'inr');
  assert.equal(url, 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR');
  assert.throws(() => currency.buildRatesUrl('us', 'INR'), /valid "from" currency/);
  assert.throws(() => currency.buildRatesUrl('USD', 'in'), /valid "to" currency/);
  assert.throws(() => currency.buildRatesUrl('USD', 'USD'), /two different currencies/);
});

test('rate payloads are parsed into a normalized entry', () => {
  const parsed = currency.parseRates(JSON.parse(RATES_BODY), 'INR');
  assert.equal(parsed.rate, 94.91);
  assert.equal(parsed.asOfDate, '2026-11-02');
  assert.throws(() => currency.parseRates(null, 'INR'), /malformed/);
  assert.throws(() => currency.parseRates({}, 'INR'), /no rates/);
  assert.throws(() => currency.parseRates({ rates: {} }, 'INR'), /no usable INR rate/);
  assert.throws(() => currency.parseRates({ rates: { INR: 'x' } }, 'INR'), /no usable INR rate/);
  assert.throws(() => currency.parseRates({ rates: { INR: 94.91 } }, 'INR'), /invalid reference date/);
  assert.throws(() => currency.parseRates({ rates: { INR: 94.91 }, date: 'yesterday' }, 'INR'), /invalid reference date/);
});

test('conversion and formatting are pure and stable', () => {
  assert.equal(currency.convertAmount(100, 94.91), 9491);
  assert.equal(currency.convertAmount(1, 0.75), 0.75);
  assert.throws(() => currency.convertAmount(0, 94.91), /positive amount/);
  assert.throws(() => currency.convertAmount(5, 0), /exchange rate/);
  assert.equal(currency.formatAmount(9491.000000), '9491');
  assert.equal(currency.formatAmount(94.91), '94.91');
  assert.equal(currency.formatAmount(0.75), '0.75');
  assert.equal(currency.formatAmount(0.000125), '0.000125');
  assert.throws(() => currency.formatAmount(Number.NaN), /non-finite/);
});

test('validateCurrencyCache guards the cache shape', () => {
  const cache = {
    version: 1,
    from: 'USD',
    to: 'INR',
    rate: 94.91,
    asOfDate: '2026-11-02',
    fetchedAt: '2026-11-03T12:00:00.000Z'
  };
  assert.ok(currency.validateCurrencyCache(cache));
  assert.ok(!currency.validateCurrencyCache({ ...cache, version: 2 }));
  assert.ok(!currency.validateCurrencyCache({ ...cache, from: 'us' }));
  assert.ok(!currency.validateCurrencyCache({ ...cache, from: 'INR', to: 'INR' }));
  assert.ok(!currency.validateCurrencyCache({ ...cache, rate: 0 }));
  assert.ok(!currency.validateCurrencyCache({ ...cache, rate: 'x' }));
  assert.ok(!currency.validateCurrencyCache({ ...cache, asOfDate: 'nope' }));
  assert.ok(!currency.validateCurrencyCache({ ...cache, fetchedAt: 'nope' }));
  assert.ok(!currency.validateCurrencyCache(null));
});

test('fetchLatestRates returns a valid cache entry', async () => {
  const fetchImpl = routeFetch([{ prefix: currency.RATES_ENDPOINT, body: RATES_BODY }]);
  const result = await currency.fetchLatestRates('usd', 'inr', fetchImpl, {
    now: () => '2026-11-03T12:00:00.000Z'
  });
  assert.equal(fetchImpl.seen.length, 1);
  assert.equal(fetchImpl.seen[0], 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR');
  assert.equal(result.version, 1);
  assert.equal(result.from, 'USD');
  assert.equal(result.to, 'INR');
  assert.equal(result.rate, 94.91);
  assert.equal(result.asOfDate, '2026-11-02');
  assert.equal(result.fetchedAt, '2026-11-03T12:00:00.000Z');
  assert.ok(currency.validateCurrencyCache(result));
});

test('fetchLatestRates reports friendly errors', async () => {
  await assert.rejects(
    currency.fetchLatestRates('USD', 'INR', routeFetch([
      { prefix: currency.RATES_ENDPOINT, body: 'not json' }
    ])),
    /malformed/
  );
  await assert.rejects(
    currency.fetchLatestRates('USD', 'INR', routeFetch([
      { prefix: currency.RATES_ENDPOINT, body: () => ({ ok: false, status: 503, text: () => Promise.resolve('') }) }
    ])),
    /HTTP 503/
  );
  await assert.rejects(
    currency.fetchLatestRates('USD', 'USD', () => Promise.resolve()),
    /two different currencies/
  );
  await assert.rejects(
    currency.fetchLatestRates('USD', 'INR', null),
    /fetch unavailable/
  );
});

test('oversized responses are rejected before parsing', async () => {
  const huge = 'x'.repeat(currency.MAX_JSON_CHARS + 1);
  await assert.rejects(
    currency.fetchLatestRates('USD', 'INR', routeFetch([
      { prefix: currency.RATES_ENDPOINT, body: () => ({ ok: true, status: 200, text: () => Promise.resolve(huge) }) }
    ])),
    /too large/
  );
});

test('a hanging request times out', async () => {
  const hanging = () => new Promise(() => {});
  await assert.rejects(
    currency.fetchLatestRates('USD', 'INR', hanging, { timeoutMs: 10 }),
    /timed out/
  );
});

