'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const wiki = require('../wiki-logic.js');

const SAMPLE_BODY = JSON.stringify({
  batchcomplete: '',
  query: {
    search: [
      {
        title: 'Kanyakumari',
        snippet: '<span class="searchmatch">Kanyakumari</span> is a coastal town in the Indian state of Tamil Nadu.',
        pageid: 2285632
      },
      {
        title: 'Kanyakumari district',
        snippet: '<span class="searchmatch">Kanyakumari</span> district is the southernmost district in Tamil Nadu.',
        pageid: 2286050
      }
    ]
  }
});

test('normalizeQuery trims, collapses whitespace, and caps length', () => {
  assert.equal(wiki.normalizeQuery('  solar   power  '), 'solar power');
  assert.equal(wiki.normalizeQuery(null), '');
  assert.equal(wiki.normalizeQuery(42), '');
  const long = 'a'.repeat(wiki.MAX_QUERY_CHARS + 10);
  assert.equal(wiki.normalizeQuery(long).length, wiki.MAX_QUERY_CHARS);
});

test('buildSearchUrl encodes the query on the keyless Wikipedia endpoint', () => {
  const url = wiki.buildSearchUrl('solar power & light');
  assert.equal(url.startsWith(wiki.SEARCH_ENDPOINT + '?action=query&list=search&format=json&origin=*&srlimit=' + wiki.MAX_RESULTS + '&srsearch='), true);
  assert.ok(url.includes(encodeURIComponent('solar power & light')));
  assert.throws(() => wiki.buildSearchUrl('   '), /Type a search term first/);
});

test('stripSnippetHtml removes markup, decodes entities, and caps length', () => {
  assert.equal(wiki.stripSnippetHtml('<span class="searchmatch">Kanyakumari</span> is a town &amp; a &quot;cape&#39;'), 'Kanyakumari is a town & a "cape\'');
  assert.equal(wiki.stripSnippetHtml(123), '');
  const longPlain = wiki.stripSnippetHtml('x'.repeat(wiki.MAX_SNIPPET_CHARS + 20));
  assert.equal(longPlain.length, wiki.MAX_SNIPPET_CHARS);
});

test('pageUrlFromId builds the canonical curid link and rejects junk', () => {
  assert.equal(wiki.pageUrlFromId(2285632), 'https://en.wikipedia.org/?curid=2285632');
  assert.equal(wiki.pageUrlFromId('2285632'), 'https://en.wikipedia.org/?curid=2285632');
  assert.equal(wiki.pageUrlFromId(0), '');
  assert.equal(wiki.pageUrlFromId(-3), '');
  assert.equal(wiki.pageUrlFromId('junk'), '');
});

test('parseSearch maps Wikipedia entries to validated results', () => {
  const results = wiki.parseSearch(JSON.parse(SAMPLE_BODY));
  assert.equal(results.length, 2);
  assert.equal(results[0].title, 'Kanyakumari');
  assert.equal(results[0].snippet, 'Kanyakumari is a coastal town in the Indian state of Tamil Nadu.');
  assert.equal(results[0].pageId, 2285632);
  assert.equal(results[0].url, 'https://en.wikipedia.org/?curid=2285632');
  for (const result of results) assert.equal(wiki.isValidResult(result), true);
});

test('parseSearch rejects malformed payloads', () => {
  assert.throws(() => wiki.parseSearch(null), /Unexpected Wikipedia response/);
  assert.throws(() => wiki.parseSearch({ query: {} }), /Unexpected Wikipedia response/);
  assert.throws(() => wiki.parseSearch({ query: { search: [] } }), /No Wikipedia results matched/);
  assert.throws(() => wiki.parseSearch({ query: { search: [{ title: '', pageid: 1, snippet: '' }] } }), /No Wikipedia results matched/);
});

test('validateWikiCache accepts a complete cache and rejects corrupt ones', () => {
  const cache = {
    version: 1,
    query: 'kanyakumari',
    results: [{
      title: 'Kanyakumari',
      snippet: 'A coastal town in Tamil Nadu.',
      pageId: 2285632,
      url: 'https://en.wikipedia.org/?curid=2285632'
    }],
    fetchedAt: '2026-11-05T10:00:00.000Z'
  };
  assert.equal(wiki.validateWikiCache(cache), true);
  assert.equal(wiki.validateWikiCache({ ...cache, version: 2 }), false);
  assert.equal(wiki.validateWikiCache({ ...cache, query: '  ' }), false);
  assert.equal(wiki.validateWikiCache({ ...cache, results: [] }), false);
  assert.equal(wiki.validateWikiCache({
    ...cache,
    results: [{ ...cache.results[0], url: 'javascript:alert(1)' }]
  }), false);
  assert.equal(wiki.validateWikiCache({ ...cache, fetchedAt: 'yesterday' }), false);
  assert.equal(wiki.validateWikiCache(null), false);
});

test('searchWikipedia returns a versioned cache payload', async () => {
  const seen = [];
  let seenInit = null;
  const fetchImpl = (url, init) => {
    seen.push(url);
    seenInit = init;
    assert.ok(!init || typeof init === 'object');
    const bytes = new TextEncoder().encode(SAMPLE_BODY);
    let offset = 0;
    const reader = {
      async read() {
        if (offset >= bytes.length) return { done: true, value: undefined };
        const chunk = bytes.slice(offset, offset + 1024);
        offset += chunk.length;
        return { done: false, value: chunk };
      },
      cancel() { return Promise.resolve(); },
      releaseLock() {}
    };
    return Promise.resolve({
      ok: true, status: 200, headers: { get() { return null; } },
      body: { getReader() { return reader; }, cancel() { return reader.cancel(); } },
      text() { throw new Error('bounded response reader must not call response.text()'); }
    });
  };
  const result = await wiki.searchWikipedia('  kanyakumari ', fetchImpl, {
    now: () => '2026-11-05T12:00:00.000Z'
  });
  assert.equal(result.version, 1);
  assert.equal(result.query, 'kanyakumari');
  assert.equal(result.fetchedAt, '2026-11-05T12:00:00.000Z');
  assert.equal(result.results.length, 2);
  assert.ok(seen[0].includes('srsearch=kanyakumari'));
  assert.equal(seenInit.credentials, 'omit');
  assert.equal(seenInit.referrerPolicy, 'no-referrer');
  assert.equal(seenInit.cache, 'no-store');
  assert.equal(seenInit.redirect, 'error');
});

test('searchWikipedia surfaces empty-query and HTTP failures as errors', async () => {
  await assert.rejects(() => wiki.searchWikipedia('   ', () => Promise.resolve({})), /Type a search term first/);
  const failing = () => Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('{}') });
  await assert.rejects(() => wiki.searchWikipedia('kanyakumari', failing), /Wikipedia request failed \(503\)/);
  await assert.rejects(() => wiki.searchWikipedia('kanyakumari', null), /fetch is not available/);
});

test('the module exposes its API and stays inert under Node', () => {
  assert.equal(typeof wiki.searchWikipedia, 'function');
  assert.equal(wiki.MAX_RESULTS, 5);
  assert.equal(wiki.SEARCH_ENDPOINT, 'https://en.wikipedia.org/w/api.php');
  assert.equal(typeof globalThis.DaymarkWiki, 'object');
});
