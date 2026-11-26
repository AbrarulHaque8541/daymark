'use strict';

const test = require('node:test');
const assert = require('node:assert');

let logic;
if (typeof require === 'function') {
  logic = require('../xkcd-logic.js');
}
if (!logic) logic = globalThis.DaymarkXkcd;

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
  month: '11',
  num: 3329,
  link: '',
  year: '2026',
  news: '',
  safe_title: 'Cesium Atom',
  transcript: '',
  alt: "We've all chipped in to buy the retiring committee chair a gold-plated cesium atom.",
  img: 'https://imgs.xkcd.com/comics/cesium_atom.png',
  title: 'Cesium Atom',
  day: '25'
});

test('normalizeComicNumber treats empty values as the latest comic', () => {
  assert.strictEqual(logic.normalizeComicNumber(null), 0);
  assert.strictEqual(logic.normalizeComicNumber(undefined), 0);
  assert.strictEqual(logic.normalizeComicNumber(''), 0);
  assert.strictEqual(logic.normalizeComicNumber('   '), 0);
  assert.strictEqual(logic.normalizeComicNumber('2871'), 2871);
});

test('normalizeComicNumber fails closed on junk and out-of-range numbers', () => {
  assert.strictEqual(logic.normalizeComicNumber('12x'), -1);
  assert.strictEqual(logic.normalizeComicNumber('-5'), -1);
  assert.strictEqual(logic.normalizeComicNumber('0'), -1);
  assert.strictEqual(logic.normalizeComicNumber('1000000'), -1);
  assert.strictEqual(logic.normalizeComicNumber('999999'), 999999);
  assert.strictEqual(logic.normalizeComicNumber(2871.5), -1);
});

test('buildsXkcdUrl pins the keyless xkcd.com endpoints', () => {
  assert.strictEqual(logic.buildsXkcdUrl(''), 'https://xkcd.com/info.0.json');
  assert.strictEqual(logic.buildsXkcdUrl(null), 'https://xkcd.com/info.0.json');
  assert.strictEqual(logic.buildsXkcdUrl('2871'), 'https://xkcd.com/2871/info.0.json');
  let thrown = null;
  try { logic.buildsXkcdUrl('not a number'); } catch (error) { thrown = error; }
  assert.ok(thrown && thrown.message.includes('comic number was not recognized'));
});

test('describesComicDate renders a plain-language date and rejects junk', () => {
  assert.strictEqual(logic.describesComicDate('25', '11', '2026'), 'November 25, 2026');
  assert.strictEqual(logic.describesComicDate('5', '3', '2006'), 'March 5, 2006');
  assert.strictEqual(logic.describesComicDate('31', '13', '2026'), null);
  assert.strictEqual(logic.describesComicDate('31', '00', '2026'), null);
  assert.strictEqual(logic.describesComicDate('00', '11', '2026'), null);
  assert.strictEqual(logic.describesComicDate('25', '11', '1989'), null);
  assert.strictEqual(logic.describesComicDate('x', '11', '2026'), null);
  assert.strictEqual(logic.describesComicDate(25, '11', '2026'), null);
});

test('parsesXkcd reads the xkcd.com JSON into an honest record', () => {
  const record = logic.parsesXkcd(samplePayload());
  assert.strictEqual(record.num, 3329);
  assert.strictEqual(record.title, 'Cesium Atom');
  assert.strictEqual(record.img, 'https://imgs.xkcd.com/comics/cesium_atom.png');
  assert.ok(record.alt.includes('gold-plated cesium atom'));
  assert.strictEqual(record.altTruncated, false);
  assert.strictEqual(record.comicDate, 'November 25, 2026');
  assert.strictEqual(record.link, 'https://xkcd.com/3329/');
});

test('parsesXkcd falls back to safe_title when title is missing', () => {
  const payload = samplePayload();
  delete payload.title;
  const record = logic.parsesXkcd(payload);
  assert.strictEqual(record.title, 'Cesium Atom');
});

test('parsesXkcd throws on malformed payloads', () => {
  assert.throws(() => logic.parsesXkcd(null), /malformed/);
  assert.throws(() => logic.parsesXkcd({}), /malformed/);
  assert.throws(() => logic.parsesXkcd({ num: 0 }), /malformed/);
  assert.throws(() => logic.parsesXkcd({ num: 3329 }), /malformed/);
});

