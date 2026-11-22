'use strict';

const test = require('node:test');
const assert = require('node:assert');

let logic;
if (typeof require === 'function') {
  logic = require('../earthquake-logic.js');
}
if (!logic) logic = globalThis.DaymarkEarthquakes;

function feature(mag, place, time, url, tsunami) {
  return {
    type: 'Feature',
    properties: { mag: mag, place: place, time: time, url: url, tsunami: tsunami },
    id: place || 'quake'
  };
}

test('formatMagnitude rounds to one decimal and rejects junk', () => {
  assert.strictEqual(logic.formatsMagnitude(6.12), '6.1');
  assert.strictEqual(logic.formatsMagnitude(0), '0.0');
  assert.strictEqual(logic.formatsMagnitude('6'), null);
  assert.strictEqual(logic.formatsMagnitude(-1), null);
  assert.strictEqual(logic.formatsMagnitude(40), null);
  assert.strictEqual(logic.formatsMagnitude(NaN), null);
});

test('describeMagnitude bands and fail-closed unrated', () => {
  assert.strictEqual(logic.describesMagnitude('1.5'), 'minor');
  assert.strictEqual(logic.describesMagnitude('3.5'), 'light');
  assert.strictEqual(logic.describesMagnitude('4.5'), 'moderate');
  assert.strictEqual(logic.describesMagnitude('5.1'), 'strong');
  assert.strictEqual(logic.describesMagnitude('6.4'), 'major');
  assert.strictEqual(logic.describesMagnitude('8.2'), 'great');
  assert.strictEqual(logic.describesMagnitude(null), 'unrated');
  assert.strictEqual(logic.describesMagnitude('junk'), 'unrated');
});

test('formatEventTime renders epoch millis as UTC text', () => {
  assert.strictEqual(logic.formatsEventTime(0), '1970-01-01 00:00 UTC');
  const ms = Date.parse('2026-11-21T18:30:00Z');
  assert.strictEqual(logic.formatsEventTime(ms), '2026-11-21 18:30 UTC');
  assert.strictEqual(logic.formatsEventTime('not a time'), null);
  assert.strictEqual(logic.formatsEventTime(-5), null);
  assert.strictEqual(logic.formatsEventTime(1.5), null);
});

test('parseQuakes sorts highest magnitude first', () => {
  const record = logic.parsesQuakes({ features: [
    feature(3.1, 'A', 3),
    feature(5.7, 'B', 2),
    feature(4.4, 'C', 1)
  ]});
  assert.strictEqual(record.count, 3);
  assert.strictEqual(record.hidden, 0);
  assert.strictEqual(record.quakes[0].place, 'B');
  assert.strictEqual(record.quakes[2].place, 'A');
});

test('parseQuakes caps the display list and reports hidden entries', () => {
  const features = [];
  for (let i = 0; i < 11; i += 1) features.push(feature(1 + i / 20, 'quake' + i, 1000 + i));
  const record = logic.parsesQuakes({ features: features });
  assert.strictEqual(record.count, logic.maxItems);
  assert.strictEqual(record.hidden, 3);
  assert.strictEqual(record.quakes.length, logic.maxItems);
});

test('parseQuakes throws on a malformed payload and accepts an empty list', () => {
  assert.throws(() => logic.parsesQuakes({ nope: true }), /malformed/);
  assert.throws(() => logic.parsesQuakes(null), /malformed/);
  const empty = logic.parsesQuakes({ features: [] });
  assert.strictEqual(empty.count, 0);
  assert.strictEqual(empty.hidden, 0);
});

test('parseQuakes drops unreadable entries and counts them as hidden', () => {
  const record = logic.parsesQuakes({ features: [
    feature(4.2, 'Good one', 5),
    { type: 'Feature', properties: {} },
    'not an object',
    null
  ]});
  assert.strictEqual(record.count, 1);
  assert.strictEqual(record.hidden, 3);
  assert.strictEqual(record.quakes[0].place, 'Good one');
});

