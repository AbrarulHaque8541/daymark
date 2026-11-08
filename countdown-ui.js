((root) => {
  'use strict';

  // Offline countdown card UI. Persist under daymark.countdowns.v1.
  // Injectable for tests. No network, no auto-refresh timers.

  const STORAGE_KEY = 'daymark.countdowns.v1';

  function attachCountdownUi(env) {
    if (!env || !env.document) throw new Error('attachCountdownUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const storage = env.localStorage || (win && win.localStorage) || null;
    const logic = env.countdownApi || root.DaymarkCountdown || null;
    const nowFn = typeof env.now === 'function' ? env.now : () => new Date();

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const nameEl = element('countdown-name');
    const dateEl = element('countdown-date');
    const addEl = element('countdown-add');
    const clearEl = element('countdown-clear');
    const formEl = element('countdown-form');
    const statusEl = element('countdown-status');
    const listEl = element('countdown-list');

    let items = [];

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function readItems() {
      if (!storage || typeof storage.getItem !== 'function') return [];
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(logic && typeof logic.validateItem === 'function' ? logic.validateItem : () => true);
      } catch (e) { return []; }
    }

    function persist() {
      if (!storage || typeof storage.setItem !== 'function') return;
      storage.setItem(STORAGE_KEY, JSON.stringify(items));
    }

    function render() {
      if (!listEl || typeof listEl.replaceChildren !== 'function' && typeof listEl.innerHTML !== 'undefined') return;
      if (typeof listEl.replaceChildren === 'function') listEl.replaceChildren();
      else listEl.innerHTML = '';
      if (!items.length) return;
      const sorted = logic && typeof logic.sortItems === 'function' ? logic.sortItems(items) : items;
      const now = nowFn();
      for (const item of sorted) {
        const row = doc.createElement('div');
        if (row && typeof row.setAttribute === 'function') row.setAttribute('class', 'feed-item');
        const nameNode = doc.createElement('span');
        nameNode.setAttribute('class', 'feed-item-title');
        nameNode.textContent = item.name;
        const days = logic ? logic.daysUntil(item.date, now) : null;
        const daysNode = doc.createElement('span');
        daysNode.setAttribute('class', 'feed-item-meta');
        daysNode.textContent = logic ? logic.formatDays(days) + ' · ' + item.date : item.date;
        const remove = doc.createElement('button');
        remove.setAttribute('type', 'button');
        remove.setAttribute('class', 'button button-quiet');
        remove.setAttribute('aria-label', 'Remove ' + item.name);
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => {
          items = items.filter(i => i.id !== item.id);
          persist();
          render();
          status(items.length ? items.length + ' countdown' + (items.length === 1 ? '' : 's') : 'No countdowns saved.');
        });
        if (typeof row.appendChild === 'function') {
          row.appendChild(nameNode);
          row.appendChild(daysNode);
          row.appendChild(remove);
          if (typeof listEl.appendChild === 'function') listEl.appendChild(row);
        }
      }
    }

    function onAdd(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (!logic) { status('Countdown logic unavailable.'); return; }
      const name = logic.sanitizeName(nameEl && nameEl.value ? nameEl.value : '');
      const date = dateEl && dateEl.value ? dateEl.value : '';
      if (!name) { status('Enter a name for the countdown.'); return; }
      if (!logic.isValidDateString(date)) { status('Choose a valid date.'); return; }
      if (items.length >= logic.MAX_ITEMS) { status('Maximum ' + logic.MAX_ITEMS + ' countdowns.'); return; }
      if (items.some(i => i.name.toLowerCase() === name.toLowerCase() && i.date === date)) {
        status('That countdown is already saved.'); return;
      }
      const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      items.push({ id, name, date });
      persist();
      if (nameEl) nameEl.value = '';
      if (dateEl) dateEl.value = '';
      render();
      status('Added · ' + items.length + ' countdown' + (items.length === 1 ? '' : 's'));
    }

    function onClear() {
      items = [];
      persist();
      render();
      status('Countdowns cleared.');
    }

    items = readItems();
    render();
    status(items.length ? items.length + ' countdown' + (items.length === 1 ? '' : 's') + ' saved.' : 'Add a named date to track.');

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', onAdd);
    }
    if (addEl && typeof addEl.addEventListener === 'function') {
      addEl.addEventListener('click', onAdd);
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', onClear);
    }

    return { onAdd, onClear, items: () => items.slice() };
  }

  const api = { attachCountdownUi, STORAGE_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkCountdownUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachCountdownUi({ document, window, localStorage: window.localStorage });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
