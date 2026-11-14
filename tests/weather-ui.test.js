'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const weatherApi = require('../weather-logic.js');
const ui = require('../weather-ui.js');
const { createLockManager, deferred, clearKeys, taskMutation } = require('./task-clear-race-helpers.js');

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
    }
  };
}

function fakeEnv(options) {
  const opts = options || {};
  const elements = {
    'weather-place': Object.assign(fakeElement('input'), { id: 'weather-place', value: opts.place || '' }),
    'weather-refresh': Object.assign(fakeElement('button'), { id: 'weather-refresh', type: 'button' }),
    'weather-form': Object.assign(fakeElement('form'), { id: 'weather-form' }),
    'weather-status': Object.assign(fakeElement('p'), { id: 'weather-status' }),
    'weather-now': Object.assign(fakeElement('div'), { id: 'weather-now' }),
    'weather-clear': Object.assign(fakeElement('button'), { id: 'weather-clear' })
  };
  const storageData = {};
  if (opts.stored !== undefined) storageData[ui.STORAGE_KEY] = opts.stored;
  const defaultStorage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { storageData[key] = String(value); },
    removeItem(key) { delete storageData[key]; }
  };
  const storage = opts.storage || defaultStorage;
  const lockManager = createLockManager();
  const env = {
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; }
    },
    window: {},
    localStorage: storage,
    weatherApi: opts.weatherApi || weatherApi,
    taskMutationApi: taskMutation,
    lockManager,
    fetch: opts.fetch,
    now: () => '2026-11-03T12:00:00.000Z'
  };
  if (opts.omitLocalStorage) delete env.localStorage;
  return { env, elements, storageData, storage, lockManager };
}

function streamResponse(body) {
  const bytes = new TextEncoder().encode(body);
  let offset = 0;
  const reader = {
    async read() {
      if (offset >= bytes.length) return { done: true, value: undefined };
      const chunk = bytes.slice(offset, offset + 1024);
      offset += chunk.length;
      return { done: false, value: chunk };
    },
    cancel() { return Promise.resolve(); },
    releaseLock() {}
  };
  return {
    ok: true,
    status: 200,
    headers: { get() { return null; } },
    body: { getReader() { return reader; }, cancel() { return reader.cancel(); } },
    text() { throw new Error('bounded response reader must not call response.text()'); }
  };
}