test('parseQuake keeps safe USGS links only', () => {
  const quake = logic.parsesQuake(feature(4.0, 'Safe', 5, 'https://earthquake.usgs.gov/earthquakes/eventpage/ok'));
  assert.strictEqual(quake.url, 'https://earthquake.usgs.gov/earthquakes/eventpage/ok');
  const bad = logic.parsesQuake(feature(4.0, 'Bad', 5, 'https://evil.example/trap'));
  assert.strictEqual(bad.url, null);
  assert.strictEqual(bad.magnitude, '4.0');
});

test('parseQuake flags a tsunami marker', () => {
  const quake = logic.parsesQuake(feature(6.0, 'With alert', 5, null, 1));
  assert.strictEqual(quake.tsunami, true);
  const plain = logic.parsesQuake(feature(6.0, 'Plain', 5, null, 0));
  assert.strictEqual(plain.tsunami, false);
});

test('classifyEarthquakeError explains limits, misses and outages in plain words', () => {
  assert.ok(logic.classifiesError(new Error('HTTP 403')).includes('limited this request'));
  assert.ok(logic.classifiesError(new Error('HTTP 404')).includes('was not found'));
  assert.ok(logic.classifiesError(new Error('HTTP 400')).includes('rejected'));
  assert.ok(logic.classifiesError(new Error('HTTP 502')).includes('server problem'));
  assert.ok(logic.classifiesError(new Error('The earthquake request timed out.')).includes('timed out'));
  assert.ok(logic.classifiesError(new Error('The earthquake response was malformed.')).includes('could not be read'));
  assert.strictEqual(logic.classifiesError(new Error('something odd')), null);
});

function streamOf(chunks) {
  return {
    getReader() {
      let index = 0;
      return {
        read: async () => {
          if (index < chunks.length) {
            const value = chunks[index];
            index += 1;
            return { done: false, value: new TextEncoder().encode(value) };
          }
          return { done: true, value: undefined };
        },
        cancel: async () => {},
        releaseLock: () => {}
      };
    }
  };
}

const okResponse = (bodyText) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  body: streamOf([bodyText]),
  text: async () => bodyText
});

test('fetchRecentEarthquakes calls the public USGS endpoint and parses a success', async () => {
  let requested = null;
  let initSeen = null;
  const payload = { features: [feature(4.4, 'Test place', Date.parse('2026-11-21T10:00:00Z'), 'https://earthquake.usgs.gov/earthquakes/eventpage/test')] };
  const fetchImpl = async (url, init) => {
    requested = url;
    initSeen = init;
    return okResponse(JSON.stringify(payload));
  };
  const record = await logic.fetchesRecent(fetchImpl);
  assert.strictEqual(requested, 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson');
  assert.strictEqual(initSeen.cache, 'no-store');
  assert.strictEqual(record.count, 1);
  assert.strictEqual(record.quakes[0].place, 'Test place');
  assert.ok(record.quakes[0].time.includes('UTC'));
});

test('fetchRecentEarthquakes surfaces HTTP failures and covers zero-quake feeds', async () => {
  const failing = async () => ({ ok: false, status: 403, headers: { get: () => null }, body: streamOf(['{}']) });
  let message = '';
  try { await logic.fetchesRecent(failing); } catch (error) { message = error.message; }
  assert.strictEqual(message, 'The public USGS feed limited this request. Try again in a moment.');
  const emptyRecord = await logic.fetchesRecent(async () => okResponse(JSON.stringify({ features: [] })));
  assert.strictEqual(emptyRecord.count, 0);
});

test('a non-JSON payload is rejected as malformed', async () => {
  let message = '';
  try {
    await logic.fetchesRecent(async () => okResponse('<html>blocked</html>'));
  } catch (error) { message = error.message; }
  assert.ok(message.includes('could not be read'));
  assert.ok(logic.classifiesError(new Error('The earthquake response was malformed.')).includes('could not be read'));
});

test('an oversized payload is rejected with an honest limit message', async () => {
  const big = { features: [] };
  big.padding = 'x'.repeat(300 * 1024);
  let message = '';
  try {
    await logic.fetchesRecent(async () => okResponse(JSON.stringify(big)));
  } catch (error) { message = error.message; }
  assert.ok(message.includes('too large'));
});
