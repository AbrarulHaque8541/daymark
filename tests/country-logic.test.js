'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const countries = require('../country-logic.js');

// Minimal UTF-8 encoder so fixtures with non-ASCII symbols stay honest on
// every Node version without depending on TextEncoder.
function utf8Bytes(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        code = 0x10000 + ((code - 0xD800) * 0x400) + (next - 0xDC00);
        i += 1;
      }
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
    else if (code < 0x10000) bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
    else bytes.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 0x3F), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
  }
  return new Uint8Array(bytes);
}

function streamResponse(text, opts) {
  const o = opts || {};
  let given = o.ok === false ? undefined : text;
  return {
    ok: !o || o.ok !== false,
    status: o.status === undefined ? 200 : o.status,
    headers: { get: () => null },
    body: {
      getReader() {
        return {
          releaseLock() {},
          async read() {
            if (given === undefined || given === null) return { done: true };
            const chunk = given;
            given = null;
            return { value: utf8Bytes(chunk), done: false };
          }
        };
      }
    }
  };
}

const FIXTURE = JSON.stringify([
  {
    name: { common: 'India', official: 'Republic of India' },
    cca2: 'IN', cca3: 'IND',
    capital: ['New Delhi'],
    region: 'Asia',
    subregion: 'Southern Asia',
    population: 1408712000,
    timezones: ['UTC+05:30', 'UTC+05:30 elsewhere', 'UTC+06:00', 'UTC+06:00 elsewhere', 'UTC+07:00', 'UTC+07:00 elsewhere'],
    currencies: { INR: { name: 'Indian rupee', symbol: '\u20b9' } },
    flag: '\ud83c\uddee\ud83c\uddf3'
  }
]);

test('normalizeQuery trims, folds inner whitespace and allows real country spellings', () => {
  assert.equal(countries.normalizeQuery('  India  '), 'India');
  assert.equal(countries.normalizeQuery('united   states'), 'united states');
  assert.equal(countries.normalizeQuery("Cote d'Ivoire"), "Cote d'Ivoire");
  assert.equal(countries.normalizeQuery('Bosnia and Herzegovina'), 'Bosnia and Herzegovina');
});

test('normalizeQuery refuses too-short, too-long, punctuation-laden and control input', () => {
  assert.equal(countries.normalizeQuery(''), null);
  assert.equal(countries.normalizeQuery('A'), null);
  assert.equal(countries.normalizeQuery('a'.repeat(61)), null);
  assert.equal(countries.normalizeQuery('india<script>'), null);
  assert.equal(countries.normalizeQuery('India\n'), null);
  assert.equal(countries.normalizeQuery('India; drop'), null);
  assert.equal(countries.normalizeQuery(42), null);
  assert.equal(countries.normalizeQuery(null), null);
});

test('buildCountriesUrl pins the HTTPS endpoint and the field list', () => {
  assert.equal(
    countries.buildCountriesUrl('United States'),
    'https://restcountries.com/v3.1/name/United%20States?fields=name,cca2,cca3,capital,region,subregion,population,timezones,currencies,flag'
  );
  assert.throws(() => countries.buildCountriesUrl('x'));
});

test('capText truncates honestly and refuses empty or control input', () => {
  const long = countries.capText('x'.repeat(81), 80);
  assert.equal(long.text.length, 80);
  assert.equal(long.truncated, true);
  assert.equal(countries.capText('ok', 80).truncated, false);
  assert.equal(countries.capText('   ', 80), null);
  assert.equal(countries.capText('a\nb', 80), null);
});

test('formatPopulation groups digits and refuses non-numbers', () => {
  assert.equal(countries.formatPopulation(1408712000), '1,408,712,000');
  assert.equal(countries.formatPopulation(0), '0');
  assert.equal(countries.formatPopulation(-5), null);
  assert.equal(countries.formatPopulation(NaN), null);
  assert.equal(countries.formatPopulation('many'), null);
});

