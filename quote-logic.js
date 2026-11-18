(function (root) {
  'use strict';

  // Keyless quote glance card for the web prototype, powered by the public
  // Quotable API (api.quotable.io, no API key, no account, no maintainer
  // backend). Pure functions, no DOM, no storage. HTTPS-only, timeout-guarded,
  // bounded response. Nothing is saved; request only on explicit Check.

  const responseBodyApi = root.DaymarkResponseBody
    || (typeof require === 'function' ? require('./response-body-logic.js') : null);

  const QUOTE_ENDPOINT = 'https://api.quotable.io/random';
  const DEFAULT_TIMEOUT_MS = 10000;
  const MAX_JSON_BYTES = 64 * 1024;
  const MAX_JSON_CHARS = MAX_JSON_BYTES;
  const MAX_CONTENT_CHARS = 280;
  const MAX_AUTHOR_CHARS = 80;
  const MAX_TAGS = 4;

  function hasControlCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 32 || code === 127) return true;
    }
    return false;
  }

  function capText(value, cap) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || hasControlCharacter(trimmed)) return null;
    if (trimmed.length <= cap) return { text: trimmed, truncated: false };
    return { text: trimmed.slice(0, cap) + '\u2026', truncated: true };
  }

  function parseQuote(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('The quote response is malformed.');
    }
    const content = capText(payload.content, MAX_CONTENT_CHARS);
    if (!content) throw new Error('No readable quote in the response.');
    const author = capText(payload.author, MAX_AUTHOR_CHARS);
    const tagsRaw = Array.isArray(payload.tags) ? payload.tags : [];
    const tags = [];
    for (let i = 0; i < tagsRaw.length && tags.length < MAX_TAGS; i += 1) {
      const t = capText(String(tagsRaw[i]), 40);
      if (t) tags.push(t.text);
    }
    return {
      content: content.text,
      contentTruncated: content.truncated,
      author: author ? author.text : 'Unknown',
      tags: tags,
      length: typeof payload.length === 'number' ? payload.length : 0
    };
  }

  function classifyQuoteError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 429') !== -1 || message.indexOf('HTTP 403') !== -1) {
      return 'The public quote service limited this request. Wait a few minutes and try again.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'The quote service rejected the request (' + message + '). Try again.';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'The quote service had a server problem (' + message + '). Try again in a moment.';
    }
    if (message.indexOf('timed out') !== -1) {
      return 'The request timed out. Check your connection and try again.';
    }
    if (message.indexOf('too large') !== -1) {
      return 'The quote response was too large to read safely.';
    }
    return null;
  }

  function timersUsable() {
    try {
      if (typeof root.setTimeout !== 'function') return false;
      const id = root.setTimeout(() => {}, 1);
      if (typeof root.clearTimeout === 'function') root.clearTimeout(id);
      return true;
    } catch (error) {
      return false;
    }
  }

  async function fetchJson(url, fetchImpl, timeoutMs) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
    const usableTimers = timersUsable();
    let timedOut = false;
    let activeReader = null;
    const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    let timer = null;
    let timeout = null;
    if (usableTimers && typeof root.clearTimeout === 'function') {
      timeout = new Promise((resolve, reject) => {
        timer = root.setTimeout(() => {
          timedOut = true;
          if (controller) controller.abort();
          if (activeReader && typeof activeReader.cancel === 'function') {
            try {
              const cancellation = activeReader.cancel();
              if (cancellation && typeof cancellation.catch === 'function') cancellation.catch(() => {});
            } catch (error) { /* best-effort */ }
          }
          reject(new Error('The quote request timed out.'));
        }, duration);
      });
    }
    const request = (async () => {
      const response = await fetchImpl(url, {
        signal: controller ? controller.signal : undefined,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        headers: { 'Accept': 'application/json' }
      });
      if (!response || !response.ok) throw new Error('HTTP ' + (response ? response.status : 'unknown'));
      if (!responseBodyApi || typeof responseBodyApi.readBoundedText !== 'function') {
        throw new Error('The bounded response reader is unavailable.');
      }
      const text = await responseBodyApi.readBoundedText(response, {
        maxBytes: MAX_JSON_BYTES,
        maxChars: MAX_JSON_CHARS,
        tooLargeMessage: 'The quote response was too large to read safely.',
        malformedMessage: 'The quote response was malformed.',
        streamRequiredMessage: 'This browser cannot read quote responses with the required size limit.',
        timeoutMessage: 'The quote request timed out.',
        controller: controller,
        isTimedOut: () => timedOut,
        onReader: (reader) => { activeReader = reader; }
      });
      if (timedOut) throw new Error('The quote request timed out.');
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error('The quote response was malformed.');
      }
    })();
    try {
      return timeout ? await Promise.race([request, timeout]) : await request;
    } finally {
      if (timer !== null && typeof root.clearTimeout === 'function') root.clearTimeout(timer);
    }
  }

  async function fetchQuote(fetchImpl, options) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const opts = options || {};
    const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const payload = await fetchJson(QUOTE_ENDPOINT, fetchImpl, timeoutMs);
    const parsed = parseQuote(payload);
    return {
      version: 1,
      content: parsed.content,
      contentTruncated: parsed.contentTruncated,
      author: parsed.author,
      tags: parsed.tags,
      length: parsed.length,
      fetchedAt: now()
    };
  }

  const api = {
    capText, parseQuote, classifyQuoteError, fetchJson, fetchQuote,
    QUOTE_ENDPOINT, MAX_CONTENT_CHARS, MAX_AUTHOR_CHARS, MAX_TAGS,
    MAX_JSON_BYTES, MAX_JSON_CHARS, DEFAULT_TIMEOUT_MS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkQuotes = api;
})(globalThis);
