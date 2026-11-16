(function (root) {
  'use strict';

  // Keyless crypto price glance for the Daymark web prototype, powered by
  // the public Coinbase exchange-rates API (no API key, no account, no
  // maintainer backend). Mirrors releases-logic.js: pure functions, no DOM,
  // no storage. The request is HTTPS-only, timeout-guarded and read through
  // the shared bounded response reader. Nothing is saved on this device.

  const responseBodyApi = root.DaymarkResponseBody
    || (typeof require === 'function' ? require('./response-body-logic.js') : null);

  const COINBASE_ENDPOINT = 'https://api.coinbase.com/v2/exchange-rates';
  const DEFAULT_TIMEOUT_MS = 10000;
  const MAX_JSON_BYTES = 256 * 1024;
  const MAX_JSON_CHARS = MAX_JSON_BYTES;
  const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'LTC', 'BCH', 'DOT', 'LINK'];
  const FIATS = ['USD', 'INR', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'SGD'];

  function hasControlCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 32 || code === 127) return true;
    }
    return false;
  }

  function normalizeCoin(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().toUpperCase();
    if (!trimmed || trimmed.length > 10 || hasControlCharacter(trimmed)) return null;
    return COINS.indexOf(trimmed) !== -1 ? trimmed : null;
  }

  function normalizeFiat(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().toUpperCase();
    if (!trimmed || trimmed.length > 10 || hasControlCharacter(trimmed)) return null;
    return FIATS.indexOf(trimmed) !== -1 ? trimmed : null;
  }

  function buildRatesUrl(coin) {
    const parsed = normalizeCoin(coin);
    if (!parsed) throw new Error('Pick a supported cryptocurrency from the list.');
    return COINBASE_ENDPOINT + '?currency=' + parsed;
  }

  // Deterministic plain-text price: grouped 2-decimal text at 1 unit or
  // above, up to 8 decimals (trailing zeros trimmed) below 1.
  function formatPrice(value, fiat) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
    let text;
    if (value >= 1) {
      text = value.toFixed(2);
      const parts = text.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      text = parts.join('.');
    } else {
      text = value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
      if (!text) text = '0';
    }
    return text + ' ' + fiat;
  }

  function parseRates(payload, coin, fiat) {
    if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
      throw new Error('The exchange-rate response is malformed.');
    }
    const data = payload.data;
    if (data.currency !== coin) {
      throw new Error('The exchange-rate response is for the wrong currency.');
    }
    const rates = data.rates;
    if (!rates || typeof rates !== 'object' || typeof rates[fiat] !== 'string') {
      throw new Error('No readable rate for ' + fiat + ' in the response.');
    }
    const raw = rates[fiat].trim();
    if (!/^\d+(\.\d+)?$/.test(raw)) {
      throw new Error('No readable rate for ' + fiat + ' in the response.');
    }
    const rate = Number(raw);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error('No readable rate for ' + fiat + ' in the response.');
    }
    return { coin: coin, fiat: fiat, rate: rate, priceText: formatPrice(rate, fiat) };
  }

  // Plain words for the failures a keyless public API call can hit. The
  // free Coinbase interface is rate limited, so 429 must be explained.
  function classifyCryptoError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 429') !== -1 || message.indexOf('HTTP 403') !== -1) {
      return 'The public rate service limited this request. Wait a moment and try again.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'The rate service rejected the request (' + message + '). Check the selected currencies.';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'The rate service had a server problem (' + message + '). Try again in a moment.';
    }
    if (message.indexOf('timed out') !== -1) {
      return 'The request timed out. Check your connection and try again.';
    }
    return null;
  }

  function timersUsable() {
    try {
      const id = root.setTimeout(() => {}, 1);
      if (typeof root.clearTimeout === 'function') root.clearTimeout(id);
      return true;
    } catch (error) {
      return false;
    }
  }

  async function fetchJson(url, fetchImpl, timeoutMs) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
    const usableTimers = timersUsable();
    let timedOut = false;
    let activeReader = null;
    const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    let timer = null;
    let timeout = null;
    if (usableTimers && typeof root.clearTimeout === 'function') {
      timeout = new Promise((resolve, reject) => {
        timer = root.setTimeout(() => {
          timedOut = true;
          if (controller) controller.abort();
          if (activeReader && typeof activeReader.cancel === 'function') {
            try {
              const cancellation = activeReader.cancel();
              if (cancellation && typeof cancellation.catch === 'function') cancellation.catch(() => {});
            } catch (error) { /* cancellation is best-effort */ }
          }
          reject(new Error('The rate request timed out.'));
        }, duration);
      });
    }
    const request = (async () => {
      const response = await fetchImpl(url, {
        signal: controller ? controller.signal : undefined,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        headers: { 'Accept': 'application/json' }
      });
      if (!response || !response.ok) throw new Error('HTTP ' + (response ? response.status : 'unknown'));
      if (!responseBodyApi || typeof responseBodyApi.readBoundedText !== 'function') {
        throw new Error('The bounded response reader is unavailable.');
      }
      const text = await responseBodyApi.readBoundedText(response, {
        maxBytes: MAX_JSON_BYTES,
        maxChars: MAX_JSON_CHARS,
        tooLargeMessage: 'The rate response was too large to read safely.',
        malformedMessage: 'The rate response was malformed.',
        streamRequiredMessage: 'This browser cannot read rate responses with the required size limit.',
        timeoutMessage: 'The rate request timed out.',
        controller: controller,
        isTimedOut: () => timedOut,
        onReader: (reader) => { activeReader = reader; }
      });
      if (timedOut) throw new Error('The rate request timed out.');
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error('The rate response was malformed.');
      }
    })();
    try {
      return timeout ? await Promise.race([request, timeout]) : await request;
    } finally {
      if (timer !== null && typeof root.clearTimeout === 'function') root.clearTimeout(timer);
    }
  }

  async function fetchRates(coin, fiat, fetchImpl, options) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const opts = options || {};
    const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const parsedCoin = normalizeCoin(coin);
    const parsedFiat = normalizeFiat(fiat);
    if (!parsedCoin) throw new Error('Pick a supported cryptocurrency from the list.');
    if (!parsedFiat) throw new Error('Pick a supported currency from the list.');
    const payload = await fetchJson(buildRatesUrl(parsedCoin), fetchImpl, timeoutMs);
    const parsed = parseRates(payload, parsedCoin, parsedFiat);
    return {
      version: 1,
      coin: parsed.coin,
      fiat: parsed.fiat,
      rate: parsed.rate,
      priceText: parsed.priceText,
      fetchedAt: now()
    };
  }

  const api = {
    normalizeCoin,
    normalizeFiat,
    buildRatesUrl,
    formatPrice,
    parseRates,
    classifyCryptoError,
    fetchJson,
    fetchRates,
    COINS,
    FIATS,
    MAX_JSON_BYTES,
    MAX_JSON_CHARS,
    DEFAULT_TIMEOUT_MS,
    COINBASE_ENDPOINT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkCrypto = api;
})(globalThis);
