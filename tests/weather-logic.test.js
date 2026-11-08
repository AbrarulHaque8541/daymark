'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const weather = require('../weather-logic.js');

const GEOCODING_BODY = JSON.stringify({
  results: [
    { name: 'Kolkata', latitude: 22.5625, longitude: 88.375, country: 'India' }
  ]
});

const FORECAST_BODY = JSON.stringify({
  current: {
    temperature_2m: 28.4,
    relative_humidity_2m: 64,
    apparent_temperature: 31.2,
    is_day: 1,
    weather_code: 2,
    wind_speed_10m: 11.3
  }
});

function jsonResponse(body) {
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

function routeFetch(routes) {
  const seen = [];
  const impl = (url) => {
    seen.push(url);
    const route = routes.find((r) => url.startsWith(r.prefix));
    if (!route) return Promise.reject(new Error('unexpected url: ' + url));
    if (typeof route.body === 'function') return Promise.resolve(route.body(url));
    return Promise.resolve(jsonResponse(route.body));
  };
  impl.seen = seen;
  return impl;
}

test('place queries are trimmed and bounded', () => {
  assert.equal(weather.normalizePlaceQuery('  Kolkata  '), 'Kolkata');
  assert.equal(weather.normalizePlaceQuery('   '), null);
  assert.equal(weather.normalizePlaceQuery(123), null);
  assert.equal(weather.normalizePlaceQuery('x'.repeat(81)), null);
  assert.equal(weather.normalizePlaceQuery('x'.repeat(80)), 'x'.repeat(80));
});

test('weather code labels cover day, night, and unknown codes', () => {
  assert.equal(weather.weatherCodeLabel(0, true), 'Clear sky');
  assert.equal(weather.weatherCodeLabel(0, false), 'Clear night');
  assert.equal(weather.weatherCodeLabel(1, false), 'Mostly clear night');
  assert.equal(weather.weatherCodeLabel(2, true), 'Partly cloudy');
  assert.equal(weather.weatherCodeLabel(63, false), 'Moderate rain');
  assert.equal(weather.weatherCodeLabel(95, true), 'Thunderstorm');
  assert.equal(weather.weatherCodeLabel(17, true), 'Unsettled');
  assert.equal(weather.weatherCodeLabel(-1, true), 'Unsettled');
  assert.equal(weather.weatherCodeLabel(100, true), 'Unsettled');
});

test('endpoints are https-only open-meteo URLs', () => {
  assert.equal(weather.GEOCODING_ENDPOINT, 'https://geocoding-api.open-meteo.com/v1/search');
  assert.equal(weather.FORECAST_ENDPOINT, 'https://api.open-meteo.com/v1/forecast');
  const geoUrl = weather.buildGeocodingUrl('New York');
  assert.ok(geoUrl.startsWith('https://geocoding-api.open-meteo.com/v1/search?'));
  assert.ok(geoUrl.includes('name=New%20York'));
  assert.ok(geoUrl.includes('count=1'));
  const forecastUrl = weather.buildForecastUrl(22.5625, 88.375);
  assert.ok(forecastUrl.startsWith('https://api.open-meteo.com/v1/forecast?'));
  assert.ok(forecastUrl.includes('latitude=22.5625'));
  assert.ok(forecastUrl.includes('longitude=88.375'));
  assert.ok(forecastUrl.includes('wind_speed_unit=kmh'));
  assert.throws(() => weather.buildGeocodingUrl('   '), /Type a place name first/);
  assert.throws(() => weather.buildForecastUrl(91, 0), /out of range/);
  assert.throws(() => weather.buildForecastUrl(0, 181), /out of range/);
});

test('geocoding results are parsed and validated', () => {
  const match = weather.parseGeocoding(JSON.parse(GEOCODING_BODY));
  assert.equal(match.name, 'Kolkata');
  assert.equal(match.country, 'India');
  assert.equal(match.latitude, 22.5625);
  assert.equal(match.longitude, 88.375);
  assert.equal(weather.parseGeocoding({ results: [] }), null);
  assert.equal(weather.parseGeocoding({}), null);
  assert.equal(weather.parseGeocoding({ results: [{ name: '', latitude: 1, longitude: 1 }] }), null);
  assert.equal(weather.parseGeocoding({ results: [{ name: 'X', latitude: 91, longitude: 1 }] }), null);
  assert.equal(weather.parseGeocoding('nope'), null);
});

test('weather payloads are parsed into normalized conditions', () => {
  const parsed = weather.parseWeather(JSON.parse(FORECAST_BODY));
  assert.equal(parsed.temperatureC, 28.4);
  assert.equal(parsed.feelsLikeC, 31.2);
  assert.equal(parsed.windKph, 11.3);
  assert.equal(parsed.humidityPercent, 64);
  assert.equal(parsed.isDay, true);
  assert.equal(parsed.weatherCode, 2);
  assert.equal(parsed.label, 'Partly cloudy');
  assert.throws(() => weather.parseWeather(null), /malformed/);
  assert.throws(() => weather.parseWeather({}), /no current conditions/);
  assert.throws(() => weather.parseWeather({ current: { temperature_2m: 999, apparent_temperature: 1, wind_speed_10m: 1, relative_humidity_2m: 1, is_day: 1, weather_code: 2 } }), /invalid temperature/);
  assert.throws(() => weather.parseWeather({ current: { temperature_2m: 20, apparent_temperature: 'x', wind_speed_10m: 1, relative_humidity_2m: 1, is_day: 1, weather_code: 2 } }), /feels-like/);
  assert.throws(() => weather.parseWeather({ current: { temperature_2m: 20, apparent_temperature: 20, wind_speed_10m: -3, relative_humidity_2m: 1, is_day: 1, weather_code: 2 } }), /wind speed/);
  assert.throws(() => weather.parseWeather({ current: { temperature_2m: 20, apparent_temperature: 20, wind_speed_10m: 3, relative_humidity_2m: 101, is_day: 1, weather_code: 2 } }), /humidity/);
  assert.throws(() => weather.parseWeather({ current: { temperature_2m: 20, apparent_temperature: 20, wind_speed_10m: 3, relative_humidity_2m: 50, is_day: 1, weather_code: 'wet' } }), /condition code/);
  const night = weather.parseWeather({ current: { temperature_2m: 20, apparent_temperature: 20, wind_speed_10m: 3, relative_humidity_2m: 50, is_day: 0, weather_code: 0 } });
  assert.equal(night.isDay, false);
  assert.equal(night.label, 'Clear night');
});

test('isValidWeather and isValidPlace guard the cache shape', () => {
  const cache = {
    version: 1,
    place: { name: 'Kolkata', country: 'India', latitude: 22.5625, longitude: 88.375 },
    weather: weather.parseWeather(JSON.parse(FORECAST_BODY)),
    fetchedAt: '2026-11-03T12:00:00.000Z'
  };
  assert.ok(weather.validateWeatherCache(cache));
  assert.ok(!weather.validateWeatherCache({ ...cache, version: 2 }));
  assert.ok(!weather.validateWeatherCache({ ...cache, fetchedAt: 'nope' }));
  assert.ok(!weather.validateWeatherCache({ ...cache, place: { name: '', latitude: 1, longitude: 1 } }));
  assert.ok(!weather.validateWeatherCache({ ...cache, weather: { ...cache.weather, temperatureC: 999 } }));
  assert.ok(!weather.validateWeatherCache(null));
  assert.ok(!weather.isValidWeather(null));
  assert.ok(!weather.isValidPlace({ name: 'X', latitude: 999, longitude: 0 }));
});

test('fetchWeatherByPlace geocodes then fetches the forecast', async () => {
  const fetchImpl = routeFetch([
    { prefix: weather.GEOCODING_ENDPOINT, body: GEOCODING_BODY },
    { prefix: weather.FORECAST_ENDPOINT, body: FORECAST_BODY }
  ]);
  const result = await weather.fetchWeatherByPlace(' kolkata ', fetchImpl, {
    now: () => '2026-11-03T12:00:00.000Z'
  });
  assert.equal(fetchImpl.seen.length, 2);
  assert.ok(fetchImpl.seen[0].includes('name=kolkata'));
  assert.equal(result.version, 1);
  assert.equal(result.place.name, 'Kolkata');
  assert.equal(result.weather.temperatureC, 28.4);
  assert.equal(result.fetchedAt, '2026-11-03T12:00:00.000Z');
  assert.ok(weather.validateWeatherCache(result));
});

test('fetchWeatherByPlace reports friendly errors', async () => {
  await assert.rejects(
    weather.fetchWeatherByPlace('nowhere-known', routeFetch([
      { prefix: weather.GEOCODING_ENDPOINT, body: JSON.stringify({ results: [] }) }
    ])),
    /No place matched/
  );
  await assert.rejects(
    weather.fetchWeatherByPlace('kolkata', routeFetch([
      { prefix: weather.GEOCODING_ENDPOINT, body: GEOCODING_BODY }
      // no forecast route: the fetch rejects with an unexpected-url error
    ])),
    /unexpected url/
  );
  await assert.rejects(
    weather.fetchWeatherByPlace('kolkata', routeFetch([
      { prefix: weather.GEOCODING_ENDPOINT, body: 'not json' }
    ])),
    /malformed/
  );
  await assert.rejects(
    weather.fetchWeatherByPlace('kolkata', routeFetch([
      { prefix: weather.GEOCODING_ENDPOINT, body: () => ({ ok: false, status: 503, text: () => Promise.resolve('') }) }
    ])),
    /HTTP 503/
  );
  await assert.rejects(
    weather.fetchWeatherByPlace('   ', () => Promise.resolve()),
    /Type a place name first/
  );
  await assert.rejects(
    weather.fetchWeatherByPlace('kolkata', null),
    /fetch unavailable/
  );
});

test('oversized responses are rejected by Content-Length before acquiring the stream', async () => {
  let readerOpened = false;
  let bodyCancelled = false;
  let textCalled = false;
  const response = {
    ok: true,
    status: 200,
    headers: { get(name) { return name.toLowerCase() === 'content-length' ? String(weather.MAX_JSON_BYTES + 1) : null; } },
    body: {
      getReader() { readerOpened = true; throw new Error('oversized body must be rejected before reader acquisition'); },
      cancel() { bodyCancelled = true; return Promise.resolve(); }
    },
    text() { textCalled = true; throw new Error('unbounded text fallback must not be called'); }
  };
  await assert.rejects(
    weather.fetchWeatherByPlace('kolkata', routeFetch([
      { prefix: weather.GEOCODING_ENDPOINT, body: () => response }
    ]])),
    /too large/
  );
  assert.equal(readerOpened, false);
  assert.equal(bodyCancelled, true);
  assert.equal(textCalled, false);
});
test('streamed JSON is decoded incrementally across split UTF-8 sequences', async () => {
  const expected = { place: 'Kolkata', note: '🌦️' };
  const bytes = new TextEncoder().encode(JSON.stringify(expected));
  const emojiStart = bytes.findIndex((value) => value === 0xF0);
  assert.ok(emojiStart >= 0, 'fixture contains a four-byte UTF-8 code point');
  const splitAt = emojiStart + 2;
  const chunks = [bytes.slice(0, splitAt), bytes.slice(splitAt)];
  let index = 0;
  const response = {
    ok: true,
    status: 200,
    headers: { get() { return null; } },
    body: {
      getReader() {
        return {
          async read() {
            if (index < chunks.length) return { done: false, value: chunks[index++] };
            return { done: true, value: undefined };
          },
          releaseLock() {}
        };
      }
    },
    text() { throw new Error('stream path must not buffer the whole response'); }
  };
  const parsed = await weather.fetchJson('https://example.test/weather', () => Promise.resolve(response));
  assert.deepEqual(parsed, expected);
});

