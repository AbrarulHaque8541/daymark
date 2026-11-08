((root) => {
  'use strict';

  const responseBodyApi = root.DaymarkResponseBody
    || (typeof require === 'function' ? require('./response-body-logic.js') : null);

  // Keyless currency glance for the Daymark web prototype, powered by the free
  // Frankfurter API (open-source, European Central Bank reference rates — no
  // API key, no account, no maintainer backend). Mirrors the weather-logic.js
  // module style: pure functions, no DOM, no storage, so it can be unit-tested
  // directly and loaded in the browser as window.DaymarkCurrency.

  const CODE_PATTERN = /^[A-Z]{3}$/;
  const MAX_AMOUNT = 1000000000; // one billion
  const MIN_RATE = 0.00000001;
  const MAX_RATE = 10000000; // ten million
  const MAX_JSON_BYTES = 256 * 1024;
  const MAX_JSON_CHARS = MAX_JSON_BYTES;
  const DEFAULT_TIMEOUT_MS = 10000;

  const RATES_ENDPOINT = 'https://api.frankfurter.dev/v1/latest';

  function normalizeCurrencyCode(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().toUpperCase();
    if (!CODE_PATTERN.test(trimmed)) return null;
    return trimmed;
  }

  function normalizeAmount(value) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) return null;
      return value;
    }
    if (typeof value !== 'string') return null;
    const cleaned = value.trim().replace(/,/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_AMOUNT) return null;
    return parsed;
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function buildRatesUrl(fromCode, toCode) {
    const from = normalizeCurrencyCode(fromCode);
    const to = normalizeCurrencyCode(toCode);
    if (!from) throw new Error('Choose a valid "from" currency code (e.g. USD).');
    if (!to) throw new Error('Choose a valid "to" currency code (e.g. INR).');
    if (from === to) throw new Error('Choose two different currencies.');
    return `${RATES_ENDPOINT}?base=${from}&symbols=${to}`;
  }

  function parseRates(payload, toCode) {
    const to = normalizeCurrencyCode(toCode);
    if (!to) throw new Error('Choose a valid "to" currency code (e.g. INR).');
    if (!payload || typeof payload !== 'object') throw new Error('The rates response is malformed.');
    const rates = payload.rates;
    if (!rates || typeof rates !== 'object') throw new Error('The rates response has no rates.');
    const rate = rates[to];
    if (!isFiniteNumber(rate) || rate < MIN_RATE || rate > MAX_RATE) {
      throw new Error(`The rates response has no usable ${to} rate.`);
    }
    const date = payload.date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('The rates response has an invalid reference date.');
    }
    return { rate, asOfDate: date };
  }

  function convertAmount(amount, rate) {
    if (!isFiniteNumber(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      throw new Error('Enter a positive amount to convert.');
    }
    if (!isFiniteNumber(rate) || rate < MIN_RATE || rate > MAX_RATE) {
      throw new Error('The exchange rate is unusable.');
    }
    const product = amount * rate;
    if (!Number.isFinite(product) || product <= 0) throw new Error('The conversion overflowed.');
    return product;
  }

  function formatAmount(value) {
    if (!isFiniteNumber(value)) throw new Error('Cannot format a non-finite amount.');
    const abs = Math.abs(value);
    let digits;
    if (abs >= 1000) digits = 2;
    else if (abs >= 1) digits = 4;
    else digits = 6;
    let text = value.toFixed(digits);
    if (text.includes('.')) text = text.replace(/\.?0+$/, '');
    if (text === '' || text === '-') text = '0';
    return text;
  }

  function isValidCacheEntry(value) {
    return Boolean(value && typeof value === 'object'
      && value.version === 1
      && typeof value.from === 'string' && CODE_PATTERN.test(value.from)
      && typeof value.to === 'string' && CODE_PATTERN.test(value.to)
      && value.from !== value.to
      && isFiniteNumber(value.rate)
      && value.rate >= MIN_RATE && value.rate <= MAX_RATE
      && typeof value.asOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.asOfDate)
      && typeof value.fetchedAt === 'string' && !Number.isNaN(Date.parse(value.fetchedAt)));
  }

  function validateCurrencyCache(value) {
    return isValidCacheEntry(value);
  }

  async function fetchJson(url, fetchImpl, timeoutMs) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
    let timedOut = false;
    let activeReader = null;
    const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    let timer = null;
    const timeout = new Promise((resolve, reject) => {
      timer = root.setTimeout(() => {
        timedOut = true;
        if (controller) controller.abort();
        if (activeReader && typeof activeReader.cancel === 'function') {
          try {
            const cancellation = activeReader.cancel();
            if (cancellation && typeof cancellation.catch === 'function') cancellation.catch(() => {});
          } catch (error) { /* cancellation is best-effort */ }
        }
        reject(new Error('Currency request timed out.'));
      }, duration);
    });
    const request = (async () => {
      const response = await fetchImpl(url, {
        signal: controller ? controller.signal : undefined,
        cache: 'no-store',
        redirect: 'follow'
      });
      if (!response || !response.ok) throw new Error(`HTTP ${response ? response.status : 'unknown'}`);
      if (!responseBodyApi || typeof responseBodyApi.readBoundedText !== 'function') {
        throw new Error('The bounded response reader is unavailable.');
      }
      const text = await responseBodyApi.readBoundedText(response, {
        maxBytes: MAX_JSON_BYTES,
        maxChars: MAX_JSON_CHARS,
        tooLargeMessage: 'The rates response was too large to parse safely.',
        malformedMessage: 'The rates response was malformed.',
        streamRequiredMessage: 'This browser cannot read rates responses with the required size limit.',
        timeoutMessage: 'Currency request timed out.',
        controller,
        isTimedOut: () => timedOut,
        onReader: (reader) => { activeReader = reader; }
      });
      if (timedOut) throw new Error('Currency request timed out.');
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error('The rates response was malformed.');
      }
    })();
    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timer !== null) root.clearTimeout(timer);
    }
  }

  async function fetchLatestRates(fromCode, toCode, fetchImpl, options) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const opts = options || {};
    const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const url = buildRatesUrl(fromCode, toCode);
    const payload = await fetchJson(url, fetchImpl, timeoutMs);
    const parsed = parseRates(payload, toCode);
    const from = normalizeCurrencyCode(fromCode);
    const to = normalizeCurrencyCode(toCode);
    return { version: 1, from, to, rate: parsed.rate, asOfDate: parsed.asOfDate, fetchedAt: now() };
  }

  const api = {
    normalizeCurrencyCode,
    normalizeAmount,
    buildRatesUrl,
    parseRates,
    convertAmount,
    formatAmount,
    isValidCacheEntry,
    validateCurrencyCache,
    fetchJson,
    fetchLatestRates,
    MAX_AMOUNT,
    MIN_RATE,
    MAX_RATE,
    MAX_JSON_CHARS,
    MAX_JSON_BYTES,
    DEFAULT_TIMEOUT_MS,
    RATES_ENDPOINT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkCurrency = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
