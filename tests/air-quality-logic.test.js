'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const air = require('../air-quality-logic.js');

const GEO_BODY = JSON.stringify({
  results: [{ name: 'Delhi', country: 'India', latitude: 28.6139, longitude: 77.209 }]
});
const AIR_BODY = JSON.stringify({
  current: { european_aqi: 35, us_aqi: 62, pm2_5: 18.4, pm10: 41.2, ozone: 55.1, nitrogen_dioxide: 22.7 }
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

test('buildAirQualityUrl pins the keyless endpoint and bounded current params', () => {
  const url = air.buildAirQualityUrl(28.6139, 77.2090);
  assert.equal(url,
    'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=28.6139&longitude=77.209'
    + '&current=european_aqi%2Cus_aqi%2Cpm2_5%2Cpm10%2Cozone%2Cnitrogen_dioxide');
});

test('buildAirQualityUrl rejects out-of-range coordinates', () => {
  let message = '';
  try { air.buildAirQualityUrl(91, 0); } catch (error) { message = error.message; }
  assert.equal(message, 'The place coordinates are out of range.');
  message = '';
  try { air.buildAirQualityUrl(0, -180.5); } catch (error) { message = error.message; }
  assert.equal(message, 'The place coordinates are out of range.');
});

test('normalizePlaceQuery trims, collapses whitespace, and bounds length', () => {
  assert.equal(air.normalizePlaceQuery('  Delhi   NCR '), 'Delhi NCR');
  assert.equal(air.normalizePlaceQuery(''), null);
  assert.equal(air.normalizePlaceQuery('   '), null);
  assert.equal(air.normalizePlaceQuery('x'.repeat(81)), null);
  assert.equal(air.normalizePlaceQuery(42), null);
});

test('parseAirQuality maps readings to honest band labels', () => {
  const parsed = air.parseAirQuality(JSON.parse(AIR_BODY));
  assert.equal(parsed.europeanAqi, 35);
  assert.equal(parsed.europeanBand, 'Fair');
  assert.equal(parsed.usAqi, 62);
  assert.equal(parsed.usBand, 'Moderate');
  assert.equal(parsed.pm25, 18.4);
  assert.equal(parsed.pm10, 41.2);
  assert.equal(parsed.ozone, 55.1);
  assert.equal(parsed.nitrogenDioxide, 22.7);
});

test('european band boundaries follow the EEA index', () => {
  const cases = [[0, 'Good'], [20, 'Good'], [21, 'Fair'], [40, 'Fair'], [41, 'Moderate'],
    [60, 'Moderate'], [61, 'Poor'], [80, 'Poor'], [81, 'Very poor'], [100, 'Very poor'],
    [101, 'Extremely poor'], [300, 'Extremely poor']];
  for (const [value, band] of cases) assert.equal(air.europeanAqiBand(value), band, 'EU ' + value);
  assert.equal(air.europeanAqiBand(-1), 'Unknown');
  assert.equal(air.europeanAqiBand(301), 'Unknown');
  assert.equal(air.europeanAqiBand('35'), 'Unknown');
});

test('us band boundaries follow the EPA index', () => {
  const cases = [[0, 'Good'], [50, 'Good'], [51, 'Moderate'], [100, 'Moderate'], [101, 'Unhealthy for sensitive groups'],
    [150, 'Unhealthy for sensitive groups'], [151, 'Unhealthy'], [200, 'Unhealthy'], [201, 'Very unhealthy'],
    [300, 'Very unhealthy'], [301, 'Hazardous'], [500, 'Hazardous']];
  for (const [value, band] of cases) assert.equal(air.usAqiBand(value), band, 'US ' + value);
  assert.equal(air.usAqiBand(501), 'Unknown');
});

test('parseAirQuality rejects malformed, missing, and out-of-range readings', () => {
  const bad = (body, fragment) => {
    let message = '';
    try { air.parseAirQuality(JSON.parse(body)); } catch (error) { message = error.message; }
    assert.ok(message.indexOf(fragment) !== -1, 'expected "' + fragment + '" in "' + message + '"');
  };
  bad('{}', 'no current readings');
  bad('{"nope":1}', 'no current readings');
  bad(JSON.stringify({ current: {} }), 'invalid European AQI reading');
  bad(JSON.stringify({ current: { european_aqi: 35 } }), 'invalid US AQI reading');
  bad(JSON.stringify({ current: { european_aqi: 35, us_aqi: 62 } }), 'invalid PM2.5 reading');
  bad(JSON.stringify({ current: { european_aqi: 35, us_aqi: 62, pm2_5: 18.4, pm10: 41.2, ozone: 55.1, nitrogen_dioxide: 1001 } }),
    'invalid nitrogen dioxide reading');
  bad(JSON.stringify({ current: { european_aqi: 'high', us_aqi: 62, pm2_5: 18.4, pm10: 41.2, ozone: 55.1, nitrogen_dioxide: 22.7 } }),
    'invalid European AQI reading');
});

test('fetchAirQualityByPlace geocodes then fetches air quality once', async () => {
  const fetchImpl = okFetch([
    { prefix: GEO_PREFIX, body: GEO_BODY },
    { prefix: air.AIR_QUALITY_ENDPOINT, body: AIR_BODY }
  ]);
  const record = await air.fetchAirQualityByPlace('  Delhi  ', fetchImpl, { now: () => '2026-11-11T05:00:00.000Z' });
  assert.equal(fetchImpl.seen.length, 2);
  assert.ok(fetchImpl.seen[0].indexOf(GEO_PREFIX + '/v1/search?name=Delhi') === 0, 'geocoding first');
  assert.ok(fetchImpl.seen[1].indexOf(air.AIR_QUALITY_ENDPOINT) === 0, 'air quality second');
  assert.equal(record.version, 1);
  assert.equal(record.place.name, 'Delhi');
  assert.equal(record.place.country, 'India');
  assert.equal(record.air.europeanBand, 'Fair');
  assert.equal(record.fetchedAt, '2026-11-11T05:00:00.000Z');
});

test('an empty place is rejected before any network call', async () => {
  const fetchImpl = okFetch([{ prefix: GEO_PREFIX, body: GEO_BODY }]);
  let message = '';
  try { await air.fetchAirQualityByPlace('   ', fetchImpl); } catch (error) { message = error.message; }
  assert.equal(message, 'Type a place name first.');
  assert.equal(fetchImpl.seen.length, 0);
});

test('an unknown place stops after the geocoding call', async () => {
  const fetchImpl = okFetch([
    { prefix: GEO_PREFIX, body: JSON.stringify({ results: [] }) },
    { prefix: air.AIR_QUALITY_ENDPOINT, body: AIR_BODY }
  ]);
  let message = '';
  try { await air.fetchAirQualityByPlace('Nowhereville', fetchImpl); } catch (error) { message = error.message; }
  assert.equal(message, 'No place matched that name. Try a nearby city.');
  assert.equal(fetchImpl.seen.length, 1);
});

test('an air-quality HTTP failure surfaces the status plainly', async () => {
  const fetchImpl = okFetch([
    { prefix: GEO_PREFIX, body: GEO_BODY },
    { prefix: air.AIR_QUALITY_ENDPOINT, body: AIR_BODY, status: 500 }
  ]);
  let message = '';
  try { await air.fetchAirQualityByPlace('Delhi', fetchImpl); } catch (error) { message = error.message; }
  assert.equal(message, 'HTTP 500');
});

test('a malformed air-quality body fails closed', async () => {
  const fetchImpl = okFetch([
    { prefix: GEO_PREFIX, body: GEO_BODY },
    { prefix: air.AIR_QUALITY_ENDPOINT, body: '{"current": "text"}' }
  ]);
  let message = '';
  try { await air.fetchAirQualityByPlace('Delhi', fetchImpl); } catch (error) { message = error.message; }
  assert.equal(message, 'The air-quality response has no current readings.');
});

test('a missing shared geocoding helper fails closed before any network call', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'air-quality-logic.js'), 'utf8');
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(source, context);
  const isolated = context.DaymarkAirQuality;
  let calls = 0;
  await assert.rejects(
    () => isolated.fetchAirQualityByPlace('Delhi', () => { calls += 1; return Promise.resolve(streamResponse(AIR_BODY)); }),
    (error) => error.message === 'The shared geocoding helper is unavailable.'
  );
  assert.equal(calls, 0);
});

test('a missing fetch implementation is rejected before any network work', async () => {
  await assert.rejects(
    () => air.fetchAirQualityByPlace('Delhi', undefined),
    (error) => error.message === 'fetch unavailable'
  );
});

test('the module exposes its API and constants', () => {
  assert.equal(typeof air.fetchAirQualityByPlace, 'function');
  assert.equal(typeof air.parseAirQuality, 'function');
  assert.equal(air.AIR_QUALITY_ENDPOINT, 'https://air-quality-api.open-meteo.com/v1/air-quality');
  assert.equal(air.DEFAULT_TIMEOUT_MS, 10000);
  assert.equal(typeof globalThis.DaymarkAirQuality, 'object');
});
