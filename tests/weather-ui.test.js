'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const weatherApi = require('../weather-logic.js');
const ui = require('../weather-ui.js');

const GEOCODING_BODY = JSON.stringify({
  results: [{ name: 'Kolkata', latitude: 22.5625, longitude: 88.375, country: 'India' }]
});
const FORECAST_BODY = JSON.stringify({
  current: {
    temperature_2m: 28.4, relative_humidity_2m: 64, apparent_temperature: 31.2,
    is_day: 1, weather_code: 2, wind_speed_10m: 11.3
  }
});

function fakeElement(tag) {
  return {
    tagName: tag,
    id: '',
    disabled: false,
    value: '',
    textContent: '',
    listeners: [],
    addEventListener(type, handler) { this.listeners.push({ type, handler }); },
    dispatchEvent(event) {
      for (const listener of this.listeners) {
        if (listener.type === event.type) listener.handler(event);
      }
      return !event.defaultPrevented;
    },
    click() {
      const clickEvent = { type: 'click', defaultPrevented: false };
      this.dispatchEvent(clickEvent);
      if (this.tagName !== 'button' || this.type !== 'submit' || !this.form) return clickEvent;
      this.form.submitCount += 1;
      const submitEvent = {
        type: 'submit',
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }
      };
      this.form.dispatchEvent(submitEvent);
      if (!submitEvent.defaultPrevented) this.form.navigationCount += 1;
      return submitEvent;
    }
  };
}

function fakeEnv(options) {
  const opts = options || {};
  const elements = {
    'weather-place': Object.assign(fakeElement('input'), { id: 'weather-place', value: opts.place || '' }),
    'weather-refresh': Object.assign(fakeElement('button'), { id: 'weather-refresh' }),
    'weather-form': Object.assign(fakeElement('form'), { id: 'weather-form' }),
    'weather-status': Object.assign(fakeElement('p'), { id: 'weather-status' }),
    'weather-now': Object.assign(fakeElement('div'), { id: 'weather-now' })
  };
  elements['weather-refresh'].type = 'submit';
  elements['weather-refresh'].form = elements['weather-form'];
  elements['weather-form'].submitCount = 0;
  elements['weather-form'].navigationCount = 0;
  const storageData = {};
  if (opts.stored !== undefined) storageData[ui.STORAGE_KEY] = opts.stored;
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { storageData[key] = String(value); }
  };
  const env = {
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; }
    },
    window: {},
    localStorage: storage,
    weatherApi,
    fetch: opts.fetch,
    now: () => '2026-11-03T12:00:00.000Z'
  };
  return { env, elements, storageData };
}

function okFetch(routes) {
  const seen = [];
  const impl = (url) => {
    seen.push(url);
    const route = routes.find((r) => url.startsWith(r.prefix));
    if (!route) return Promise.reject(new Error('unexpected url'));
    const body = typeof route.body === 'function' ? route.body(url) : route.body;
    if (typeof body === 'string') {
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) });
    }
    return Promise.resolve(body);
  };
  impl.seen = seen;
  return impl;
}

test('attach renders a cached forecast with a cached note', () => {
  const stored = JSON.stringify({
    version: 1,
    place: { name: 'Kolkata', country: 'India', latitude: 22.5625, longitude: 88.375 },
    weather: {
      temperatureC: 28.4, feelsLikeC: 31.2, windKph: 11.3, humidityPercent: 64,
      isDay: true, weatherCode: 2, label: 'Partly cloudy'
    },
    fetchedAt: '2026-11-02T09:30:00.000Z'
  });
  const { env, elements } = fakeEnv({ stored });
  const handle = ui.attachWeatherUi(env);
  assert.equal(elements['weather-now'].textContent,
    'Kolkata, India · 28°C · Partly cloudy · Feels 31°C · Wind 11 km/h · Humidity 64%');
  assert.ok(elements['weather-status'].textContent.startsWith('Cached · updated 2026-11-02 09:30 UTC'));
  assert.equal(typeof handle.onRefresh, 'function');
});

test('attach with no cache prompts the user to type a place', () => {
  const { env, elements } = fakeEnv({});
  ui.attachWeatherUi(env);
  assert.equal(elements['weather-now'].textContent, '');
  assert.equal(elements['weather-status'].textContent, 'Type a place name and tap Refresh.');
});

test('a corrupt cache is ignored instead of crashing', () => {
  const { env, elements } = fakeEnv({ stored: '{not json' });
  ui.attachWeatherUi(env);
  assert.equal(elements['weather-now'].textContent, '');
  assert.equal(elements['weather-status'].textContent, 'Type a place name and tap Refresh.');
});

