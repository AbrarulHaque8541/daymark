'use strict';

const test = require('node:test');
const assert = require('node:assert');

let logic;
if (typeof window === 'undefined' && typeof globalThis.DaymarkOnThisDay === 'undefined') {
  try { logic = require('../onthisday-logic.js'); } catch (error) { logic = null; }
}
if (!logic) logic = globalThis.DaymarkOnThisDay;

test('normalizeDateParts accepts numbers and zero-pads the feed path', () => {
  const parsed = logic.normalizeDateParts(3, 5);
  assert.strictEqual(parsed.month, 3);
  assert.strictEqual(parsed.day, 5);
  assert.strictEqual(parsed.padded, '03/05');
});

test('normalizeDateParts accepts an MM-DD string', () => {
  const parsed = logic.normalizeDateParts('11-15');
  assert.strictEqual(parsed.month, 11);
  assert.strictEqual(parsed.day, 15);
  assert.strictEqual(parsed.padded, '11/15');
});

test('normalizeDateParts accepts an MM/DD string', () => {
  const parsed = logic.normalizeDateParts('01/09');
  assert.strictEqual(parsed.padded, '01/09');
});

test('normalizeDateParts rejects impossible dates', () => {
  assert.strictEqual(logic.normalizeDateParts(13, 1), null);
  assert.strictEqual(logic.normalizeDateParts(0, 10), null);
  assert.strictEqual(logic.normalizeDateParts(2, 32), null);
  assert.strictEqual(logic.normalizeDateParts(2, 0), null);
  assert.strictEqual(logic.normalizeDateParts('abc'), null);
  assert.strictEqual(logic.normalizeDateParts('11'), null);
  assert.strictEqual(logic.normalizeDateParts('1-2-3'), null);
  assert.strictEqual(logic.normalizeDateParts(null), null);
});

test('datePartsFromIso reads month and day from an ISO timestamp', () => {
  const parsed = logic.datePartsFromIso('2026-11-15T06:00:00.000Z');
  assert.strictEqual(parsed.padded, '11/15');
});

test('datePartsFromIso rejects non-ISO input', () => {
  assert.strictEqual(logic.datePartsFromIso('not a date'), null);
  assert.strictEqual(logic.datePartsFromIso(undefined), null);
});

test('buildOnThisDayUrl targets the public Wikimedia feed endpoint', () => {
  assert.strictEqual(
    logic.buildOnThisDayUrl(11, 15),
    'https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/11/15'
  );
  assert.strictEqual(
    logic.buildOnThisDayUrl('03-05'),
    'https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/03/05'
  );
});

test('buildOnThisDayUrl throws on an impossible date', () => {
  assert.throws(() => logic.buildOnThisDayUrl(13, 1), /real calendar date/);
});

test('parseEvents maps selected events with years and page links', () => {
  const events = logic.parseEvents({
    selected: [
      {
        year: 1926,
        text: 'NBC opened with a radio show.',
        pages: [
          { content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/NBC' } } }
        ]
      },
      {
        year: -46,
        text: 'Julian calendar took effect.',
        pages: []
      }
    ]
  });
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].year, 1926);
  assert.strictEqual(events[0].text, 'NBC opened with a radio show.');
  assert.strictEqual(events[0].pages[0], 'https://en.wikipedia.org/wiki/NBC');
  assert.strictEqual(events[0].textTruncated, false);
  assert.strictEqual(events[0].pagesTruncated, false);
  assert.strictEqual(events[1].year, -46);
  assert.strictEqual(events[1].pages.length, 0);
});

test('parseEvents skips malformed entries instead of guessing', () => {
  const events = logic.parseEvents({
    selected: [
      null,
      { text: 'no year here' },
      { year: 'not-a-number', text: 'bad year' },
      { year: 2000, text: '' },
      { year: 2001, text: 'kept' }
    ]
  });
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].text, 'kept');
});

test('parseEvents throws when nothing readable remains', () => {
  assert.throws(() => logic.parseEvents({ selected: [{ year: 2000 }] }), /No readable/);
  assert.throws(() => logic.parseEvents({}), /malformed/);
  assert.throws(() => logic.parseEvents(null), /malformed/);
});

test('parseEvents caps the number of events', () => {
  const selected = [];
  for (let index = 0; index < 20; index += 1) {
    selected.push({ year: 1900 + index, text: 'Event ' + index });
  }
  const events = logic.parseEvents({ selected: selected });
  assert.strictEqual(events.length, logic.MAX_EVENTS);
});

