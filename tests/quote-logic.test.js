'use strict';

const test = require('node:test');
const assert = require('node:assert');

let logic;
if (typeof require === 'function') {
  logic = require('../quotable-logic.js');
}
if (!logic) logic = globalThis.DaymarkQuote;

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

const sampleQuote = () => ([{
  q: 'Life is about choice. You can choose to be a victim or anything else you like to be.',
  a: 'Celestine Chua',
  h: '<blockquote>&ldquo;Life is about choice.&rdquo;</blockquote>'
}]);

test('normalizeQuoteMode treats empty values as the daily quote', () => {
  assert.strictEqual(logic.normalizeQuoteMode(null), 'today');
  assert.strictEqual(logic.normalizeQuoteMode(undefined), 'today');
  assert.strictEqual(logic.normalizeQuoteMode(''), 'today');
  assert.strictEqual(logic.normalizeQuoteMode('   '), 'today');
  assert.strictEqual(logic.normalizeQuoteMode('today'), 'today');
  assert.strictEqual(logic.normalizeQuoteMode('RANDOM'), 'random');
});

test('normalizeQuoteMode fails closed on junk modes', () => {
  assert.strictEqual(logic.normalizeQuoteMode('12x'), null);
  assert.strictEqual(logic.normalizeQuoteMode('tomorrow'), null);
  assert.strictEqual(logic.normalizeQuoteMode('42.5'), null);
  assert.strictEqual(logic.normalizeQuoteMode('random '), 'random');
});

test('buildsQuoteUrl pins the keyless zenquotes.io endpoints', () => {
  assert.strictEqual(logic.buildsQuoteUrl(''), 'https://zenquotes.io/api/today');
  assert.strictEqual(logic.buildsQuoteUrl(null), 'https://zenquotes.io/api/today');
  assert.strictEqual(logic.buildsQuoteUrl('random'), 'https://zenquotes.io/api/random');
  let thrown = null;
  try { logic.buildsQuoteUrl('not a mode'); } catch (error) { thrown = error; }
  assert.ok(thrown && thrown.message.includes('quote mode was not recognized'));
});

test('parsesQuote reads a quote into an honest record', () => {
  const record = logic.parsesQuote(sampleQuote());
  assert.ok(record.quote.includes('Life is about choice'));
  assert.strictEqual(record.quoteTruncated, false);
  assert.strictEqual(record.author, 'Celestine Chua');
  assert.strictEqual(record.authorTruncated, false);
  assert.strictEqual(record.link, 'https://zenquotes.io/');
});

test('parsesQuote accepts a missing author without failing', () => {
  const payload = [{ q: 'A short quote.' }];
  const record = logic.parsesQuote(payload);
  assert.strictEqual(record.author, '');
  assert.strictEqual(record.authorTruncated, false);
});

test('parsesQuote throws on malformed payloads', () => {
  assert.throws(() => logic.parsesQuote(null), /malformed/);
  assert.throws(() => logic.parsesQuote([]), /malformed/);
  assert.throws(() => logic.parsesQuote([{}]), /malformed/);
  assert.throws(() => logic.parsesQuote([{ q: '   ' }]), /malformed/);
  assert.throws(() => logic.parsesQuote({ q: 'not an array' }), /malformed/);
  assert.throws(() => logic.parsesQuote([{ error: true, q: 'x' }]), /malformed/);
});

test('parsesQuote truncates very long quote text honestly', () => {
  const payload = sampleQuote();
  payload[0].q = 'a'.repeat(500);
  const record = logic.parsesQuote(payload);
  assert.strictEqual(record.quoteTruncated, true);
  assert.strictEqual(record.quote.length, logic.maxQuoteChars);
  assert.strictEqual(record.authorTruncated, false);
});

test('parsesQuote truncates very long author text honestly', () => {
  const payload = sampleQuote();
  payload[0].a = 'b'.repeat(120);
  const record = logic.parsesQuote(payload);
  assert.strictEqual(record.authorTruncated, true);
  assert.strictEqual(record.author.length, logic.maxAuthorChars);
  assert.strictEqual(record.quoteTruncated, false);
});