test('refresh fetches, renders, and persists the result', async () => {
  const fetchImpl = okFetch([
    { prefix: weatherApi.GEOCODING_ENDPOINT, body: GEOCODING_BODY },
    { prefix: weatherApi.FORECAST_ENDPOINT, body: FORECAST_BODY }
  ]);
  const { env, elements, storageData } = fakeEnv({ place: 'Kolkata', fetch: fetchImpl });
  const handle = ui.attachWeatherUi(env);
  await handle.onRefresh();
  assert.equal(fetchImpl.seen.length, 2);
  assert.equal(elements['weather-now'].textContent,
    'Kolkata, India · 28°C · Partly cloudy · Feels 31°C · Wind 11 km/h · Humidity 64%');
  assert.equal(elements['weather-status'].textContent, 'Updated · 2026-11-03 12:00 UTC');
  assert.equal(elements['weather-refresh'].disabled, false);
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.ok(weatherApi.validateWeatherCache(saved));
  assert.equal(saved.weather.temperatureC, 28.4);
  assert.equal(saved.place.name, 'Kolkata');
});

test('an empty place field reuses the cached place name', async () => {
  const stored = JSON.stringify({
    version: 1,
    place: { name: 'Kolkata', country: 'India', latitude: 22.5625, longitude: 88.375 },
    weather: {
      temperatureC: 10, feelsLikeC: 9, windKph: 5, humidityPercent: 70,
      isDay: false, weatherCode: 0, label: 'Clear night'
    },
    fetchedAt: '2026-11-02T09:30:00.000Z'
  });
  const fetchImpl = okFetch([
    { prefix: weatherApi.GEOCODING_ENDPOINT, body: GEOCODING_BODY },
    { prefix: weatherApi.FORECAST_ENDPOINT, body: FORECAST_BODY }
  ]);
  const { env } = fakeEnv({ stored, fetch: fetchImpl });
  const handle = ui.attachWeatherUi(env);
  await handle.onRefresh();
  assert.ok(fetchImpl.seen[0].includes('name=Kolkata'));
});

test('refresh failure keeps the cached forecast visible', async () => {
  const stored = JSON.stringify({
    version: 1,
    place: { name: 'Kolkata', country: 'India', latitude: 22.5625, longitude: 88.375 },
    weather: {
      temperatureC: 10, feelsLikeC: 9, windKph: 5, humidityPercent: 70,
      isDay: false, weatherCode: 0, label: 'Clear night'
    },
    fetchedAt: '2026-11-02T09:30:00.000Z'
  });
  const failing = () => Promise.reject(new Error('offline'));
  const { env, elements } = fakeEnv({ place: 'Kolkata', stored, fetch: failing });
  const handle = ui.attachWeatherUi(env);
  await handle.onRefresh();
  assert.ok(elements['weather-status'].textContent.includes('Could not refresh: offline — showing cached weather.'));
  assert.equal(elements['weather-now'].textContent,
    'Kolkata, India · 10°C · Clear night · Feels 9°C · Wind 5 km/h · Humidity 70%');
  assert.equal(elements['weather-refresh'].disabled, false);
});

test('refresh failure with no cache reports the error plainly', async () => {
  const failing = () => Promise.reject(new Error('offline'));
  const { env, elements } = fakeEnv({ place: 'Kolkata', fetch: failing });
  const handle = ui.attachWeatherUi(env);
  await handle.onRefresh();
  assert.equal(elements['weather-status'].textContent, 'Could not refresh: offline');
  assert.equal(elements['weather-now'].textContent, '');
});

test('missing fetch support is reported instead of throwing', async () => {
  const { env, elements } = fakeEnv({ place: 'Kolkata' });
  const handle = ui.attachWeatherUi(env);
  await handle.onRefresh();
  assert.ok(elements['weather-status'].textContent.includes('fetch is unavailable'));
});

test('form submission prevents navigation and refreshes the forecast', async () => {
  const fetchImpl = okFetch([
    { prefix: weatherApi.GEOCODING_ENDPOINT, body: GEOCODING_BODY },
    { prefix: weatherApi.FORECAST_ENDPOINT, body: FORECAST_BODY }
  ]);
  const { env, elements } = fakeEnv({ place: 'Kolkata', fetch: fetchImpl });
  ui.attachWeatherUi(env);
  const submit = elements['weather-form'].listeners.find((listener) => listener.type === 'submit');
  assert.ok(submit, 'weather form should handle native submit events');
  let prevented = false;
  await submit.handler({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'native form navigation should be prevented');
  assert.equal(fetchImpl.seen.length, 2);
  assert.ok(elements['weather-now'].textContent.includes('Kolkata'));
});

test('activating the Refresh submit button sends one form event and prevents navigation', async () => {
  const fetchImpl = okFetch([
    { prefix: weatherApi.GEOCODING_ENDPOINT, body: GEOCODING_BODY },
    { prefix: weatherApi.FORECAST_ENDPOINT, body: FORECAST_BODY }
  ]);
  const { env, elements } = fakeEnv({ place: 'Kolkata', fetch: fetchImpl });
  ui.attachWeatherUi(env);
  const submitEvent = elements['weather-refresh'].click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements['weather-form'].submitCount, 1);
  assert.equal(submitEvent.defaultPrevented, true);
  assert.equal(elements['weather-form'].navigationCount, 0);
  assert.equal(fetchImpl.seen.length, 2);
});

test('the module exposes its API and stays inert under Node', () => {
  assert.equal(typeof ui.attachWeatherUi, 'function');
  assert.equal(ui.STORAGE_KEY, 'daymark.weather.v1');
  assert.equal(typeof globalThis.DaymarkWeatherUi, 'object');
});