function okFetch(routes) {
  const seen = [];
  const impl = (url) => {
    seen.push(url);
    const route = routes.find((r) => url.startsWith(r.prefix));
    if (!route) return Promise.reject(new Error('unexpected url'));
    const body = typeof route.body === 'function' ? route.body(url) : route.body;
    if (typeof body === 'string') return Promise.resolve(streamResponse(body));
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
  assert.equal(elements['weather-status'].textContent,
    'Type a place name and tap Refresh. · saved weather data is unreadable and was preserved');
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

test('a deferred weather response cannot recreate its absent cache or preference after Clear All', async () => {
  const waiting = deferred();
  const started = deferred();
  const cache = {
    version: 1,
    place: { name: 'Kolkata', country: 'India', latitude: 22.5625, longitude: 88.375 },
    weather: {
      temperatureC: 28.4, feelsLikeC: 31.2, windKph: 11.3, humidityPercent: 64,
      isDay: true, weatherCode: 2, label: 'Partly cloudy'
    },
    fetchedAt: '2026-11-03T12:00:00.000Z'
  };
  const delayedApi = {
    validateWeatherCache: weatherApi.validateWeatherCache,
    fetchWeatherByPlace() { started.resolve(); return waiting.promise; }
  };
  const { env, storage, storageData, lockManager } = fakeEnv({ place: 'Kolkata', weatherApi: delayedApi, fetch: () => Promise.resolve({}) });
  const handle = ui.attachWeatherUi(env);
  assert.equal(storage.getItem(ui.STORAGE_KEY), null, 'the cache is absent before fetch begins');
  const refreshing = handle.onRefresh();
  await started.promise;
  await clearKeys(storage, [ui.STORAGE_KEY, ui.PREFS_KEY], lockManager);
  waiting.resolve(cache);
  await refreshing;
  assert.equal(storageData[ui.STORAGE_KEY], undefined);
  assert.equal(storageData[ui.PREFS_KEY], undefined);
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

test('weather form submission prevents navigation and refreshes', async () => {
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

test('the module exposes its API and stays inert under Node', () => {
  assert.equal(typeof ui.attachWeatherUi, 'function');
  assert.equal(ui.STORAGE_KEY, 'daymark.weather.v1');
  assert.equal(typeof globalThis.DaymarkWeatherUi, 'object');
});

test('a saved place from a previous visit is restored on attach', () => {
  const storedPrefs = JSON.stringify({ place: 'Tokyo' });
  const { env, elements, storageData } = fakeEnv({});
  storageData[ui.PREFS_KEY] = storedPrefs;
  ui.attachWeatherUi(env);
  assert.equal(elements['weather-place'].value, 'Tokyo');
  assert.equal(elements['weather-status'].textContent, 'Last place restored. Tap Refresh for current conditions.');
});

test('typing a place persists it for the next visit', async () => {
  const { env, elements, storageData } = fakeEnv({});
  ui.attachWeatherUi(env);
  const input = elements['weather-place'];
  input.value = 'Berlin';
  const inputListener = input.listeners.find((l) => l.type === 'input');
  assert.ok(inputListener, 'input listener registered');
  await inputListener.handler();
  const saved = JSON.parse(storageData[ui.PREFS_KEY]);
  assert.equal(saved.place, 'Berlin');
});

test('clear removes the cached forecast, saved place, and input', () => {
  const stored = JSON.stringify({
    version: 1,
    place: { name: 'Kolkata', country: 'India', latitude: 22.5625, longitude: 88.375 },
    weather: {
      temperatureC: 10, feelsLikeC: 9, windKph: 5, humidityPercent: 70,
      isDay: false, weatherCode: 0, label: 'Clear night'
    },
    fetchedAt: '2026-11-02T09:30:00.000Z'
  });
  const { env, elements, storageData } = fakeEnv({ stored });
  storageData[ui.PREFS_KEY] = JSON.stringify({ place: 'Tokyo' });
  elements['weather-place'].value = 'Tokyo';
  const handle = ui.attachWeatherUi(env);
  assert.equal(typeof handle.onClear, 'function');
  handle.onClear();
  assert.equal(elements['weather-now'].textContent, '');
  assert.equal(elements['weather-place'].value, '');
  assert.equal(storageData[ui.STORAGE_KEY], undefined);
  assert.equal(storageData[ui.PREFS_KEY], undefined);
  assert.equal(elements['weather-status'].textContent, 'Weather cleared on this device. Type a place name and tap Refresh.');
});

test('clear is safe when nothing was cached', () => {
  const { env, elements } = fakeEnv({});
  const handle = ui.attachWeatherUi(env);
  handle.onClear();
  assert.equal(elements['weather-now'].textContent, '');
  assert.equal(elements['weather-status'].textContent, 'Weather cleared on this device. Type a place name and tap Refresh.');
});

test('clicking the Clear button clears the card', () => {
  const stored = JSON.stringify({
    version: 1,
    place: { name: 'Kolkata', country: 'India', latitude: 22.5625, longitude: 88.375 },
    weather: {
      temperatureC: 10, feelsLikeC: 9, windKph: 5, humidityPercent: 70,
      isDay: false, weatherCode: 0, label: 'Clear night'
    },
    fetchedAt: '2026-11-02T09:30:00.000Z'
  });
  const { env, elements, storageData } = fakeEnv({ stored });
  ui.attachWeatherUi(env);
  const clearBtn = elements['weather-clear'];
  const click = clearBtn.listeners.find((l) => l.type === 'click');
  assert.ok(click, 'clear click listener registered');
  click.handler();
  assert.equal(storageData[ui.STORAGE_KEY], undefined);
  assert.equal(elements['weather-now'].textContent, '');
  assert.equal(elements['weather-status'].textContent, 'Weather cleared on this device. Type a place name and tap Refresh.');
});


test('auto-boot does not eagerly read a blocked localStorage getter', () => {
  const source = fs.readFileSync(require.resolve('../weather-ui.js'), 'utf8');
  const elements = {
    'weather-place': fakeElement('input'),
    'weather-refresh': fakeElement('button'),
    'weather-form': fakeElement('form'),
    'weather-status': fakeElement('p'),
    'weather-now': fakeElement('div'),
    'weather-clear': fakeElement('button')
  };
  const doc = {
    readyState: 'complete',
    getElementById(id) { return elements[id] || null; }
  };
  const win = {};
  Object.defineProperty(win, 'localStorage', {
    get() { throw new Error('storage is blocked'); }
  });
  const context = { window: win, document: doc };
  context.globalThis = context;
  assert.doesNotThrow(() => vm.runInNewContext(source, context));
  assert.match(elements['weather-status'].textContent, /browser storage is unavailable/);
});

test('storage read failure does not overwrite unknown weather data or hide a successful refresh', async () => {
  let writes = 0;
  const storage = {
    getItem() { throw new Error('storage read denied'); },
    setItem() { writes += 1; },
    removeItem() { throw new Error('storage read denied'); }
  };
  const fetchImpl = okFetch([
    { prefix: weatherApi.GEOCODING_ENDPOINT, body: GEOCODING_BODY },
    { prefix: weatherApi.FORECAST_ENDPOINT, body: FORECAST_BODY }
  ]);
  const { env, elements } = fakeEnv({ place: 'Kolkata', fetch: fetchImpl, storage });
  const handle = ui.attachWeatherUi(env);
  await handle.onRefresh();
  assert.equal(fetchImpl.seen.length, 2);
  assert.match(elements['weather-now'].textContent, /Kolkata, India/);
  assert.match(elements['weather-status'].textContent, /^Updated · .*saved weather data could not be read/);
  assert.equal(writes, 0, 'unreadable cache and preferences must not be overwritten');
});

test('a corrupt weather cache is preserved after a successful network refresh', async () => {
  const corrupt = '{broken weather cache';
  const fetchImpl = okFetch([
    { prefix: weatherApi.GEOCODING_ENDPOINT, body: GEOCODING_BODY },
    { prefix: weatherApi.FORECAST_ENDPOINT, body: FORECAST_BODY }
  ]);
  const { env, elements, storageData } = fakeEnv({ place: 'Kolkata', stored: corrupt, fetch: fetchImpl });
  const handle = ui.attachWeatherUi(env);
  await handle.onRefresh();
  assert.equal(storageData[ui.STORAGE_KEY], corrupt);
  assert.match(elements['weather-now'].textContent, /Kolkata, India/);
  assert.match(elements['weather-status'].textContent, /saved weather data is unreadable and was preserved/);
});

test('storage quota failure does not turn a successful refresh into a network error', async () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error('quota exceeded'); },
    removeItem() {}
  };
  const fetchImpl = okFetch([
    { prefix: weatherApi.GEOCODING_ENDPOINT, body: GEOCODING_BODY },
    { prefix: weatherApi.FORECAST_ENDPOINT, body: FORECAST_BODY }
  ]);
  const { env, elements } = fakeEnv({ place: 'Kolkata', fetch: fetchImpl, storage });
  const handle = ui.attachWeatherUi(env);
  await handle.onRefresh();
  assert.match(elements['weather-now'].textContent, /Kolkata, India/);
  assert.match(elements['weather-status'].textContent, /^Updated · .*changes could not be saved/);
  assert.equal(elements['weather-refresh'].disabled, false);
});

test('place preference write failure is contained inside the input event', async () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error('quota exceeded'); },
    removeItem() {}
  };
  const { env, elements } = fakeEnv({ storage });
  ui.attachWeatherUi(env);
  const input = elements['weather-place'];
  input.value = 'Berlin';
  const inputListener = input.listeners.find((listener) => listener.type === 'input');
  assert.ok(inputListener);
  await assert.doesNotReject(() => inputListener.handler());
  assert.match(elements['weather-status'].textContent, /Place preference was not saved/);
  assert.match(elements['weather-status'].textContent, /changes could not be saved/);
});

