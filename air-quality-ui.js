((root) => {
  'use strict';

  // Air-quality glance UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view.
  //
  // The card markup is injected here instead of being hand-placed in
  // index.html, so the module can ship without touching shared markup files.
  // If a host page already provides the elements, they are reused as-is and
  // nothing is duplicated. Mirrors the weather-ui.js module style:
  // attachAirQualityUi(env) is fully injectable for unit tests.

  const CARD_ID = 'air-card';

  function bandClass(band) {
    if (!band || typeof band !== 'string') return 'aqi-unknown';
    const lower = band.toLowerCase();
    if (lower.indexOf('good') !== -1) return 'aqi-good';
    if (lower.indexOf('fair') !== -1 || lower.indexOf('moderate') !== -1) return 'aqi-moderate';
    if (lower.indexOf('poor') !== -1 || lower.indexOf('unhealthy') !== -1) return 'aqi-poor';
    if (lower.indexOf('very') !== -1 || lower.indexOf('hazardous') !== -1 || lower.indexOf('extremely') !== -1) return 'aqi-severe';
    return 'aqi-unknown';
  }

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('air-quality card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card air-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'air-heading');

    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);

    const heading = doc.createElement('h2');
    heading.id = 'air-heading';
    heading.textContent = 'Air quality now';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.textContent = 'Open-Meteo air quality — no account, no API key. Fetched on Check; not saved on this device.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'air-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');

    const label = doc.createElement('label');
    label.className = 'sr-only';
    if (typeof label.setAttribute === 'function') label.setAttribute('for', 'air-place');
    label.textContent = 'Place name';
    form.appendChild(label);

    const input = doc.createElement('input');
    input.id = 'air-place';
    if (input.setAttribute) {
      input.setAttribute('name', 'place');
      input.setAttribute('type', 'text');
      input.setAttribute('maxlength', '80');
      input.setAttribute('placeholder', 'City, e.g. Delhi');
      input.setAttribute('autocomplete', 'off');
    }
    form.appendChild(input);

    const checkButton = doc.createElement('button');
    checkButton.id = 'air-refresh';
    checkButton.className = 'button button-primary';
    if (checkButton.setAttribute) checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'air-clear';
    clearButton.className = 'button button-quiet';
    if (clearButton.setAttribute) clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    form.appendChild(clearButton);

    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'air-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') statusLine.setAttribute('role', 'status');
    if (typeof statusLine.setAttribute === 'function') statusLine.setAttribute('aria-live', 'polite');
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'air-result';
    result.className = 'air-result';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const weatherCard = typeof doc.getElementById === 'function' ? doc.getElementById('weather-card') : null;
    if (weatherCard && weatherCard.parentNode && typeof weatherCard.parentNode.insertBefore === 'function') {
      weatherCard.parentNode.insertBefore(aside, weatherCard.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachAirQualityUi(env) {
    if (!env || !env.document) throw new Error('attachAirQualityUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const airApi = env.airApi || root.DaymarkAirQuality || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const inputEl = element('air-place');
    const buttonEl = element('air-refresh');
    const formEl = element('air-form');
    const statusEl = element('air-status');
    const resultEl = element('air-result');
    const clearEl = element('air-clear');

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
        }
        if (typeof buttonEl.setAttribute === 'function') {
          if (isBusy) buttonEl.setAttribute('aria-busy', 'true');
          else buttonEl.removeAttribute('aria-busy');
        }
      }
    }

    function clearResult() {
      if (!resultEl) return;
      if (typeof resultEl.replaceChildren === 'function') resultEl.replaceChildren();
      else if (resultEl.children) {
        while (resultEl.children.length) resultEl.removeChild(resultEl.children[0]);
      }
      resultEl.textContent = '';
    }

    function makeLine(label, value, band) {
      const line = doc.createElement ? doc.createElement('div') : { className: '', textContent: '', appendChild() {} };
      line.className = 'air-line';
      const labelEl = doc.createElement ? doc.createElement('span') : { className: '', textContent: '' };
      labelEl.className = 'air-label';
      labelEl.textContent = label;
      const valueEl = doc.createElement ? doc.createElement('span') : { className: '', textContent: '' };
      valueEl.className = 'air-value ' + bandClass(band);
      valueEl.textContent = value + (band ? ' (' + band + ')' : '');
      if (line.appendChild) {
        line.appendChild(labelEl);
        line.appendChild(valueEl);
      }
      return line;
    }

    function render(record) {
      if (!resultEl || !record) return;
      const place = record.place;
      const air = record.air;
      const placeLine = place.country ? place.name + ', ' + place.country : place.name;

      clearResult();

      const placeEl = doc.createElement ? doc.createElement('div') : null;
      if (placeEl) {
        placeEl.className = 'air-place';
        placeEl.textContent = placeLine;
        if (resultEl.appendChild) resultEl.appendChild(placeEl);
      }

      if (resultEl.appendChild && doc.createElement) {
        resultEl.appendChild(makeLine('European AQI', String(air.europeanAqi), air.europeanBand));
        resultEl.appendChild(makeLine('US AQI', String(air.usAqi), air.usBand));
        resultEl.appendChild(makeLine('PM2.5', String(air.pm25) + ' µg/m³', null));
      }

      // Always keep a plain-text summary for screen readers and simple hosts.
      const summary = placeLine
        + ' · European AQI ' + air.europeanAqi + ' (' + air.europeanBand + ')'
        + ' · US AQI ' + air.usAqi + ' (' + air.usBand + ')'
        + ' · PM2.5 ' + air.pm25 + ' µg/m³';
      if (!resultEl.textContent || resultEl.children && resultEl.children.length === 0) {
        resultEl.textContent = summary;
      } else if (typeof resultEl.setAttribute === 'function') {
        resultEl.setAttribute('aria-label', summary);
      }
    }

    async function onCheck() {
      if (busy) return;
      if (!airApi || typeof airApi.fetchAirQualityByPlace !== 'function') {
        status('Air quality is unavailable.');
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
        const record = await airApi.fetchAirQualityByPlace(typed, fetchImpl, { now: now });
        render(record);
        status('Updated · ' + record.fetchedAt.slice(0, 16).replace('T', ' ')
          + ' UTC · not saved on this device');
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        status('Could not check: ' + message);
        clearResult();
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      if (busy) return;
      if (inputEl && typeof inputEl.value === 'string') inputEl.value = '';
      clearResult();
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

  const api = { attachAirQualityUi, ensureCard, CARD_ID, bandClass };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkAirQualityUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachAirQualityUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