test('parseCountries maps the REST Countries shape honestly', () => {
  const result = countries.parseCountries(JSON.parse(FIXTURE));
  assert.equal(result.countries.length, 1);
  const c = result.countries[0];
  assert.equal(c.name, 'India');
  assert.equal(c.officialName, 'Republic of India');
  assert.deepEqual([c.cca2, c.cca3], ['IN', 'IND']);
  assert.equal(c.capital, 'New Delhi');
  assert.equal(c.region, 'Asia');
  assert.equal(c.subregion, 'Southern Asia');
  assert.equal(c.populationText, '1,408,712,000');
  assert.equal(c.timezones.length, 4);
  assert.equal(c.timezonesOmitted, 2);
  assert.equal(c.currencies[0].indexOf('INR') !== -1, true);
  assert.equal(c.currencies[0].indexOf('Indian rupee') !== -1, true);
  assert.equal(c.flag.length > 0, true);
});

test('parseCountries caps the rendered list and never guesses past it', () => {
  const many = [];
  for (let i = 0; i < 7; i += 1) {
    many.push({ name: { common: 'Land ' + (i + 1) }, region: 'Somewhere', population: 1000 * (i + 1) });
  }
  const result = countries.parseCountries(many);
  assert.equal(result.countries.length, countries.MAX_COUNTRIES);
  assert.equal(result.countries[0].name, 'Land 1');
});

test('parseCountries raises plain words for malformed payloads', () => {
  assert.throws(() => countries.parseCountries({}), /malformed/);
  assert.throws(() => countries.parseCountries('no'), /malformed/);
  assert.throws(() => countries.parseCountries([]), /No readable/);
  assert.throws(() => countries.parseCountries([{}]), /No readable/);
});

test('parseCountries counts honestly truncated names', () => {
  const payload = [{ name: { common: 'y'.repeat(100) } }];
  const result = countries.parseCountries(payload);
  assert.equal(result.countries[0].name.length, 80);
  assert.equal(result.truncatedFields >= 1, true);
});

test('classifyCountryError explains the public API failures in plain words', () => {
  assert.match(countries.classifyCountryError(new Error('HTTP 404')), /No country matched/);
  assert.match(countries.classifyCountryError(new Error('HTTP 429')), /limited/);
  assert.match(countries.classifyCountryError(new Error('HTTP 403')), /limited/);
  assert.match(countries.classifyCountryError(new Error('HTTP 418')), /rejected/);
  assert.match(countries.classifyCountryError(new Error('HTTP 500')), /server problem/);
  assert.match(countries.classifyCountryError(new Error('The country request timed out.')), /timed out/);
  assert.match(countries.classifyCountryError(new Error('too large')), /too large/);
  assert.equal(countries.classifyCountryError(new Error('weird world')), null);
  assert.equal(countries.classifyCountryError(null), null);
});

test('fetchCountries returns an honest stateless record and hardens the request', async () => {
  let seenUrl = '';
  let seenInit = null;
  const fetchImpl = async (url, init) => { seenUrl = url; seenInit = init; return streamResponse(FIXTURE); };
  const record = await countries.fetchCountries('  India  ', fetchImpl, { now: () => '2026-11-18T04:45:00Z' });
  assert.equal(record.version, 1);
  assert.equal(record.query, 'India');
  assert.equal(record.fetchedAt, '2026-11-18T04:45:00Z');
  assert.equal(record.countries.length, 1);
  assert.equal(seenUrl.indexOf('https://restcountries.com/v3.1/name/India?fields='), 0);
  assert.equal(seenInit.credentials, 'omit');
  assert.equal(seenInit.cache, 'no-store');
  assert.equal(seenInit.redirect, 'error');
  assert.deepEqual(seenInit.headers, { 'Accept': 'application/json' });
});

test('fetchCountries refuses bad input before any network call', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return streamResponse(FIXTURE); };
  await assert.rejects(() => countries.fetchCountries('', fetchImpl), /Enter a country name/);
  await assert.rejects(() => countries.fetchCountries('India\n', fetchImpl), /Enter a country name/);
  await assert.rejects(() => countries.fetchCountries(42, fetchImpl), /Enter a country name/);
  assert.equal(called, false);
});

test('fetchCountries surfaces nonzero statuses verbatim', async () => {
  await assert.rejects(() => countries.fetchCountries('India', async () => streamResponse('', { ok: false, status: 404 })), /HTTP 404/);
  await assert.rejects(() => countries.fetchCountries('India', async () => streamResponse('', { ok: false, status: 503 })), /HTTP 503/);
});

test('fetchCountries rejects response bodies that are not JSON', async () => {
  await assert.rejects(() => countries.fetchCountries('India', async () => streamResponse('not json')), /malformed/);
});
