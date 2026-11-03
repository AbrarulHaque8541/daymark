/*
 * Daymark currency glance UI wiring for the web prototype.
 *
 * A small offline-first card: the user picks an amount and two currencies and
 * taps Refresh; the reference rate comes from the keyless Frankfurter API
 * (European Central Bank data) and the last successful result stays cached on
 * this device, so the card keeps working offline with a "cached" note. Nothing
 * ever refreshes on its own — no polling, no timers, no battery drain.
 * Mirrors the weather-ui.js module style: attachCurrencyUi(env) is fully
 * injectable for unit tests.
 */
((root) => {
  'use strict';

  const STORAGE_KEY = 'daymark.currency.v1';
  const DEFAULT_FROM = 'USD';
  const DEFAULT_TO = 'INR';
  const DEFAULT_AMOUNT = '1';

  function attachCurrencyUi(env) {
    if (!env || !env.document) throw new Error('attachCurrencyUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const storage = env.localStorage || (win && win.localStorage) || null;
    const currencyApi = env.currencyApi || root.DaymarkCurrency || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const amountEl = element('currency-amount');
    const fromEl = element('currency-from');
    const toEl = element('currency-to');
    const buttonEl = element('currency-refresh');
    const swapEl = element('currency-swap');
    const statusEl = element('currency-status');
    const nowEl = element('currency-now');

    let busy = false;
    let cached = null;

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function readInputs() {
      const amountText = amountEl && typeof amountEl.value === 'string' && amountEl.value.trim()
        ? amountEl.value
        : DEFAULT_AMOUNT;
      const from = currencyApi ? currencyApi.normalizeCurrencyCode(
        fromEl && typeof fromEl.value === 'string' ? fromEl.value : '') : null;
      const to = currencyApi ? currencyApi.normalizeCurrencyCode(
        toEl && typeof toEl.value === 'string' ? toEl.value : '') : null;
      return { amountText, from, to };
    }

    function render(cache, amount) {
      if (!nowEl || !cache) return;
      if (!currencyApi) return;
      const converted = currencyApi.convertAmount(amount, cache.rate);
      const formatted = currencyApi.formatAmount(converted, cache.to);
      const rateText = currencyApi.formatRate(cache.rate, cache.from, cache.to);
      nowEl.innerHTML = `<div class="currency-result"><strong>${formatted}</strong><span class="currency-rate">${rateText}</span><span class="currency-asof">as of ${cache.asOfDate}</span></div>`;
    }

    function persistCache(cache) {
      if (!storage || typeof storage.setItem !== 'function') return;
      try { storage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch (e) { /* quota */ }
    }

    function readCache() {
      if (!storage || typeof storage.getItem !== 'function') return null;
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== 1 || !parsed.from || !parsed.to || typeof parsed.rate !== 'number') return null;
        return parsed;
      } catch (e) { return null; }
    }

    async function onRefresh() {
      if (busy) return;
      const { amountText, from, to } = readInputs();
      const amount = currencyApi ? currencyApi.normalizeAmount(amountText) : null;
      if (amount === null) {
        status('Enter a positive amount to convert.');
        return;
      }
      if (!from || !to) {
        status('Choose a valid "from" and "to" currency code.');
        return;
      }
      if (from === to) {
        status('Choose two different currencies.');
        return;
      }
      busy = true;
      if (buttonEl) buttonEl.disabled = true;
      try {
        const result = await currencyApi.fetchLatestRates(from, to, fetchImpl, { now });
        cached = result;
        persistCache(cached);
        render(cached, amount);
        status(`Updated · ${cached.fetchedAt.slice(0, 16).replace('T', ' ')} UTC`);
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        if (cached && cached.from === from && cached.to === to) {
          render(cached, amount);
          status(`Could not refresh: ${message} — showing the cached rate.`);
        } else {
          status(`Could not refresh: ${message}`);
        }
      } finally {
        busy = false;
        if (buttonEl) buttonEl.disabled = false;
      }
    }

    cached = readCache();
    if (cached) {
      render(cached, currencyApi ? currencyApi.normalizeAmount(
        amountEl && typeof amountEl.value === 'string' && amountEl.value.trim() ? amountEl.value : DEFAULT_AMOUNT
      ) || 1 : 1);
      status(`Cached · updated ${cached.fetchedAt.slice(0, 16).replace('T', ' ')} UTC`);
    } else {
      status('Pick two currencies and tap Refresh.');
    }

    if (buttonEl && typeof buttonEl.addEventListener === 'function') {
      buttonEl.addEventListener('click', () => { onRefresh(); });
    }
    if (swapEl && typeof swapEl.addEventListener === 'function') {
      swapEl.addEventListener('click', () => {
        if (busy) return;
        const fromVal = fromEl ? fromEl.value : '';
        const toVal = toEl ? toEl.value : '';
        if (fromEl) fromEl.value = toVal;
        if (toEl) toEl.value = fromVal;
        status('Currencies swapped. Tap Refresh to update.');
      });
    }

    return {
      onRefresh,
      readCache,
      detach() {
        // No document-level listener is registered; the button reference is
        // dropped when the returned handle goes out of scope.
        busy = false;
      }
    };
  }

  const api = { attachCurrencyUi, STORAGE_KEY, DEFAULT_FROM, DEFAULT_TO, DEFAULT_AMOUNT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkCurrencyUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachCurrencyUi({ document, window, localStorage: window.localStorage });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
