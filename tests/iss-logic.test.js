'use strict';
// Tests for iss-logic.js: URL building, record validation, error wording,
// bounded keyless fetches and the stateless position record shape.
const test = require('node:test');
const assert = require('node:assert');
const logic = globalThis.DaymarkIss || require('../iss-logic.js');

function asciiBytes(text) {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 255;
  return bytes;
}
function streamOf(chunks) {
  let index = 0;
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
        cancel() { return Promise.resolve(); }
      };
    }
  };
}
function okResponse(text) {
  return { ok: true, status: 200, headers: { get() { return null; } }, body: streamOf([text]) };
}
function fixturePayload() {
  return {
    name: 'iss',
    latitude: 19.654382,
    longitude: -63.532708,
    altitude: 421.2187,
    velocity: 27597.318,
    visibility: 'daylight',
    timestamp: 1732000000
  };
}

test('buildIssUrl targets the keyless wheretheiss.at satellite endpoint over HTTPS', () => {
  const url = logic.buildIssUrl();
  assert.strictEqual(url, 'https://api.wheretheiss.at/v1/satellites/25544');
});
test('parseIss maps the feed record into an honest plain-number position', () => {
  const position = logic.parseIss(fixturePayload());
  assert.strictEqual(position.version, 1);
  assert.strictEqual(position.name, 'iss');
  assert.strictEqual(position.latitude, 19.6544);
  assert.strictEqual(position.longitude, -63.5327);
  assert.strictEqual(position.latitudeLabel, '19.6544° N');
  assert.strictEqual(position.longitudeLabel, '63.5327° W');
  assert.strictEqual(position.hemisphere, 'northern hemisphere');
  assert.strictEqual(position.altitude, 421.2);
  assert.strictEqual(position.velocity, 27597);
  assert.strictEqual(position.visibility, 'daylight');
  assert.strictEqual(position.timestamp, 1732000000);
});
test('parseIss classifies the hemisphere and labels for a southern sighting', () => {
  const payload = fixturePayload();
  payload.latitude = -33.865;
  payload.longitude = 151.2;
  const position = logic.parseIss(payload);
  assert.strictEqual(position.hemisphere, 'southern hemisphere');
  assert.strictEqual(position.latitudeLabel, '33.865° S');
  assert.strictEqual(position.longitudeLabel, '151.2° E');
});
test('parseIss accepts unknown visibility honestly instead of guessing', () => {
  const payload = fixturePayload();
  payload.visibility = 'moonlit-ish';
  assert.strictEqual(logic.parseIss(payload).visibility, 'unknown');
});
test('parseIss includes an HTTPS OpenStreetMap link built from validated numbers', () => {
  const position = logic.parseIss(fixturePayload());
  assert.ok(position.mapUrl, 'expected a map link');
  assert.ok(position.mapUrl.indexOf('https://www.openstreetmap.org/?mlat=19.6544') === 0, 'unexpected map url');
  assert.ok(position.mapUrl.indexOf('#map=5/19.6544/-63.5327') !== -1, 'expected a bounded zoom link');
  assert.ok(position.mapUrl.length <= logic.MAX_URL_CHARS, 'map url over the safe cap');
});
test('parseIss fails closed on malformed payloads and unreadable numbers', () => {
  assert.throws(() => logic.parseIss({}), /unreadable/);
  assert.throws(() => logic.parseIss(null), /malformed/);
  assert.throws(() => logic.parseIss({ latitude: 999 }), /latitude/);
  assert.throws(() => logic.parseIss({ latitude: 5, longitude: 700 }), /longitude/);
  assert.throws(() => logic.parseIss({ latitude: 5, longitude: 5, altitude: 5000 }), /altitude/);
  assert.throws(() => logic.parseIss({ latitude: 5, longitude: 5, altitude: 420, velocity: 40000 }), /speed/);
  assert.throws(() => logic.parseIss({ latitude: 5, longitude: 5, altitude: 420, velocity: 27000, timestamp: 0 }), /position age/);
  assert.throws(() => logic.parseIss({ latitude: 'north' }), /latitude/);
});
test('a hostile name field falls back to the honest ISS label', () => {
  const payload = fixturePayload();
  payload.name = '  i' + 'x'.repeat(120) + '\u0007  ';
  assert.strictEqual(logic.parseIss(payload).name, 'ISS');
});
test('classifyIssError gives plain words for each failure family', () => {
  assert.strictEqual(
    logic.classifyIssError(new Error('HTTP 429')),
    'The space-station feed limited this request. Wait a moment and try again.'
  );
  assert.strictEqual(
    logic.classifyIssError(new Error('HTTP 404')),
    'The space-station feed has no entry for that satellite id right now.'
  );
  assert.strictEqual(
    logic.classifyIssError(new Error('HTTP 503')),
    'The space-station feed had a server problem (HTTP 503). Try again in a moment.'
  );
  assert.strictEqual(
    logic.classifyIssError(new Error('The space-station request timed out.')),
    'The request timed out. Check your connection and try again.'
  );
  assert.strictEqual(logic.classifyIssError(new Error('something odd')), null);
});
test('the endpoint, caps and timeout constants are exported for guards', () => {
  assert.ok(logic.ISS_ENDPOINT.indexOf('https://') === 0, 'endpoint must stay HTTPS');
  assert.strictEqual(logic.MAX_LAT, 90);
  assert.strictEqual(logic.MAX_LON, 180);
  assert.ok(logic.MAX_JSON_BYTES === 256 * 1024, 'bounded reader cap');
  assert.strictEqual(logic.DEFAULT_TIMEOUT_MS, 10000);
});
test('fetchJson reads a bounded JSON body through the shared reader', async () => {
  const payload = await logic.fetchJson(logic.buildIssUrl(), () => Promise.resolve(okResponse(JSON.stringify({ ok: true }))));
  assert.strictEqual(payload.ok, true);
});
test('fetchJson sends keyless, no-store, credential-free requests', async () => {
  let captured = null;
  await logic.fetchJson(logic.buildIssUrl(), (url, init) => {
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
  await logic.fetchJson(logic.buildIssUrl(), undefined).catch((error) => { rejected = error; });
  assert.ok(rejected, 'expected a rejection without a fetch implementation');
});
test('fetchJson surfaces HTTP errors in the shared plain-word shape', async () => {
  let reported = null;
  await logic.fetchJson(logic.buildIssUrl(), () => Promise.resolve({ ok: false, status: 503 }))
    .catch((error) => { reported = error; });
  assert.ok(reported, 'expected an error');
  assert.strictEqual(
    logic.classifyIssError(reported),
    'The space-station feed had a server problem (HTTP 503). Try again in a moment.'
  );
});
test('fetchJson malformations fail closed with a friendly message', async () => {
  let reported = null;
  await logic.fetchJson(logic.buildIssUrl(), () => Promise.resolve(okResponse('not json')))
    .catch((error) => { reported = error; });
  assert.ok(reported, 'expected an error');
  assert.strictEqual(reported.message, 'The space-station response was malformed.');
});
test('fetchIss returns a stateless position record with the checked time', async () => {
  let requestedUrl = null;
  const position = await logic.fetchIss((url) => {
    requestedUrl = url;
    return Promise.resolve(okResponse(JSON.stringify(fixturePayload())));
  }, { now: () => '2026-11-23T04:30:00.000Z' });
  assert.strictEqual(requestedUrl, logic.ISS_ENDPOINT);
  assert.strictEqual(position.name, 'iss');
  assert.strictEqual(position.velocity, 27597);
  assert.strictEqual(position.fetchedAt, '2026-11-23T04:30:00.000Z');
});
test('fetchIss stamps fetchedAt from the environment clock when now is absent', async () => {
  function asciiBytes(text) {
    const bytes = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 255;
    return bytes;
  }
  function streamOf(chunk) {
    let consumed = false;
    return {
      getReader() {
        return {
          read() {
            if (consumed) return Promise.resolve({ done: true, value: undefined });
            consumed = true;
            return Promise.resolve({ done: false, value: asciiBytes(chunk) });
          },
          cancel() { return Promise.resolve(); }
        };
      }
    };
  }
  function okResponseJson(text) {
    return { ok: true, status: 200, headers: { get() { return null; } }, body: streamOf(text) };
  }
  const payload = logic.parseIss({
    name: 'iss', latitude: 5, longitude: 5, altitude: 420, velocity: 27000, visibility: 'daylight', timestamp: 1732000001
  });
  const position = await logic.fetchIss(() => Promise.resolve(okResponseJson(JSON.stringify({
    name: 'iss', latitude: 5, longitude: 5, altitude: 420, velocity: 27000, visibility: 'daylight', timestamp: 1732000001
  }))), {});
  assert.strictEqual(position.version, 1);
  assert.ok(typeof position.fetchedAt === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(position.fetchedAt)
    && position.fetchedAt.slice(-1) === 'Z', 'expected an ISO UTC stamped fetchedAt from the ambient clock');
});
test('fetchIss rejects when the feed answers with an out-of-range latitude', async () => {
  const payload = fixturePayload();
  payload.latitude = 1200;
  let reported = null;
  await logic.fetchIss(() => Promise.resolve(okResponse(JSON.stringify(payload))), {})
    .catch((error) => { reported = error; });
  assert.ok(reported, 'expected an error');
  assert.ok(reported.message.indexOf('latitude') !== -1, 'unexpected wording');
});
