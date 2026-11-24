(function (root) {
  'use strict';
  const responseBodyApi = root.DaymarkResponseBody
    || (typeof require === 'function' ? require('./response-body-logic.js') : null);
  const MAX_ARTICLES = 8;
  const MAX_TITLE = 200;
  const MAX_SUMMARY = 400;
  const MAX_SITE = 60;
  const MAX_URL_CHARS = 1024;
  const MAX_LIMIT = 10;
  const MAX_JSON_BYTES = 256 * 1024;
  const MAX_JSON_CHARS = MAX_JSON_BYTES;
  const DEFAULT_TIMEOUT_MS = 10000;
  const DEFAULT_LIMIT = 5;
  const SNAPI_ENDPOINT = 'https://api.spaceflightnewsapi.net/v4/articles/?limit=';
  function hasControlCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 32 || code === 127) return true;
    }
    return false;
  }
  function isScaledWhitespaceUnit(code) {
    return code === 32 || (code >= 9 && code <= 13);
  }
  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }
  function isDigits(value, start, count) {
    for (let index = start; index < start + count; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 48 || code > 57) return false;
    }
    return true;
  }
  // Collapses line breaks and runs of spaces in summaries to single spaces,
  // manually over character codes (no regex escapes needed).
  function squashWhitespace(value) {
    let out = '';
    let pendingSpace = false;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (isScaledWhitespaceUnit(code)) {
        pendingSpace = true;
      } else {
        if (pendingSpace && out.length > 0) out += ' ';
        pendingSpace = false;
        out += value.charAt(index);
      }
    }
    return out;
  }
  // Fail-closed 1..10 limit; anything unreadable falls back to the default.
  function normalizeLimit(value) {
    const num = Number(value);
    if (!isFiniteNumber(num)) return DEFAULT_LIMIT;
    const whole = Math.floor(num);
    if (whole < 1) return DEFAULT_LIMIT;
    if (whole > MAX_LIMIT) return MAX_LIMIT;
    return whole;
  }
  function buildArticlesUrl(limit) {
    return SNAPI_ENDPOINT + normalizeLimit(limit);
  }
  function truncatedText(value, cap) {
    if (value === null || value === undefined || typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed || hasControlCharacter(trimmed)) return '';
    return trimmed.slice(0, cap);
  }
  // An article URL is only ever published when it is a validated HTTPS link.
  function safeArticleUrl(value) {
    if (typeof value !== 'string' || !value) return null;
    if (value.length > MAX_URL_CHARS) return null;
    if (value.indexOf('https://') !== 0) return null;
    if (hasControlCharacter(value)) return null;
    return value;
  }
  // Only full calendar dates in the feed shape are accepted, checked manually.
  function parsePublishedAt(value) {
    if (typeof value !== 'string' || value.length < 10) return null;
    if (!isDigits(value, 0, 4)) return null;
    if (value.charAt(4) !== '-' || value.charAt(7) !== '-') return null;
    if (!isDigits(value, 5, 2) || !isDigits(value, 8, 2)) return null;
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return value.slice(0, 10);
  }
  // Parses one SNAPI article record, fail-closed. Returns { article } or
  // { skip: reason }; an unreadable record is skipped and counted, never guessed.
  function parseArticle(item) {
    if (!item || typeof item !== 'object') return { skip: 'not a record' };
    const id = Number(item.id);
    if (!isFiniteNumber(id) || id < 0) return { skip: 'unreadable id' };
    const rawTitle = typeof item.title === 'string' ? item.title.trim() : '';
    const title = truncatedText(item.title, MAX_TITLE);
    if (!title) return { skip: 'unreadable title' };
    const url = safeArticleUrl(item.url);
    if (!url) return { skip: 'unreadable link' };
    const site = truncatedText(item.news_site, MAX_SITE) || 'unknown';
    const publishedAt = parsePublishedAt(item.published_at);
    if (!publishedAt) return { skip: 'unreadable date' };
    let summary = '';
    const rawSummary = typeof item.summary === 'string' ? item.summary.trim() : '';
    if (rawSummary) {
      summary = squashWhitespace(rawSummary).slice(0, MAX_SUMMARY);
    }
    const entry = {
      id: Math.floor(id),
      title: title,
      url: url,
      site: site,
      publishedAt: publishedAt,
      summary: summary,
      truncated: 0
    };
    if (rawTitle.length > MAX_TITLE) entry.truncated += 1;
    if (rawSummary.length > summary.length) entry.truncated += 1;
    return { article: entry };
  }
  // Parses the whole SNAPI list payload, fail-closed: a payload without a
  // real results array is rejected, never guessed.
  function parseArticles(payload, limit) {
    const results = payload !== null && typeof payload === 'object' && Array.isArray(payload.results)
      ? payload.results
      : null;
    if (results === null) {
      throw new Error('The spaceflight feed response is malformed.');
    }
    const requested = normalizeLimit(limit);
    const raw = results;
    const articles = [];
    let skipped = 0;
    let fieldsTruncated = 0;
    for (let index = 0; index < raw.length && articles.length < MAX_ARTICLES; index += 1) {
      const parsed = parseArticle(raw[index]);
      if (parsed.article) {
        articles.push(parsed.article);
        if (parsed.article.truncated > 0) fieldsTruncated += 1;
      } else {
        skipped += 1;
      }
    }
    const limited = articles.slice(0, MAX_ARTICLES);
    const overflow = raw.length - articles.length - skipped;
    return {
      version: 1,
      requested: requested,
      returned: limited.length,
      skipped: skipped,
      listTruncated: overflow > 0,
      fieldsTruncated: fieldsTruncated,
      truncationNote: overflow > 0 ? overflow + ' more article(s) not shown.' : '',
      articles: limited
    };
  }
  // Plain words for the failures a keyless SNAPI call can hit.
  function classifySpaceNewsError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 403') !== -1 || message.indexOf('HTTP 429') !== -1) {
      return 'The spaceflight news feed limited this request. Wait a moment and try again.';
    }
    if (message.indexOf('HTTP 404') !== -1) {
      return 'The spaceflight news feed has no articles for that request right now.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'The spaceflight news feed rejected the request (' + message + ')';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'The spaceflight news feed had a server problem (' + message + '). Try again in a moment.';
    }
    if (message.indexOf('timed out') !== -1) {
      return 'The request timed out. Check your connection and try again.';
    }
    if (message.indexOf('too large') !== -1) {
      return 'The spaceflight news feed sent more data than this card will safely read.';
    }
    return null;
  }
  // Bounded JSON fetch with a timeout and an AbortController when available.
  async function fetchJson(url, fetchImpl, timeoutMs) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
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
        reject(new Error('The spaceflight news request timed out.'));
      }, duration);
    });
    const request = (async () => {
      const response = await fetchImpl(url, {
        signal: controller ? controller.signal : undefined,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        headers: { 'Accept': 'application/json', 'Api-User-Agent': 'DaymarkWebPrototype/1.0 (offline-first task prototype)' }
      });
      if (!response || !response.ok) throw new Error('HTTP ' + (response ? response.status : 'unknown'));
      if (!responseBodyApi || typeof responseBodyApi.readBoundedText !== 'function') {
        throw new Error('The bounded response reader is unavailable.');
      }
      const text = await responseBodyApi.readBoundedText(response, {
        maxBytes: MAX_JSON_BYTES,
        maxChars: MAX_JSON_CHARS,
        tooLargeMessage: 'The spaceflight news response was too large to read safely.',
        malformedMessage: 'The spaceflight news response was malformed.',
        streamRequiredMessage: 'This browser cannot read spaceflight news responses with the required size limit.',
        timeoutMessage: 'The spaceflight news request timed out.',
        controller: controller,
        isTimedOut: () => timedOut,
        onReader: (reader) => { activeReader = reader; }
      });
      if (timedOut) throw new Error('The spaceflight news request timed out.');
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error('The spaceflight news response was malformed.');
      }
    })();
    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timer !== null) root.clearTimeout(timer);
    }
  }
  // Stateless: one manual fetch, one plain list. No cache, no polling.
  async function fetchSpaceNews(fetchImpl, options) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const opts = options || {};
    const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const payload = await fetchJson(buildArticlesUrl(opts.limit), fetchImpl, timeoutMs);
    const snapshot = parseArticles(payload, opts.limit);
    snapshot.fetchedAt = now();
    return snapshot;
  }
  const api = {
    buildArticlesUrl: buildArticlesUrl,
    normalizeLimit: normalizeLimit,
    parseArticle: parseArticle,
    parseArticles: parseArticles,
    classifySpaceNewsError: classifySpaceNewsError,
    fetchJson: fetchJson,
    fetchSpaceNews: fetchSpaceNews,
    MAX_ARTICLES: MAX_ARTICLES,
    MAX_TITLE: MAX_TITLE,
    MAX_SUMMARY: MAX_SUMMARY,
    MAX_SITE: MAX_SITE,
    MAX_URL_CHARS: MAX_URL_CHARS,
    MAX_LIMIT: MAX_LIMIT,
    MAX_JSON_BYTES: MAX_JSON_BYTES,
    DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
    DEFAULT_LIMIT: DEFAULT_LIMIT,
    SNAPI_ENDPOINT: SNAPI_ENDPOINT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkSpaceNews = api;
})(globalThis);