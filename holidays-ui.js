/*
 * Daymark public-holidays UI wiring for the web prototype.
 *
 * A small offline-first card: the user picks a country and taps Refresh; the
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
    const storage = env.localStorage || (win && win.localStorage) || null;
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
      // Next-up summary for faster glanceability (first upcoming holiday).
      const next = upcoming[0];
      const nextDays = daysUntil(next.date);
      const nextWhen = nextDays === 0 ? 'today' : nextDays === 1 ? 'tomorrow' : nextDays > 1 ? `in ${nextDays} days` : '';
      const summaryRow = makeRow('feed-item');
      if (summaryRow) {
        appendText(summaryRow, 'feed-item-title', 'Next up: ' + next.name + (nextWhen ? ' · ' + nextWhen : ''));
        appendText(summaryRow, 'feed-item-summary', 'Soonest public holiday for this country.');
        listEl.appendChild(summaryRow);
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

    function readCache() {
      if (!storage || typeof storage.getItem !== 'function') return null;
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (holidaysApi && typeof holidaysApi.validateHolidayCache === 'function'
          && holidaysApi.validateHolidayCache(parsed)) return parsed;
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
        if (parsed && typeof parsed.countryCode === 'string' && parsed.countryCode.trim()) return parsed;
      } catch (error) { /* ignore corrupt prefs */ }
      return null;
    }

    function persistPrefs(countryCode) {
      if (!storage || typeof storage.setItem !== 'function' || !countryCode || !countryCode.trim()) return;
      storage.setItem(PREFS_KEY, JSON.stringify({ countryCode: countryCode.trim() }));
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
        persistCache(cached);
        persistPrefs(code);
        render(cached);
        status(`Updated · ${cached.fetchedAt.slice(0, 16).replace('T', ' ')} UTC`);
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        if (cached) {
          render(cached);
          status(`Could not refresh: ${message} — showing cached holidays.`);
        } else {
          status(`Could not refresh: ${message}`);
        }
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      // Explicit, scoped removal: only this card's cached holiday list and country preference.
      if (storage && typeof storage.removeItem === 'function') {
        storage.removeItem(STORAGE_KEY);
        storage.removeItem(PREFS_KEY);
      }
      cached = null;
      if (countryEl && typeof countryEl.value === 'string') countryEl.value = DEFAULT_COUNTRY;
      clearList();
      status('Holidays cleared on this device. Choose a country and tap Refresh.');
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
        if (typeof countryEl.value === 'string') persistPrefs(countryEl.value);
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
    const boot = () => attachHolidaysUi({ document, window, localStorage: window.localStorage });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
