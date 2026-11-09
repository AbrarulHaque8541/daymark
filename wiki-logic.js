((root) => {
  'use strict';

  const responseBodyApi = root.DaymarkResponseBody
    || (typeof require === 'function' ? require('./response-body-logic.js') : null);

  // Keyless Wikipedia knowledge glance for the Daymark web prototype, powered by
  // the free public Wikipedia search API (no API key, no account, no maintainer
  // backend). Mirrors the weather-logic.js module style: pure functions, no
  // DOM, no storage, so it can be unit-tested directly and loaded in the
  // browser as window.DaymarkWiki.

  const MAX_QUERY_CHARS = 120;
  const MAX_RESULTS = 5;
  const MAX_SNIPPET_CHARS = 400;
  const MAX_JSON_BYTES = 256 * 1024;
  const MAX_JSON_CHARS = MAX_JSON_BYTES;
  const DEFAULT_TIMEOUT_MS = 10000;

  const SEARCH_ENDPOINT = 'https://en.wikipedia.org/w/api.php';

  function normalizeQuery(query) {
    if (typeof query !== 'string') return '';
    const collapsed = query.trim().replace(/\s+/g, ' ');
    return collapsed.length > MAX_QUERY_CHARS ? collapsed.slice(0, MAX_QUERY_CHARS) : collapsed;
  }

  function buildSearchUrl(query) {
    const normalized = normalizeQuery(query);
    if (!normalized) throw new Error('Type a search term first.');
    return SEARCH_ENDPOINT
      + '?action=query&list=search&format=json&origin=*'
      + '&srlimit=' + MAX_RESULTS
      + '&srsearch=' + encodeURIComponent(normalized);
  }

  function decodeEntities(text) {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function stripSnippetHtml(html) {
    if (typeof html !== 'string') return '';
    const plain = decodeEntities(html.replace(/<[^>]*>/g, ''))
      .replace(/\s+/g, ' ')
      .trim();
    return plain.length > MAX_SNIPPET_CHARS ? plain.slice(0, MAX_SNIPPET_CHARS) : plain;
  }

  function pageUrlFromId(pageId) {
    const id = Number(pageId);
    if (!Number.isInteger(id) || id <= 0) return '';
    return 'https://en.wikipedia.org/?curid=' + id;
  }

  function isValidResult(result) {
    if (!result || typeof result !== 'object') return false;
    if (typeof result.title !== 'string' || !result.title.trim()) return false;
    if (typeof result.snippet !== 'string') return false;
    if (!Number.isInteger(result.pageId) || result.pageId <= 0) return false;
    if (typeof result.url !== 'string' || !/^https:\/\/en\.wikipedia\.org\/\?curid=\d+$/.test(result.url)) return false;
    return true;
  }

  function parseSearch(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Unexpected Wikipedia response.');
    const query = payload.query;
    if (!query || !Array.isArray(query.search)) throw new Error('Unexpected Wikipedia response.');
    const results = [];
    for (const entry of query.search.slice(0, MAX_RESULTS)) {
      if (!entry || typeof entry !== 'object') continue;
      const pageId = Number(entry.pageid);
      const url = pageUrlFromId(pageId);
      if (!url) continue;
      const title = typeof entry.title === 'string' ? entry.title.trim() : '';
      if (!title) continue;
      const snippet = stripSnippetHtml(entry.snippet || '');
      const result = { title, snippet, pageId, url };
      if (isValidResult(result)) results.push(result);
    }
    if (!results.length) throw new Error('No Wikipedia results matched that search.');
    return results;
  }

  function validateWikiCache(cache) {
    if (!cache || typeof cache !== 'object') return false;
    if (cache.version !== 1) return false;
    if (typeof cache.query !== 'string' || !cache.query.trim()) return false;
    if (!Array.isArray(cache.results) || !cache.results.length || cache.results.length > MAX_RESULTS) return false;
    for (const result of cache.results) {
      if (!isValidResult(result)) return false;
    }
    if (typeof cache.fetchedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(cache.fetchedAt)) return false;
    return true;
  }

  async function fetchJson(url, fetchImpl, timeoutMs) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch is not available.');
    const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
    let timedOut = false;
    let activeReader = null;
    const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    let timer = null;
    const timeout = new Promise((resolve, reject) => {
      timer = root.setTimeout(() => {
        timedOut = true;
        if (controller) controller.abort();
        if (activeReader && typeof activeReader.cancel === 'function') {
          try {
            const cancellation = activeReader.cancel();
            if (cancellation && typeof cancellation.catch === 'function') cancellation.catch(() => {});
          } catch (error) { /* cancellation is best-effort */ }
        }
        reject(new Error('Wikipedia request timed out.'));
      }, duration);
    });
    const request = (async () => {
      const response = await fetchImpl(url, {
        signal: controller ? controller.signal : undefined,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        redirect: 'error'
      });
      if (!response || !response.ok) {
        throw new Error('Wikipedia request failed (' + (response ? response.status : 'no response') + ').');
      }
      if (!responseBodyApi || typeof responseBodyApi.readBoundedText !== 'function') {
        throw new Error('The bounded response reader is unavailable.');
      }
      const body = await responseBodyApi.readBoundedText(response, {
        maxBytes: MAX_JSON_BYTES,
        maxChars: MAX_JSON_CHARS,
        tooLargeMessage: 'Wikipedia response too large.',
        malformedMessage: 'Wikipedia response was malformed.',
        streamRequiredMessage: 'This browser cannot read Wikipedia responses with the required size limit.',
        timeoutMessage: 'Wikipedia request timed out.',
        controller,
        isTimedOut: () => timedOut,
        onReader: (reader) => { activeReader = reader; }
      });
      if (timedOut) throw new Error('Wikipedia request timed out.');
      return JSON.parse(body);
    })();
    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timer !== null) root.clearTimeout(timer);
    }
  }

  async function searchWikipedia(query, fetchImpl, options) {
    const opts = options || {};
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const normalized = normalizeQuery(query);
    if (!normalized) throw new Error('Type a search term first.');
    const payload = await fetchJson(buildSearchUrl(normalized), fetchImpl, opts.timeoutMs);
    const results = parseSearch(payload);
    return { version: 1, query: normalized, results, fetchedAt: now() };
  }

  const api = {
    normalizeQuery,
    buildSearchUrl,
    decodeEntities,
    stripSnippetHtml,
    pageUrlFromId,
    isValidResult,
    parseSearch,
    validateWikiCache,
    fetchJson,
    searchWikipedia,
    MAX_QUERY_CHARS,
    MAX_RESULTS,
    MAX_SNIPPET_CHARS,
    MAX_JSON_CHARS,
    MAX_JSON_BYTES,
    DEFAULT_TIMEOUT_MS,
    SEARCH_ENDPOINT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkWiki = api;
})(globalThis);
