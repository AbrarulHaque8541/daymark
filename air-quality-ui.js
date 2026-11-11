((root) => {
  'use strict';

  // Air-quality glance UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view. Mirrors
  // the weather-ui.js module style: attachAirQualityUi(env) is fully
  // injectable for unit tests.

  function attachAirQualityUi(env) {
    if (!env || !env.document) throw new Error('attachAirQualityUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const airApi = env.airApi || root.DaymarkAirQuality || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

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

    function render(record) {
      if (!resultEl || !record) return;
      const place = record.place;
      const air = record.air;
      const placeLine = place.country ? place.name + ', ' + place.country : place.name;
      resultEl.textContent = placeLine
        + ' · European AQI ' + air.europeanAqi + ' (' + air.europeanBand + ')'
        + ' · US AQI ' + air.usAqi + ' (' + air.usBand + ')'
        + ' · PM2.5 ' + air.pm25 + ' µg/m³';
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

  const api = { attachAirQualityUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkAirQualityUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachAirQualityUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
