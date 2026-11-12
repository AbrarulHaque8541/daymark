'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const daylight = require('../daylight-logic.js');

const GEO_BODY = JSON.stringify({
  results: [{ name: 'Kanyakumari', country: 'India', latitude: 8.0883, longitude: 77.5385 }]
});
const DAYLIGHT_BODY = JSON.stringify({
  latitude: 8.0883,
  longitude: 77.5385,
  timezone: 'Asia/Kolkata',
  daily: {
    sunrise: ['2026-11-12T06:14', '2026-11-13T06:14', '2026-11-14T06:15'],
    sunset: ['2026-11-12T17:52', '2026-11-13T17:52', '2026-11-14T17:52'],
    uv_index_max: [9.5, 9.8, 11.2]
  }
});

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
    const route = routes.find((r) => url.indexOf(r.prefix) === 0);
    if (!route) return Promise.reject(new Error('unexpected url'));
    if (route.status) return Promise.resolve({ ok: false, status: route.status, headers: { get() { return null; } } });
    return Promise.resolve(streamResponse(route.body));
  };
  impl.seen = seen;
  return impl;
}

const GEO_PREFIX = 'https://geocoding-api.open-meteo.com';

test('buildDaylightUrl pins the keyless endpoint and bounded daily params', () => {
  const url = daylight.buildDaylightUrl(8.0883, 77.5385);
  assert.equal(url,
    'https://api.open-meteo.com/v1/forecast?latitude=8.0883&longitude=77.5385'
    + '&daily=sunrise%2Csunset%2Cuv_index_max&forecast_days=3&timezone=auto');
});

test('buildDaylightUrl rejects out-of-range coordinates', () => {
  let message = '';
  try { daylight.buildDaylightUrl(90.5, 0); } catch (error) { message = error.message; }
  assert.equal(message, 'The place coordinates are out of range.');
  message = '';
  try { daylight.buildDaylightUrl(0, -180.5); } catch (error) { message = error.message; }
  assert.equal(message, 'The place coordinates are out of range.');
});

test('clockFromIso reads local clocks without timezone shifting', () => {
  assert.equal(daylight.clockFromIso('2026-11-12T06:14'), '06:14');
  assert.equal(daylight.clockFromIso('2026-11-12T17:52'), '17:52');
  assert.equal(daylight.clockFromIso('2026-11-12T9:14'), null);
  assert.equal(daylight.clockFromIso('nonsense'), null);
  assert.equal(daylight.clockFromIso(42), null);
  assert.equal(daylight.clockFromIso('2026-11-12T24:00'), null);
});

test('daylightMinutes and formatDuration compute honest day lengths', () => {
  assert.equal(daylight.daylightMinutes('2026-11-12T06:14', '2026-11-12T17:52'), 698);
  assert.equal(daylight.formatDuration(698), '11 h 38 min');
  assert.equal(daylight.formatDuration(600), '10 h');
  assert.equal(daylight.formatDuration(1440), '24 h');
  assert.equal(daylight.formatDuration(1441), 'unknown');
  assert.equal(daylight.formatDuration('x'), 'unknown');
});

test('uv bands follow the WHO global solar UV index', () => {
  const cases = [[0, 'Low'], [2.9, 'Low'], [3, 'Moderate'], [5.9, 'Moderate'], [6, 'High'],
    [7.9, 'High'], [8, 'Very high'], [10.9, 'Very high'], [11, 'Extreme'], [20, 'Extreme']];
  for (const [value, band] of cases) assert.equal(daylight.uvBand(value), band, 'UV ' + value);
  assert.equal(daylight.uvBand(-0.1), 'Unknown');
  assert.equal(daylight.uvBand(20.1), 'Unknown');
  assert.equal(daylight.uvBand('9'), 'Unknown');
});

test('parseDaylight maps readings to honest band labels', () => {
  const parsed = daylight.parseDaylight(JSON.parse(DAYLIGHT_BODY));
  assert.equal(parsed.timezone, 'Asia/Kolkata');
  assert.equal(parsed.days.length, 3);
  assert.equal(parsed.days[0].sunriseClock, '06:14');
  assert.equal(parsed.days[0].sunsetClock, '17:52');
  assert.equal(parsed.days[0].daylightMinutes, 698);
  assert.equal(parsed.days[0].durationLabel, '11 h 38 min');
  assert.equal(parsed.days[0].uvMax, 9.5);
  assert.equal(parsed.days[0].uvBand, 'Very high');
  assert.equal(parsed.days[2].uvBand, 'Extreme');
});