test('streamed response is cancelled as soon as the byte limit is exceeded', async () => {
  let index = 0;
  let cancelled = false;
  let textFallbackCalled = false;
  const chunks = [new Uint8Array(weather.MAX_JSON_BYTES), new Uint8Array([0x7B])];
  const response = {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          async read() {
            if (index < chunks.length) return { done: false, value: chunks[index++] };
            return { done: true, value: undefined };
          },
          cancel() { cancelled = true; return Promise.resolve(); },
          releaseLock() {}
        };
      }
    },
    text() { textFallbackCalled = true; return Promise.resolve('{}'); }
  };
  await assert.rejects(
    weather.fetchJson('https://example.test/weather', () => Promise.resolve(response)),
    /too large/
  );
  assert.equal(cancelled, true, 'oversized stream should be cancelled');
  assert.equal(textFallbackCalled, false, 'stream path must not fall back to unbounded text()');
});

test('oversized Content-Length is rejected before opening the response reader', async () => {
  let readerOpened = false;
  let textCalled = false;
  const response = {
    ok: true,
    status: 200,
    headers: { get(name) { return name.toLowerCase() === 'content-length' ? String(weather.MAX_JSON_BYTES + 1) : null; } },
    body: {
      getReader() {
        readerOpened = true;
        return { async read() { return { done: true }; }, releaseLock() {} };
      }
    },
    text() { textCalled = true; return Promise.resolve('{}'); }
  };
  await assert.rejects(
    weather.fetchJson('https://example.test/weather', () => Promise.resolve(response)),
    /too large/
  );
  assert.equal(readerOpened, false, 'declared oversized body must be rejected before reading');
  assert.equal(textCalled, false);
});

test('a hanging request times out', async () => {
  const hanging = () => new Promise(() => {});
  await assert.rejects(
    weather.fetchWeatherByPlace('kolkata', hanging, { timeoutMs: 10 }),
    /timed out/
  );
});
