/*
 * Daymark weather glance UI wiring for the web prototype.
 *
 * A small offline-first card: the user types a place name and taps Refresh;
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
    const storage = env.localStorage || (win && win.localStorage) || null;
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

    function render(cache) {
      if (!nowEl || !cache) return;
      const place = cache.place;
      const weather = cache.weather;
      const placeLine = place.country ? `${place.name}, ${place.country}` : place.name;
      nowEl.textContent = `${placeLine} · ${Math.round(weather.temperatureC)}°C · ${weather.label}`
        + ` · Feels ${Math.round(weather.feelsLikeC)}°C · Wind ${Math.round(weather.windKph)} km/h`
        + ` · Humidity ${Math.round(weather.humidityPercent)}%`;
    }

    function readCache() {
      if (!storage || typeof storage.getItem !== 'function') return null;
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (weatherApi && typeof weatherApi.validateWeatherCache === 'function'
          && weatherApi.validateWeatherCache(parsed)) return parsed;
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
        if (parsed && typeof parsed.place === 'string' && parsed.place.trim()) return parsed;
      } catch (error) { /* ignore corrupt prefs */ }
      return null;
    }

    function persistPrefs(place) {
      if (!storage || typeof storage.setItem !== 'function' || !place || !place.trim()) return;
      storage.setItem(PREFS_KEY, JSON.stringify({ place: place.trim() }));
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
        status(`Updated · ${cached.fetchedAt.slice(0, 16).replace('T', ' ')} UTC`);
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

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        return onRefresh();
      });
    }
    if (buttonEl && typeof buttonEl.addEventListener === 'function') {
      buttonEl.addEventListener('click', () => { onRefresh(); });
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
        if (typeof inputEl.value === 'string') persistPrefs(inputEl.value);
      });
    }

    return {
      onRefresh,
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
    const boot = () => attachWeatherUi({ document, window, localStorage: window.localStorage });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
