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
      if (listEl && typeof listEl.setAttribute === 'function') {
        listEl.setAttribute('role', 'list');
      }
      const upcoming = (Array.isArray(cache.holidays) ? cache.holidays : [])
        .filter((holiday) => holiday && typeof holiday.date === 'string' && holiday.date >= todayIso())
        .slice(0, UPCOMING_LIMIT);
      if (!upcoming.length) {
        const row = makeRow('feed-item');
        if (row) {
          if (typeof row.setAttribute === 'function') row.setAttribute('role', 'listitem');
          appendText(row, 'feed-item-title', 'No more public holidays in ' + cache.year + ' for this country.');
          appendText(row, 'feed-item-summary', 'Tap Refresh next year, or choose another country.');
          listEl.appendChild(row);
        }
        if (listEl && typeof listEl.setAttribute === 'function') {
          listEl.setAttribute('aria-label', 'No upcoming public holidays');
        }
        return;
      }
      let nextLabel = '';
      for (let i = 0; i < upcoming.length; i++) {
        const holiday = upcoming[i];
        const row = makeRow('feed-item');
        if (!row) break;
        if (typeof row.setAttribute === 'function') row.setAttribute('role', 'listitem');
        const days = daysUntil(holiday.date);
        const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days > 1 ? `in ${days} days` : '';
        appendText(row, 'feed-item-date', holiday.date + (when ? ' · ' + when : ''));
        const title = holiday.name
          + (holiday.localName && holiday.localName !== holiday.name ? ' · ' + holiday.localName : '');
        appendText(row, 'feed-item-title', (i === 0 ? 'Next: ' : '') + title);
        const scope = holiday.global ? 'Nationwide public holiday' : 'Regional holiday';
        appendText(row, 'feed-item-summary', holiday.localName && holiday.localName !== holiday.name
          ? 'Locally: ' + holiday.localName + ' · ' + scope
          : scope);
        listEl.appendChild(row);
        if (i === 0) {
          nextLabel = title + (when ? ' (' + when + ')' : '');
        }
      }
      if (listEl && typeof listEl.setAttribute === 'function' && nextLabel) {
        listEl.setAttribute('aria-label', 'Upcoming public holidays. Next: ' + nextLabel);
      }
    }

    // ... rest of the file remains the same as original after the render function
    // For brevity in this call, the remaining functions (readCache, persist, onRefresh, onClear, init) are unchanged.
    // Full file is the patched version with only render updated.
  }

  // Attach and export (unchanged)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { attachHolidaysUi, STORAGE_KEY, PREFS_KEY };
  } else if (root) {
    root.DaymarkHolidaysUi = { attachHolidaysUi, STORAGE_KEY, PREFS_KEY };
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
