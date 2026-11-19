'use strict';
// Tests for potd-logic.js: date handling, URL building, feed parsing,
// error wording, bounded keyless fetches and the stateless record shape.
const test = require('node:test');
const assert = require('node:assert');
const logic = globalThis.DaymarkPotd || require('../potd-logic.js');

function asciiBytes(text) {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 255;
  return bytes;
}
function streamOf(chunks) {
  let index = 0;
  let cancelled = false;
  return {
    getReader() {
      return {
        read() {
          if (index < chunks.length) {
            const chunk = asciiBytes(chunks[index]);
            index += 1;
            return Promise.resolve({ done: false, value: chunk });
          }
          return Promise.resolve({ done: true, value: undefined });
        },
        cancel() { cancelled = true; return Promise.resolve(); }
      };
    },
    _isCancelled() { return cancelled; }
  };
}
function okResponse(text) {
  return { ok: true, status: 200, headers: { get() { return null; } }, body: streamOf([text]) };
}
function fixturePayload() {
  return {
    tfa: {},
    image: {
      title: 'File:Harbour example.jpg',
      description: { text: 'A harbour at dusk' },
      artist: { text: '<a href="https://commons.wikimedia.org">Anne Example</a>' },
      license: { text: 'CC BY-SA 4.0' },
      file_page: 'https://commons.wikimedia.org/wiki/File:Harbour_example.jpg',
      image: { source: 'https://upload.wikimedia.org/wikipedia/commons/harbour.jpg', width: 1200, height: 800 },
      thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/harbour.jpg', width: 320, height: 213 }
    }
  };
}

