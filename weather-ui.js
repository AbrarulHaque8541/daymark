/*
 * Daymark weather glance UI wiring for the web prototype.
 *
 * A small offline-first card: the user types a place name and taps Refresh;
 * the current conditions come from the keyless Open-Meteo public API and the
 * last successful result stays cached on this device, so the card keeps
 * working offline with a "cached" note. Nothing ever refreshes on its own —
 * no polling, no timers, no battery drain. Mirrors the export-ui.js module
 * style: attachWeatherUi(env) is fully injectable for unit tests.
 */
((root) => {
  'use strict';

  const STORAGE_KEY = 'daymark.weather.v1';

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
    const copyEl = element('weather-copy');
    const statusEl = element('weather-status');
    const nowEl = element('weather-now');

    let busy = false;
    let cached = null;

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function setBusy(isBusy) {
      busy = isBusy;
      if (buttonEl) {
        buttonEl.disabled = isBusy;
        buttonEl.classList.toggle('is-busy', isBusy);
      }
    }

    function render(cache) {
      if (!nowEl || !cache) return;
      const place = cache.place;
      const weather = cache.weather;
      const placeLine = place.country ? `${place.name}, ${place.country}` : place.name;
      const text = `${placeLine} · ${Math.round(weather.temperatureC)}°C · ${weather.label}`
        + ` · Feels ${Math.round(weather.feelsLikeC)}°C · Wind ${Math.round(weather.windKph)} km/h`
        + ` · Humidity ${Math.round(weather.humidityPercent)}%`;
      nowEl.textContent = text;
      if (copyEl) copyEl.hidden = false;
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
    if (cached) {
      render(cached);
      status(`Cached · updated ${cached.fetchedAt.slice(0, 16).replace('T', ' ')} UTC`);
    } else {
      status('Type a place name and tap Refresh.');
    }

    if (buttonEl && typeof buttonEl.addEventListener === 'function') {
      buttonEl.addEventListener('click', () => { onRefresh(); });
    }
    if (copyEl && typeof copyEl.addEventListener === 'function') {
      copyEl.addEventListener('click', () => { onCopy(); });
    }

    async function onCopy() {
      if (!nowEl || !nowEl.textContent) return;
      const text = nowEl.textContent.trim();
      if (!text) return;
      try {
        if (win && win.navigator && win.navigator.clipboard && typeof win.navigator.clipboard.writeText === 'function') {
          await win.navigator.clipboard.writeText(text);
          status('Copied to clipboard.');
        } else {
          status('Copy is not available in this browser.');
        }
      } catch (error) {
        status('Could not copy.');
      }
    }

    return {
      onRefresh,
      onCopy,
      readCache,
      detach() {
        // No document-level listener is registered; the button reference is
        // dropped when the returned handle goes out of scope.
        setBusy(false);
      }
    };
  }

  const api = { attachWeatherUi, STORAGE_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkWeatherUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachWeatherUi({ document, window, localStorage: window.localStorage });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
