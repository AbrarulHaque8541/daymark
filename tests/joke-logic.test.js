'use strict';

const test = require('node:test');
const assert = require('node:assert');

let logic;
if (typeof require === 'function') {
  logic = require('../joke-logic.js');
}
if (!logic) logic = globalThis.DaymarkJoke;

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

const sampleSingle = () => ({
  error: false,
  category: 'Programming',
  type: 'single',
  joke: 'A programmer puts two glasses on his bedside table before going to sleep: a full one, in case he gets thirsty, and an empty one, in case he does not.',
  id: 7
});

const sampleTwopart = () => ({
  error: false,
  category: 'Miscellaneous',
  type: 'twopart',
  setup: 'Why do programmers prefer dark mode?',
  delivery: 'Because light attracts bugs.',
  id: 42
});

test('normalizeJokeId treats empty values as a random joke', () => {
  assert.strictEqual(logic.normalizeJokeId(null), 0);
  assert.strictEqual(logic.normalizeJokeId(undefined), 0);
  assert.strictEqual(logic.normalizeJokeId(''), 0);
  assert.strictEqual(logic.normalizeJokeId('   '), 0);
  assert.strictEqual(logic.normalizeJokeId('42'), 42);
  assert.strictEqual(logic.normalizeJokeId('0'), 0);
});

test('normalizeJokeId fails closed on junk and out-of-range ids', () => {
  assert.strictEqual(logic.normalizeJokeId('12x'), -1);
  assert.strictEqual(logic.normalizeJokeId('-5'), -1);
  assert.strictEqual(logic.normalizeJokeId('100000'), -1);
  assert.strictEqual(logic.normalizeJokeId('99999'), 99999);
  assert.strictEqual(logic.normalizeJokeId(42.5), -1);
});

test('buildsJokeUrl pins the keyless jokeapi.dev safe-mode endpoints', () => {
  assert.strictEqual(logic.buildsJokeUrl(''), 'https://v2.jokeapi.dev/joke/Any?safe-mode&type=single,twopart');
  assert.strictEqual(logic.buildsJokeUrl(null), 'https://v2.jokeapi.dev/joke/Any?safe-mode&type=single,twopart');
  assert.strictEqual(logic.buildsJokeUrl('42'), 'https://v2.jokeapi.dev/joke/Any?safe-mode&type=single,twopart&idRange=42');
  assert.strictEqual(logic.buildsJokeUrl('0'), 'https://v2.jokeapi.dev/joke/Any?safe-mode&type=single,twopart&idRange=0');
  let thrown = null;
  try { logic.buildsJokeUrl('not a number'); } catch (error) { thrown = error; }
  assert.ok(thrown && thrown.message.includes('joke id was not recognized'));
});

test('parsesJoke reads a single-type joke into an honest record', () => {
  const record = logic.parsesJoke(sampleSingle());
  assert.strictEqual(record.type, 'single');
  assert.strictEqual(record.id, 7);
  assert.strictEqual(record.category, 'Programming');
  assert.ok(record.joke.includes('bedside table'));
  assert.strictEqual(record.jokeTruncated, false);
  assert.strictEqual(record.link, 'https://jokeapi.dev');
});

test('parsesJoke reads a twopart joke into setup and delivery', () => {
  const record = logic.parsesJoke(sampleTwopart());
  assert.strictEqual(record.type, 'twopart');
  assert.strictEqual(record.setup, 'Why do programmers prefer dark mode?');
  assert.strictEqual(record.delivery, 'Because light attracts bugs.');
  assert.strictEqual(record.setupTruncated, false);
  assert.strictEqual(record.deliveryTruncated, false);
});

test('parsesJoke throws on malformed payloads', () => {
  assert.throws(() => logic.parsesJoke(null), /malformed/);
  assert.throws(() => logic.parsesJoke({}), /malformed/);
  assert.throws(() => logic.parsesJoke({ error: false, id: 1, category: 'X', type: 'nope' }), /malformed/);
  assert.throws(() => logic.parsesJoke({ error: false, id: 1, category: 'X', type: 'single', joke: '   ' }), /malformed/);
  assert.throws(() => logic.parsesJoke({ error: false, id: 1, category: '  ', type: 'single', joke: 'x' }), /malformed/);
  assert.throws(() => logic.parsesJoke({ error: false, id: 1, category: 'X', type: 'twopart', setup: 'a' }), /malformed/);
  assert.throws(() => logic.parsesJoke({ error: false, id: 1, type: 'single', joke: 'x' }), /malformed/);
});

test('parsesJoke fails closed on a junk joke id', () => {
  const bad = sampleSingle();
  bad.id = 'not-a-number';
  assert.throws(() => logic.parsesJoke(bad), /malformed/);
  const negative = sampleSingle();
  negative.id = -3;
  assert.throws(() => logic.parsesJoke(negative), /malformed/);
});

