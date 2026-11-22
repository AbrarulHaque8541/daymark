((root) => {
  'use strict';

  // Daylight planner UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key and no boot-time storage reads. Clear only empties the view.
  // attachDaylightUi(env) is fully injectable for unit tests.

  const CARD_ID = 'daylight-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('daylight card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'daylight-heading');

    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);

    const heading = doc.createElement('h2');
    heading.id = 'daylight-heading';
    heading.textContent = 'Daylight & UV, keyless';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'daylight-description';
    description.textContent = 'Before Check: the typed place is sent to Open-Meteo Geocoding. The resolved coordinates are then sent to Open-Meteo Forecast for sunrise, sunset and UV data. This happens only after you tap Check. No place or result is saved on this device. No account or API key.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'daylight-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');

    const label = doc.createElement('label');
    label.className = 'sr-only';
    if (typeof label.setAttribute === 'function') label.setAttribute('for', 'daylight-place');
    label.textContent = 'Place name';
    form.appendChild(label);

    const input = doc.createElement('input');
    input.id = 'daylight-place';
    if (input.setAttribute) {
      input.setAttribute('name', 'place');
      input.setAttribute('type', 'text');
      input.setAttribute('maxlength', '80');
      input.setAttribute('placeholder', 'Place name');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('aria-describedby', 'daylight-description');
    }
    form.appendChild(input);

    const checkButton = doc.createElement('button');
    checkButton.id = 'daylight-refresh';
    checkButton.className = 'button button-primary';
    if (checkButton.setAttribute) {
      checkButton.setAttribute('type', 'submit');
      checkButton.setAttribute('title', 'Check daylight and UV for the place');
    }
    checkButton.textContent = 'Check';
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'daylight-clear';
    clearButton.className = 'button button-quiet';
    if (clearButton.setAttribute) {
      clearButton.setAttribute('type', 'button');
      clearButton.setAttribute('title', 'Clear the daylight view');
    }
    clearButton.textContent = 'Clear';
    form.appendChild(clearButton);

    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'daylight-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') {
      statusLine.setAttribute('role', 'status');
      statusLine.setAttribute('aria-live', 'polite');
    }
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'daylight-result';
    result.className = 'feed-result';
    aside.appendChild(result);

    return aside;
  }

  function attachDaylightUi(env) {
    const doc = env && env.document;
    if (!doc) throw new Error('daylight UI needs a document');
    const win = env.window || (typeof window !== 'undefined' ? window : null);
    const daylightApi = env.daylightApi || (win && win.DaymarkDaylight) || null;
    const fetchImpl = env.fetch || (win && win.fetch) || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();

    const card = ensureCard(doc);
    const air = doc.getElementById && doc.getElementById('air-card');
    const weather = doc.getElementById && doc.getElementById('weather-card');
    const anchor = air || weather;
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(card, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(card);
    }

    const inputEl = doc.getElementById('daylight-place');
    const buttonEl = doc.getElementById('daylight-refresh');
    const clearEl = doc.getElementById('daylight-clear');
    const formEl = doc.getElementById('daylight-form');
    const statusEl = doc.getElementById('daylight-status');
    const resultEl = doc.getElementById('daylight-result');

    let busy = false;
    function setBusy(isBusy) {
      busy = isBusy;
      if (buttonEl) {
        buttonEl.disabled = isBusy;
        if (buttonEl.classList && typeof buttonEl.classList.toggle === 'function') {
          buttonEl.classList.toggle('is-busy', isBusy);
          if (clearEl && clearEl.classList) clearEl.classList.toggle('is-busy', isBusy);
        }
      }
    }

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function render(record) {
      if (!resultEl || !record || !record.daily) return;
      const lines = [];
      const daily = record.daily;
      for (let i = 0; i < Math.min(3, daily.sunrise.length); i++) {
        const rise = (daily.sunrise[i] || '').slice(11, 16);
        const set = (daily.sunset[i] || '').slice(11, 16);
        const uv = daily.uv_index_max[i];
        const label = i === 0 ? 'Today' : '+' + i + 'd';
        lines.push(label + ' sunrise ' + rise + ', sunset ' + set
          + ' (' + (record.dayLengths && record.dayLengths[i] || '') + '), UV max ' + uv
          + (record.uvCategories && record.uvCategories[i] ? ' (' + record.uvCategories[i] + ')' : ''));
      }
      const placeLine = record.place || '';
      const suffix = record.timezone ? ' · local time (' + record.timezone + ')' : ' · local time';
      resultEl.textContent = placeLine + ' · ' + lines.join(' · ') + suffix;
    }

    async function onCheck() {
      if (busy) return;
      if (!daylightApi || typeof daylightApi.fetchDaylightByPlace !== 'function') {
        status('Daylight planning is unavailable.');
        return;
      }
      if (!fetchImpl) {
        status('Could not check: fetch is unavailable in this browser.');
        return;
      }
      const typed = inputEl && typeof inputEl.value === 'string' ? inputEl.value : '';
      if (!typed.trim()) {
        status('Type a place name first.');
        return;
      }
      setBusy(true);
      try {
        const record = await daylightApi.fetchDaylightByPlace(typed, fetchImpl, { now: now });
        render(record);
        status('Updated · ' + record.fetchedAt.slice(0, 16).replace('T', ' ')
          + ' UTC · not saved on this device');
        if (statusEl && statusEl.classList && typeof statusEl.classList.add === 'function') {
          statusEl.classList.add('is-success');
          if (typeof statusEl.setAttribute === 'function') statusEl.setAttribute('title', 'Daylight and UV updated');
          setTimeout(() => {
            if (statusEl.classList) statusEl.classList.remove('is-success');
            if (typeof statusEl.removeAttribute === 'function') statusEl.removeAttribute('title');
          }, 1400);
        }
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        status('Could not check: ' + message);
        if (statusEl && statusEl.classList && typeof statusEl.classList.remove === 'function') {
          statusEl.classList.remove('is-success');
          if (typeof statusEl.removeAttribute === 'function') statusEl.removeAttribute('title');
        }
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      if (busy) return;
      if (inputEl && typeof inputEl.value === 'string') inputEl.value = '';
      if (resultEl) resultEl.textContent = '';
      status('Cleared. Type a place name and tap Check.');
      if (statusEl && statusEl.classList && typeof statusEl.classList.remove === 'function') {
        statusEl.classList.remove('is-success');
        if (typeof statusEl.removeAttribute === 'function') statusEl.removeAttribute('title');
      }
    }

    status('Type a place name and tap Check.');

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        return onCheck();
      });
    }
    if (buttonEl && typeof buttonEl.addEventListener === 'function') {
      buttonEl.addEventListener('click', () => { onCheck(); });
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }
    if (inputEl && typeof inputEl.addEventListener === 'function') {
      inputEl.addEventListener('keydown', (event) => {
        if (event && (event.key === 'Enter' || event.keyCode === 13)) {
          if (typeof event.preventDefault === 'function') event.preventDefault();
          onCheck();
        }
      });
    }

    return { onCheck, onClear, detach() {} };
  }

  const api = { attachDaylightUi, ensureCard, CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkDaylightUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachDaylightUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