test('parsesQuote trims surrounding whitespace from quote and author', () => {
  const payload = sampleQuote();
  payload[0].q = '  Padded quote.  ';
  payload[0].a = '  Padded author.  ';
  const record = logic.parsesQuote(payload);
  assert.strictEqual(record.quote, 'Padded quote.');
  assert.strictEqual(record.author, 'Padded author.');
});

test('classifyError explains limits, misses and outages in plain words', () => {
  assert.ok(logic.classifiesError(new Error('HTTP 403')).includes('limited this request'));
  assert.ok(logic.classifiesError(new Error('HTTP 404')).includes('was not found'));
  assert.ok(logic.classifiesError(new Error('HTTP 400')).includes('rejected'));
  assert.ok(logic.classifiesError(new Error('HTTP 502')).includes('server problem'));
  assert.ok(logic.classifiesError(new Error('The quote request timed out.')).includes('timed out'));
  assert.ok(logic.classifiesError(new Error('The quote response was malformed.')).includes('could not be read'));
  assert.ok(logic.classifiesError(new Error('The quote response was too large to read safely. Try again later.')).includes('too large'));
  assert.ok(logic.classifiesError(new Error('The quote mode was not recognized.')).includes('today or random'));
  assert.strictEqual(logic.classifiesError(new Error('something odd')), null);
});

test('fetchesQuote calls the public keyless endpoint for the requested mode', async () => {
  let requested = null;
  let initSeen = null;
  const fetchImpl = async (url, init) => { requested = url; initSeen = init; return okResponse(JSON.stringify(sampleQuote())); };
  const record = await logic.fetchesQuote(fetchImpl, '');
  assert.strictEqual(requested, 'https://zenquotes.io/api/today');
  assert.strictEqual(initSeen.cache, 'no-store');
  assert.strictEqual(record.url, requested);
  assert.strictEqual(record.mode, 'today');
  await logic.fetchesQuote(fetchImpl, 'random');
  assert.strictEqual(requested, 'https://zenquotes.io/api/random');
});

test('a random-mode record is stamped with the random mode', async () => {
  const fetchImpl = async () => okResponse(JSON.stringify(sampleQuote()));
  const record = await logic.fetchesQuote(fetchImpl, '  RANDOM  ');
  assert.strictEqual(record.mode, 'random');
  assert.strictEqual(record.url, 'https://zenquotes.io/api/random');
});

test('HTTP failures surface friendly messages', async () => {
  const failing = async () => ({ ok: false, status: 403, headers: { get: () => null }, body: streamOf(['{}']) });
  let message = '';
  try { await logic.fetchesQuote(failing, ''); } catch (error) { message = error.message; }
  assert.strictEqual(message, 'The zenquotes.io endpoint limited this request. Try again in a moment.');
  const notFound = async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) });
  message = '';
  try { await logic.fetchesQuote(notFound, 'random'); } catch (error) { message = error.message; }
  assert.ok(message.includes('was not found'));
});

test('a non-JSON payload is rejected as malformed', async () => {
  let message = '';
  try {
    await logic.fetchesQuote(async () => okResponse('<html>blocked</html>'), '');
  } catch (error) { message = error.message; }
  assert.ok(message.includes('could not be read'));
});

test('an oversized payload is rejected with an honest limit message', async () => {
  const big = sampleQuote();
  big[0].q = 'x'.repeat(300 * 1024);
  let message = '';
  try {
    await logic.fetchesQuote(async () => okResponse(JSON.stringify(big)), '');
  } catch (error) { message = error.message; }
  assert.ok(message.includes('too large'));
});

test('an unrecognized mode degrades with the bounded-choice message', async () => {
  let message = '';
  try { await logic.fetchesQuote(async () => okResponse(JSON.stringify(sampleQuote())), 'bogus'); }
  catch (error) { message = error.message; }
  assert.ok(message.includes('today or random'));
});

test('missing fetch degrades honestly', async () => {
  let message = '';
  try { await logic.fetchesQuote(null, ''); } catch (error) { message = error.message; }
  assert.ok(message.includes('fetch is unavailable'));
});
