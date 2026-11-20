'use strict';

const test = require('node:test');
const assert = require('node:assert');

let logic;
if (typeof window === 'undefined' && typeof globalThis.DaymarkTrending === 'undefined') {
  try { logic = require('../trending-logic.js'); } catch (error) { logic = null; }
}
if (!logic) logic = globalThis.DaymarkTrending;

function streamResponse(payloadFragments) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: {
      getReader() {
        let index = 0;
        return {
          read: async () => {
            if (index < payloadFragments.length) {
              const value = payloadFragments[index];
              index += 1;
              return { done: false, value: new TextEncoder().encode(value) };
            }
            return { done: true, value: undefined };
          },
          cancel: async () => {},
          releaseLock: () => {}
        };
      }
    }
  };
}

const body = (text) => streamResponse([text]);

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
  const parsed = logic.datePartsFromIso('2026-11-20T06:00:00.000Z');
  assert.strictEqual(parsed.padded, '11/20');
});

test('datePartsFromIso rejects non-ISO input', () => {
  assert.strictEqual(logic.datePartsFromIso('not a date'), null);
  assert.strictEqual(logic.datePartsFromIso(undefined), null);
  assert.strictEqual(logic.datePartsFromIso('2026-11'), null);
});

test('buildTrendingUrl targets the public Wikimedia featured endpoint', () => {
  assert.strictEqual(
    logic.buildTrendingUrl(11, 20),
    'https://api.wikimedia.org/feed/v1/wikipedia/en/featured/11/20'
  );
  assert.strictEqual(
    logic.buildTrendingUrl('03-05'),
    'https://api.wikimedia.org/feed/v1/wikipedia/en/featured/03/05'
  );
});

test('buildTrendingUrl throws on an impossible date', () => {
  assert.throws(() => logic.buildTrendingUrl(13, 1), /real calendar date/);
});

test('parseTrending maps most-read articles with titles, views and links', () => {
  const parsed = logic.parseTrending({
    mostread: {
      date: '2026-11-18',
      articles: [
        {
          titles: { normalized: 'Grand Theft Auto VI' },
          views: 519632,
          content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Grand_Theft_Auto_VI' } }
        },
        {
          titles: { normalized: 'Deaths in 2026' },
          views: 90000,
          content_urls: null
        }
      ]
    }
  });
  assert.strictEqual(parsed.articles.length, 2);
  assert.strictEqual(parsed.statsDate, '2026-11-18');
  assert.strictEqual(parsed.articles[0].title, 'Grand Theft Auto VI');
  assert.strictEqual(parsed.articles[0].views, 519632);
  assert.strictEqual(parsed.articles[0].url, 'https://en.wikipedia.org/wiki/Grand_Theft_Auto_VI');
  assert.strictEqual(parsed.articles[0].titleTruncated, false);
  assert.strictEqual(parsed.articles[1].url, null);
  assert.strictEqual(parsed.articlesTruncated, false);
  assert.strictEqual(parsed.skipped, 0);
});

test('parseTrending skips malformed entries and counts them honestly', () => {
  const parsed = logic.parseTrending({
    mostread: {
      date: '2026-11-18',
      articles: [
        null,
        { titles: { normalized: 'No views' } },
        { views: -1, titles: { normalized: 'Negative views' } },
        { views: 42, titles: { normalized: 'kept' } }
      ]
    }
  });
  assert.strictEqual(parsed.articles.length, 1);
  assert.strictEqual(parsed.articles[0].title, 'kept');
  assert.strictEqual(parsed.skipped, 3);
});

test('parseTrending throws when nothing readable remains', () => {
  assert.throws(
    () => { logic.parseTrending({ mostread: { date: '2026-11-18', articles: [{ views: 1 }] } }); },
    /No readable/
  );
  assert.throws(() => { logic.parseTrending({}); }, /malformed/);
  assert.throws(() => { logic.parseTrending(null); }, /malformed/);
});

test('parseTrending caps the number of articles and flags truncation', () => {
  const articles = [];
  for (let index = 0; index < 40; index += 1) {
    articles.push({ titles: { normalized: 'Article ' + index }, views: index });
  }
  const parsed = logic.parseTrending({ mostread: { date: '2026-11-18', articles: articles } });
  assert.strictEqual(parsed.articles.length, logic.MAX_ARTICLES);
  assert.strictEqual(parsed.articlesTruncated, true);
});

test('parseTrending truncates long titles and flags it', () => {
  const parsed = logic.parseTrending({
    mostread: {
      date: '2026-11-18',
      articles: [{ titles: { normalized: 'x'.repeat(500) }, views: 10 }]
    }
  });
  assert.strictEqual(parsed.articles[0].title.length, logic.MAX_TITLE_CHARS);
  assert.strictEqual(parsed.articles[0].titleTruncated, true);
});