test('parsesXkcd rejects non-HTTPS or foreign image hosts', () => {
  const insecure = samplePayload();
  insecure.img = 'http://imgs.xkcd.com/comics/cesium_atom.png';
  assert.throws(() => logic.parsesXkcd(insecure), /malformed/);
  const foreign = samplePayload();
  foreign.img = 'https://evil.example/comic.png';
  assert.throws(() => logic.parsesXkcd(foreign), /malformed/);
});

test('parsesXkcd fails closed on a bad comic date', () => {
  const bad = samplePayload();
  bad.year = '19x6';
  assert.throws(() => logic.parsesXkcd(bad), /malformed/);
});

test('parsesXkcd truncates a very long caption honestly', () => {
  const payload = samplePayload();
  payload.alt = 'a'.repeat(500);
  const record = logic.parsesXkcd(payload);
  assert.strictEqual(record.altTruncated, true);
  assert.strictEqual(record.alt.length, logic.maxAltChars);
});

test('classifyError explains limits, misses and outages in plain words', () => {
  assert.ok(logic.classifiesError(new Error('HTTP 403')).includes('limited this request'));
  assert.ok(logic.classifiesError(new Error('HTTP 404')).includes('was not found'));
  assert.ok(logic.classifiesError(new Error('HTTP 400')).includes('rejected'));
  assert.ok(logic.classifiesError(new Error('HTTP 502')).includes('server problem'));
  assert.ok(logic.classifiesError(new Error('The XKCD request timed out.')).includes('timed out'));
  assert.ok(logic.classifiesError(new Error('The XKCD response was malformed.')).includes('could not be read'));
  assert.ok(logic.classifiesError(new Error('The XKCD response was too large to read safely. Try again later.')).includes('too large'));
  assert.ok(logic.classifiesError(new Error('The comic number was not recognized.')).includes('between 1 and 999999'));
  assert.strictEqual(logic.classifiesError(new Error('something odd')), null);
});

test('fetchesXkcd calls the public keyless endpoint with the requested comic', async () => {
  let requested = null;
  let initSeen = null;
  const fetchImpl = async (url, init) => { requested = url; initSeen = init; return okResponse(JSON.stringify(samplePayload())); };
  const record = await logic.fetchesXkcd(fetchImpl, '');
  assert.strictEqual(requested, 'https://xkcd.com/info.0.json');
  assert.strictEqual(initSeen.cache, 'no-store');
  assert.strictEqual(record.url, 'https://xkcd.com/info.0.json');
  const again = await logic.fetchesXkcd(fetchImpl, '2871');
  assert.strictEqual(requested, 'https://xkcd.com/2871/info.0.json');
  assert.strictEqual(again.url, 'https://xkcd.com/2871/info.0.json');
});

test('HTTP failures surface friendly messages', async () => {
  const failing = async () => ({ ok: false, status: 403, headers: { get: () => null }, body: streamOf(['{}']) });
  let message = '';
  try { await logic.fetchesXkcd(failing, ''); } catch (error) { message = error.message; }
  assert.strictEqual(message, 'The xkcd.com endpoint limited this request. Try again in a moment.');
  const notFound = async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) });
  message = '';
  try { await logic.fetchesXkcd(notFound, '999999'); } catch (error) { message = error.message; }
  assert.ok(message.includes('was not found'));
});

test('a non-JSON payload is rejected as malformed', async () => {
  let message = '';
  try {
    await logic.fetchesXkcd(async () => okResponse('<html>blocked</html>'), '');
  } catch (error) { message = error.message; }
  assert.ok(message.includes('could not be read'));
});

test('an oversized payload is rejected with an honest limit message', async () => {
  const big = samplePayload();
  big.news = 'x'.repeat(300 * 1024);
  let message = '';
  try {
    await logic.fetchesXkcd(async () => okResponse(JSON.stringify(big)), '');
  } catch (error) { message = error.message; }
  assert.ok(message.includes('too large'));
});

test('an out-of-range comic number degrades with the bounded-range message', async () => {
  let message = '';
  try { await logic.fetchesXkcd(async () => okResponse(JSON.stringify(samplePayload())), 'bogus'); }
  catch (error) { message = error.message; }
  assert.ok(message.includes('between 1 and 999999'));
});

test('missing fetch degrades honestly', async () => {
  let message = '';
  try { await logic.fetchesXkcd(null, ''); } catch (error) { message = error.message; }
  assert.ok(message.includes('fetch is unavailable'));
});

