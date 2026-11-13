/* 
 * Daymark public-holidays UI wiring for the web prototype.
 *
 * A small network-on-demand card: the user picks a country and taps Refresh; the
 * year's public holidays come from the keyless Nager.Date open API and the last
 * successful result stays cached on this device, so the card keeps working
 * offline with a "cached" note. Nothing ever refreshes on its own — no polling,
 * no timers, no battery drain. The last-checked country is remembered inside the
 * cache itself (localStorage only). Also remembers the last selected country
 * preference across sessions (even after clear) so the select restores. Mirrors
 * the weather-ui.js module style: attachHolidaysUi(env) is fully injectable for unit tests.
 */
((root) => {
  'use strict';

  const STORAGE_KEY = 'daymark.holidays.v1';
  const PREFS_KEY = 'daymark.holidays.prefs.v1';
  const DEFAULT_COUNTRY = 'IN';
  const UPCOMING_LIMIT = 8;

  function attachHolidaysUi(env) {
    if (!env || !env.document) throw new Error('attachHolidaysUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const storageRequested = Object.prototype.hasOwnProperty.call(env, 'localStorage')
      || !!env.window || typeof window !== 'undefined';
    let storage = null;
    let storageAccessFailed = false;
    let storageReadFailed = false;
    let storageWriteFailed = false;
    let storageRemoveFailed = false;
    let storageConflict = false;
    try {
      storage = Object.prototype.hasOwnProperty.call(env, 'localStorage')
        ? env.localStorage
        : (win && win.localStorage) || null;
      if (storageRequested && !storage) storageAccessFailed = true;
    } catch (error) {
      storageAccessFailed = true;
    }
    const holidaysApi = env.holidaysApi || root.DaymarkHolidays || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const countryEl = element('holiday-country');
    const buttonEl = element('holiday-refresh');
    const formEl = element('holiday-form');
    const statusEl = element('holiday-status');
    const listEl = element('holiday-list');
    const clearEl = element('holiday-clear');

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
        }
        if (typeof buttonEl.setAttribute === 'function') {
          if (isBusy) buttonEl.setAttribute('aria-busy', 'true');
          else buttonEl.removeAttribute('aria-busy');
        }
      }
      if (clearEl) {
        clearEl.disabled = isBusy;
        if (clearEl.classList && typeof clearEl.classList.toggle === 'function') {
          clearEl.classList.toggle('is-busy', isBusy);
        }
      }
    }

    function todayIso() {
      return String(now()).slice(0, 10);
    }

    function daysUntil(dateIso) {
      if (!dateIso || typeof dateIso !== 'string' || dateIso.length < 10) return null;
      const today = new Date(todayIso() + 'T00:00:00Z');
      const target = new Date(dateIso.slice(0, 10) + 'T00:00:00Z');
      if (Number.isNaN(today.getTime()) || Number.isNaN(target.getTime())) return null;
      return Math.round((target - today) / 86400000);
    }

    function makeRow(rowClass) {
      if (!doc || typeof doc.createElement !== 'function') return null;
      const row = doc.createElement('div');
      if (row && typeof row.setAttribute === 'function') row.setAttribute('class', rowClass);
      return row;
    }

    function appendText(parent, className, text) {
      if (!parent || typeof parent.appendChild !== 'function') return;
      const node = doc && typeof doc.createElement === 'function' ? doc.createElement(tagFor(className)) : null;
      if (!node) return;
      if (typeof node.setAttribute === 'function') node.setAttribute('class', className);
      node.textContent = text;
      parent.appendChild(node);
    }

    function tagFor(className) {
      return className === 'feed-item-summary' ? 'p' : 'span';
    }

    function clearList() {
      if (!listEl || typeof listEl.removeChild !== 'function') return;
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
    }

    function render(cache) {
      if (!listEl || !cache) return;
      clearList();
      const upcoming = (Array.isArray(cache.holidays) ? cache.holidays : [])
        .filter((holiday) => holiday && typeof holiday.date === 'string' && holiday.date >= todayIso())
        .slice(0, UPCOMING_LIMIT);
      if (!upcoming.length) {
        const row = makeRow('feed-item');
        if (row) {
          appendText(row, 'feed-item-title', 'No more public holidays in ' + cache.year + ' for this country.');
          appendText(row, 'feed-item-summary', 'Tap Refresh next year, or choose another country.');
          listEl.appendChild(row);
        }
        return;
      }
      for (const holiday of upcoming) {
        const row = makeRow('feed-item');
        if (!row) break;
        const days = daysUntil(holiday.date);
        const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days > 1 ? `in ${days} days` : '';
        appendText(row, 'feed-item-date', holiday.date + (when ? ' · ' + when : ''));
        appendText(row, 'feed-item-title', holiday.name
          + (holiday.localName && holiday.localName !== holiday.name ? ' · ' + holiday.localName : ''));
        const scope = holiday.global ? 'Nationwide public holiday' : 'Regional holiday';
        appendText(row, 'feed-item-summary', holiday.localName && holiday.localName !== holiday.name
          ? 'Locally: ' + holiday.localName + ' · ' + scope
          : scope);
        listEl.appendChild(row);
      }
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
      if (typeof raw !== 'string' || raw.length === 0) return { key, state: 'corrupt', raw, value: null };
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        return { key, state: 'corrupt', raw, value: null };
      }
      let valid = false;
      try { valid = validate(parsed) === true; } catch (error) { valid = false; }
      if (!valid) return { key, state: 'corrupt', raw, value: null };
      return { key, state: 'valid', raw, value: parsed };
    }

    function storageNotice() {
      if (!storageRequested) return '';
      if (storageAccessFailed) return ' · browser storage is unavailable';
      if (storageReadFailed) return ' · saved holiday data could not be read';
      if (storageConflict) return ' · saved data changed elsewhere and was preserved';
      const problems = [];
      if (cacheRecord && cacheRecord.state === 'corrupt') {
        problems.push('saved holiday cache is unreadable and was preserved');
      }
      if (prefsRecord && prefsRecord.state === 'corrupt') {
        problems.push('saved country preference is unreadable and was preserved');
      }
      if (storageWriteFailed) problems.push('changes could not be saved in this browser');
      if (storageRemoveFailed) problems.push('saved holiday data could not be removed');
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
        holidaysApi && typeof holidaysApi.validateHolidayCache === 'function'
        && holidaysApi.validateHolidayCache(parsed)
      ));
      return cacheRecord.value;
    }

    function persistCache(cache) {
      return persistRecord(cacheRecord, cache);
    }

    function readPrefs() {
      prefsRecord = readRecord(PREFS_KEY, (parsed) => !!(
        parsed && typeof parsed.countryCode === 'string' && /^[A-Za-z]{2}$/.test(parsed.countryCode.trim())
      ));
      return prefsRecord.value;
    }

    function persistPrefs(countryCode) {
      if (!countryCode || !countryCode.trim()) return true;
      return persistRecord(prefsRecord, { countryCode: countryCode.trim().toUpperCase() });
    }

    async function onRefresh() {
      if (busy) return;
      if (!holidaysApi || typeof holidaysApi.fetchHolidays !== 'function') {
        status('Holidays are unavailable.');
        return;
      }
      if (!fetchImpl) {
        status('Could not refresh: fetch is unavailable in this browser.');
        return;
      }
      const typed = countryEl && typeof countryEl.value === 'string' ? countryEl.value : '';
      const code = typed.trim() || (cached ? cached.countryCode : '');
      if (!code) {
        status('Choose a country first.');
        return;
      }
      setBusy(true);
      status('Refreshing…');
      try {
        const result = await holidaysApi.fetchHolidays(code, fetchImpl, { now });
        cached = result;
        storageWriteFailed = false;
        persistCache(cached);
        persistPrefs(code);
        render(cached);
        status(`Updated · ${cached.fetchedAt.slice(0, 16).replace('T', ' ')} UTC` + storageNotice());
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        if (cached) {
          render(cached);
          status(`Could not refresh: ${message} — showing cached holidays.` + storageNotice());
        } else {
          status(`Could not refresh: ${message}` + storageNotice());
        }
      } finally {
        setBusy(false);
      }
    }

    function clearView() {
      cached = null;
      if (countryEl && typeof countryEl.value === 'string') countryEl.value = DEFAULT_COUNTRY;
      clearList();
    }

    function onClear() {
      if (busy) return;
      setBusy(true);
      try {
        // Clearing is explicit, but do not discard visible or saved data when its
        // current value cannot be read or has changed since this card loaded.
        if (!storageRequested) {
          clearView();
          status('Holidays cleared from this view; browser storage is unavailable.');
          return;
        }
        if (!storage || storageAccessFailed || !cacheRecord || !prefsRecord
          || cacheRecord.state === 'unreadable' || prefsRecord.state === 'unreadable') {
          status('Could not verify saved holidays; nothing was cleared.' + storageNotice());
          return;
        }
        if (typeof storage.getItem !== 'function') {
          storageReadFailed = true;
          status('Could not verify saved holidays; nothing was cleared.' + storageNotice());
          return;
        }

        const records = [cacheRecord, prefsRecord];
        const current = [];
        try {
          for (const record of records) current.push(storage.getItem(record.key));
        } catch (error) {
          storageReadFailed = true;
          status('Could not verify saved holidays; nothing was cleared.' + storageNotice());
          return;
        }
        if (records.some((record, index) => current[index] !== record.raw)) {
          storageConflict = true;
          status('Could not clear saved holidays because they changed elsewhere; current data was kept.' + storageNotice());
          return;
        }

        try {
          for (const record of records) {
            if (record.raw !== null) {
              if (typeof storage.removeItem !== 'function') throw new Error('removeItem is unavailable');
              storage.removeItem(record.key);
            }
          }
        } catch (error) {
          storageRemoveFailed = true;
          let rollbackFailed = false;
          for (const record of records) {
            if (record.raw === null) continue; // absent keys were not touched by the removal loop
            try {
              if (typeof storage.setItem !== 'function') throw new Error('setItem is unavailable');
              storage.setItem(record.key, record.raw);
            } catch (rollbackError) {
              rollbackFailed = true;
              storageWriteFailed = true;
            }
          }
          status((rollbackFailed
            ? 'Could not clear saved holidays; storage may be partially changed.'
            : 'Could not clear saved holidays; previous saved data was restored where possible.')
            + storageNotice());
          return;
        }

        cacheRecord = { key: STORAGE_KEY, state: 'absent', raw: null, value: null };
        prefsRecord = { key: PREFS_KEY, state: 'absent', raw: null, value: null };
        storageAccessFailed = false;
        storageReadFailed = false;
        storageWriteFailed = false;
        storageRemoveFailed = false;
        storageConflict = false;
        clearView();
        status('Holidays cleared on this device. Choose a country and tap Refresh.');
      } finally {
        setBusy(false);
      }
    }

    cached = readCache();
    const prefs = readPrefs();
    if (prefs && countryEl && typeof countryEl.value === 'string') {
      countryEl.value = prefs.countryCode;
    }
    if (cached) {
      if (countryEl && typeof countryEl.value === 'string') countryEl.value = cached.countryCode;
      render(cached);
      status(`Cached · updated ${cached.fetchedAt.slice(0, 16).replace('T', ' ')} UTC`);
    } else if (prefs) {
      status('Last country restored. Tap Refresh for upcoming holidays.');
    } else {
      status('Choose a country and tap Refresh.');
    }
    if (storageNotice()) status((statusEl && statusEl.textContent || 'Holidays are ready.') + storageNotice());

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        return onRefresh();
      });
    }
    if (buttonEl && typeof buttonEl.addEventListener === 'function') {
      buttonEl.addEventListener('click', () => { onRefresh(); });
    }

    // Persist country preference on change so it restores even without a cache.
    if (countryEl && typeof countryEl.addEventListener === 'function') {
      countryEl.addEventListener('change', () => {
        if (typeof countryEl.value === 'string' && !persistPrefs(countryEl.value)) {
          status('Country preference was not saved.' + storageNotice());
        }
      });
    }

    // Clear removes this card's cached holiday list and preference on demand.
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }

    return {
      onRefresh,
      onClear,
      readCache,
      detach() {
        // No document-level listener is registered; the button reference is
        // dropped when the returned handle goes out of scope.
        setBusy(false);
      }
    };
  }

  const api = { attachHolidaysUi, STORAGE_KEY, PREFS_KEY, DEFAULT_COUNTRY, UPCOMING_LIMIT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkHolidaysUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachHolidaysUi({ document, window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