test('parsesJoke honors the reported error envelope fail-closed', () => {
  assert.throws(() => logic.parsesJoke({ error: true, message: 'No matching joke found' }), /reported no joke/);
});

test('parsesJoke truncates very long joke text honestly', () => {
  const payload = sampleSingle();
  payload.joke = 'a'.repeat(500);
  const record = logic.parsesJoke(payload);
  assert.strictEqual(record.jokeTruncated, true);
  assert.strictEqual(record.joke.length, logic.maxTextChars);

  const two = sampleTwopart();
  two.delivery = 'b'.repeat(500);
  const record2 = logic.parsesJoke(two);
  assert.strictEqual(record2.deliveryTruncated, true);
  assert.strictEqual(record2.delivery.length, logic.maxTextChars);
});

test('parsesJoke trims surrounding whitespace from joke text', () => {
  const payload = sampleTwopart();
  payload.setup = '  Why so quiet?  ';
  const record = logic.parsesJoke(payload);
  assert.strictEqual(record.setup, 'Why so quiet?');
});

test('classifyError explains limits, misses and outages in plain words', () => {
  assert.ok(logic.classifiesError(new Error('HTTP 403')).includes('limited this request'));
  assert.ok(logic.classifiesError(new Error('HTTP 404')).includes('was not found'));
  assert.ok(logic.classifiesError(new Error('HTTP 400')).includes('rejected'));
  assert.ok(logic.classifiesError(new Error('HTTP 502')).includes('server problem'));
  assert.ok(logic.classifiesError(new Error('The joke request timed out.')).includes('timed out'));
  assert.ok(logic.classifiesError(new Error('The joke endpoint reported no joke: none found.')).includes('could not serve that joke'));
  assert.ok(logic.classifiesError(new Error('The joke response was malformed.')).includes('could not be read'));
  assert.ok(logic.classifiesError(new Error('The joke response was too large to read safely. Try again later.')).includes('too large'));
  assert.ok(logic.classifiesError(new Error('The joke id was not recognized.')).includes('between 0 and 99999'));
  assert.strictEqual(logic.classifiesError(new Error('something odd')), null);
});

test('fetchesJoke calls the public keyless endpoint with the requested id', async () => {
  let requested = null;
  let initSeen = null;
  const fetchImpl = async (url, init) => { requested = url; initSeen = init; return okResponse(JSON.stringify(sampleSingle())); };
  const record = await logic.fetchesJoke(fetchImpl, '');
  assert.strictEqual(requested, 'https://v2.jokeapi.dev/joke/Any?safe-mode&type=single,twopart');
  assert.strictEqual(initSeen.cache, 'no-store');
  assert.strictEqual(record.url, requested);
  await logic.fetchesJoke(fetchImpl, '42');
  assert.strictEqual(requested, 'https://v2.jokeapi.dev/joke/Any?safe-mode&type=single,twopart&idRange=42');
});

test('HTTP failures surface friendly messages', async () => {
  const failing = async () => ({ ok: false, status: 403, headers: { get: () => null }, body: streamOf(['{}']) });
  let message = '';
  try { await logic.fetchesJoke(failing, ''); } catch (error) { message = error.message; }
  assert.strictEqual(message, 'The jokeapi.dev endpoint limited this request. Try again in a moment.');
  const notFound = async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) });
  message = '';
  try { await logic.fetchesJoke(notFound, '99999'); } catch (error) { message = error.message; }
  assert.ok(message.includes('was not found'));
});

test('a non-JSON payload is rejected as malformed', async () => {
  let message = '';
  try {
    await logic.fetchesJoke(async () => okResponse('<html>blocked</html>'), '');
  } catch (error) { message = error.message; }
  assert.ok(message.includes('could not be read'));
});

test('an error-envelope payload (HTTP 200) degrades honestly', async () => {
  let message = '';
  try {
    await logic.fetchesJoke(async () => okResponse(JSON.stringify({ error: true, message: 'No matching joke found' })), '');
  } catch (error) { message = error.message; }
  assert.ok(message.includes('could not serve that joke'));
});

test('an oversized payload is rejected with an honest limit message', async () => {
  const big = sampleSingle();
  big.joke = 'x'.repeat(300 * 1024);
  let message = '';
  try {
    await logic.fetchesJoke(async () => okResponse(JSON.stringify(big)), '');
  } catch (error) { message = error.message; }
  assert.ok(message.includes('too large'));
});

test('an unrecognized joke id degrades with the bounded-range message', async () => {
  let message = '';
  try { await logic.fetchesJoke(async () => okResponse(JSON.stringify(sampleSingle())), 'bogus'); }
  catch (error) { message = error.message; }
  assert.ok(message.includes('between 0 and 99999'));
});

test('missing fetch degrades honestly', async () => {
  let message = '';
  try { await logic.fetchesJoke(null, ''); } catch (error) { message = error.message; }
  assert.ok(message.includes('fetch is unavailable'));
});
