'use strict';

const test = require('node:test');
const assertStrict = require('node:assert/strict');
const holidays = require('../holidays-logic.js');

const HOLIDAYS_BODY = JSON.stringify([
  { date: '2026-01-26', localName: 'Republic Day', name: 'Republic Day', countryCode: 'IN', global: true },
  { date: '2026-10-02', localName: 'Gandhi Jayanti', name: 'Gandhi Jayanti', countryCode: 'IN', global: true },
  { date: '2026-12-25', localName: 'Christmas Day', name: 'Christmas Day', countryCode: 'IN', global: true },
  { date: 'bad-date', localName: 'Broken', name: 'Broken entry', countryCode: 'IN', global: false },
  { date: '2026-03-21', localName: '', name: '', countryCode: 'IN', global: false }
]);

function jsonResponse(body) {
  return { ok: true, status: 200, text: () => Promise.resolve(body) };
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

test('country codes are normalized to two uppercase letters', () => {
  assertStrict.equal(holidays.normalizeCountryCode('  in '), 'IN');
  assertStrict.equal(holidays.normalizeCountryCode('us'), 'US');
  assertStrict.equal(holidays.normalizeCountryCode('IND'), null);
  assertStrict.equal(holidays.normalizeCountryCode('i1'), null);
  assertStrict.equal(holidays.normalizeCountryCode(123), null);
  assertStrict.equal(holidays.normalizeCountryCode('   '), null);
});

test('the endpoint is the https-only Nager.Date public-holidays URL', () => {
  assertStrict.equal(holidays.ENDPOINT, 'https://date.nager.at/api/v3/PublicHolidays');
  assertStrict.equal(holidays.buildHolidaysUrl('in', 2026), 'https://date.nager.at/api/v3/PublicHolidays/2026/IN');
  assertStrict.throws(() => holidays.buildHolidaysUrl('IND', 2026), /two-letter country code/);
  assertStrict.throws(() => holidays.buildHolidaysUrl('IN', 1999), /year is out of range/);
  assertStrict.throws(() => holidays.buildHolidaysUrl('IN', '2026'), /year is out of range/);
});

test('holiday payloads are parsed, cleaned, deduped, and sorted', () => {
  const payload = JSON.parse(HOLIDAYS_BODY).concat([
    { date: '2026-10-02', localName: 'Gandhi Jayanti', name: 'Gandhi Jayanti', countryCode: 'IN', global: true }
  ]);
  const parsed = holidays.parseHolidays(payload, 'in');
  assertStrict.equal(parsed.countryCode, 'IN');
  assertStrict.deepEqual(parsed.holidays.map((holiday) => holiday.date),
    ['2026-01-26', '2026-10-02', '2026-12-25']);
  assertStrict.equal(parsed.holidays[1].name, 'Gandhi Jayanti');
  assertStrict.equal(parsed.holidays[1].global, true);
  assertStrict.equal(parsed.holidays[2].localName, 'Christmas Day');
  assertStrict.throws(() => holidays.parseHolidays('nope', 'IN'), /malformed/);
  assertStrict.throws(() => holidays.parseHolidays([], 'IN'), /no readable public holidays/);
  assertStrict.throws(() => holidays.parseHolidays(JSON.parse(HOLIDAYS_BODY), 'IND'),
    /two-letter country code/);
});

test('isValidHoliday and validateHolidayCache guard the cache shape', () => {
  const cache = {
    version: 1,
    countryCode: 'IN',
    year: 2026,
    holidays: holidays.parseHolidays(JSON.parse(HOLIDAYS_BODY), 'IN').holidays,
    fetchedAt: '2026-11-06T12:00:00.000Z'
  };
  assertStrict.ok(holidays.validateHolidayCache(cache));
  assertStrict.ok(!holidays.validateHolidayCache({ ...cache, version: 2 }));
  assertStrict.ok(!holidays.validateHolidayCache({ ...cache, countryCode: 'ind' }));
  assertStrict.ok(!holidays.validateHolidayCache({ ...cache, year: '2026' }));
  assertStrict.ok(!holidays.validateHolidayCache({ ...cache, fetchedAt: 'nope' }));
  assertStrict.ok(!holidays.validateHolidayCache({ ...cache, holidays: [] }));
  assertStrict.ok(!holidays.validateHolidayCache(null));
  assertStrict.ok(!holidays.isValidHoliday({ date: '2026-13-01', name: 'X', localName: '', global: true }));
  assertStrict.ok(!holidays.isValidHoliday({ date: '2026-01-01', name: '', localName: '', global: true }));
  assertStrict.ok(!holidays.isValidHoliday({ date: '2026-01-01', name: 'X', localName: '', global: 'yes' }));
  assertStrict.ok(holidays.isValidHoliday({ date: '2026-01-01', name: 'X', localName: 'Y', global: false }));
});

test('fetchHolidays fetches the current year for a country code', async () => {
  const fetchImpl = routeFetch([
    { prefix: holidays.ENDPOINT, body: HOLIDAYS_BODY }
  ]);
  const result = await holidays.fetchHolidays(' in ', fetchImpl, {
    now: () => '2026-11-06T12:00:00.000Z'
  });
  assertStrict.equal(fetchImpl.seen.length, 1);
  assertStrict.equal(fetchImpl.seen[0], 'https://date.nager.at/api/v3/PublicHolidays/2026/IN');
  assertStrict.equal(result.version, 1);
  assertStrict.equal(result.countryCode, 'IN');
  assertStrict.equal(result.year, 2026);
  assertStrict.equal(result.fetchedAt, '2026-11-06T12:00:00.000Z');
  assertStrict.ok(holidays.validateHolidayCache(result));
});

test('fetchHolidays honors an explicit year option', async () => {
  const fetchImpl = routeFetch([
    { prefix: holidays.ENDPOINT, body: HOLIDAYS_BODY }
  ]);
  await holidays.fetchHolidays('US', fetchImpl, {
    year: 2027,
    now: () => '2026-11-06T12:00:00.000Z'
  });
  assertStrict.equal(fetchImpl.seen[0], 'https://date.nager.at/api/v3/PublicHolidays/2027/US');
});

test('fetchHolidays reports friendly errors', async () => {
  await assertStrict.rejects(
    holidays.fetchHolidays('IND', routeFetch([])),
    /two-letter country code/
  );
  await assertStrict.rejects(
    holidays.fetchHolidays('IN', null),
    /fetch unavailable/
  );
  await assertStrict.rejects(
    holidays.fetchHolidays('IN', routeFetch([
      { prefix: holidays.ENDPOINT, body: () => ({ ok: false, status: 404, text: () => Promise.resolve('') }) }
    ]), { now: () => '2026-11-06T12:00:00.000Z' }),
    /HTTP 404/
  );
  await assertStrict.rejects(
    holidays.fetchHolidays('IN', routeFetch([
      { prefix: holidays.ENDPOINT, body: 'not json' }
    ]), { now: () => '2026-11-06T12:00:00.000Z' }),
    /malformed/
  );
  await assertStrict.rejects(
    holidays.fetchHolidays('IN', routeFetch([
      { prefix: holidays.ENDPOINT, body: '[]' }
    ]), { now: () => '2026-11-06T12:00:00.000Z' }),
    /no readable public holidays/
  );
});

test('oversized responses are rejected before parsing', async () => {
  const huge = 'x'.repeat(holidays.MAX_JSON_CHARS + 1);
  await assertStrict.rejects(
    holidays.fetchHolidays('IN', routeFetch([
      { prefix: holidays.ENDPOINT, body: () => ({ ok: true, status: 200, text: () => Promise.resolve(huge) }) }
    ]), { now: () => '2026-11-06T12:00:00.000Z' }),
    /too large/
  );
});

test('a hanging request times out', async () => {
  const hanging = () => new Promise(() => {});
  await assertStrict.rejects(
    holidays.fetchHolidays('IN', hanging, { timeoutMs: 10, now: () => '2026-11-06T12:00:00.000Z' }),
    /timed out/
  );
});

test('the module exposes its API and stays inert under Node', () => {
  assertStrict.equal(typeof holidays.fetchHolidays, 'function');
  assertStrict.equal(typeof globalThis.DaymarkHolidays, 'object');
  assertStrict.equal(holidays.MAX_HOLIDAYS, 60);
});
