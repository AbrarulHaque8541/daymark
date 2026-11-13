((root) => {
  'use strict';

  // Daylight planner UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view.
  //
  // The card markup is injected here instead of being hand-placed in
  // index.html, so the module can ship without touching shared markup files.
  // If a host page already provides the elements, they are reused as-is and
  // nothing is duplicated. Mirrors the air-quality-ui.js module style:
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
    heading.textContent = 'Daylight and UV';
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
      input.setAttribute('placeholder', 'City, e.g. Kanyakumari');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('aria-describedby', 'daylight-description');
    }
    form.appendChild(input);

    const checkButton = doc.createElement('button');
    checkButton.id = 'daylight-refresh';
    checkButton.className = 'button button-primary';
    if (checkButton.setAttribute) checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'daylight-clear';
    clearButton.className = 'button button-quiet';
    if (clearButton.setAttribute) clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    form.appendChild(clearButton);

    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'daylight-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') {
      statusLine.setAttribute('role', 'status');
      statusLine.setAttribute('aria-live', 'polite');
      statusLine.setAttribute('aria-atomic', 'true');
    }
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'daylight-result';
    result.className = 'feed-list';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = typeof doc.getElementById === 'function'
      ? (doc.getElementById('air-card') || doc.getElementById('weather-card'))
      : null;
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachDaylightUi(env) {
    if (!env || !env.document) throw new Error('attachDaylightUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const daylightApi = env.daylightApi || root.DaymarkDaylight || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const inputEl = element('daylight-place');
    const buttonEl = element('daylight-refresh');
    const formEl = element('daylight-form');
    const statusEl = element('daylight-status');
    const resultEl = element('daylight-result');
    const clearEl = element('daylight-clear');

    let busy = false;

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function setBusy(isBusy) {
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

    function render(record) {
      if (!resultEl || !record) return;
      const place = record.place;
      const daylight = record.daylight;
      const placeLine = place.country ? place.name + ', ' + place.country : place.name;
      const lines = daylight.days.map((day, index) => {
        const dayLabel = index === 0 ? 'Today' : '+' + index + 'd';
        return dayLabel + ' sunrise ' + day.sunriseClock + ', sunset ' + day.sunsetClock
          + ' (' + day.durationLabel + '), UV max ' + day.uvMax + ' (' + day.uvBand + ')';
      });
      const suffix = daylight.timezone ? ' · local time (' + daylight.timezone + ')' : ' · local time';
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
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        status('Could not check: ' + message);
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      if (busy) return;
      if (inputEl && typeof inputEl.value === 'string') inputEl.value = '';
      if (resultEl) resultEl.textContent = '';
      status('Cleared. Type a place name and tap Check.');
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

    return {
      onCheck,
      onClear,
      detach() {
        setBusy(false);
      }
    };
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
