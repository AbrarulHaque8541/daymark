/*
 * Daymark browser address-bar preview UI wiring for the web prototype.
 *
 * A small network-on-demand card: the user types address-bar text and this card
 * shows, locally, how Daymark's browser would read it — an http(s) page
 * (with an honest Encrypted / Not encrypted label), a search with the
 * chosen provider, a safe external handoff (mailto/tel/sms), or a blocked
 * scheme. Nothing is ever loaded or fetched; the classification engine is
 * DaymarkBrowserAddress (browser-address-logic.js). The chosen search
 * provider is remembered across sessions (localStorage only). Mirrors the
 * export-ui.js / weather-ui.js module style: attachBrowserAddressUi(env)
 * is fully injectable for unit tests.
 */
((root) => {
  'use strict';

  const PREFS_KEY = 'daymark.browser-address.prefs.v1';

  function attachBrowserAddressUi(env) {
    if (!env || !env.document) throw new Error('attachBrowserAddressUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    let storage = null;
    let storageAccessFailed = false;
    let storageReadFailed = false;
    let storageWriteFailed = false;
    try {
      storage = Object.prototype.hasOwnProperty.call(env, 'localStorage')
        ? env.localStorage
        : ((win && win.localStorage) || null);
    } catch (error) {
      storageAccessFailed = true;
    }
    // An env may explicitly pass addressApi: null to model a page where the
    // engine failed to load; only fall back to the global when it is absent.
    const addressApi = Object.prototype.hasOwnProperty.call(env, 'addressApi')
      ? env.addressApi
      : (root.DaymarkBrowserAddress || null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const inputEl = element('browser-address-input');
    const providerEl = element('browser-address-provider');
    const statusEl = element('browser-address-status');
    const resultEl = element('browser-address-result');
    const formEl = element('browser-address-form');
    const clearEl = element('browser-address-clear');

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function detail(message) {
      if (resultEl) resultEl.textContent = message;
    }

    function currentProvider() {
      const value = providerEl && typeof providerEl.value === 'string' ? providerEl.value : '';
      if (addressApi && typeof addressApi.isKnownProvider === 'function'
        && addressApi.isKnownProvider(value)) {
        return value;
      }
      return addressApi ? addressApi.DEFAULT_SEARCH_PROVIDER : 'duckduckgo';
    }

    function readPrefs() {
      if (!storage || typeof storage.getItem !== 'function') {
        storageReadFailed = true;
        return null;
      }
      let raw = null;
      try {
        raw = storage.getItem(PREFS_KEY);
      } catch (error) {
        // Unknown saved preference must not be overwritten by a later change.
        storageReadFailed = true;
        return null;
      }
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.provider === 'string'
          && addressApi && addressApi.isKnownProvider(parsed.provider)) {
          return parsed;
        }
      } catch (error) {
        // A non-empty but unreadable value is unknown saved state, not an absent preference.
        storageReadFailed = true;
        return null;
      }
      // Preserve syntactically valid but unsupported values rather than overwriting them.
      storageReadFailed = true;
      return null;
    }

    function persistPrefs(provider) {
      if (!storage || storageAccessFailed || storageReadFailed
        || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return false;
      if (!addressApi || !addressApi.isKnownProvider(provider)) return false;
      try {
        storage.setItem(PREFS_KEY, JSON.stringify({ provider }));
        return true;
      } catch (error) {
        storageWriteFailed = true;
        return false;
      }
    }

    function storageNotice() {
      return storageAccessFailed || storageReadFailed || storageWriteFailed
        || !storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function'
        ? ' · provider preference not saved in this browser' : '';
    }

    function securityLabel(security) {
      if (security === 'encrypted') return 'Encrypted (HTTPS)';
      if (security === 'not-encrypted') return 'Not encrypted (HTTP)';
      return '';
    }

    function classify() {
      if (!addressApi || typeof addressApi.parseAddressInput !== 'function') {
        status('Address preview is unavailable.' + storageNotice());
        return;
      }
      const typed = inputEl && typeof inputEl.value === 'string' ? inputEl.value : '';
      if (!typed.trim()) {
        status('Nothing typed yet.' + storageNotice());
        detail('Type a URL or search text to see how the browser will read it.');
        return;
      }
      const result = addressApi.parseAddressInput(typed, { provider: currentProvider() });
      if (result.kind === 'navigate') {
        status('Opens a page · ' + securityLabel(result.security) + storageNotice());
        const idn = result.idn ? ' (Unicode domain, punycode host ' + result.host + ')' : '';
        detail('Navigate to ' + result.url + idn);
      } else if (result.kind === 'search') {
        status('Runs a search with ' + result.providerName + '.' + storageNotice());
        detail('Search for "' + result.searchQuery + '" · ' + result.url);
      } else if (result.kind === 'external') {
        status('External handoff.' + storageNotice());
        detail(result.url + ' — Daymark passes this to another app only on your explicit action.');
      } else if (result.kind === 'blocked') {
        status('Blocked.' + storageNotice());
        detail(result.reason);
      } else {
        status('Nothing to preview.' + storageNotice());
        detail('');
      }
    }

    function onClear() {
      if (inputEl && typeof inputEl.value === 'string') inputEl.value = '';
      status('Cleared. Type a URL or search text.');
      detail('');
    }

    const prefs = readPrefs();
    if (prefs && providerEl && typeof providerEl.value === 'string') {
      providerEl.value = prefs.provider;
    }
    classify();

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        classify();
      });
    }
    if (inputEl && typeof inputEl.addEventListener === 'function') {
      inputEl.addEventListener('input', () => { classify(); });
    }
    if (providerEl && typeof providerEl.addEventListener === 'function') {
      providerEl.addEventListener('change', () => {
        persistPrefs(currentProvider());
        classify();
      });
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }

    return {
      classify,
      onClear,
      currentProvider,
      detach() {
        // No document-level listener is registered; the returned handle
        // simply stops being used once it goes out of scope.
        status('');
      }
    };
  }

  const api = { attachBrowserAddressUi, PREFS_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkBrowserAddressUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachBrowserAddressUi({ document, window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
