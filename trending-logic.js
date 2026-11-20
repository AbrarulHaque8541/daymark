(function (root) {
  'use strict';

  // Keyless "Trending on Wikipedia" glance for the Daymark web prototype,
  // powered by the free public Wikimedia Feed API (api.wikimedia.org, no API
  // key, no account, no maintainer backend). Mirrors the onthisday-logic.js
  // module style: pure functions, no DOM, no storage, so it can be
  // unit-tested directly and loaded in the browser as window.DaymarkTrending.
  // The request is HTTPS-only, timeout-guarded and read through the shared
  // bounded response reader.

  const responseBodyApi = root.DaymarkResponseBody
    || (typeof require === 'function' ? require('./response-body-logic.js') : null);

  const MAX_MONTH = 12;
  const MAX_DAY = 31;
  const MAX_ARTICLES = 5;
  const MAX_TITLE_CHARS = 120;
  const MAX_URL_CHARS = 300;
  const MAX_JSON_BYTES = 256 * 1024;
  const MAX_JSON_CHARS = MAX_JSON_BYTES;
  const DEFAULT_TIMEOUT_MS = 10000;
  const FEED_ENDPOINT = 'https://api.wikimedia.org/feed/v1/wikipedia/en/featured';

  function hasControlCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 32 || code === 127) return true;
    }
    return false;
  }

  function collapseWhitespace(value) {
    const parts = [];
    const buffer = [];
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code === 32 || code === 9 || code === 10 || code === 13) {
        if (buffer.length) {
          parts.push(buffer.join(''));
          buffer.length = 0;
        }
      } else {
        buffer.push(value.charAt(index));
      }
    }
    if (buffer.length) parts.push(buffer.join(''));
    return parts.join(' ');
  }

  // Accepts numbers, numeric strings, or an "MM-DD"/"MM/DD" string. Anything
  // outside a real calendar month/day range is rejected fail-closed.
  function normalizeDateParts(month, day) {
    let m = month;
    let d = day;
    if (typeof month === 'string' && day === undefined) {
      const normalized = month.trim().replace(/-/g, '/');
      const parts = normalized.split('/');
      if (parts.length !== 2) return null;
      m = parts[0];
      d = parts[1];
    }
    const monthNum = Number(m);
    const dayNum = Number(d);
    if (!Number.isInteger(monthNum) || !Number.isInteger(dayNum)) return null;
    if (monthNum < 1 || monthNum > MAX_MONTH) return null;
    if (dayNum < 1 || dayNum > MAX_DAY) return null;
    const pad = (value) => (value < 10 ? '0' + value : String(value));
    return { month: monthNum, day: dayNum, padded: pad(monthNum) + '/' + pad(dayNum) };
  }

  // Manual ISO month/day reader (no regular expressions, per repo hygiene).
  function datePartsFromIso(iso) {
    if (typeof iso !== 'string' || iso.length < 10) return null;
    if (iso.charCodeAt(4) !== 45 || iso.charCodeAt(7) !== 45) return null;
    const readDigits = (start, count) => {
      let out = '';
      for (let index = 0; index < count; index += 1) {
        const code = iso.charCodeAt(start + index);
        if (code < 48 || code > 57) return null;
        out += iso.charAt(start + index);
      }
      return out;
    };
    const monthStr = readDigits(5, 2);
    const dayStr = readDigits(8, 2);
    if (!monthStr || !dayStr) return null;
    return normalizeDateParts(Number(monthStr), Number(dayStr));
  }

  function buildTrendingUrl(month, day) {
    const parsed = normalizeDateParts(month, day);
    if (!parsed) throw new Error('Enter a real calendar date (month 1-12, day 1-31).');
    return FEED_ENDPOINT + '/' + parsed.padded;
  }

  function cleanText(value, maxChars) {
    if (typeof value !== 'string') return null;
    const trimmed = collapseWhitespace(value);
    if (!trimmed) return null;
    if (hasControlCharacter(trimmed)) return null;
    return trimmed.slice(0, maxChars);
  }

  // Plain-words comma grouping without Intl, e.g. 519632 -> "519,632".
  function formatViews(views) {
    if (typeof views !== 'number' || !Number.isInteger(views) || views < 0) return null;
    let rest = String(views);
    let out = '';
    while (rest.length > 3) {
      out = ',' + rest.slice(-3) + out;
      rest = rest.slice(0, -3);
    }
    return rest + out;
  }

  function pageUrlFrom(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const urls = entry.content_urls;
    const desktop = urls && typeof urls === 'object' ? urls.desktop : null;
    const url = desktop && typeof desktop === 'object' ? desktop.page : null;
    if (typeof url !== 'string' || !url) return null;
    if (url.length > MAX_URL_CHARS) return null;
    if (url.indexOf('https://') !== 0) return null;
    if (hasControlCharacter(url)) return null;
    return url;
  }

  // The feed returns one entry per read article under "mostread".articles.
  // Each entry carries normalized titles, view counts and optional page
  // links. Malformed entries are skipped and counted, never guessed.
  function parseTrending(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('The trending feed response is malformed.');
    }
    const mostread = payload.mostread;
    if (!mostread || typeof mostread !== 'object' || !Array.isArray(mostread.articles)) {
      throw new Error('The trending feed response is malformed.');
    }
    const statsDate = typeof mostread.date === 'string' && mostread.date
      ? mostread.date.slice(0, 10)
      : null;
    const articles = [];
    let skipped = 0;
    let parsedCount = 0;
    for (const entry of mostread.articles) {
      if (articles.length >= MAX_ARTICLES) break;
      if (!entry || typeof entry !== 'object') {
        skipped += 1;
        continue;
      }
      const titles = entry.titles && typeof entry.titles === 'object' ? entry.titles : null;
      const rawTitle = titles && typeof titles.normalized === 'string' ? titles.normalized : null;
      const title = cleanText(rawTitle, MAX_TITLE_CHARS);
      const views = Number(entry.views);
      if (!title || !Number.isInteger(views) || views < 0) {
        skipped += 1;
        continue;
      }
      const titleWasLonger = rawTitle !== null && collapseWhitespace(rawTitle).length > MAX_TITLE_CHARS;
      articles.push({
        title: title,
        titleTruncated: titleWasLonger,
        views: views,
        url: pageUrlFrom(entry)
      });
      parsedCount += 1;
    }
    if (!articles.length) {
      throw new Error('No readable trending entries came back for that date.');
    }
    const articlesTruncated =
      parsedCount === MAX_ARTICLES &&
      mostread.articles.length > MAX_ARTICLES;
    return {
      statsDate: statsDate,
      articles: articles,
      articlesTruncated: articlesTruncated,
      skipped: skipped
    };
  }

  // Plain words for the failures a keyless Wikimedia call can hit. The Feed
  // API is free without a key but rate-limited, so 403 must be explained,
  // not hidden.
  function classifyTrendingError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 403') !== -1) {
      return 'Wikimedia limited this request (the free feed is rate-limited). Try again in a moment.';
    }
    if (message.indexOf('HTTP 404') !== -1) {
      return 'No trending feed exists for that date. Check the month and day.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'Wikimedia rejected the request (' + message + '). Check the date.';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'Wikimedia had a server problem (' + message + '). Try again in a moment.';
    }
    if (message.indexOf('timed out') !== -1) {
      return 'The trending request timed out. Check your connection and try again.';
    }
    return null;
  }

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
        reject(new Error('The trending request timed out.'));
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
        tooLargeMessage: 'The trending response was too large to read safely.',
        malformedMessage: 'The trending response was malformed.',
        streamRequiredMessage: 'This browser cannot read trending responses with the required size limit.',
        timeoutMessage: 'The trending request timed out.',
        controller: controller,
        isTimedOut: () => timedOut,
        onReader: (reader) => { activeReader = reader; }
      });
      if (timedOut) throw new Error('The trending request timed out.');
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error('The trending response was malformed.');
      }
    })();
    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timer !== null) root.clearTimeout(timer);
    }
  }

  // Stateless: fetches the featured feed for one date and returns the
  // most-read section as a plain record. Nothing is cached or saved anywhere.
  async function fetchTrending(fetchImpl, options) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const opts = options || {};
    const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const iso = typeof opts.now === 'function' ? opts.now() : now();
    const parts = opts.month !== undefined || opts.day !== undefined
      ? normalizeDateParts(opts.month, opts.day)
      : datePartsFromIso(iso);
    if (!parts) throw new Error('Enter a real calendar date (month 1-12, day 1-31).');
    const payload = await fetchJson(buildTrendingUrl(parts.month, parts.day), fetchImpl, timeoutMs);
    const parsed = parseTrending(payload);
    return {
      version: 1,
      month: parts.month,
      day: parts.day,
      statsDate: parsed.statsDate,
      articles: parsed.articles,
      articlesTruncated: parsed.articlesTruncated,
      fetchedAt: now()
    };
  }

  const api = {
    normalizeDateParts,
    datePartsFromIso,
    buildTrendingUrl,
    parseTrending,
    formatViews,
    classifyTrendingError,
    fetchJson,
    fetchTrending,
    MAX_MONTH,
    MAX_DAY,
    MAX_ARTICLES,
    MAX_TITLE_CHARS,
    MAX_URL_CHARS,
    MAX_JSON_BYTES,
    MAX_JSON_CHARS,
    DEFAULT_TIMEOUT_MS,
    FEED_ENDPOINT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkTrending = api;
})(globalThis);
