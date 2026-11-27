'use strict';

const test = require('node:test');
const assert = require('node:assert');

let logic;
if (typeof require === 'function') {
  logic = require('../fact-logic.js');
}
if (!logic) logic = globalThis.DaymarkFact;

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

const sampleFact = () => ({
  id: 'bb551ba64c723bc76db78f1860abb264',
  text: '13% of Americans actually believe that some parts of the moon are made of cheese.',
  source: 'djtech.net',
  source_url: 'https://www.djtech.net/humor/shorty_useless_facts.htm',
  language: 'en',
  permalink: 'https://uselessfacts.jsph.pl/api/v2/facts/bb551ba64c723bc76db78f1860abb264'
});

test('normalizeFactMode treats empty values as the daily fact', () => {
  assert.strictEqual(logic.normalizeFactMode(null), 'today');
  assert.strictEqual(logic.normalizeFactMode(undefined), 'today');
  assert.strictEqual(logic.normalizeFactMode(''), 'today');
  assert.strictEqual(logic.normalizeFactMode('   '), 'today');
  assert.strictEqual(logic.normalizeFactMode('today'), 'today');
  assert.strictEqual(logic.normalizeFactMode('RANDOM'), 'random');
});

test('normalizeFactMode fails closed on junk modes', () => {
  assert.strictEqual(logic.normalizeFactMode('12x'), null);
  assert.strictEqual(logic.normalizeFactMode('tomorrow'), null);
  assert.strictEqual(logic.normalizeFactMode('42.5'), null);
  assert.strictEqual(logic.normalizeFactMode('random '), 'random');
});

test('buildsFactUrl pins the keyless uselessfacts.jsph.pl endpoints', () => {
  assert.strictEqual(logic.buildsFactUrl(''), 'https://uselessfacts.jsph.pl/api/v2/facts/today');
  assert.strictEqual(logic.buildsFactUrl(null), 'https://uselessfacts.jsph.pl/api/v2/facts/today');
  assert.strictEqual(logic.buildsFactUrl('random'), 'https://uselessfacts.jsph.pl/api/v2/facts/random');
  let thrown = null;
  try { logic.buildsFactUrl('not a mode'); } catch (error) { thrown = error; }
  assert.ok(thrown && thrown.message.includes('fact mode was not recognized'));
});

test('parsesFact reads a fact into an honest record', () => {
  const record = logic.parsesFact(sampleFact());
  assert.strictEqual(record.id, 'bb551ba64c723bc76db78f1860abb264');
  assert.ok(record.text.includes('moon are made of cheese'));
  assert.strictEqual(record.truncated, false);
  assert.strictEqual(record.source, 'djtech.net');
  assert.strictEqual(record.language, 'en');
  assert.strictEqual(record.link, 'https://uselessfacts.jsph.pl/api/v2/facts/bb551ba64c723bc76db78f1860abb264');
});

test('parsesFact accepts a numeric id and missing optional fields', () => {
  const payload = { id: 42, text: 'A short fact.', permalink: 'https://uselessfacts.jsph.pl/api/v2/facts/42' };
  const record = logic.parsesFact(payload);
  assert.strictEqual(record.id, '42');
  assert.strictEqual(record.source, '');
  assert.strictEqual(record.language, '');
});

test('parsesFact throws on malformed payloads', () => {
  assert.throws(() => logic.parsesFact(null), /malformed/);
  assert.throws(() => logic.parsesFact({}), /malformed/);
  assert.throws(() => logic.parsesFact({ id: 'x', text: '   ' }), /malformed/);
  assert.throws(() => logic.parsesFact({ id: 'x' }), /malformed/);
  assert.throws(() => logic.parsesFact({ text: 5 }), /malformed/);
});

test('parsesFact falls back to the site link on a foreign permalink', () => {
  const payload = sampleFact();
  payload.permalink = 'http://evil.example/track?x=1';
  const record = logic.parsesFact(payload);
  assert.strictEqual(record.link, 'https://uselessfacts.jsph.pl');
  payload.permalink = 'https://uselessfacts.jsph.pl/api/v2/facts/ok';
  assert.strictEqual(logic.parsesFact(payload).link, 'https://uselessfacts.jsph.pl/api/v2/facts/ok');
});

test('parsesFact honors a reported error envelope fail-closed', () => {
  assert.throws(() => logic.parsesFact({ error: true, message: 'No fact found' }), /malformed|could not/);
});

