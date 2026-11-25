'use strict';

const test = require('node:test');
const assert = require('node:assert');

let logic;
if (typeof require === 'function') {
  logic = require('../prayer-times-logic.js');
}
if (!logic) logic = globalThis.DaymarkPrayerTimes;

function streamOf(chunks) {
  return {
    getReader() {
      let index = 0;
      return {
        read: async () => {
          if (index < chunks.length) {
            const value = chunks[index];
            index += 1;
            const bytes = new Uint8Array(value.length);
            for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 0xff;
            return { done: false, value: bytes };
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

const samplePayload = () => ({
  code: 200,
  data: {
    timings: { Fajr: '05:14', Sunrise: '06:15', Dhuhr: '12:07', Asr: '15:28', Sunset: '17:58', Maghrib: '17:58', Isha: '18:59', Imsak: '05:04' },
    date: {
      readable: '25 Nov 2026',
      hijri: { day: '15', year: '1448', month: { en: 'Jumada al-akhirah' } }
    },
    meta: { latitude: 8.0883, longitude: 77.5385, timezone: 'Asia/Kolkata', method: { name: 'Islamic Society of North America' } }
  }
});

test('datePartsFromIso accepts only real YYYY-MM-DD dates', () => {
  const parts = logic.datePartsFromIso('2026-11-25T04:00:00Z');
  assert.deepStrictEqual(parts, { yyyy: '2026', mm: '11', dd: '25' });
  assert.strictEqual(logic.datePartsFromIso('bad'), null);
  assert.strictEqual(logic.datePartsFromIso('25-11-2026'), null);
  assert.strictEqual(logic.datePartsFromIso('2026-13-01'), null);
  assert.strictEqual(logic.datePartsFromIso('2026-00-10'), null);
  assert.strictEqual(logic.datePartsFromIso(null), null);
});

test('time validation is strict 24h HH:MM', () => {
  assert.ok(logic.validatesTime('05:14'));
  assert.ok(logic.validatesTime('23:59'));
  assert.ok(!logic.validatesTime('24:00'));
  assert.ok(!logic.validatesTime('05:60'));
  assert.ok(!logic.validatesTime('514'));
  assert.ok(!logic.validatesTime('ab:cd'));
  assert.strictEqual(logic.formatsTime('12:07'), '12:07');
  assert.strictEqual(logic.formatsTime('12:7'), null);
});

test('city table is honest and bounded', () => {
  assert.ok(logic.cities.length >= 2 && logic.cities.length <= 12);
  assert.strictEqual(logic.normalizesCity('kanyakumari').label, 'Kanyakumari');
  assert.strictEqual(logic.normalizesCity('atlantis'), null);
  assert.strictEqual(logic.normalizesCity(''), null);
  assert.strictEqual(logic.normalizesCity(undefined), null);
  const ids = [];
  for (let i = 0; i < logic.cities.length; i += 1) {
    const city = logic.cities[i];
    assert.ok(city.latitude >= -90 && city.latitude <= 90);
    assert.ok(city.longitude >= -180 && city.longitude <= 180);
    assert.ok(ids.indexOf(city.id) === -1);
    ids.push(city.id);
  }
});

test('buildTimingsUrl pins the keyless Aladhan endpoint', () => {
  const url = logic.buildsTimingsUrl('kanyakumari', '2026-11-25');
  assert.strictEqual(url, 'https://api.aladhan.com/v1/timings/25-11-2026?latitude=8.0883&longitude=77.5385&method=2');
  let thrown = null;
  try { logic.buildsTimingsUrl('atlantis', '2026-11-25'); } catch (error) { thrown = error; }
  assert.ok(thrown && thrown.message.includes('city'));
  thrown = null;
  try { logic.buildsTimingsUrl('delhi', 'not a date'); } catch (error) { thrown = error; }
  assert.ok(thrown && thrown.message.includes('date'));
});

test('parsesTimings reads the Aladhan feed and reports hijri and method', () => {
  const record = logic.parsesTimings(samplePayload());
  assert.strictEqual(record.count, 7);
  assert.strictEqual(record.missing, 0);
  assert.strictEqual(record.prayers[0].name, 'Fajr');
  assert.strictEqual(record.prayers[0].time, '05:14');
  assert.strictEqual(record.hijri, '15 Jumada al-akhirah 1448 AH');
  assert.strictEqual(record.gregorian, '25 Nov 2026');
  assert.strictEqual(record.method, 'Islamic Society of North America');
});

test('parsesTimings throws on malformed payloads', () => {
  assert.throws(() => logic.parsesTimings(null), /malformed/);
  assert.throws(() => logic.parsesTimings({ data: {} }), /malformed/);
  assert.throws(() => logic.parsesTimings({ data: { timings: [] } }), /malformed/);
});

test('unreadable prayer entries are skipped and counted, never invented', () => {
  const payload = samplePayload();
  payload.data.timings.Asr = 'garbage';
  payload.data.timings.Isha = '24:99';
  const record = logic.parsesTimings(payload);
  assert.strictEqual(record.count, 5);
  assert.strictEqual(record.missing, 2);
  const broken = samplePayload();
  for (let i = 0; i < logic.prayerOrder.length; i += 1) broken.data.timings[logic.prayerOrder[i]] = '';
  assert.throws(() => logic.parsesTimings(broken), /malformed/);
});

test('hijri line fails soft when the feed lacks it', () => {
  const payload = samplePayload();
  delete payload.data.date.hijri;
  const record = logic.parsesTimings(payload);
  assert.strictEqual(record.hijri, null);
});

test('classifyError explains limits, misses and outages in plain words', () => {
  assert.ok(logic.classifiesError(new Error('HTTP 403')).includes('limited this request'));
  assert.ok(logic.classifiesError(new Error('HTTP 404')).includes('was not found'));
  assert.ok(logic.classifiesError(new Error('HTTP 400')).includes('rejected'));
  assert.ok(logic.classifiesError(new Error('HTTP 502')).includes('server problem'));
  assert.ok(logic.classifiesError(new Error('The prayer times request timed out.')).includes('timed out'));
  assert.ok(logic.classifiesError(new Error('The prayer times response was malformed.')).includes('could not be read'));
  assert.ok(logic.classifiesError(new Error('The prayer times response was too large to read safely. Try again later.')).includes('too large'));
  assert.strictEqual(logic.classifiesError(new Error('something odd')), null);
});

test('fetchesTimings calls the public keyless endpoint with the given date', async () => {
  let requested = null;
  let initSeen = null;
  const fetchImpl = async (url, init) => { requested = url; initSeen = init; return okResponse(JSON.stringify(samplePayload())); };
  const record = await logic.fetchesTimings(fetchImpl, 'delhi', '2026-11-25');
  assert.strictEqual(requested, 'https://api.aladhan.com/v1/timings/25-11-2026?latitude=28.6139&longitude=77.209&method=2');
  assert.strictEqual(initSeen.cache, 'no-store');
  assert.strictEqual(record.cityId, 'delhi');
  assert.strictEqual(record.city, 'New Delhi');
  assert.ok(record.url.indexOf('https://api.aladhan.com/v1/timings/') === 0);
  assert.strictEqual(record.count, 7);
});

test('HTTP failures surface friendly messages', async () => {
  const failing = async () => ({ ok: false, status: 403, headers: { get: () => null }, body: streamOf(['{}']) });
  let message = '';
  try { await logic.fetchesTimings(failing, 'delhi', '2026-11-25'); } catch (error) { message = error.message; }
  assert.strictEqual(message, 'The public Aladhan API limited this request. Try again in a moment.');
  const notFound = async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) });
  message = '';
  try { await logic.fetchesTimings(notFound, 'delhi', '2026-11-25'); } catch (error) { message = error.message; }
  assert.ok(message.includes('was not found'));
});

test('a non-JSON payload is rejected as malformed', async () => {
  let message = '';
  try {
    await logic.fetchesTimings(async () => okResponse('<html>blocked</html>'), 'delhi', '2026-11-25');
  } catch (error) { message = error.message; }
  assert.ok(message.includes('could not be read'));
});

test('an oversized payload is rejected with an honest limit message', async () => {
  const big = samplePayload();
  big.data.padding = 'x'.repeat(300 * 1024);
  let message = '';
  try {
    await logic.fetchesTimings(async () => okResponse(JSON.stringify(big)), 'delhi', '2026-11-25');
  } catch (error) { message = error.message; }
  assert.ok(message.includes('too large'));
});

test('missing fetch degrades honestly', async () => {
  let message = '';
  try { await logic.fetchesTimings(null, 'delhi', '2026-11-25'); } catch (error) { message = error.message; }
  assert.ok(message.includes('fetch is unavailable'));
});