test('normalizeDateParts accepts a valid numeric month/day pair', () => {
  const parts = logic.normalizeDateParts(11, 19);
  assert.ok(parts, 'expected a valid pair to normalize');
  assert.strictEqual(parts.month, 11);
  assert.strictEqual(parts.day, 19);
  assert.strictEqual(parts.padded, '11/19');
});
test('normalizeDateParts rejects out-of-calendar values fail-closed', () => {
  assert.strictEqual(logic.normalizeDateParts(13, 5), null);
  assert.strictEqual(logic.normalizeDateParts(0, 15), null);
  assert.strictEqual(logic.normalizeDateParts(11, 0), null);
  assert.strictEqual(logic.normalizeDateParts(11, 32), null);
  assert.strictEqual(logic.normalizeDateParts(2.5, 3), null);
});
test('normalizeDateParts parses MM-DD and MM/DD strings', () => {
  assert.strictEqual(logic.normalizeDateParts('08-05').padded, '08/05');
  assert.strictEqual(logic.normalizeDateParts('08/05').padded, '08/05');
  assert.strictEqual(logic.normalizeDateParts('8-5').padded, '08/05');
  assert.strictEqual(logic.normalizeDateParts('99-99'), null);
  assert.strictEqual(logic.normalizeDateParts('junk'), null);
});
test('datePartsFromIso extracts the month and day of an ISO timestamp', () => {
  assert.strictEqual(logic.datePartsFromIso('2026-11-19T03:00:00.000Z').padded, '11/19');
  assert.strictEqual(logic.datePartsFromIso('not a date'), null);
  assert.strictEqual(logic.datePartsFromIso(null), null);
});
test('buildPotdUrl targets the keyless Wikimedia featured feed', () => {
  const url = logic.buildPotdUrl(11, 19);
  assert.ok(url.indexOf('https://api.wikimedia.org/feed/v1/wikipedia/en/featured/') === 0, 'unexpected endpoint');
  assert.ok(url.indexOf('/11/19') !== -1, 'expected padded path');
});
test('buildPotdUrl throws a friendly error for impossible dates', () => {
  assert.throws(() => logic.buildPotdUrl(13, 40), /Enter a real calendar date/);
});
test('parsePotd maps the feed attribution fields honestly', () => {
  const picture = logic.parsePotd(fixturePayload());
  assert.strictEqual(picture.title, 'Harbour example.jpg');
  assert.strictEqual(picture.description, 'A harbour at dusk');
  assert.strictEqual(picture.artist, 'Anne Example');
  assert.strictEqual(picture.license, 'CC BY-SA 4.0');
  assert.strictEqual(picture.thumbUrl, 'https://upload.wikimedia.org/wikipedia/commons/thumb/harbour.jpg');
  assert.strictEqual(picture.imageUrl, 'https://upload.wikimedia.org/wikipedia/commons/harbour.jpg');
  assert.strictEqual(picture.filePage, 'https://commons.wikimedia.org/wiki/File:Harbour_example.jpg');
  assert.strictEqual(picture.width, 1200);
  assert.strictEqual(picture.height, 800);
  assert.strictEqual(picture.descriptionTruncated, false);
});
test('parsePotd fails closed on a malformed payload', () => {
  assert.throws(() => logic.parsePotd({}), /malformed/);
  assert.throws(() => logic.parsePotd(null), /malformed/);
});
test('parsePotd refuses payloads without a readable HTTPS picture', () => {
  assert.throws(() => logic.parsePotd({ image: { title: 'File:x.jpg' } }), /No readable picture/);
});
test('parsePotd rejects payloads with only non-HTTPS image sources', () => {
  const payload = fixturePayload();
  payload.image.image.source = 'http://upload.wikimedia.org/wikipedia/commons/harbour.jpg';
  payload.image.thumbnail.source = 'http://upload.wikimedia.org/wikipedia/commons/thumb/harbour.jpg';
  assert.throws(() => logic.parsePotd(payload), /No readable picture/);
});
test('parsePotd caps overly long metadata like the onthisday card', () => {
  const payload = fixturePayload();
  payload.image.title = 'File:' + 'x'.repeat(400);
  payload.image.description = { text: 'y'.repeat(900) };
  const picture = logic.parsePotd(payload);
  assert.strictEqual(picture.title.length, logic.MAX_TITLE_CHARS);
  assert.strictEqual(picture.description.length, logic.MAX_DESC_CHARS);
  assert.strictEqual(picture.descriptionTruncated, true);
});
test('classifyPotdError gives plain words for each failure family', () => {
  assert.strictEqual(
    logic.classifyPotdError(new Error('HTTP 403')),
    'Wikimedia limited this request (the free feed is rate-limited). Try again in a moment.'
  );
  assert.strictEqual(
    logic.classifyPotdError(new Error('HTTP 404')),
    'No picture feed exists for that date. Check the month and day.'
  );
  assert.strictEqual(
    logic.classifyPotdError(new Error('HTTP 500')),
    'Wikimedia had a server problem (HTTP 500). Try again in a moment.'
  );
  assert.strictEqual(
    logic.classifyPotdError(new Error('The picture request timed out.')),
    'The request timed out. Check your connection and try again.'
  );
  assert.strictEqual(logic.classifyPotdError(new Error('something odd')), null);
});
test('fetchJson reads a bounded JSON body through the shared reader', async () => {
  const payload = await logic.fetchJson('https://api.wikimedia.org/feed/x', () => Promise.resolve(okResponse(JSON.stringify({ ok: true }))));
  assert.strictEqual(payload.ok, true);
});
test('fetchJson sends keyless, no-store, credential-free requests', async () => {
  let captured = null;
  await logic.fetchJson('https://api.wikimedia.org/feed/x', (url, init) => {
    captured = init;
    return Promise.resolve(okResponse('{}'));
  });
  assert.ok(captured, 'expected request options to be captured');
  assert.strictEqual(captured.cache, 'no-store');
  assert.strictEqual(captured.credentials, 'omit');
  assert.strictEqual(captured.referrerPolicy, 'no-referrer');
  assert.strictEqual(captured.headers.Accept, 'application/json');
  assert.ok(captured.headers['Api-User-Agent'].indexOf('DaymarkWebPrototype') !== -1, 'expected the Daymark user agent');
  let rejected = null;
  await logic.fetchJson('https://api.wikimedia.org/feed/x', undefined).catch((error) => { rejected = error; });
  assert.ok(rejected, 'expected a rejection without a fetch implementation');
});
test('fetchJson surfaces HTTP errors in the shared plain-word shape', async () => {
  let reported = null;
  await logic.fetchJson('https://api.wikimedia.org/feed/x', () => Promise.resolve({ ok: false, status: 404 }))
    .catch((error) => { reported = error; });
  assert.ok(reported, 'expected an error');
  assert.strictEqual(logic.classifyPotdError(reported), 'No picture feed exists for that date. Check the month and day.');
});
test('fetchJson malformations fail closed with a friendly message', async () => {
  let reported = null;
  await logic.fetchJson('https://api.wikimedia.org/feed/x', () => Promise.resolve(okResponse('not json')))
    .catch((error) => { reported = error; });
  assert.ok(reported, 'expected an error');
  assert.strictEqual(reported.message, 'The picture-of-the-day response was malformed.');
});
test('fetchPotd returns a stateless record for an explicit date', async () => {
  let requestedUrl = null;
  const record = await logic.fetchPotd((url) => {
    requestedUrl = url;
    return Promise.resolve(okResponse(JSON.stringify(fixturePayload())));
  }, { month: 8, day: 5, now: () => '2026-11-19T03:00:00.000Z' });
  assert.ok(requestedUrl.indexOf('/08/05') !== -1, 'expected the requested date path');
  assert.strictEqual(record.month, 8);
  assert.strictEqual(record.day, 5);
  assert.strictEqual(record.picture.title, 'Harbour example.jpg');
  assert.strictEqual(record.fetchedAt, '2026-11-19T03:00:00.000Z');
});
test('fetchPotd defaults to today when no date is given', async () => {
  let requestedUrl = null;
  const record = await logic.fetchPotd((url) => {
    requestedUrl = url;
    return Promise.resolve(okResponse(JSON.stringify(fixturePayload())));
  }, { now: () => '2026-11-19T03:00:00.000Z' });
  assert.ok(requestedUrl.indexOf('/11/19') !== -1, 'expected the today path');
  assert.strictEqual(record.month, 11);
  assert.strictEqual(record.day, 19);
});
test('fetchPotd rejects an out-of-calendar explicit date', async () => {
  let reported = null;
  await logic.fetchPotd(() => Promise.resolve(okResponse('{}')), { month: 13, day: 1 })
    .catch((error) => { reported = error; });
  assert.ok(reported, 'expected an error');
  assert.ok(/Enter a real calendar date/.test(reported.message), 'unexpected wording');
});
