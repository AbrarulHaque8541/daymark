'use strict';

const test = require('node:test');
const assert = require('node:assert');

let logic;
if (typeof window === 'undefined' && typeof globalThis.DaymarkCrypto === 'undefined') {
  try { logic = require('../crypto-logic.js'); } catch (error) { logic = null; }
}
if (!logic) logic = globalThis.DaymarkCrypto;

test('normalizeCoin trims, uppercases and pins the allowlist', () => {
  assert.strictEqual(logic.normalizeCoin('  btc  '), 'BTC');
  assert.strictEqual(logic.normalizeCoin('eth'), 'ETH');
  assert.deepStrictEqual(logic.normalizeCoin('sol'), 'SOL');
});

test('normalizeCoin rejects junk, control characters and unknown codes', () => {
  assert.strictEqual(logic.normalizeCoin(''), null);
  assert.strictEqual(logic.normalizeCoin('   '), null);
  assert.strictEqual(logic.normalizeCoin(null), null);
  assert.strictEqual(logic.normalizeCoin(42), null);
  assert.strictEqual(logic.normalizeCoin('BAD\u0007x'), null);
  assert.strictEqual(logic.normalizeCoin('xyz'), null);
  assert.strictEqual(logic.normalizeCoin('BT C'), null);
});

test('normalizeFiat pins the fiat allowlist', () => {
  assert.strictEqual(logic.normalizeFiat(' inr '), 'INR');
  assert.strictEqual(logic.normalizeFiat('usd'), 'USD');
  assert.strictEqual(logic.normalizeFiat('nope'), null);
  assert.strictEqual(logic.normalizeFiat(''), null);
  assert.strictEqual(logic.normalizeFiat(null), null);
});

test('the coin and fiat catalogs are non-empty uppercase lists', () => {
  assert.ok(Array.isArray(logic.COINS) && logic.COINS.length >= 5);
  assert.ok(Array.isArray(logic.FIATS) && logic.FIATS.length >= 5);
  logic.COINS.forEach((coin) => assert.strictEqual(coin, coin.toUpperCase()));
  logic.FIATS.forEach((fiat) => assert.strictEqual(fiat, fiat.toUpperCase()));
});

test('buildRatesUrl targets the public HTTPS endpoint with the coin', () => {
  const url = logic.buildRatesUrl('btc');
  assert.ok(url.indexOf('https://api.coinbase.com/') === 0);
  assert.strictEqual(url, logic.COINBASE_ENDPOINT + '?currency=BTC');
});

test('buildRatesUrl throws on an unsupported coin', () => {
  assert.throws(() => logic.buildRatesUrl('   '), /supported cryptocurrency/);
  assert.throws(() => logic.buildRatesUrl(null), /supported cryptocurrency/);
  assert.throws(() => logic.buildRatesUrl('ZZZ'), /supported cryptocurrency/);
});

test('formatPrice groups thousands at one unit or above', () => {
  assert.strictEqual(logic.formatPrice(73412.051, 'USD'), '73,412.05 USD');
  assert.strictEqual(logic.formatPrice(1, 'EUR'), '1.00 EUR');
  assert.strictEqual(logic.formatPrice(7341205.51, 'INR'), '7,341,205.51 INR');
});

test('formatPrice trims sub-unit prices to significant decimals', () => {
  assert.strictEqual(logic.formatPrice(0.21, 'USD'), '0.21 USD');
  assert.strictEqual(logic.formatPrice(0.00001234, 'USD'), '0.00001234 USD');
});

test('formatPrice returns null for unusable numbers', () => {
  assert.strictEqual(logic.formatPrice(0, 'USD'), null);
  assert.strictEqual(logic.formatPrice(-2, 'USD'), null);
  assert.strictEqual(logic.formatPrice('x', 'USD'), null);
  assert.strictEqual(logic.formatPrice(NaN, 'USD'), null);
});

