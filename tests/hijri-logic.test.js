'use strict';

const test = require('node:test');
const assert = require('node:assert');

let logic;
if (typeof require === 'function') {
  logic = require('../hijri-logic.js');
}
if (!logic) logic = globalThis.DaymarkHijri;

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
  status: 'OK',
  data: {
    hijri: {
      date: '15-06-1448',
      format: 'DD-MM-YYYY',
      day: '15',
      weekday: { en: "Al Arba'a" },
      month: { number: 6, en: 'Jumada al-akhirah', days: 29 },
      year: '1448',
      designation: { abbreviated: 'AH', expanded: 'Anno Hegirae' },
      holidays: []
    },
    gregorian: '25-11-2026'
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

test('Hijri day validation is bounded to 1-30 and four-digit years', () => {
  assert.ok(logic.validatesDateParts('15', '1448'));
  assert.ok(logic.validatesDateParts('1', '1'));
  assert.ok(!logic.validatesDateParts('31', '1448'));
  assert.ok(!logic.validatesDateParts('00', '1448'));
  assert.ok(!logic.validatesDateParts('15', 'garbage'));
  assert.ok(!logic.validatesDateParts(15, '1448'));
  assert.ok(!logic.validatesDateParts('15', 1448));
  assert.ok(!logic.validatesDateParts('15', '14489'));
});

test('buildHijriUrl pins the keyless Aladhan gToH endpoint', () => {
  const url = logic.buildsHijriUrl('2026-11-25');
  assert.strictEqual(url, 'https://api.aladhan.com/v1/gToH?date=25-11-2026');
  let thrown = null;
  try { logic.buildsHijriUrl('not a date'); } catch (error) { thrown = error; }
  assert.ok(thrown && thrown.message.includes('date'));
  thrown = null;
  try { logic.buildsHijriUrl(null); } catch (error) { thrown = error; }
  assert.ok(thrown && thrown.message.includes('date'));
});

test('parsesHijri reads the Aladhan response into an honest record', () => {
  const record = logic.parsesHijri(samplePayload());
  assert.strictEqual(record.hijri, '15 Jumada al-akhirah 1448 AH');
  assert.strictEqual(record.weekday, "Al Arba'a");
  assert.strictEqual(record.month, 'Jumada al-akhirah');
  assert.strictEqual(record.monthNumber, 6);
  assert.strictEqual(record.year, '1448');
  assert.deepStrictEqual(record.holidays, []);
  assert.strictEqual(record.holidaysTruncated, false);
  assert.strictEqual(record.gregorian, '25-11-2026');
  assert.strictEqual(record.designation, 'Anno Hegirae');
});

test('parsesHijri throws on malformed payloads', () => {
  assert.throws(() => logic.parsesHijri(null), /malformed/);
  assert.throws(() => logic.parsesHijri({}), /malformed/);
  assert.throws(() => logic.parsesHijri({ data: {} }), /malformed/);
  assert.throws(() => logic.parsesHijri({ data: { hijri: { day: 5 } } }), /malformed/);
});

test('out-of-range Hijri day or year fails closed', () => {
  const badDay = samplePayload();
  badDay.data.hijri.day = '31';
  assert.throws(() => logic.parsesHijri(badDay), /malformed/);
  const badYear = samplePayload();
  badYear.data.hijri.year = '12x4';
  assert.throws(() => logic.parsesHijri(badYear), /malformed/);
  const badMonth = samplePayload();
  badMonth.data.hijri.month.number = 13;
  assert.throws(() => logic.parsesHijri(badMonth), /malformed/);
});

test('holiday list keeps only readable bounded entries', () => {
  const payload = samplePayload();
  payload.data.hijri.holidays = ['Eid al-Adha', '', '   ', '2nd day'];
  const record = logic.parsesHijri(payload);
  assert.deepStrictEqual(record.holidays, ['Eid al-Adha', '2nd day']);

  const many = samplePayload();
  many.data.hijri.holidays = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const capped = logic.parsesHijri(many);
  assert.strictEqual(capped.holidays.length, logic.maxHolidays);
  assert.strictEqual(capped.holidaysTruncated, true);
  assert.ok(capped.holidays.indexOf('i') === -1);
});

test('classifyError explains limits, misses and outages in plain words', () => {
  assert.ok(logic.classifiesError(new Error('HTTP 403')).includes('limited this request'));
  assert.ok(logic.classifiesError(new Error('HTTP 404')).includes('was not found'));
  assert.ok(logic.classifiesError(new Error('HTTP 400')).includes('rejected'));
  assert.ok(logic.classifiesError(new Error('HTTP 502')).includes('server problem'));
  assert.ok(logic.classifiesError(new Error('The Hijri date request timed out.')).includes('timed out'));
  assert.ok(logic.classifiesError(new Error('The Hijri date response was malformed.')).includes('could not be read'));
  assert.ok(logic.classifiesError(new Error('The Hijri date response was too large to read safely. Try again later.')).includes('too large'));
  assert.strictEqual(logic.classifiesError(new Error('something odd')), null);
});

test('fetchesHijri calls the public keyless endpoint with the given date', async () => {
  let requested = null;
  let initSeen = null;
  const fetchImpl = async (url, init) => { requested = url; initSeen = init; return okResponse(JSON.stringify(samplePayload())); };
  const record = await logic.fetchesHijri(fetchImpl, '2026-11-25');
  assert.strictEqual(requested, 'https://api.aladhan.com/v1/gToH?date=25-11-2026');
  assert.strictEqual(initSeen.cache, 'no-store');
  assert.strictEqual(record.url, 'https://api.aladhan.com/v1/gToH?date=25-11-2026');
  assert.strictEqual(record.hijri, '15 Jumada al-akhirah 1448 AH');
});

test('HTTP failures surface friendly messages', async () => {
  const failing = async () => ({ ok: false, status: 403, headers: { get: () => null }, body: streamOf(['{}']) });
  let message = '';
  try { await logic.fetchesHijri(failing, '2026-11-25'); } catch (error) { message = error.message; }
  assert.strictEqual(message, 'The public Aladhan API limited this request. Try again in a moment.');
  const notFound = async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) });
  message = '';
  try { await logic.fetchesHijri(notFound, '2026-11-25'); } catch (error) { message = error.message; }
  assert.ok(message.includes('was not found'));
});

test('a non-JSON payload is rejected as malformed', async () => {
  let message = '';
  try {
    await logic.fetchesHijri(async () => okResponse('<html>blocked</html>'), '2026-11-25');
  } catch (error) { message = error.message; }
  assert.ok(message.includes('could not be read'));
});

test('an oversized payload is rejected with an honest limit message', async () => {
  const big = samplePayload();
  big.data.padding = 'x'.repeat(300 * 1024);
  let message = '';
  try {
    await logic.fetchesHijri(async () => okResponse(JSON.stringify(big)), '2026-11-25');
  } catch (error) { message = error.message; }
  assert.ok(message.includes('too large'));
});

test('missing fetch degrades honestly', async () => {
  let message = '';
  try { await logic.fetchesHijri(null, '2026-11-25'); } catch (error) { message = error.message; }
  assert.ok(message.includes('fetch is unavailable'));
});
