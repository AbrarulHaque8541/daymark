/*
 * Daymark Wikipedia glance UI wiring for the web prototype.
 *
 * A small network-on-demand card: the user types a topic and taps Search; the top
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
    // Storage is optional for this card. Do not let a privacy-restricted
    // window.localStorage getter prevent the search UI from attaching.
    let storage = null;
    try {
      if (Object.prototype.hasOwnProperty.call(env, 'localStorage')) {
        storage = env.localStorage || null;
      } else {
        storage = win ? (win.localStorage || null) : null;
      }
    } catch (error) {
      storage = null;
    }
    const wikiApi = env.wikiApi || root.DaymarkWiki || null;
    const taskMutation = env.taskMutationApi || root.DaymarkTaskMutation || null;
    let lockManager = env.lockManager || null;
    if (!lockManager) {
      try { lockManager = (env.navigator || (win && win.navigator) || {}).locks || null; }
      catch (error) { lockManager = null; }
    }
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const inputEl = element('wiki-query');
    const buttonEl = element('wiki-search');
    const clearEl = element('wiki-clear');
    const statusEl = element('wiki-status');
    const listEl = element('wiki-list');

    let busy = false;
    let cached = null;
    let cacheRecord = null;
    let prefsRecord = null;

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
          if (clearEl && clearEl.classList) clearEl.classList.toggle('is-busy', isBusy);
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

    function readStoredRecord(key, validate) {
      if (!storage || typeof storage.getItem !== 'function') return { state: 'unavailable', raw: null, value: null };
      let raw;
      try { raw = storage.getItem(key); }
      catch (error) { return { state: 'unreadable', raw: null, value: null }; }
      if (raw === null) return { state: 'absent', raw: null, value: null };
      if (typeof raw !== 'string' || raw.length === 0) return { state: 'corrupt', raw, value: null };
      try {
        const parsed = JSON.parse(raw);
        if (validate(parsed)) return { state: 'valid', raw, value: parsed };
      } catch (error) {
        // Preserve corrupt raw values instead of silently treating them as absent.
      }
      return { state: 'corrupt', raw, value: null };
    }

    function readCache() {
      cacheRecord = readStoredRecord(STORAGE_KEY, (value) => !!(
        wikiApi && typeof wikiApi.validateWikiCache === 'function'
        && wikiApi.validateWikiCache(value)
      ));
      return cacheRecord.value;
    }

    function readPrefs() {
      prefsRecord = readStoredRecord(PREFS_KEY, (value) => !!(
        value && typeof value.query === 'string' && value.query.trim()
      ));
      return prefsRecord.value;
    }

    function persistRecord(key, value, record) {
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
        return { ok: false, reason: 'unavailable' };
      }
      if (!record || (record.state !== 'absent' && record.state !== 'valid')) {
        return { ok: false, reason: record ? record.state : 'unknown' };
      }
      let current;
      try { current = storage.getItem(key); }
      catch (error) { return { ok: false, reason: 'unreadable' }; }
      if (current !== record.raw) return { ok: false, reason: 'changed' };
      let raw;
      try {
        raw = JSON.stringify(value);
        storage.setItem(key, raw);
      } catch (error) {
        return { ok: false, reason: 'write' };
      }
      return { ok: true, record: { state: 'valid', raw, value } };
    }

    async function persistRecordFenced(key, value, record, epochSnapshot) {
      if (!storage) return persistRecord(key, value, record);
      if (!record || (record.state !== 'absent' && record.state !== 'valid')) {
        return persistRecord(key, value, record);
      }
      if (!taskMutation || !lockManager || !epochSnapshot || !epochSnapshot.ok) {
        return { ok: false, reason: 'lock-unavailable' };
      }
      const result = await taskMutation.withClearEpochLock(
        lockManager,
        [taskMutation.TASK_LOCK_NAME],
        storage,
        epochSnapshot.value,
        () => persistRecord(key, value, record)
      );
      if (!result.ok || !result.value || !result.value.ok) {
        return { ok: false, reason: result.reason || (result.value && result.value.reason) || 'write' };
      }
      return result.value;
    }

    function persistCache(cache, epochSnapshot) {
      return persistRecordFenced(STORAGE_KEY, cache, cacheRecord, epochSnapshot).then((result) => {
        if (result.ok) cacheRecord = result.record;
        return result;
      });
    }

    function persistPrefs(query, epochSnapshot) {
      if (!query || !query.trim()) return { ok: true, skipped: true };
      return persistRecordFenced(PREFS_KEY, { query: query.trim() }, prefsRecord, epochSnapshot).then((result) => {
        if (result.ok) prefsRecord = result.record;
        return result;
      });
    }

    function persistenceMessage(label, result) {
      if (!result || result.ok) return '';
      if (result.reason === 'unavailable') return label + ' could not be saved because local storage is unavailable';
      if (result.reason === 'unreadable') return label + ' could not be verified and was left untouched';
      if (result.reason === 'corrupt') return label + ' is invalid and was left untouched';
      if (result.reason === 'changed') return label + ' changed elsewhere and was not overwritten';
      return label + ' could not be saved';
    }

    function readWarning(record, label) {
      if (!record) return '';
      if (record.state === 'unavailable') return 'Local storage is unavailable; saved ' + label + ' cannot be restored or changed.';
      if (record.state === 'unreadable') return 'Saved ' + label + ' could not be read and was left untouched.';
      if (record.state === 'corrupt') return 'Saved ' + label + ' is invalid and was left untouched.';
      return '';
    }

    function restoreRecord(key, record) {
      if (record.raw === null) storage.removeItem(key);
      else {
        if (typeof storage.setItem !== 'function') throw new Error('Storage cannot restore the previous value.');
        storage.setItem(key, record.raw);
      }
    }

    function clearStorage() {
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.removeItem !== 'function') {
        return { ok: false, reason: 'unavailable' };
      }
      if (!cacheRecord || !prefsRecord
        || cacheRecord.state === 'unavailable' || cacheRecord.state === 'unreadable'
        || prefsRecord.state === 'unavailable' || prefsRecord.state === 'unreadable') {
        return { ok: false, reason: 'unknown' };
      }
      if ((cacheRecord.raw !== null || prefsRecord.raw !== null)
        && typeof storage.setItem !== 'function') {
        return { ok: false, reason: 'unavailable' };
      }
      const before = [
        { key: STORAGE_KEY, record: cacheRecord },
        { key: PREFS_KEY, record: prefsRecord }
      ];
      try {
        for (const entry of before) {
          if (storage.getItem(entry.key) !== entry.record.raw) return { ok: false, reason: 'changed' };
        }
      } catch (error) {
        return { ok: false, reason: 'unknown' };
      }
      try {
        storage.removeItem(STORAGE_KEY);
        storage.removeItem(PREFS_KEY);
      } catch (error) {
        let restored = true;
        for (const entry of before) {
          try { restoreRecord(entry.key, entry.record); }
          catch (restoreError) { restored = false; }
        }
        return { ok: false, reason: restored ? 'remove' : 'partial' };
      }
      cacheRecord = { state: 'absent', raw: null, value: null };
      prefsRecord = { state: 'absent', raw: null, value: null };
      return { ok: true };
    }

    function onClear() {
      if (busy) return;
      const cleared = clearStorage();
      if (!cleared.ok) {
        if (cleared.reason === 'unknown') {
          status('Could not clear: saved Wikipedia data could not be read or verified; it was left untouched.');
        } else if (cleared.reason === 'changed') {
          status('Could not clear: saved Wikipedia data changed elsewhere; current results were kept.');
        } else if (cleared.reason === 'partial') {
          status('Could not fully clear saved data; current results were kept on this page.');
        } else {
          status('Could not clear saved Wikipedia data; current results were kept.');
        }
        return false;
      }
      if (inputEl && typeof inputEl.value === 'string') inputEl.value = '';
      if (listEl) {
        if (typeof listEl.removeChild === 'function') {
          while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
        } else {
          listEl.textContent = '';
        }
      }
      cached = null;
      status('Cleared. Type a topic and tap Search.');
      return true;
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
      const epochSnapshot = taskMutation && storage ? taskMutation.captureClearEpoch(storage) : null;
      setBusy(true);
      try {
        const result = await wikiApi.searchWikipedia(query, fetchImpl, { now });
        cached = result;
        render(cached);
        const cacheSave = await persistCache(cached, epochSnapshot);
        const prefsSave = await persistPrefs(query, epochSnapshot);
        const warnings = [
          persistenceMessage('Saved Wikipedia cache', cacheSave),
          persistenceMessage('Search preference', prefsSave)
        ].filter(Boolean);
        status('Updated · ' + cached.fetchedAt.slice(0, 16).replace('T', ' ') + ' UTC'
          + (warnings.length ? ' · ' + warnings.join('; ') : ''));
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
    const initialWarnings = [
      readWarning(cacheRecord, 'Wikipedia cache'),
      readWarning(prefsRecord, 'search preference')
    ].filter(Boolean);
    const initialWarning = initialWarnings.length ? initialWarnings.join(' ') + ' ' : '';
    if (cached) {
      render(cached);
      status('Cached · updated ' + cached.fetchedAt.slice(0, 16).replace('T', ' ') + ' UTC'
        + (initialWarnings.length ? ' · ' + initialWarnings.join(' ') : ''));
    } else if (prefs) {
      status(initialWarning + 'Last search restored. Tap Search to look it up again.');
    } else {
      status(initialWarning + 'Type a topic and tap Search.');
    }

    if (buttonEl && typeof buttonEl.addEventListener === 'function') {
      buttonEl.addEventListener('click', () => { onSearch(); });
    }

    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
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
        if (typeof inputEl.value !== 'string' || !inputEl.value.trim()) return;
        const epochSnapshot = taskMutation && storage ? taskMutation.captureClearEpoch(storage) : null;
        return persistPrefs(inputEl.value, epochSnapshot).then((saved) => {
          if (!saved.ok) status(persistenceMessage('Search preference', saved) + '.');
          return saved;
        });
      });
    }

    return {
      onSearch,
      onClear,
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
    const boot = () => attachWikiUi({ document, window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