test('parseTrending drops non-https page links and keeps safe ones', () => {
  const parsed = logic.parseTrending({
    mostread: {
      date: '2026-11-18',
      articles: [
        {
          titles: { normalized: 'Insecure' },
          views: 1,
          content_urls: { desktop: { page: 'http://en.wikipedia.org/wiki/Insecure' } }
        },
        {
          titles: { normalized: 'Safe' },
          views: 2,
          content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Safe' } }
        }
      ]
    }
  });
  assert.strictEqual(parsed.articles[0].url, null);
  assert.strictEqual(parsed.articles[1].url, 'https://en.wikipedia.org/wiki/Safe');
});

test('formatViews groups digits without Intl', () => {
  assert.strictEqual(logic.formatViews(519632), '519,632');
  assert.strictEqual(logic.formatViews(999), '999');
  assert.strictEqual(logic.formatViews(1000000), '1,000,000');
  assert.strictEqual(logic.formatViews(-5), null);
  assert.strictEqual(logic.formatViews('12'), null);
});

test('classifyTrendingError explains limits, misses and outages in plain words', () => {
  assert.ok(logic.classifyTrendingError(new Error('HTTP 403')).includes('rate-limited'));
  assert.ok(logic.classifyTrendingError(new Error('HTTP 404')).includes('Check the month and day'));
  assert.ok(logic.classifyTrendingError(new Error('HTTP 400')).includes('rejected'));
  assert.ok(logic.classifyTrendingError(new Error('HTTP 502')).includes('server problem'));
  assert.ok(logic.classifyTrendingError(new Error('The trending request timed out.')).includes('timed out'));
  assert.strictEqual(logic.classifyTrendingError(new Error('something odd')), null);
});

test('fetchTrending defaults to the date in now() and returns a stateless record', async () => {
  let requested = null;
  const payload = {
    mostread: {
      date: '2026-11-19',
      articles: [{ titles: { normalized: 'Trending page' }, views: 123456, content_urls: null }]
    }
  };
  const fetchImpl = async (url) => {
    requested = url;
    return body(JSON.stringify(payload));
  };
  const record = await logic.fetchTrending(fetchImpl, {
    now: () => '2026-11-20T10:00:00.000Z'
  });
  assert.strictEqual(requested, 'https://api.wikimedia.org/feed/v1/wikipedia/en/featured/11/20');
  assert.strictEqual(record.version, 1);
  assert.strictEqual(record.month, 11);
  assert.strictEqual(record.day, 20);
  assert.strictEqual(record.statsDate, '2026-11-19');
  assert.strictEqual(record.articles.length, 1);
  assert.strictEqual(record.articles[0].title, 'Trending page');
  assert.strictEqual(record.fetchedAt, '2026-11-20T10:00:00.000Z');
});

test('fetchTrending honours an explicit month and day', async () => {
  let requested = null;
  const fetchImpl = async (url) => {
    requested = url;
    return body(JSON.stringify({ mostread: { date: '2026-03-04', articles: [{ titles: { normalized: 'kept' }, views: 1 }] } }));
  };
  const record = await logic.fetchTrending(fetchImpl, { month: 3, day: 5, now: () => '2026-11-20T10:00:00.000Z' });
  assert.strictEqual(requested, 'https://api.wikimedia.org/feed/v1/wikipedia/en/featured/03/05');
  assert.strictEqual(record.day, 5);
});

test('fetchTrending rejects an impossible explicit date without calling fetch', async () => {
  let called = 0;
  const fetchImpl = async () => { called += 1; return body('{}'); };
  await assert.rejects(
    () => logic.fetchTrending(fetchImpl, { month: 13, day: 1 }),
    /real calendar date/
  );
  assert.strictEqual(called, 0);
});

test('fetchTrending surfaces an HTTP failure as a plain-word error', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, headers: { get: () => null }, body: body('{}') });
  const error = await logic.fetchTrending(fetchImpl, { month: 11, day: 20 }).then(
    () => { throw new Error('should have failed'); },
    (caught) => caught
  );
  assert.ok(logic.classifyTrendingError(error).includes('rate-limited'));
});

test('fetchTrending explains a malformed JSON response', async () => {
  const fetchImpl = async () => body('not json at all');
  const error = await logic.fetchTrending(fetchImpl, { month: 11, day: 20 }).then(
    () => { throw new Error('should have failed'); },
    (caught) => caught
  );
  assert.ok(String(error.message).includes('malformed'));
});