test('parsesFact truncates very long fact text honestly', () => {
  const payload = sampleFact();
  payload.text = 'a'.repeat(500);
  const record = logic.parsesFact(payload);
  assert.strictEqual(record.truncated, true);
  assert.strictEqual(record.text.length, logic.maxTextChars);
});

test('parsesFact trims surrounding whitespace from fact text', () => {
  const payload = sampleFact();
  payload.text = '  Padded fact.  ';
  assert.strictEqual(logic.parsesFact(payload).text, 'Padded fact.');
});

test('classifyError explains limits, misses and outages in plain words', () => {
  assert.ok(logic.classifiesError(new Error('HTTP 403')).includes('limited this request'));
  assert.ok(logic.classifiesError(new Error('HTTP 404')).includes('was not found'));
  assert.ok(logic.classifiesError(new Error('HTTP 400')).includes('rejected'));
  assert.ok(logic.classifiesError(new Error('HTTP 502')).includes('server problem'));
  assert.ok(logic.classifiesError(new Error('The fact request timed out.')).includes('timed out'));
  assert.ok(logic.classifiesError(new Error('The fact response was malformed.')).includes('could not be read'));
  assert.ok(logic.classifiesError(new Error('The fact response was too large to read safely. Try again later.')).includes('too large'));
  assert.ok(logic.classifiesError(new Error('The fact mode was not recognized.')).includes('today or random'));
  assert.strictEqual(logic.classifiesError(new Error('something odd')), null);
});

test('fetchesFact calls the public keyless endpoint for the requested mode', async () => {
  let requested = null;
  let initSeen = null;
  const fetchImpl = async (url, init) => { requested = url; initSeen = init; return okResponse(JSON.stringify(sampleFact())); };
  const record = await logic.fetchesFact(fetchImpl, '');
  assert.strictEqual(requested, 'https://uselessfacts.jsph.pl/api/v2/facts/today');
  assert.strictEqual(initSeen.cache, 'no-store');
  assert.strictEqual(record.url, requested);
  assert.strictEqual(record.mode, 'today');
  await logic.fetchesFact(fetchImpl, 'random');
  assert.strictEqual(requested, 'https://uselessfacts.jsph.pl/api/v2/facts/random');
});

test('a random-mode record is stamped with the random mode', async () => {
  const fetchImpl = async () => okResponse(JSON.stringify(sampleFact()));
  const record = await logic.fetchesFact(fetchImpl, '  RANDOM  ');
  assert.strictEqual(record.mode, 'random');
  assert.strictEqual(record.url, 'https://uselessfacts.jsph.pl/api/v2/facts/random');
});

test('HTTP failures surface friendly messages', async () => {
  const failing = async () => ({ ok: false, status: 403, headers: { get: () => null }, body: streamOf(['{}']) });
  let message = '';
  try { await logic.fetchesFact(failing, ''); } catch (error) { message = error.message; }
  assert.strictEqual(message, 'The uselessfacts.jsph.pl endpoint limited this request. Try again in a moment.');
  const notFound = async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) });
  message = '';
  try { await logic.fetchesFact(notFound, 'random'); } catch (error) { message = error.message; }
  assert.ok(message.includes('was not found'));
});

test('a non-JSON payload is rejected as malformed', async () => {
  let message = '';
  try {
    await logic.fetchesFact(async () => okResponse('<html>blocked</html>'), '');
  } catch (error) { message = error.message; }
  assert.ok(message.includes('could not be read'));
});

test('an oversized payload is rejected with an honest limit message', async () => {
  const big = sampleFact();
  big.text = 'x'.repeat(300 * 1024);
  let message = '';
  try {
    await logic.fetchesFact(async () => okResponse(JSON.stringify(big)), '');
  } catch (error) { message = error.message; }
  assert.ok(message.includes('too large'));
});

test('an unrecognized mode degrades with the bounded-choice message', async () => {
  let message = '';
  try { await logic.fetchesFact(async () => okResponse(JSON.stringify(sampleFact())), 'bogus'); }
  catch (error) { message = error.message; }
  assert.ok(message.includes('today or random'));
});

test('missing fetch degrades honestly', async () => {
  let message = '';
  try { await logic.fetchesFact(null, ''); } catch (error) { message = error.message; }
  assert.ok(message.includes('fetch is unavailable'));
});
