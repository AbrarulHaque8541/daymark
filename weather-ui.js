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
      if (!nowEl || !cache) return;
      const place = cache.place;
      const weather = cache.weather;
      const placeLine = place.country ? `${place.name}, ${place.country}` : place.name;
      nowEl.textContent = `${placeLine} · ${Math.round(weather.temperatureC)}°C · ${weather.label}`
        + ` · Feels ${Math.round(weather.feelsLikeC)}°C · Wind ${Math.round(weather.windKph)} km/h`
        + ` · Humidity ${Math.round(weather.humidityPercent)}%`;
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
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        return { key, state: 'corrupt', raw, value: null };
      }
      if (!validate(parsed)) return { key, state: 'corrupt', raw, value: null };
      return { key, state: 'valid', raw, value: parsed };
    }

    function storageNotice() {
      if (!storageRequested) return '';
      if (storageAccessFailed) return ' · browser storage is unavailable';
      if (storageReadFailed) return ' · saved weather data could not be read';
      if (storageConflict) return ' · saved data changed elsewhere and was preserved';
      const problems = [];
      if (cacheRecord && cacheRecord.state === 'corrupt') {
        problems.push('saved weather data is unreadable and was preserved');
      }
      if (prefsRecord && prefsRecord.state === 'corrupt') {
        problems.push('saved place preferences are unreadable and were preserved');
      }
      if (storageWriteFailed) problems.push('changes could not be saved in this browser');
      return problems.length ? ' · ' + problems.join('; ') : '';
    }

    function persistRecord(record, value) {
      if (!storageRequested) return true;
      if (!record || record.state !== 'absent' && record.state !== 'valid') return false;
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
        weatherApi && typeof weatherApi.validateWeatherCache === 'function'
        && weatherApi.validateWeatherCache(parsed)
      ));
      return cacheRecord.value;
    }

    function persistCache(cache) {
      return persistRecord(cacheRecord, cache);
    }

    function readPrefs() {
      prefsRecord = readRecord(PREFS_KEY, (parsed) => !!(
        parsed && typeof parsed.place === 'string' && parsed.place.trim()
      ));
      return prefsRecord.value;
    }

    function persistPrefs(place) {
      if (!place || !place.trim()) return true;
      return persistRecord(prefsRecord, { place: place.trim() });
    }

    async function onRefresh() {
      if (busy) return;
      if (!weatherApi || typeof weatherApi.fetchWeatherByPlace !== 'function') {
        status('Weather is unavailable.');
        return;
      }
      if (!fetchImpl) {
        status('Could not refresh: fetch is unavailable in this browser.');
        return;
      }
      const typed = inputEl && typeof inputEl.value === 'string' ? inputEl.value : '';
      let query = typed;
      if (!query.trim() && cached) query = cached.place.name;
      if (!query.trim()) {
        status('Type a place name first.');
        return;
      }
      setBusy(true);
      try {
        const result = await weatherApi.fetchWeatherByPlace(query, fetchImpl, { now });
        cached = result;
        persistCache(cached);
        persistPrefs(query);
        render(cached);
        status(`Updated · ${cached.fetchedAt.slice(0, 16).replace('T', ' ')} UTC` + storageNotice());
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        if (cached) {
          render(cached);
          status(`Could not refresh: ${message} — showing cached weather.`);
        } else {
          status(`Could not refresh: ${message}`);
        }
      } finally {
        setBusy(false);
      }
    }

    function clearView() {
      cached = null;
      if (inputEl && typeof inputEl.value === 'string') inputEl.value = '';
      if (nowEl) nowEl.textContent = '';
    }

    function onClear() {
      // Clearing is explicit, but never report success unless both owned keys
      // were verified and removed. A partial failure attempts to restore both.
      if (busy) return;
      if (!storageRequested) {
        clearView();
        status('Weather cleared from this view; browser storage is unavailable.');
        return;
      }
      if (!storage || storageAccessFailed || !cacheRecord || !prefsRecord
        || cacheRecord.state === 'unreadable' || prefsRecord.state === 'unreadable') {
        status('Could not verify saved weather; nothing was cleared.' + storageNotice());
        return;
      }
      if (typeof storage.getItem !== 'function') {
        storageReadFailed = true;
        status('Could not verify saved weather; nothing was cleared.' + storageNotice());
        return;
      }
      const records = [cacheRecord, prefsRecord];
      const current = [];
      try {
        for (const record of records) current.push(storage.getItem(record.key));
      } catch (error) {
        storageReadFailed = true;
        status('Could not verify saved weather; nothing was cleared.' + storageNotice());
        return;
      }
      if (records.some((record, index) => current[index] !== record.raw)) {
        storageConflict = true;
        status('Could not clear saved weather because it changed elsewhere; current data was kept.' + storageNotice());
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
        storageWriteFailed = true;
        let rollbackFailed = false;
        for (const record of records) {
          try {
            if (record.raw === null) {
              if (typeof storage.removeItem === 'function') storage.removeItem(record.key);
            } else {
              if (typeof storage.setItem !== 'function') throw new Error('setItem is unavailable');
              storage.setItem(record.key, record.raw);
            }
          } catch (rollbackError) {
            rollbackFailed = true;
          }
        }
        status((rollbackFailed
          ? 'Could not clear saved weather; storage may be partially changed.'
          : 'Could not clear saved weather; previous saved data was restored where possible.')
          + storageNotice());
        return;
      }
      cacheRecord = { key: STORAGE_KEY, state: 'absent', raw: null, value: null };
      prefsRecord = { key: PREFS_KEY, state: 'absent', raw: null, value: null };
      clearView();
      status('Weather cleared on this device. Type a place name and tap Refresh.');
    }

    cached = readCache();
    const prefs = readPrefs();
    if (prefs && inputEl && typeof inputEl.value === 'string') {
      inputEl.value = prefs.place;
    }
    if (cached) {
      render(cached);
      status(`Cached · updated ${cached.fetchedAt.slice(0, 16).replace('T', ' ')} UTC`);
    } else if (prefs) {
      status('Last place restored. Tap Refresh for current conditions.');
    } else {
      status('Type a place name and tap Refresh.');
    }
    if (storageNotice()) status((statusEl && statusEl.textContent || 'Weather is ready.') + storageNotice());

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        return onRefresh();
      });
    }
    if (buttonEl && typeof buttonEl.addEventListener === 'function') {
      buttonEl.addEventListener('click', () => { onRefresh(); });
    }

    // Clear removes this card's cached forecast and saved place on demand.
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }

    // Enter on the place field starts the same refresh (keyboard efficiency).
    if (inputEl && typeof inputEl.addEventListener === 'function') {
      inputEl.addEventListener('keydown', (event) => {
        if (event && (event.key === 'Enter' || event.keyCode === 13)) {
          if (typeof event.preventDefault === 'function') event.preventDefault();
          onRefresh();
        }
      });
      inputEl.addEventListener('input', () => {
        if (typeof inputEl.value === 'string' && !persistPrefs(inputEl.value)) {
          status('Place preference was not saved.' + storageNotice());
        }
      });
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

  const api = { attachWeatherUi, STORAGE_KEY, PREFS_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkWeatherUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachWeatherUi({ document, window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
