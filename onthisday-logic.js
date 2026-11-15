(function (root) {
  'use strict';

  // Keyless "On this day" history glance for the Daymark web prototype,
  // powered by the free public Wikimedia Feed API (api.wikimedia.org, no API
  // key, no account, no maintainer backend). Mirrors the releases-logic.js
  // module style: pure functions, no DOM, no storage, so it can be
  // unit-tested directly and loaded in the browser as window.DaymarkOnThisDay.
  // The request is HTTPS-only, timeout-guarded and read through the shared
  // bounded response reader.

  const responseBodyApi = root.DaymarkResponseBody
    || (typeof require === 'function' ? require('./response-body-logic.js') : null);

  const MAX_MONTH = 12;
  const MAX_DAY = 31;
  const MAX_EVENTS = 6;
  const MAX_TEXT_CHARS = 400;
  const MAX_PAGES_PER_EVENT = 3;
  const MAX_URL_CHARS = 300;
  const MAX_JSON_BYTES = 256 * 1024;
  const MAX_JSON_CHARS = MAX_JSON_BYTES;
  const DEFAULT_TIMEOUT_MS = 10000;
  const FEED_ENDPOINT = 'https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected';

  function hasControlCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 32 || code === 127) return true;
    }
    return false;
  }

  // Accepts numbers, numeric strings, or an "MM-DD"/"MM/DD" string. Anything
  // outside a real calendar month/day range is rejected fail-closed.
  function normalizeDateParts(month, day) {
    let m = month;
    let d = day;
    if (typeof month === 'string' && day === undefined) {
      const parts = month.trim().split(/[-\/]/);
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

  function datePartsFromIso(iso) {
    if (typeof iso !== 'string') return null;
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return normalizeDateParts(Number(match[2]), Number(match[3]));
  }

  function buildOnThisDayUrl(month, day) {
    const parsed = normalizeDateParts(month, day);
    if (!parsed) throw new Error('Enter a real calendar date (month 1-12, day 1-31).');
    return FEED_ENDPOINT + '/' + parsed.padded;
  }

  function cleanText(value, maxChars) {
    if (typeof value !== 'string') return null;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (!trimmed) return null;
    if (hasControlCharacter(trimmed)) return null;
    return trimmed.slice(0, maxChars);
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

  // The feed returns one selected event per year under "selected". Each event
  // carries plain text, a year and related encyclopedia pages. Malformed
  // entries are skipped, never guessed.
  function parseEvents(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('The history feed response is malformed.');
    }
    if (!Array.isArray(payload.selected)) {
      throw new Error('The history feed response is malformed.');
    }
    const events = [];
    for (const entry of payload.selected) {
      if (!entry || typeof entry !== 'object') continue;
      const text = cleanText(entry.text, MAX_TEXT_CHARS);
      if (!text) continue;
      const year = Number(entry.year);
      if (!Number.isInteger(year)) continue;
      const pages = [];
      if (Array.isArray(entry.pages)) {
        for (const page of entry.pages) {
          if (pages.length >= MAX_PAGES_PER_EVENT) break;
          const url = pageUrlFrom(page);
          if (url) pages.push(url);
        }
      }
      events.push({
        year: year,
        text: text,
        textTruncated: typeof entry.text === 'string' && entry.text.replace(/\s+/g, ' ').trim().length > MAX_TEXT_CHARS,
        pages: pages,
        pagesTruncated: Array.isArray(entry.pages) && entry.pages.length > pages.length
      });
      if (events.length >= MAX_EVENTS) break;
    }
    if (!events.length) {
      throw new Error('No readable "On this day" events came back for that date.');
    }
    return events;
  }

  // Plain words for the failures a keyless Wikimedia call can hit. The Feed
  // API is free without a key but rate-limited, so 403 must be explained,
  // not hidden.
  function classifyOnThisDayError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 403') !== -1) {
      return 'Wikimedia limited this request (the free feed is rate-limited). Try again in a moment.';
    }
    if (message.indexOf('HTTP 404') !== -1) {
      return 'No "On this day" feed exists for that date. Check the month and day.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'Wikimedia rejected the request (' + message + '). Check the date.';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'Wikimedia had a server problem (' + message + '). Try again in a moment.';
    }
    if (message.indexOf('timed out') !== -1) {
      return 'The request timed out. Check your connection and try again.';
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
        reject(new Error('The history request timed out.'));
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
        tooLargeMessage: 'The history response was too large to read safely.',
        malformedMessage: 'The history response was malformed.',
        streamRequiredMessage: 'This browser cannot read history responses with the required size limit.',
        timeoutMessage: 'The history request timed out.',
        controller: controller,
        isTimedOut: () => timedOut,
        onReader: (reader) => { activeReader = reader; }
      });
      if (timedOut) throw new Error('The history request timed out.');
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error('The history response was malformed.');
      }
    })();
    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timer !== null) root.clearTimeout(timer);
    }
  }

  // Stateless: fetches the feed for one date and returns a plain record.
  // Nothing is cached or saved anywhere.
  async function fetchOnThisDay(fetchImpl, options) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const opts = options || {};
    const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const iso = typeof opts.now === 'function' ? opts.now() : now();
    const parts = opts.month !== undefined || opts.day !== undefined
      ? normalizeDateParts(opts.month, opts.day)
      : datePartsFromIso(iso);
    if (!parts) throw new Error('Enter a real calendar date (month 1-12, day 1-31).');
    const payload = await fetchJson(buildOnThisDayUrl(parts.month, parts.day), fetchImpl, timeoutMs);
    const events = parseEvents(payload);
    return { version: 1, month: parts.month, day: parts.day, events: events, fetchedAt: now() };
  }

  const api = {
    normalizeDateParts,
    datePartsFromIso,
    buildOnThisDayUrl,
    parseEvents,
    classifyOnThisDayError,
    fetchJson,
    fetchOnThisDay,
    MAX_MONTH,
    MAX_DAY,
    MAX_EVENTS,
    MAX_TEXT_CHARS,
    MAX_PAGES_PER_EVENT,
    MAX_URL_CHARS,
    MAX_JSON_BYTES,
    MAX_JSON_CHARS,
    DEFAULT_TIMEOUT_MS,
    FEED_ENDPOINT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkOnThisDay = api;
})(globalThis);
