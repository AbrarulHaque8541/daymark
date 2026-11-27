(function (root) {
  'use strict';

  // Keyless fact glance card for the Daymark web prototype, powered by the
  // public Useless Facts JSON API at uselessfacts.jsph.pl (no API key, no
  // account, no maintainer backend). Stateless like joke-logic.js: no DOM,
  // no storage, so it is directly unit-testable and safe to reuse. Leave the
  // mode empty for today's fact, or ask for "random" for a random one.
  const MAX_TEXT_CHARS = 400;
  const LINK_PREFIX = 'https://uselessfacts.jsph.pl/';

  const api = {
    mechanism: 'bounded fetch',
    endpointBase: 'https://uselessfacts.jsph.pl',
    maxPayloadBytes: 256 * 1024,
    maxTextChars: MAX_TEXT_CHARS,
    linkPrefix: LINK_PREFIX,
    normalizeFactMode: normalizeFactMode,
    buildsFactUrl: buildFactUrl,
    parsesFact: parseFact,
    truncateWithHonesty: truncateWithHonesty,
    classifiesError: classifyFactError,
    fetchesFact: fetchFact
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  root.DaymarkFact = api;

  // Empty or absent means "today's fact". A present value must be exactly
  // "today" or "random" (case-insensitive, trimmed); anything else fails
  // closed with null.
  function normalizeFactMode(value) {
    if (value === null || value === undefined) return 'today';
    const text = String(value).trim().toLowerCase();
    if (!text) return 'today';
    if (text === 'today') return 'today';
    if (text === 'random') return 'random';
    return null;
  }

  function buildFactUrl(value) {
    const normalized = normalizeFactMode(value);
    if (normalized === null) throw new Error('The fact mode was not recognized.');
    return api.endpointBase + '/api/v2/facts/' + normalized;
  }

  function truncateWithHonesty(text) {
    if (typeof text !== 'string') return { text: '', truncated: false };
    if (text.length <= MAX_TEXT_CHARS) return { text: text, truncated: false };
    return { text: text.slice(0, MAX_TEXT_CHARS), truncated: true };
  }

  function safeLink(permalink) {
    if (typeof permalink !== 'string') return 'https://uselessfacts.jsph.pl';
    const trimmed = permalink.trim();
    if (!trimmed || trimmed.length > 300) return 'https://uselessfacts.jsph.pl';
    if (trimmed.indexOf(LINK_PREFIX) !== 0) return 'https://uselessfacts.jsph.pl';
    return trimmed;
  }

  function parseFact(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('The fact response was malformed.');
    }
    const fact = truncateWithHonesty(typeof payload.text === 'string' ? payload.text.trim() : '');
    if (!fact.text) throw new Error('The fact response was malformed.');
    const id = typeof payload.id === 'string' && payload.id.trim()
      ? payload.id.trim()
      : (typeof payload.id === 'number' && Number.isFinite(payload.id) ? String(payload.id) : '');
    const source = typeof payload.source === 'string' ? payload.source.trim() : '';
    const language = typeof payload.language === 'string' ? payload.language.trim() : '';
    return {
      id: id,
      text: fact.text,
      truncated: fact.truncated,
      source: source,
      language: language,
      link: safeLink(payload.permalink)
    };
  }

  function classifyFactError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 403') !== -1) {
      return 'The uselessfacts.jsph.pl endpoint limited this request. Try again in a moment.';
    }
    if (message.indexOf('HTTP 404') !== -1) {
      return 'That fact was not found at uselessfacts.jsph.pl. Check the mode and try again.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'The uselessfacts.jsph.pl endpoint rejected the request (' + message + ')';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'The uselessfacts.jsph.pl endpoint had a server problem. Try again in a moment.';
    }
    if (message.indexOf('timed out') !== -1) {
      return 'The request timed out. Check your connection and try again.';
    }
    if (message.indexOf('malformed') !== -1) {
      return 'The fact response could not be read. Try again in a moment.';
    }
    if (message.indexOf('too large') !== -1) {
      return 'The fact response was too large to read safely. Try again later.';
    }
    if (message.indexOf('fact mode was not recognized') !== -1) {
      return 'Please enter today or random, or leave it empty for today\'s fact.';
    }
    if (message.indexOf('unavailable in this environment') !== -1) {
      return 'The fact glance is unavailable in this environment.';
    }
    return null;
  }

  async function fetchFact(fetch, mode) {
    if (typeof fetch !== 'function') throw new Error('fetch is unavailable in this environment.');
    let url;
    try {
      url = buildFactUrl(mode);
    } catch (error) {
      const friendly = classifyFactError(error);
      throw new Error(friendly === null
        ? (error && error.message ? String(error.message) : 'The fact mode was not recognized.')
        : friendly);
    }
    let response = null;
    try {
      response = await fetch(url, { cache: 'no-store' });
      if (!response || typeof response !== 'object') {
        throw new Error('The fact request returned no response.');
      }
      if (!response.ok) throw new Error('HTTP ' + String(response.status));
      const responseBodyModule = (typeof require === 'function')
        ? require('./response-body-logic.js')
        : (root.DaymarkResponseBody || null);
      const readBoundedText = responseBodyModule && typeof responseBodyModule.readBoundedText === 'function'
        ? responseBodyModule.readBoundedText
        : null;
      if (!readBoundedText) throw new Error('The fact response could not be read.');
      const text = await readBoundedText(response, {
        maxBytes: api.maxPayloadBytes,
        tooLargeMessage: 'The fact response was too large to read safely. Try again later.',
        malformedMessage: 'The fact response was malformed.',
        timeoutMessage: 'The fact request timed out.',
        streamRequiredMessage: 'The fact response could not be read.'
      });
      let payload;
      try { payload = JSON.parse(text); } catch (error) {
        throw new Error('The fact response was malformed.');
      }
      const record = parseFact(payload);
      record.mode = normalizeFactMode(mode) === 'random' ? 'random' : 'today';
      record.url = url;
      return record;
    } catch (error) {
      const friendly = classifyFactError(error);
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