test('parseRates maps a full exchange-rate payload', () => {
  const parsed = logic.parseRates({ data: { currency: 'BTC', rates: { INR: '7341205.51' } } }, 'BTC', 'INR');
  assert.strictEqual(parsed.coin, 'BTC');
  assert.strictEqual(parsed.fiat, 'INR');
  assert.strictEqual(parsed.rate, 7341205.51);
  assert.strictEqual(parsed.priceText, '7,341,205.51 INR');
});

test('parseRates throws fail-closed on malformed or mismatched payloads', () => {
  assert.throws(() => logic.parseRates(null, 'BTC', 'USD'), /malformed/);
  assert.throws(() => logic.parseRates({}, 'BTC', 'USD'), /malformed/);
  assert.throws(() => logic.parseRates({ data: {} }, 'BTC', 'USD'), /malformed|wrong currency/);
  assert.throws(() => logic.parseRates({ data: { currency: 'ETH', rates: { USD: '1' } } }, 'BTC', 'USD'), /wrong currency/);
  assert.throws(() => logic.parseRates({ data: { currency: 'BTC', rates: {} } }, 'BTC', 'USD'), /No readable rate/);
  assert.throws(() => logic.parseRates({ data: { currency: 'BTC', rates: { USD: 'abc' } } }, 'BTC', 'USD'), /No readable rate/);
  assert.throws(() => logic.parseRates({ data: { currency: 'BTC', rates: { USD: '0' } } }, 'BTC', 'USD'), /No readable rate/);
});

test('classifyCryptoError explains limits, rejections, outages and timeouts', () => {
  assert.ok(logic.classifyCryptoError(new Error('HTTP 429')).includes('limited'));
  assert.ok(logic.classifyCryptoError(new Error('HTTP 403')).includes('limited'));
  assert.ok(logic.classifyCryptoError(new Error('HTTP 400')).includes('rejected'));
  assert.ok(logic.classifyCryptoError(new Error('HTTP 502')).includes('server problem'));
  assert.ok(logic.classifyCryptoError(new Error('The rate request timed out.')).includes('timed out'));
  assert.strictEqual(logic.classifyCryptoError(new Error('something odd')), null);
});

test('fetchRates returns a stateless record from the public API', async () => {
  let requested = null;
  const payload = { data: { currency: 'BTC', rates: { INR: '7341205.51' } } };
  const fetchImpl = async (url) => {
    requested = url;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader() {
          let sent = false;
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: new TextEncoder().encode(JSON.stringify(payload)) };
            },
            cancel: async () => {},
            releaseLock: () => {}
          };
        }
      }
    };
  };
  const record = await logic.fetchRates(' btc ', ' inr ', fetchImpl, {
    now: () => '2026-11-16T12:00:00.000Z'
  });
  assert.strictEqual(requested, logic.COINBASE_ENDPOINT + '?currency=BTC');
  assert.strictEqual(record.coin, 'BTC');
  assert.strictEqual(record.fiat, 'INR');
  assert.strictEqual(record.rate, 7341205.51);
  assert.strictEqual(record.priceText, '7,341,205.51 INR');
  assert.strictEqual(record.fetchedAt, '2026-11-16T12:00:00.000Z');
});

test('fetchRates rejects an unsupported coin before any network call', async () => {
  let called = false;
  await assert.rejects(
    () => logic.fetchRates('ZZZ', 'USD', async () => { called = true; }),
    /supported cryptocurrency/
  );
  assert.strictEqual(called, false);
});

test('fetchRates rejects an unsupported fiat before any network call', async () => {
  let called = false;
  await assert.rejects(
    () => logic.fetchRates('BTC', 'NOPE', async () => { called = true; }),
    /supported currency/
  );
  assert.strictEqual(called, false);
});

test('fetchRates surfaces HTTP errors from the service', async () => {
  const limited = async () => ({ ok: false, status: 429, headers: { get: () => null }, body: null });
  await assert.rejects(() => logic.fetchRates('BTC', 'USD', limited), /HTTP 429/);
});

test('the endpoint is HTTPS-only by construction', () => {
  assert.ok(logic.COINBASE_ENDPOINT.indexOf('https://') === 0);
  assert.ok(logic.COINBASE_ENDPOINT.indexOf('http://') !== 0);
});
