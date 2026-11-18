'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../country-logic.js');

test('normalizeQuery rejects short, long, and control-character input', () => {
  assert.equal(logic.normalizeQuery('a'), null);
  assert.equal(logic.normalizeQuery('  Japan  '), 'Japan');
  assert.equal(logic.normalizeQuery('x'.repeat(61)), null);
  assert.equal(logic.normalizeQuery('bad\u0000name'), null);
});

test('buildCountriesUrl encodes the query', () => {
  const url = logic.buildCountriesUrl('New Zealand');
  assert.match(url, /restcountries\.com\/v3\.1\/name\/New%20Zealand/);
});

test('parseResponse extracts capped country list and truncation flag', () => {
  const payload = JSON.stringify([
    { name: { common: 'Japan' }, capital: ['Tokyo'], population: 125800000, region: 'Asia' },
    { name: { common: 'Jordan' }, capital: ['Amman'], population: 10200000, region: 'Asia' }
  ]);
  const result = logic.parseResponse(payload);
  assert.equal(result.countries.length, 2);
  assert.equal(result.countries[0].name, 'Japan');
  assert.equal(result.truncated, false);
});

test('parseResponse fails closed on empty or malformed payloads', () => {
  assert.throws(() => logic.parseResponse('[]'), /No matching country/);
  assert.throws(() => logic.parseResponse('not-json'), /unexpected response/);
});
