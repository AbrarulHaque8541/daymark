(function (root) {
  'use strict';

  // Keyless quote glance card for the Daymark web prototype, powered by the
  // public ZenQuotes JSON API at zenquotes.io (no API key, no account, no
  // maintainer backend). Stateless like fact-logic.js: no DOM, no storage,
  // so it is directly unit-testable and safe to reuse. Leave the mode empty
  // for today's quote, or ask for "random" for a random one.
  const MAX_TEXT_CHARS = 400;
  const LINK_PREFIX = 'https://zenquotes.io/';

  const api = {
    mechanism: 'bounded fetch',
    endpointBase: 'https://zenquotes.io',
    maxPayloadBytes: 256 * 1024,
    maxTextChars: MAX_TEXT_CHARS,
    linkPrefix: LINK_PREFIX,
    normalizeQuoteMode: normalizeQuoteMode,
    buildsQuoteUrl: buildQuoteUrl,
    parsesQuote: parseQuote,
    truncateWithHonesty: truncateWithHonesty,
    classifiesError: classifyQuoteError,
    fetchesQuote: fetchQuote
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  root.DaymarkQuote = api;

  // Empty or absent means "today's quote". A present value must be exactly
  // "today" or "random" (case-insensitive, trimmed); anything else fails
  // closed with null.
  function normalizeQuoteMode(value) {
    if (value === null || value === undefined) return 'today';
    const text = String(value).trim().toLowerCase();
    if (!text) return 'today';
    if (text === 'today') return 'today';
    if (text === 'random') return 'random';
    return null;
  }

  function buildQuoteUrl(value) {
    const normalized = normalizeQuoteMode(value);
    if (normalized === null) throw new Error('The quote mode was not recognized.');
    return api.endpointBase + '/api/' + normalized;
  }

  function truncateWithHonesty(text) {
    if (typeof text !== 'string') return { text: '', truncated: false };
    if (text.length <= MAX_TEXT_CHARS) return { text: text, truncated: false };
    return { text: text.slice(0, MAX_TEXT_CHARS), truncated: true };
  }

  function safeLink(permalink) {
    if (typeof permalink !== 'string') return 'https://zenquotes.io';
    const trimmed = permalink.trim();
    if (!trimmed || trimmed.length > 300) return 'https://zenquotes.io';
    if (trimmed.indexOf(LINK_PREFIX) !== 0) return 'https://zenquotes.io';
    return trimmed;
  }

  function parseQuote(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('The quote response was malformed.');
    }
    // ZenQuotes returns an array of one object for both endpoints.
    const item = Array.isArray(payload) ? payload[0] : payload;
    if (!item || typeof item !== 'object') {
      throw new Error('The quote response was malformed.');
    }
    const quote = truncateWithHonesty(typeof item.q === 'string' ? item.q.trim() : '');
    if (!quote.text) throw new Error('The quote response was malformed.');
    const author = typeof item.a === 'string' ? item.a.trim() : '';
    return {
      text: quote.text,
      truncated: quote.truncated,
      author: author,
      link: safeLink(item.h ? null : null) // ZenQuotes has no permalink; use site
    };
  }

  function classifyQuoteError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 403') !== -1) {
      return 'The zenquotes.io endpoint limited this request. Try again in a moment.';
    }
    if (message.indexOf('HTTP 404') !== -1) {
      return 'That quote was not found at zenquotes.io. Check the mode and try again.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'The zenquotes.io endpoint rejected the request (' + message + ')';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'The zenquotes.io endpoint had a server problem. Try again in a moment.';
    }
    if (message.indexOf('timed out') !== -1) {
      return 'The request timed out. Check your connection and try again.';
    }
    if (message.indexOf('malformed') !== -1) {
      return 'The quote response could not be read. Try again in a moment.';
    }
    if (message.indexOf('too large') !== -1) {
      return 'The quote response was too large to read safely. Try again later.';
    }
    if (message.indexOf('quote mode was not recognized') !== -1) {
      return 'Please enter today or random, or leave it empty for today\'s quote.';
    }
    if (message.indexOf('unavailable in this environment') !== -1) {
      return 'The quote glance is unavailable in this environment.';
    }
    return null;
  }

  async function fetchQuote(fetch, mode) {
    if (typeof fetch !== 'function') throw new Error('fetch is unavailable in this environment.');
    let url;
    try {
      url = buildQuoteUrl(mode);
    } catch (error) {
      const friendly = classifyQuoteError(error);
      throw new Error(friendly === null
        ? (error && error.message ? String(error.message) : 'The quote mode was not recognized.')
        : friendly);
    }
    let response = null;
    try {
      response = await fetch(url, { cache: 'no-store' });
      if (!response || typeof response !== 'object') {
        throw new Error('The quote request returned no response.');
      }
      if (!response.ok) throw new Error('HTTP ' + String(response.status));
      const responseBodyModule = (typeof require === 'function')
        ? require('./response-body-logic.js')
        : (root.DaymarkResponseBody || null);
      const readBoundedText = responseBodyModule && typeof responseBodyModule.readBoundedText === 'function'
        ? responseBodyModule.readBoundedText
        : null;
      if (!readBoundedText) throw new Error('The quote response could not be read.');
      const text = await readBoundedText(response, {
        maxBytes: api.maxPayloadBytes,
        tooLargeMessage: 'The quote response was too large to read safely. Try again later.',
        malformedMessage: 'The quote response was malformed.',
        timeoutMessage: 'The quote request timed out.',
        streamRequiredMessage: 'The quote response could not be read.'
      });
      let payload;
      try { payload = JSON.parse(text); } catch (error) {
        throw new Error('The quote response was malformed.');
      }
      const record = parseQuote(payload);
      record.mode = normalizeQuoteMode(mode) === 'random' ? 'random' : 'today';
      record.url = url;
      record.link = 'https://zenquotes.io';
      return record;
    } catch (error) {
      const friendly = classifyQuoteError(error);
      if (friendly === null) throw error;
      const typed = new Error(friendly);
      typed.originalMessage = error && error.message ? String(error.message) : '';
      throw typed;
    } finally {
      if (response && response.body && typeof response.body.cancel === 'function') {
        try {
          const cancellation = response.body.cancel();
          if (cancellation && typeof cancellation.catch === 'function') cancellation.catch(() => {});
        } catch (error) {
          // the caller already has its answer; the stream cleanup is best-effort
        }
      }
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