test('parseDaylight rejects malformed, mismatched, and out-of-range payloads', () => {
  const bad = (body, fragment) => {
    let message = '';
    try { daylight.parseDaylight(JSON.parse(body)); } catch (error) { message = error.message; }
    assert.ok(message.indexOf(fragment) !== -1, 'expected "' + fragment + '" in "' + message + '"');
  };
  bad('{}', 'no daily data');
  bad('{"daily": "text"}', 'no daily data');
  bad(JSON.stringify({ daily: { sunrise: [], sunset: [], uv_index_max: [] } }), 'unexpected day count');
  bad(JSON.stringify({ daily: { sunrise: ['2026-11-12T06:14'], sunset: [], uv_index_max: [9] } }), 'mismatched daily fields');
  bad(JSON.stringify({ daily: { sunrise: ['bad'], sunset: ['2026-11-12T17:52'], uv_index_max: [9] } }), 'unreadable sunrise or sunset');
  bad(JSON.stringify({ daily: { sunrise: ['2026-11-12T06:14'], sunset: ['2026-11-12T05:00'], uv_index_max: [9] } }), 'impossible day length');
  bad(JSON.stringify({ daily: { sunrise: ['2026-11-12T06:14'], sunset: ['2026-11-12T17:52'], uv_index_max: [21] } }), 'invalid UV index reading');
  bad(JSON.stringify({ daily: { sunrise: ['2026-11-12T06:14'], sunset: ['2026-11-12T17:52'], uv_index_max: ['high'] } }), 'invalid UV index reading');
});

test('fetchDaylightByPlace geocodes then fetches daylight once', async () => {
  const fetchImpl = okFetch([
    { prefix: GEO_PREFIX, body: GEO_BODY },
    { prefix: daylight.DAYLIGHT_ENDPOINT, body: DAYLIGHT_BODY }
  ]);
  const record = await daylight.fetchDaylightByPlace('  Kanyakumari  ', fetchImpl, { now: () => '2026-11-12T05:00:00.000Z' });
  assert.equal(fetchImpl.seen.length, 2);
  assert.ok(fetchImpl.seen[0].indexOf(GEO_PREFIX + '/v1/search?name=Kanyakumari') === 0, 'geocoding first');
  assert.ok(fetchImpl.seen[1].indexOf(daylight.DAYLIGHT_ENDPOINT) === 0, 'daylight second');
  assert.equal(record.version, 1);
  assert.equal(record.place.name, 'Kanyakumari');
  assert.equal(record.place.country, 'India');
  assert.equal(record.daylight.days[0].uvBand, 'Very high');
  assert.equal(record.fetchedAt, '2026-11-12T05:00:00.000Z');
});

test('an empty place is rejected before any network call', async () => {
  const fetchImpl = okFetch([{ prefix: GEO_PREFIX, body: GEO_BODY }]);
  let message = '';
  try { await daylight.fetchDaylightByPlace('   ', fetchImpl); } catch (error) { message = error.message; }
  assert.equal(message, 'Type a place name first.');
  assert.equal(fetchImpl.seen.length, 0);
});

test('an unknown place stops after the geocoding call', async () => {
  const fetchImpl = okFetch([
    { prefix: GEO_PREFIX, body: JSON.stringify({ results: [] }) },
    { prefix: daylight.DAYLIGHT_ENDPOINT, body: DAYLIGHT_BODY }
  ]);
  let message = '';
  try { await daylight.fetchDaylightByPlace('Nowhereville', fetchImpl); } catch (error) { message = error.message; }
  assert.equal(message, 'No place matched that name. Try a nearby city.');
  assert.equal(fetchImpl.seen.length, 1);
});

test('a daylight HTTP failure surfaces the status plainly', async () => {
  const fetchImpl = okFetch([
    { prefix: GEO_PREFIX, body: GEO_BODY },
    { prefix: daylight.DAYLIGHT_ENDPOINT, body: DAYLIGHT_BODY, status: 503 }
  ]);
  let message = '';
  try { await daylight.fetchDaylightByPlace('Kanyakumari', fetchImpl); } catch (error) { message = error.message; }
  assert.equal(message, 'HTTP 503');
});

test('a malformed daylight body fails closed', async () => {
  const fetchImpl = okFetch([
    { prefix: GEO_PREFIX, body: GEO_BODY },
    { prefix: daylight.DAYLIGHT_ENDPOINT, body: '{"daily": 7}' }
  ]);
  let message = '';
  try { await daylight.fetchDaylightByPlace('Kanyakumari', fetchImpl); } catch (error) { message = error.message; }
  assert.equal(message, 'The daylight response has no daily data.');
});

test('a missing shared geocoding helper fails closed before any network call', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'daylight-logic.js'), 'utf8');
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(source, context);
  const isolated = context.DaymarkDaylight;
  let calls = 0;
  await assert.rejects(
    () => isolated.fetchDaylightByPlace('Kanyakumari', () => { calls += 1; return Promise.resolve(streamResponse(DAYLIGHT_BODY)); }),
    (error) => error.message === 'The shared geocoding helper is unavailable.'
  );
  assert.equal(calls, 0);
});

test('a missing fetch implementation is rejected before any network work', async () => {
  await assert.rejects(
    () => daylight.fetchDaylightByPlace('Kanyakumari', undefined),
    (error) => error.message === 'fetch unavailable'
  );
});

test('the module exposes its API and constants', () => {
  assert.equal(typeof daylight.fetchDaylightByPlace, 'function');
  assert.equal(typeof daylight.parseDaylight, 'function');
  assert.equal(daylight.DAYLIGHT_ENDPOINT, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(daylight.DEFAULT_TIMEOUT_MS, 10000);
  assert.equal(daylight.MAX_FORECAST_DAYS, 3);
  assert.equal(typeof globalThis.DaymarkDaylight, 'object');
});
