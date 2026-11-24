'use strict';
// Tests for space-news-logic.js: URL building, limit normalization, record
// validation, error wording, bounded keyless fetches and the list shape.
const test = require('node:test');
const assert = require('node:assert');
const logic = globalThis.DaymarkSpaceNews || require('../space-news-logic.js');

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
function articleFixture() {
  return {
    id: 41,
    title: 'Falcon 9 launches a rideshare mission',
    url: 'https://example.com/news/a',
    news_site: 'Spaceflight Now',
    published_at: '2026-11-23T09:30:00.000Z',
    summary: 'First  stage  landing\n    succeeded without a hitch.'
  };
}
function listFixture(count) {
  const raw = [];
  for (let i = 0; i < count; i += 1) {
    const item = articleFixture();
    item.id = 90 + i;
    item.url = 'https://example.com/news/a' + i;
    item.title = 'Story ' + i;
    raw.push(item);
  }
  return { results: raw };
}

test('buildArticlesUrl targets the keyless Spaceflight News API over HTTPS with the default limit', () => {
  assert.strictEqual(logic.buildArticlesUrl(), 'https://api.spaceflightnewsapi.net/v4/articles/?limit=5');
  assert.strictEqual(logic.buildArticlesUrl(3), 'https://api.spaceflightnewsapi.net/v4/articles/?limit=3');
});
test('normalizeLimit bounds the limit fail-closed between 1 and 10', () => {
  assert.strictEqual(logic.normalizeLimit(undefined), 5);
  assert.strictEqual(logic.normalizeLimit(0), 5);
  assert.strictEqual(logic.normalizeLimit(-4), 5);
  assert.strictEqual(logic.normalizeLimit('nine'), 5);
  assert.strictEqual(logic.normalizeLimit(99), 10);
  assert.strictEqual(logic.normalizeLimit(2.9), 2);
  assert.strictEqual(logic.normalizeLimit(1), 1);
});
test('parseArticle maps one record into an honest plain-number article', () => {
  const parsed = logic.parseArticle(articleFixture());
  assert.ok(parsed.article, 'expected a parsed record');
  const entry = parsed.article;
  assert.strictEqual(entry.id, 41);
  assert.strictEqual(entry.title, 'Falcon 9 launches a rideshare mission');
  assert.strictEqual(entry.url, 'https://example.com/news/a');
  assert.strictEqual(entry.site, 'Spaceflight Now');
  assert.strictEqual(entry.publishedAt, '2026-11-23');
  assert.strictEqual(entry.summary, 'First stage landing succeeded without a hitch.');
  assert.strictEqual(entry.truncated, 0);
});
test('parseArticle counts honest truncation for long titles and summaries', () => {
  const longTitle = articleFixture();
  longTitle.title = 'x'.repeat(250);
  const parsedTitle = logic.parseArticle(longTitle);
  assert.strictEqual(parsedTitle.article.title.length, logic.MAX_TITLE);
  assert.strictEqual(parsedTitle.article.truncated, 1);
  const longSummary = articleFixture();
  longSummary.summary = 's'.repeat(500);
  const parsedSummary = logic.parseArticle(longSummary);
  assert.strictEqual(parsedSummary.article.summary.length, logic.MAX_SUMMARY);
  assert.strictEqual(parsedSummary.article.truncated, 1);
});
test('parseArticle rejects non-calendar published dates without guessing', () => {
  const bad = articleFixture();
  bad.published_at = '2026-13-31T00:00:00Z';
  assert.ok(logic.parseArticle(bad).skip, 'month 13 must be skipped');
  const worse = articleFixture();
  worse.published_at = 'long ago';
  assert.ok(logic.parseArticle(worse).skip);
  const older = articleFixture();
  older.published_at = '2026-11-2';
  assert.ok(logic.parseArticle(older).skip);
});
test('parseArticle fails closed on unreadable records', () => {
  assert.ok(logic.parseArticle(null).skip);
  assert.ok(logic.parseArticle({}).skip);
  const insecure = articleFixture();
  insecure.url = 'http://insecure.example/a';
  assert.ok(/link/.test(logic.parseArticle(insecure).skip), 'only validated https links pass');
  const noTitle = articleFixture();
  noTitle.title = '   ';
  assert.ok(logic.parseArticle(noTitle).skip);
  const badId = articleFixture();
  badId.id = 'forty-one';
  assert.ok(logic.parseArticle(badId).skip);
  const control = articleFixture();
  control.title = 'bad ' + String.fromCharCode(7) + ' title';
  assert.ok(logic.parseArticle(control).skip, 'control characters are refused');
});
test('parseArticles skips unreadable records and counts them', () => {
  const payload = listFixture(3);
  payload.results.push({ id: 999, title: 'broken', url: 'http://nope.example/x', news_site: 'x', published_at: '2026-11-23T09:30:00.000Z' });
  const snap = logic.parseArticles(payload, 10);
  assert.strictEqual(snap.returned, 3);
  assert.strictEqual(snap.skipped, 1);
  assert.strictEqual(snap.listTruncated, false);
});
test('parseArticles caps the list at eight with an honest truncation note', () => {
  const snap = logic.parseArticles(listFixture(11), 10);
  assert.strictEqual(snap.returned, logic.MAX_ARTICLES);
  assert.strictEqual(snap.listTruncated, true);
  assert.ok(/more article/.test(snap.truncationNote));
});
test('parseArticles classifies truncation fields honestly', () => {
  const payload = listFixture(1);
  payload.results[0].summary = 'y'.repeat(450);
  const snap = logic.parseArticles(payload, 10);
  assert.strictEqual(snap.fieldsTruncated, 1);
});
test('parseArticles fails closed on malformed payloads', () => {
  assert.throws(() => logic.parseArticles(null, 5), /malformed/);
  assert.throws(() => logic.parseArticles({}, 5), /malformed/);
  assert.throws(() => logic.parseArticles({ results: 'nope' }, 5), /malformed/);
});
test('classifySpaceNewsError gives plain words for each failure family', () => {
  assert.strictEqual(
    logic.classifySpaceNewsError(new Error('HTTP 429')),
    'The spaceflight news feed limited this request. Wait a moment and try again.'
  );
  assert.strictEqual(
    logic.classifySpaceNewsError(new Error('HTTP 404')),
    'The spaceflight news feed has no articles for that request right now.'
  );
  assert.strictEqual(
    logic.classifySpaceNewsError(new Error('HTTP 503')),
    'The spaceflight news feed had a server problem (HTTP 503). Try again in a moment.'
  );
  assert.strictEqual(
    logic.classifySpaceNewsError(new Error('The spaceflight news request timed out.')),
    'The request timed out. Check your connection and try again.'
  );
  assert.strictEqual(
    logic.classifySpaceNewsError(new Error('The spaceflight news response was too large to read safely.')),
    'The spaceflight news feed sent more data than this card will safely read.'
  );
  assert.strictEqual(logic.classifySpaceNewsError(new Error('something odd')), null);
});
test('the endpoint, caps and timeout constants are exported for guards', () => {
  assert.ok(logic.SNAPI_ENDPOINT.indexOf('https://') === 0, 'endpoint must stay HTTPS');
  assert.strictEqual(logic.MAX_ARTICLES, 8);
  assert.strictEqual(logic.MAX_TITLE, 200);
  assert.strictEqual(logic.MAX_SUMMARY, 400);
  assert.strictEqual(logic.MAX_LIMIT, 10);
  assert.strictEqual(logic.MAX_JSON_BYTES, 256 * 1024);
  assert.strictEqual(logic.DEFAULT_TIMEOUT_MS, 10000);
  assert.strictEqual(logic.DEFAULT_LIMIT, 5);
});
test('fetchJson reads a bounded JSON body through the shared reader', async () => {
  const payload = await logic.fetchJson(
    logic.buildArticlesUrl(5),
    () => Promise.resolve(okResponse(JSON.stringify({ ok: true })))
  );
  assert.strictEqual(payload.ok, true);
});
test('fetchJson sends keyless, no-store, credential-free requests', async () => {
  let captured = null;
  await logic.fetchJson(logic.buildArticlesUrl(5), (url, init) => {
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
  await logic.fetchJson(logic.buildArticlesUrl(5), undefined).catch((error) => { rejected = error; });
  assert.ok(rejected, 'expected a rejection without a fetch implementation');
});
test('fetchJson surfaces HTTP errors in the shared plain-word shape', async () => {
  let reported = null;
  await logic.fetchJson(logic.buildArticlesUrl(5), () => Promise.resolve({ ok: false, status: 503 }))
    .catch((error) => { reported = error; });
  assert.ok(reported, 'expected an error');
  assert.strictEqual(
    logic.classifySpaceNewsError(reported),
    'The spaceflight news feed had a server problem (HTTP 503). Try again in a moment.'
  );
});
test('fetchJson malformations fail closed with a friendly message', async () => {
  let reported = null;
  await logic.fetchJson(logic.buildArticlesUrl(5), () => Promise.resolve(okResponse('not json')))
    .catch((error) => { reported = error; });
  assert.ok(reported, 'expected an error');
  assert.strictEqual(reported.message, 'The spaceflight news response was malformed.');
});
test('fetchSpaceNews returns a stateless list with the checked time', async () => {
  let requestedUrl = null;
  const snapshot = await logic.fetchSpaceNews((url) => {
    requestedUrl = url;
    return Promise.resolve(okResponse(JSON.stringify(listFixture(2))));
  }, { now: () => '2026-11-24T04:30:00.000Z' });
  assert.strictEqual(requestedUrl, 'https://api.spaceflightnewsapi.net/v4/articles/?limit=5');
  assert.strictEqual(snapshot.version, 1);
  assert.strictEqual(snapshot.returned, 2);
  assert.strictEqual(snapshot.articles[0].site, 'Spaceflight Now');
  assert.strictEqual(snapshot.fetchedAt, '2026-11-24T04:30:00.000Z');
});
test('fetchSpaceNews stamps fetchedAt from the ambient clock when now is absent', async () => {
  const snapshot = await logic.fetchSpaceNews(
    () => Promise.resolve(okResponse(JSON.stringify(listFixture(1)))),
    {}
  );
  assert.strictEqual(snapshot.version, 1);
  assert.ok(typeof snapshot.fetchedAt === 'string' && snapshot.fetchedAt.length >= 20
    && snapshot.fetchedAt.charAt(4) === '-' && snapshot.fetchedAt.charAt(10) === 'T',
    'expected an ISO UTC stamped fetchedAt from the ambient clock');
});
