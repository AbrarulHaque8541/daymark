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
    const copyEl = element('currency-copy');
    const formEl = element('currency-form');
    const statusEl = element('currency-status');
    const nowEl = element('currency-now');

    let busy = false;
    let cached = null;

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function setBusy(isBusy) {
      busy = isBusy;
      if (buttonEl) {
        buttonEl.disabled = isBusy;
        if (buttonEl.classList && typeof buttonEl.classList.toggle === 'function') {
          buttonEl.classList.toggle('is-busy', isBusy);
        }
        if (typeof buttonEl.setAttribute === 'function') {
          if (isBusy) buttonEl.setAttribute('aria-busy', 'true');
          else buttonEl.removeAttribute('aria-busy');
        }
      }
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
      const amountText = currencyApi.formatAmount(amount);
      const convertedText = currencyApi.formatAmount(converted);
      const rateText = currencyApi.formatAmount(cache.rate);
      nowEl.textContent = `${amountText} ${cache.from} = ${convertedText} ${cache.to}`
        + ` · 1 ${cache.from} = ${rateText} ${cache.to}`
        + ` · ECB reference rates, as of ${cache.asOfDate}`;
      if (copyEl) {
        copyEl.disabled = false;
        copyEl.dataset.converted = String(converted);
        copyEl.dataset.currency = cache.to;
      }
    }

    function readCache() {
      if (!storage || typeof storage.getItem !== 'function') return null;
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (currencyApi && typeof currencyApi.validateCurrencyCache === 'function'
          && currencyApi.validateCurrencyCache(parsed)) return parsed;
      } catch (error) { /* a corrupt cache is treated as no cache */ }
      return null;
    }

    function persistCache(cache) {
      if (!storage || typeof storage.setItem !== 'function') return;
      storage.setItem(STORAGE_KEY, JSON.stringify(cache));
    }

    async function onRefresh() {
      if (busy) return;
      if (!currencyApi || typeof currencyApi.fetchLatestRates !== 'function') {
        status('Currency conversion is unavailable.');
        return;
      }
      if (!fetchImpl) {
        status('Could not refresh: fetch is unavailable in this browser.');
        return;
      }
      const { amountText, from, to } = readInputs();
      const amount = currencyApi.normalizeAmount(amountText);
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
      setBusy(true);
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
        setBusy(false);
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
      if (copyEl) copyEl.disabled = true;
    }

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        return onRefresh();
      });
    }

    // Enter in any of the currency fields starts the same refresh (keyboard efficiency).
    const enterRefresh = (event) => {
      if (event && (event.key === 'Enter' || event.keyCode === 13)) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        onRefresh();
      }
    };
    [amountEl, fromEl, toEl].forEach((el) => {
      if (el && typeof el.addEventListener === 'function') {
        el.addEventListener('keydown', enterRefresh);
      }
    });

    if (swapEl && typeof swapEl.addEventListener === 'function') {
      swapEl.addEventListener('click', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (!fromEl || !toEl || typeof fromEl.value !== 'string' || typeof toEl.value !== 'string') return;
        const tmp = fromEl.value;
        fromEl.value = toEl.value;
        toEl.value = tmp;
        if (cached && currencyApi) {
          const amount = currencyApi.normalizeAmount(
            amountEl && typeof amountEl.value === 'string' && amountEl.value.trim() ? amountEl.value : DEFAULT_AMOUNT
          ) || 1;
          if (cached.from === fromEl.value && cached.to === toEl.value) {
            render(cached, amount);
            status(`Cached · updated ${cached.fetchedAt.slice(0, 16).replace('T', ' ')} UTC`);
          } else {
            if (nowEl) nowEl.textContent = '';
            if (copyEl) copyEl.disabled = true;
            status('Currencies swapped. Tap Refresh for the new rate.');
          }
        } else {
          status('Currencies swapped. Tap Refresh for the rate.');
        }
      });
    }

    if (copyEl && typeof copyEl.addEventListener === 'function') {
      copyEl.addEventListener('click', async (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (copyEl.disabled) return;
        const converted = copyEl.dataset.converted;
        const currency = copyEl.dataset.currency || '';
        if (!converted) return;
        const text = `${converted} ${currency}`.trim();
        let copied = false;
        try {
          if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
            copied = true;
          } else if (document && document.execCommand) {
            // Fallback for older environments
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'absolute';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            copied = document.execCommand('copy');
            document.body.removeChild(ta);
          }
        } catch (e) { /* clipboard blocked */ }
        status(copied ? `Copied ${text}` : 'Could not copy — select and copy the amount manually.');
      });
    }

    return {
      onRefresh,
      readCache,
      detach() {
        // No document-level listener is registered; the button reference is
        // dropped when the returned handle goes out of scope.
        setBusy(false);
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