test('parseEvents truncates long text and flags it', () => {
  const events = logic.parseEvents({
    selected: [{ year: 2000, text: 'x'.repeat(500) }]
  });
  assert.strictEqual(events[0].text.length, logic.MAX_TEXT_CHARS);
  assert.strictEqual(events[0].textTruncated, true);
});

test('parseEvents caps related pages per event and flags it', () => {
  const pages = [];
  for (let index = 0; index < 8; index += 1) {
    pages.push({ content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Page_' + index } } });
  }
  const events = logic.parseEvents({
    selected: [{ year: 2000, text: 'An event.', pages: pages }]
  });
  assert.strictEqual(events[0].pages.length, logic.MAX_PAGES_PER_EVENT);
  assert.strictEqual(events[0].pagesTruncated, true);
});

test('parseEvents drops non-https page links', () => {
  const events = logic.parseEvents({
    selected: [{
      year: 2000,
      text: 'An event.',
      pages: [
        { content_urls: { desktop: { page: 'http://en.wikipedia.org/wiki/Insecure' } } },
        { content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Safe' } } }
      ]
    }]
  });
  assert.deepStrictEqual(events[0].pages, ['https://en.wikipedia.org/wiki/Safe']);
});

test('classifyOnThisDayError explains limits, misses and outages in plain words', () => {
  assert.ok(logic.classifyOnThisDayError(new Error('HTTP 403')).includes('rate-limited'));
  assert.ok(logic.classifyOnThisDayError(new Error('HTTP 404')).includes('Check the month and day'));
  assert.ok(logic.classifyOnThisDayError(new Error('HTTP 400')).includes('rejected'));
  assert.ok(logic.classifyOnThisDayError(new Error('HTTP 502')).includes('server problem'));
  assert.ok(logic.classifyOnThisDayError(new Error('The history request timed out.')).includes('timed out'));
  assert.strictEqual(logic.classifyOnThisDayError(new Error('something odd')), null);
});

test('fetchOnThisDay defaults to the date in now() and returns a stateless record', async () => {
  let requested = null;
  const payload = {
    selected: [{ year: 1926, text: 'NBC opened with a radio show.', pages: [] }]
  };
  const fetchImpl = async (url) => {
    requested = url;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader() {
          let sent = false;
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: new TextEncoder().encode(JSON.stringify(payload)) };
            },
            cancel: async () => {},
            releaseLock: () => {}
          };
        }
      }
    };
  };
  const record = await logic.fetchOnThisDay(fetchImpl, {
    now: () => '2026-11-15T10:00:00.000Z'
  });
  assert.strictEqual(requested, 'https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/11/15');
  assert.strictEqual(record.month, 11);
  assert.strictEqual(record.day, 15);
  assert.strictEqual(record.events.length, 1);
  assert.strictEqual(record.events[0].year, 1926);
  assert.strictEqual(record.fetchedAt, '2026-11-15T10:00:00.000Z');
});

test('fetchOnThisDay honours an explicit month and day', async () => {
  let requested = null;
  const fetchImpl = async (url) => {
    requested = url;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader() {
          let sent = false;
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: new TextEncoder().encode(JSON.stringify({ selected: [{ year: 1, text: 'kept' }] })) };
            },
            cancel: async () => {},
            releaseLock: () => {}
          };
        }
      }
    };
  };
  const record = await logic.fetchOnThisDay(fetchImpl, { month: 2, day: 29, now: () => '2026-11-15T10:00:00.000Z' });
  assert.strictEqual(requested, 'https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/02/29');
  assert.strictEqual(record.day, 29);
});

test('fetchOnThisDay rejects an impossible explicit date without calling fetch', async () => {
  let called = 0;
  const fetchImpl = async () => { called += 1; return { ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }), cancel: async () => {}, releaseLock: () => {} }) } }; };
  await assert.rejects(
    () => logic.fetchOnThisDay(fetchImpl, { month: 13, day: 1 }),
    /real calendar date/
  );
  assert.strictEqual(called, 0);
});

test('fetchOnThisDay surfaces an HTTP failure as a plain-word error', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, headers: { get: () => null }, body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }), cancel: async () => {}, releaseLock: () => {} }) } });
  const error = await logic.fetchOnThisDay(fetchImpl, { month: 11, day: 15 }).then(
    () => { throw new Error('should have failed'); },
    (caught) => caught
  );
  assert.ok(logic.classifyOnThisDayError(error).includes('rate-limited'));
});