test('partial Clear failure restores saved cache and preference and keeps the visible forecast', () => {
  const cache = JSON.stringify({
    version: 1,
    place: { name: 'Kolkata', country: 'India', latitude: 22.5625, longitude: 88.375 },
    weather: {
      temperatureC: 10, feelsLikeC: 9, windKph: 5, humidityPercent: 70,
      isDay: false, weatherCode: 0, label: 'Clear night'
    },
    fetchedAt: '2026-11-02T09:30:00.000Z'
  });
  const prefs = JSON.stringify({ place: 'Kolkata' });
  const storageData = {
    [ui.STORAGE_KEY]: cache,
    [ui.PREFS_KEY]: prefs
  };
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { storageData[key] = String(value); },
    removeItem(key) {
      if (key === ui.PREFS_KEY) throw new Error('preference removal denied');
      delete storageData[key];
    }
  };
  const { env, elements } = fakeEnv({ storage });
  const handle = ui.attachWeatherUi(env);
  const before = elements['weather-now'].textContent;
  handle.onClear();
  assert.equal(storageData[ui.STORAGE_KEY], cache, 'cache is restored after partial removal');
  assert.equal(storageData[ui.PREFS_KEY], prefs, 'preference remains unchanged');
  assert.equal(elements['weather-now'].textContent, before, 'visible weather is retained');
  assert.match(elements['weather-status'].textContent, /Could not clear saved weather/);
  assert.doesNotMatch(elements['weather-status'].textContent, /^Weather cleared/);
});

test('Clear refuses to erase a value changed in another tab', () => {
  const stored = JSON.stringify({
    version: 1,
    place: { name: 'Kolkata', country: 'India', latitude: 22.5625, longitude: 88.375 },
    weather: {
      temperatureC: 10, feelsLikeC: 9, windKph: 5, humidityPercent: 70,
      isDay: false, weatherCode: 0, label: 'Clear night'
    },
    fetchedAt: '2026-11-02T09:30:00.000Z'
  });
  const { env, elements, storageData } = fakeEnv({ stored });
  const handle = ui.attachWeatherUi(env);
  const visible = elements['weather-now'].textContent;
  storageData[ui.STORAGE_KEY] = JSON.stringify({ otherTab: true });
  handle.onClear();
  assert.notEqual(storageData[ui.STORAGE_KEY], undefined);
  assert.equal(elements['weather-now'].textContent, visible);
  assert.match(elements['weather-status'].textContent, /changed elsewhere/);
});
