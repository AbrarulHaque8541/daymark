/*
 * Daymark currency glance UI wiring for the web prototype.
 *
 * A small network-on-demand card: the user picks an amount and two currencies and
 * taps Refresh; the reference rate comes from the keyless Frankfurter API
 * (European Central Bank data) and the last successful result stays cached on
 * this device, so the card keeps working offline with a "cached" note. Nothing
 * ever refreshes on its own — no polling, no timers, no battery drain.
 * Remembers the last amount and currency pair across sessions (localStorage only).
 * Mirrors the weather-ui.js module style: attachCurrencyUi(env) is fully
 * injectable for unit tests.
 */
((root) => {
  'use strict';

  const STORAGE_KEY = 'daymark.currency.v1';
  const PREFS_KEY = 'daymark.currency.prefs.v1';
  const DEFAULT_FROM = 'USD';
  const DEFAULT_TO = 'INR';
  const DEFAULT_AMOUNT = '1';

  function attachCurrencyUi(env) {
    if (!env || !env.document) throw new Error('attachCurrencyUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const storageRequested = Object.prototype.hasOwnProperty.call(env, 'localStorage')
      || !!env.window || typeof window !== 'undefined';
    let storage = null;
    let storageAccessFailed = false;
    let storageReadFailed = false;
    let storageWriteFailed = false;
    let storageConflict = false;
    try {
      storage = Object.prototype.hasOwnProperty.call(env, 'localStorage')
        ? env.localStorage
        : (win && win.localStorage) || null;
      if (storageRequested && !storage) storageAccessFailed = true;
    } catch (error) {
      storageAccessFailed = true;
    }
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
    const formEl = element('currency-form');
    const statusEl = element('currency-status');
    const nowEl = element('currency-now');
    const copyEl = element('currency-copy');

    let busy = false;
    let cached = null;
    let cacheRecord = null;
    let prefsRecord = null;

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function updateCopyVisibility() {
      if (!copyEl) return;
      const hasResult = nowEl && nowEl.textContent && nowEl.textContent.trim().length > 0;
      if (typeof copyEl.hidden !== 'undefined') copyEl.hidden = !hasResult;
      if (copyEl.classList && typeof copyEl.classList.toggle === 'function') {
        copyEl.classList.toggle('is-hidden', !hasResult);
      }
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
      if (swapEl) {
        swapEl.disabled = isBusy;
        if (typeof swapEl.setAttribute === 'function') {
          if (isBusy) swapEl.setAttribute('aria-busy', 'true');
          else swapEl.removeAttribute('aria-busy');
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
      updateCopyVisibility();
    }

    function readRecord(key, validate) {
      if (!storageRequested) return { key, state: 'unavailable', raw: null, value: null };
      if (!storage || storageAccessFailed || typeof storage.getItem !== 'function') {
        storageReadFailed = true;
        return { key, state: 'unreadable', raw: null, value: null };
      }
      let raw;
      try {
        raw = storage.getItem(key);
      } catch (error) {
        storageReadFailed = true;
        return { key, state: 'unreadable', raw: null, value: null };
      }
      if (raw === null) return { key, state: 'absent', raw: null, value: null };
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        return { key, state: 'corrupt', raw, value: null };
      }
      if (!validate(parsed)) return { key, state: 'corrupt', raw, value: null };
      return { key, state: 'valid', raw, value: parsed };
    }

    function storageNotice() {
      if (!storageRequested) return '';
      if (storageAccessFailed) return ' · browser storage is unavailable';
      if (storageReadFailed) return ' · browser storage could not be read; existing currency data was preserved';
      if (storageConflict) return ' · saved currency data changed elsewhere and was preserved';
      const problems = [];
      if (cacheRecord && cacheRecord.state === 'corrupt') {
        problems.push('saved currency data is unreadable and was preserved');
      }
      if (prefsRecord && prefsRecord.state === 'corrupt') {
        problems.push('saved currency preferences are unreadable and were preserved');
      }
      if (storageWriteFailed) problems.push('changes could not be saved in this browser');
      return problems.length ? ' · ' + problems.join('; ') : '';
    }

    function persistRecord(record, value) {
      if (!storageRequested) return true;
      if (!record || (record.state !== 'absent' && record.state !== 'valid')) return false;
      if (!storage || storageAccessFailed) {
        storageAccessFailed = true;
        return false;
      }
      if (typeof storage.getItem !== 'function') {
        storageReadFailed = true;
        record.state = 'unreadable';
        return false;
      }
      let current;
      try {
        current = storage.getItem(record.key);
      } catch (error) {
        storageReadFailed = true;
        record.state = 'unreadable';
        return false;
      }
      if (current !== record.raw) {
        storageConflict = true;
        record.state = 'conflict';
        return false;
      }
      if (typeof storage.setItem !== 'function') {
        storageWriteFailed = true;
        return false;
      }
      const raw = JSON.stringify(value);
      try {
        storage.setItem(record.key, raw);
        record.state = 'valid';
        record.raw = raw;
        record.value = value;
        return true;
      } catch (error) {
        storageWriteFailed = true;
        return false;
      }
    }

    function readCache() {
      cacheRecord = readRecord(STORAGE_KEY, (parsed) => !!(
        currencyApi && typeof currencyApi.validateCurrencyCache === 'function'
        && currencyApi.validateCurrencyCache(parsed)
      ));
      return cacheRecord.value;
    }

    function persistCache(cache) {
      return persistRecord(cacheRecord, cache);
    }

    function readPrefs() {
      prefsRecord = readRecord(PREFS_KEY, (parsed) => !!(
        parsed && typeof parsed.amount === 'string'
        && typeof parsed.from === 'string' && typeof parsed.to === 'string'
      ));
      return prefsRecord.value;
    }

    function persistPrefs() {
      const { amountText, from, to } = readInputs();
      if (!from || !to) return true;
      return persistRecord(prefsRecord, { amount: amountText, from, to });
    }

    function restorePrefs() {
      const prefs = readPrefs();
      if (!prefs) return;
      if (amountEl && typeof amountEl.value === 'string') amountEl.value = prefs.amount || DEFAULT_AMOUNT;
      if (fromEl && typeof fromEl.value === 'string') fromEl.value = prefs.from || DEFAULT_FROM;
      if (toEl && typeof toEl.value === 'string') toEl.value = prefs.to || DEFAULT_TO;
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
        persistPrefs();
        render(cached, amount);
        status(`Updated · ${cached.fetchedAt.slice(0, 16).replace('T', ' ')} UTC` + storageNotice());
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

    restorePrefs();
    cached = readCache();
    if (cached) {
      render(cached, currencyApi ? currencyApi.normalizeAmount(
        amountEl && typeof amountEl.value === 'string' && amountEl.value.trim() ? amountEl.value : DEFAULT_AMOUNT
      ) || 1 : 1);
      status(`Cached · updated ${cached.fetchedAt.slice(0, 16).replace('T', ' ')} UTC`);
      updateCopyVisibility();
    } else {
      status('Pick two currencies and tap Refresh.');
      updateCopyVisibility();
    }
    if (storageNotice()) status((statusEl && statusEl.textContent || 'Currency conversion is ready.') + storageNotice());

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
        const savePrefs = () => {
          if (!persistPrefs()) status('Currency preferences could not be saved.' + storageNotice());
        };
        el.addEventListener('change', savePrefs);
        el.addEventListener('input', savePrefs);
      }
    });

    // Live update the display from cache when the amount changes and the pair matches.
    // No network call; pure offline responsiveness for the common case.
    if (amountEl && typeof amountEl.addEventListener === 'function') {
      amountEl.addEventListener('input', () => {
        if (busy || !cached || !currencyApi) return;
        const { from, to } = readInputs();
        if (from !== cached.from || to !== cached.to) return;
        const amount = currencyApi.normalizeAmount(
          amountEl.value && typeof amountEl.value === 'string' && amountEl.value.trim()
            ? amountEl.value
            : DEFAULT_AMOUNT
        );
        if (amount === null) return;
        render(cached, amount);
      });
    }

    if (swapEl && typeof swapEl.addEventListener === 'function') {
      swapEl.addEventListener('click', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (!fromEl || !toEl || typeof fromEl.value !== 'string' || typeof toEl.value !== 'string') return;
        const tmp = fromEl.value;
        fromEl.value = toEl.value;
        toEl.value = tmp;
        const prefsSaved = persistPrefs();
        if (cached && currencyApi) {
          const amount = currencyApi.normalizeAmount(
            amountEl && typeof amountEl.value === 'string' && amountEl.value.trim() ? amountEl.value : DEFAULT_AMOUNT
          ) || 1;
          if (cached.from === fromEl.value && cached.to === toEl.value) {
            render(cached, amount);
            status(`Cached · updated ${cached.fetchedAt.slice(0, 16).replace('T', ' ')} UTC`);
          } else if (cached.from === toEl.value && cached.to === fromEl.value) {
            // Offline inverse of the cached pair — a useful glance without a network call.
            const inverseRate = 1 / cached.rate;
            if (Number.isFinite(inverseRate) && inverseRate >= currencyApi.MIN_RATE && inverseRate <= currencyApi.MAX_RATE) {
              const inverseCache = {
                version: 1,
                from: fromEl.value,
                to: toEl.value,
                rate: inverseRate,
                asOfDate: cached.asOfDate,
                fetchedAt: cached.fetchedAt
              };
              render(inverseCache, amount);
              status('Inverse of cached rate · tap Refresh for the official ECB rate.');
            } else {
              if (nowEl) nowEl.textContent = '';
              updateCopyVisibility();
              status('Currencies swapped. Tap Refresh for the new rate.');
            }
          } else {
            if (nowEl) nowEl.textContent = '';
            updateCopyVisibility();
            status('Currencies swapped. Tap Refresh for the new rate.');
          }
        } else {
          status('Currencies swapped. Tap Refresh for the rate.');
        }
        if (!prefsSaved) status((statusEl && statusEl.textContent || 'Currencies swapped.') + storageNotice());
      });
    }

    async function onCopy() {
      if (!nowEl || !nowEl.textContent || !nowEl.textContent.trim()) return;
      const text = nowEl.textContent.split(' · ')[0].trim(); // main conversion line
      const clipboard = (win && win.navigator && win.navigator.clipboard) || (env.clipboard);
      try {
        if (clipboard && typeof clipboard.writeText === 'function') {
          await clipboard.writeText(text);
        } else {
          // fallback for older environments / tests
          if (typeof document !== 'undefined' && document.createElement) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'absolute';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
        }
        const prev = statusEl ? statusEl.textContent : '';
        status('Copied conversion to clipboard.');
        setTimeout(() => { if (statusEl && statusEl.textContent === 'Copied conversion to clipboard.') status(prev); }, 1800);
      } catch (err) {
        status('Could not copy. Select the text manually.');
      }
    }

    if (copyEl && typeof copyEl.addEventListener === 'function') {
      copyEl.addEventListener('click', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        onCopy();
      });
    }

    return {
      onRefresh,
      readCache,
      onCopy,
      detach() {
        // No document-level listener is registered; the button reference is
        // dropped when the returned handle goes out of scope.
        setBusy(false);
      }
    };
  }

  const api = { attachCurrencyUi, STORAGE_KEY, PREFS_KEY, DEFAULT_FROM, DEFAULT_TO, DEFAULT_AMOUNT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkCurrencyUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachCurrencyUi({ document, window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
