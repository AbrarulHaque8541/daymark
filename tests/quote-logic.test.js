'use strict';

const test = require('node:test');
const assert = require('node:assert');

let logic;
if (typeof require === 'function') {
  logic = require('../quote-logic.js');
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

const sampleQuote = () => ([{ q: 'Those who realize their folly are not true fools.', a: 'Zhuangzi', h: '<blockquote>...</blockquote>' }]);

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
  assert.ok(record.text.includes('true fools'));
  assert.strictEqual(record.truncated, false);
  assert.strictEqual(record.author, 'Zhuangzi');
  assert.strictEqual(record.link, 'https://zenquotes.io');
});

test('parsesQuote throws on malformed payloads', () => {
  assert.throws(() => logic.parsesQuote(null), /malformed/);
  assert.throws(() => logic.parsesQuote([]), /malformed/);
  assert.throws(() => logic.parsesQuote([{}]), /malformed/);
  assert.throws(() => logic.parsesQuote([{ q: '   ' }]), /malformed/);
});

test('parsesQuote truncates very long quote text honestly', () => {
  const payload = sampleQuote();
  payload[0].q = 'a'.repeat(500);
  const record = logic.parsesQuote(payload);
  assert.strictEqual(record.truncated, true);
  assert.strictEqual(record.text.length, logic.maxTextChars);
});

test('classifyError explains limits and outages in plain words', () => {
  assert.ok(logic.classifiesError(new Error('HTTP 403')).includes('limited this request'));
  assert.ok(logic.classifiesError(new Error('HTTP 404')).includes('was not found'));
  assert.ok(logic.classifiesError(new Error('HTTP 502')).includes('server problem'));
  assert.ok(logic.classifiesError(new Error('The quote request timed out.')).includes('timed out'));
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

test('HTTP failures surface friendly messages', async () => {
  const failing = async () => ({ ok: false, status: 403, headers: { get: () => null }, body: streamOf(['{}']) });
  let message = '';
  try { await logic.fetchesQuote(failing, ''); } catch (error) { message = error.message; }
  assert.strictEqual(message, 'The zenquotes.io endpoint limited this request. Try again in a moment.');
});

test('a non-JSON payload is rejected as malformed', async () => {
  let message = '';
  try {
    await logic.fetchesQuote(async () => okResponse('<html>blocked</html>'), '');
  } catch (error) { message = error.message; }
  assert.ok(message.includes('could not be read'));
});

test('missing fetch degrades honestly', async () => {
  let message = '';
  try { await logic.fetchesQuote(null, ''); } catch (error) { message = error.message; }
  assert.ok(message.includes('fetch is unavailable'));
});
