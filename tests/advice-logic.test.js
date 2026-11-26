'use strict';

const test = require('node:test');
const assert = require('node:assert');

let logic;
if (typeof require === 'function') {
  logic = require('../advice-logic.js');
}
if (!logic) logic = globalThis.DaymarkAdvice;

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
  slip: {
    id: 217,
    advice: 'Do not fall in love with the first thing that catches your eye; look twice.'
  }
});

test('normalizeSlipId treats empty values as a random slip', () => {
  assert.strictEqual(logic.normalizeSlipId(null), 0);
  assert.strictEqual(logic.normalizeSlipId(undefined), 0);
  assert.strictEqual(logic.normalizeSlipId(''), 0);
  assert.strictEqual(logic.normalizeSlipId('   '), 0);
  assert.strictEqual(logic.normalizeSlipId('217'), 217);
});

test('normalizeSlipId fails closed on junk and out-of-range ids', () => {
  assert.strictEqual(logic.normalizeSlipId('12x'), -1);
  assert.strictEqual(logic.normalizeSlipId('-5'), -1);
  assert.strictEqual(logic.normalizeSlipId('0'), -1);
  assert.strictEqual(logic.normalizeSlipId('100000'), -1);
  assert.strictEqual(logic.normalizeSlipId('99999'), 99999);
  assert.strictEqual(logic.normalizeSlipId(217.5), -1);
});

test('buildsAdviceUrl pins the keyless adviceslip.com endpoints', () => {
  assert.strictEqual(logic.buildsAdviceUrl(''), 'https://api.adviceslip.com/advice');
  assert.strictEqual(logic.buildsAdviceUrl(null), 'https://api.adviceslip.com/advice');
  assert.strictEqual(logic.buildsAdviceUrl('217'), 'https://api.adviceslip.com/advice/217');
  let thrown = null;
  try { logic.buildsAdviceUrl('not a number'); } catch (error) { thrown = error; }
  assert.ok(thrown && thrown.message.includes('advice id was not recognized'));
});

test('parsesAdvice reads the adviceslip.com JSON into an honest record', () => {
  const record = logic.parsesAdvice(samplePayload());
  assert.strictEqual(record.id, 217);
  assert.ok(record.advice.includes('look twice'));
  assert.strictEqual(record.adviceTruncated, false);
  assert.strictEqual(record.link, 'https://adviceslip.com/advice/217');
});

test('parsesAdvice throws on malformed payloads', () => {
  assert.throws(() => logic.parsesAdvice(null), /malformed/);
  assert.throws(() => logic.parsesAdvice({}), /malformed/);
  assert.throws(() => logic.parsesAdvice({ slip: null }), /malformed/);
  assert.throws(() => logic.parsesAdvice({ slip: { id: 0, advice: 'x' } }), /malformed/);
  assert.throws(() => logic.parsesAdvice({ slip: { id: 217 } }), /malformed/);
  assert.throws(() => logic.parsesAdvice({ slip: { id: 217, advice: '   ' } }), /malformed/);
});

test('parsesAdvice fails closed on a junk slip id', () => {
  const bad = samplePayload();
  bad.slip.id = 'not-a-number';
  assert.throws(() => logic.parsesAdvice(bad), /malformed/);
});

test('parsesAdvice truncates very long advice honestly', () => {
  const payload = samplePayload();
  payload.slip.advice = 'a'.repeat(500);
  const record = logic.parsesAdvice(payload);
  assert.strictEqual(record.adviceTruncated, true);
  assert.strictEqual(record.advice.length, logic.maxAdviceChars);
});

test('parsesAdvice trims surrounding whitespace from the advice text', () => {
  const payload = samplePayload();
  payload.slip.advice = '  Breathe.  ';
  const record = logic.parsesAdvice(payload);
  assert.strictEqual(record.advice, 'Breathe.');
});

test('classifyError explains limits, misses and outages in plain words', () => {
  assert.ok(logic.classifiesError(new Error('HTTP 403')).includes('limited this request'));
  assert.ok(logic.classifiesError(new Error('HTTP 404')).includes('was not found'));
  assert.ok(logic.classifiesError(new Error('HTTP 400')).includes('rejected'));
  assert.ok(logic.classifiesError(new Error('HTTP 502')).includes('server problem'));
  assert.ok(logic.classifiesError(new Error('The advice request timed out.')).includes('timed out'));
  assert.ok(logic.classifiesError(new Error('The advice response was malformed.')).includes('could not be read'));
  assert.ok(logic.classifiesError(new Error('The advice response was too large to read safely. Try again later.')).includes('too large'));
  assert.ok(logic.classifiesError(new Error('The advice id was not recognized.')).includes('between 1 and 99999'));
  assert.strictEqual(logic.classifiesError(new Error('something odd')), null);
});

test('fetchesAdvice calls the public keyless endpoint with the requested slip', async () => {
  let requested = null;
  let initSeen = null;
  const fetchImpl = async (url, init) => { requested = url; initSeen = init; return okResponse(JSON.stringify(samplePayload())); };
  const record = await logic.fetchesAdvice(fetchImpl, '');
  assert.strictEqual(requested, 'https://api.adviceslip.com/advice');
  assert.strictEqual(initSeen.cache, 'no-store');
  assert.strictEqual(record.url, 'https://api.adviceslip.com/advice');
  const again = await logic.fetchesAdvice(fetchImpl, '217');
  assert.strictEqual(requested, 'https://api.adviceslip.com/advice/217');
  assert.strictEqual(again.url, 'https://api.adviceslip.com/advice/217');
});

test('HTTP failures surface friendly messages', async () => {
  const failing = async () => ({ ok: false, status: 403, headers: { get: () => null }, body: streamOf(['{}']) });
  let message = '';
  try { await logic.fetchesAdvice(failing, ''); } catch (error) { message = error.message; }
  assert.strictEqual(message, 'The adviceslip.com endpoint limited this request. Try again in a moment.');
  const notFound = async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) });
  message = '';
  try { await logic.fetchesAdvice(notFound, '99999'); } catch (error) { message = error.message; }
  assert.ok(message.includes('was not found'));
});

test('a non-JSON payload is rejected as malformed', async () => {
  let message = '';
  try {
    await logic.fetchesAdvice(async () => okResponse('<html>blocked</html>'), '');
  } catch (error) { message = error.message; }
  assert.ok(message.includes('could not be read'));
});

test('an oversized payload is rejected with an honest limit message', async () => {
  const big = samplePayload();
  big.slip.advice = 'x'.repeat(300 * 1024);
  let message = '';
  try {
    await logic.fetchesAdvice(async () => okResponse(JSON.stringify(big)), '');
  } catch (error) { message = error.message; }
  assert.ok(message.includes('too large'));
});

test('an unrecognized slip id degrades with the bounded-range message', async () => {
  let message = '';
  try { await logic.fetchesAdvice(async () => okResponse(JSON.stringify(samplePayload())), 'bogus'); }
  catch (error) { message = error.message; }
  assert.ok(message.includes('between 1 and 99999'));
});

test('missing fetch degrades honestly', async () => {
  let message = '';
  try { await logic.fetchesAdvice(null, ''); } catch (error) { message = error.message; }
  assert.ok(message.includes('fetch is unavailable'));
});
