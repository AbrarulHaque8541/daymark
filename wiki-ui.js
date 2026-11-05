/*
 * Daymark Wikipedia glance UI wiring for the web prototype.
 *
 * A small offline-first card: the user types a topic and taps Search; the top
 * encyclopedia matches come from the keyless public Wikipedia API and the last
 * successful results stay cached on this device, so the card keeps working
 * offline with a "cached" note. Nothing ever refreshes on its own — no
 * polling, no timers, no battery drain. Remembers the last search term across
 * sessions (localStorage only). Mirrors the weather-ui.js module style:
 * attachWikiUi(env) is fully injectable for unit tests.
 */
((root) => {
  'use strict';

  const STORAGE_KEY = 'daymark.wiki.v1';
  const PREFS_KEY = 'daymark.wiki.prefs.v1';

  function attachWikiUi(env) {
    if (!env || !env.document) throw new Error('attachWikiUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const storage = env.localStorage || (win && win.localStorage) || null;
    const wikiApi = env.wikiApi || root.DaymarkWiki || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const inputEl = element('wiki-query');
    const buttonEl = element('wiki-search');
    const statusEl = element('wiki-status');
    const listEl = element('wiki-list');

    let busy = false;
    let cached = null;

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function setBusy(isBusy) {
      // a11y: announce busy state without flooding live regions
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

    function render(cache) {
      if (!listEl || !cache) return;
      if (typeof doc.createElement !== 'function') {
        // Minimal fallback for hosts without DOM creation: plain text lines.
        listEl.textContent = cache.results
          .map((result) => result.title + (result.snippet ? ' — ' + result.snippet : ''))
          .join('\n');
        return;
      }
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
      cache.results.forEach((result) => {
        const item = doc.createElement('div');
        if (typeof item.setAttribute === 'function') item.setAttribute('class', 'wiki-item');
        else if ('className' in item) item.className = 'wiki-item';

        const link = doc.createElement('a');
        if ('href' in link) link.href = result.url;
        if (typeof link.setAttribute === 'function') {
          link.setAttribute('class', 'wiki-item-link');
          link.setAttribute('href', result.url);
          link.setAttribute('target', '_blank');
          link.setAttribute('rel', 'noopener noreferrer');
        }
        link.textContent = result.title;

        const snippet = doc.createElement('p');
        if (typeof snippet.setAttribute === 'function') snippet.setAttribute('class', 'wiki-item-summary');
        else if ('className' in snippet) snippet.className = 'wiki-item-summary';
        snippet.textContent = result.snippet;

        if (typeof item.appendChild === 'function') {
          item.appendChild(link);
          item.appendChild(snippet);
        }
        if (typeof listEl.appendChild === 'function') listEl.appendChild(item);
      });
    }

    function readCache() {
      if (!storage || typeof storage.getItem !== 'function') return null;
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (wikiApi && typeof wikiApi.validateWikiCache === 'function'
          && wikiApi.validateWikiCache(parsed)) return parsed;
      } catch (error) { /* a corrupt cache is treated as no cache */ }
      return null;
    }

    function persistCache(cache) {
      if (!storage || typeof storage.setItem !== 'function') return;
      storage.setItem(STORAGE_KEY, JSON.stringify(cache));
    }

    function readPrefs() {
      if (!storage || typeof storage.getItem !== 'function') return null;
      const raw = storage.getItem(PREFS_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.query === 'string' && parsed.query.trim()) return parsed;
      } catch (error) { /* ignore corrupt prefs */ }
      return null;
    }

    function persistPrefs(query) {
      if (!storage || typeof storage.setItem !== 'function' || !query || !query.trim()) return;
      storage.setItem(PREFS_KEY, JSON.stringify({ query: query.trim() }));
    }

    async function onSearch() {
      if (busy) return;
      if (!wikiApi || typeof wikiApi.searchWikipedia !== 'function') {
        status('Wikipedia search is unavailable.');
        return;
      }
      if (!fetchImpl) {
        status('Could not search: fetch is unavailable in this browser.');
        return;
      }
      const typed = inputEl && typeof inputEl.value === 'string' ? inputEl.value : '';
      let query = typed;
      if (!query.trim() && cached) query = cached.query;
      if (!query.trim()) {
        status('Type a search term first.');
        return;
      }
      setBusy(true);
      try {
        const result = await wikiApi.searchWikipedia(query, fetchImpl, { now });
        cached = result;
        persistCache(cached);
        persistPrefs(query);
        render(cached);
        status('Updated · ' + cached.fetchedAt.slice(0, 16).replace('T', ' ') + ' UTC');
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        if (cached) {
          render(cached);
          status('Could not search: ' + message + ' — showing cached results.');
        } else {
          status('Could not search: ' + message);
        }
      } finally {
        setBusy(false);
      }
    }

    cached = readCache();
    const prefs = readPrefs();
    if (prefs && inputEl && typeof inputEl.value === 'string') {
      inputEl.value = prefs.query;
    }
    if (cached) {
      render(cached);
      status('Cached · updated ' + cached.fetchedAt.slice(0, 16).replace('T', ' ') + ' UTC');
    } else if (prefs) {
      status('Last search restored. Tap Search to look it up again.');
    } else {
      status('Type a topic and tap Search.');
    }

    if (buttonEl && typeof buttonEl.addEventListener === 'function') {
      buttonEl.addEventListener('click', () => { onSearch(); });
    }

    // Enter on the query field starts the same search (keyboard efficiency).
    if (inputEl && typeof inputEl.addEventListener === 'function') {
      inputEl.addEventListener('keydown', (event) => {
        if (event && (event.key === 'Enter' || event.keyCode === 13)) {
          if (typeof event.preventDefault === 'function') event.preventDefault();
          // Return the promise so hosts and tests can await the triggered search.
          return onSearch();
        }
        return undefined;
      });
      inputEl.addEventListener('input', () => {
        if (typeof inputEl.value === 'string') persistPrefs(inputEl.value);
      });
    }

    return {
      onSearch,
      readCache,
      detach() {
        // No document-level listener is registered; the button reference is
        // dropped when the returned handle goes out of scope.
        setBusy(false);
      }
    };
  }

  const api = { attachWikiUi, STORAGE_KEY, PREFS_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkWikiUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachWikiUi({ document, window, localStorage: window.localStorage });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
