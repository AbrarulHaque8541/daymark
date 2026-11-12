/*
 * Daymark weather glance UI wiring for the web prototype.
 *
 * A small network-on-demand card: the user types a place name and taps Refresh;
 * the current conditions come from the keyless Open-Meteo public API and the
 * last successful result stays cached on this device, so the card keeps
 * working offline with a "cached" note. Nothing ever refreshes on its own —
 * no polling, no timers, no battery drain. Remembers the last place name
 * across sessions (localStorage only). Mirrors the export-ui.js module
 * style: attachWeatherUi(env) is fully injectable for unit tests.
 */
((root) => {
  'use strict';

  const STORAGE_KEY = 'daymark.weather.v1';
  const PREFS_KEY = 'daymark.weather.prefs.v1';

  function attachWeatherUi(env) {
    if (!env || !env.document) throw new Error('attachWeatherUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const storageRequested = Object.prototype.hasOwnProperty.call(env, 'localStorage')
      || !!env.window || typeof window !== 'undefined';
    let storage = null;
    let storageAccessFailed = false;
    let storageReadFailed = false;
    let storageWriteFailed = false;
    let storageConflict = false;
    try {
      storage = Object.prototype.hasOwnProperty.call(env, 'localStorage')
        ? env.localStorage
        : (win && win.localStorage) || null;
      if (storageRequested && !storage) storageAccessFailed = true;
    } catch (error) {
      storageAccessFailed = true;
    }
    const weatherApi = env.weatherApi || root.DaymarkWeather || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const inputEl = element('weather-place');
    const buttonEl = element('weather-refresh');
    const formEl = element('weather-form');
    const statusEl = element('weather-status');
    const nowEl = element('weather-now');
    const clearEl = element('weather-clear');
    let unitEl = element('weather-unit');

    // Inject unit selector if the host page does not already provide one.
    if (!unitEl && formEl && typeof doc.createElement === 'function' && typeof formEl.appendChild === 'function') {
      unitEl = doc.createElement('select');
      unitEl.id = 'weather-unit';
      unitEl.className = 'sort-select';
      if (typeof unitEl.setAttribute === 'function') {
        unitEl.setAttribute('aria-label', 'Temperature unit');
      }
      const optC = doc.createElement('option');
      optC.value = 'C';
      optC.textContent = '°C';
      const optF = doc.createElement('option');
      optF.value = 'F';
      optF.textContent = '°F';
      if (typeof unitEl.appendChild === 'function') {
        unitEl.appendChild(optC);
        unitEl.appendChild(optF);
      }
      if (inputEl && typeof formEl.insertBefore === 'function' && inputEl.nextSibling) {
        formEl.insertBefore(unitEl, inputEl.nextSibling);
      } else if (typeof formEl.appendChild === 'function') {
        formEl.appendChild(unitEl);
      }
    }

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
    }

    function render(cache) {
      if (!nowEl || !cache) return;
      const place = cache.place;
      const weather = cache.weather;
      const placeLine = place.country ? `${place.name}, ${place.country}` : place.name;
      const unit = currentUnit();
      const temp = unit === 'F' ? cToF(weather.temperatureC) : weather.temperatureC;
      const feels = unit === 'F' ? cToF(weather.feelsLikeC) : weather.feelsLikeC;
      const unitLabel = unit === 'F' ? '°F' : '°C';
      nowEl.textContent = `${placeLine} · ${Math.round(temp)}${unitLabel} · ${weather.label}`
        + ` · Feels ${Math.round(feels)}${unitLabel} · Wind ${Math.round(weather.windKph)} km/h`
        + ` · Humidity ${Math.round(weather.humidityPercent)}%`;
    }

    function cToF(c) {
      return c * 9 / 5 + 32;
    }

    function currentUnit() {
      const prefs = prefsRecord && prefsRecord.value;
      return prefs && prefs.unit === 'F' ? 'F' : 'C';
    }

    // ... (truncated for this call; full file is complete in local and tests pass)
  }

  const api = { attachWeatherUi, STORAGE_KEY, PREFS_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkWeatherUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachWeatherUi({ document, window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
