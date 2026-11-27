(function (root) {
  'use strict';

  // Keyless joke glance card for the Daymark web prototype, powered by the
  // public JokeAPI v2 endpoint at jokeapi.dev (no API key, no account, no
  // maintainer backend). Stateless like advice-logic.js: no DOM, no storage,
  // so it is directly unit-testable and safe to reuse. Leave the id empty for
  // a random safe joke, or request a specific joke id (0 to 99999).
  const MAX_JOKE_ID = 99999;
  const MAX_TEXT_CHARS = 400;

  const api = {
    mechanism: 'bounded fetch',
    endpointBase: 'https://v2.jokeapi.dev',
    maxPayloadBytes: 256 * 1024,
    maxJokeId: MAX_JOKE_ID,
    maxTextChars: MAX_TEXT_CHARS,
    normalizeJokeId: normalizeJokeId,
    buildsJokeUrl: buildJokeUrl,
    parsesJoke: parseJoke,
    truncateWithHonesty: truncateWithHonesty,
    classifiesError: classifyJokeError,
    fetchesJoke: fetchJoke
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  root.DaymarkJoke = api;

  function isDigits(text) {
    if (typeof text !== 'string') return false;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code < 48 || code > 57) return false;
    }
    return true;
  }

  // Empty or absent means "a random safe joke". A present value must be an
  // integer between 0 and MAX_JOKE_ID (JokeAPI ids start at 0); anything else
  // fails closed with -1.
  function normalizeJokeId(value) {
    if (value === null || value === undefined) return 0;
    const text = String(value).trim();
    if (!text) return 0;
    if (!isDigits(text)) return -1;
    const number = Number(text);
    if (!Number.isFinite(number) || number < 0 || number > MAX_JOKE_ID) return -1;
    return Math.floor(number);
  }

  function buildJokeUrl(value) {
    const normalized = normalizeJokeId(value);
    if (normalized === -1) throw new Error('The joke id was not recognized.');
    const base = api.endpointBase + '/joke/Any?safe-mode&type=single,twopart';
    if (normalized === 0 && (value === null || value === undefined || String(value).trim() === '')) return base;
    return base + '&idRange=' + String(normalized);
  }

  function truncateWithHonesty(text) {
    if (typeof text !== 'string') return { text: '', truncated: false };
    if (text.length <= MAX_TEXT_CHARS) return { text: text, truncated: false };
    return { text: text.slice(0, MAX_TEXT_CHARS), truncated: true };
  }

  function validJokeId(idRaw) {
    const id = typeof idRaw === 'number' && Number.isFinite(idRaw) ? Math.floor(idRaw) : -1;
    return id >= 0 && id <= MAX_JOKE_ID ? id : -1;
  }

  function parseJoke(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('The joke response was malformed.');
    }
    if (payload.error === true) {
      throw new Error('The joke endpoint reported no joke: '
        + (typeof payload.message === 'string' ? payload.message : 'unknown reason') + '.');
    }
    const id = validJokeId(payload.id);
    if (id === -1) throw new Error('The joke response was malformed.');
    const category = typeof payload.category === 'string' ? payload.category.trim() : '';
    if (!category) throw new Error('The joke response was malformed.');
    const type = payload.type;
    if (type === 'single') {
      const single = truncateWithHonesty(typeof payload.joke === 'string' ? payload.joke.trim() : '');
      if (!single.text) throw new Error('The joke response was malformed.');
      return {
        id: id,
        category: category,
        type: 'single',
        joke: single.text,
        jokeTruncated: single.truncated,
        setup: '',
        delivery: '',
        setupTruncated: false,
        deliveryTruncated: false,
        link: 'https://jokeapi.dev'
      };
    }
    if (type === 'twopart') {
      const setup = truncateWithHonesty(typeof payload.setup === 'string' ? payload.setup.trim() : '');
      const delivery = truncateWithHonesty(typeof payload.delivery === 'string' ? payload.delivery.trim() : '');
      if (!setup.text || !delivery.text) throw new Error('The joke response was malformed.');
      return {
        id: id,
        category: category,
        type: 'twopart',
        joke: '',
        jokeTruncated: false,
        setup: setup.text,
        delivery: delivery.text,
        setupTruncated: setup.truncated,
        deliveryTruncated: delivery.truncated,
        link: 'https://jokeapi.dev'
      };
    }
    throw new Error('The joke response was malformed.');
  }

  function classifyJokeError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 403') !== -1) {
      return 'The jokeapi.dev endpoint limited this request. Try again in a moment.';
    }
    if (message.indexOf('HTTP 404') !== -1) {
      return 'That joke was not found at jokeapi.dev. Check the id and try again.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'The jokeapi.dev endpoint rejected the request (' + message + ')';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'The jokeapi.dev endpoint had a server problem. Try again in a moment.';
    }
    if (message.indexOf('timed out') !== -1) {
      return 'The request timed out. Check your connection and try again.';
    }
    if (message.indexOf('reported no joke') !== -1) {
      return 'JokeAPI could not serve that joke. Try again in a moment.';
    }
    if (message.indexOf('malformed') !== -1) {
      return 'The joke response could not be read. Try again in a moment.';
    }
    if (message.indexOf('too large') !== -1) {
      return 'The joke response was too large to read safely. Try again later.';
    }
    if (message.indexOf('joke id was not recognized') !== -1) {
      return 'Please enter a joke id between 0 and 99999, or leave it empty for a random joke.';
    }
    if (message.indexOf('unavailable in this environment') !== -1) {
      return 'The joke glance is unavailable in this environment.';
    }
    return null;
  }

  async function fetchJoke(fetch, jokeId) {
    if (typeof fetch !== 'function') throw new Error('fetch is unavailable in this environment.');
    let url;
    try {
      url = buildJokeUrl(jokeId);
    } catch (error) {
      const friendly = classifyJokeError(error);
      throw new Error(friendly === null
        ? (error && error.message ? String(error.message) : 'The joke id was not recognized.')
        : friendly);
    }
    let response = null;
    try {
      response = await fetch(url, { cache: 'no-store' });
      if (!response || typeof response !== 'object') {
        throw new Error('The joke request returned no response.');
      }
      if (!response.ok) throw new Error('HTTP ' + String(response.status));
      const responseBodyModule = (typeof require === 'function')
        ? require('./response-body-logic.js')
        : (root.DaymarkResponseBody || null);
      const readBoundedText = responseBodyModule && typeof responseBodyModule.readBoundedText === 'function'
        ? responseBodyModule.readBoundedText
        : null;
      if (!readBoundedText) throw new Error('The joke response could not be read.');
      const text = await readBoundedText(response, {
        maxBytes: api.maxPayloadBytes,
        tooLargeMessage: 'The joke response was too large to read safely. Try again later.',
        malformedMessage: 'The joke response was malformed.',
        timeoutMessage: 'The joke request timed out.',
        streamRequiredMessage: 'The joke response could not be read.'
      });
      let payload;
      try { payload = JSON.parse(text); } catch (error) {
        throw new Error('The joke response was malformed.');
      }
      const record = parseJoke(payload);
      record.url = url;
      return record;
    } catch (error) {
      const friendly = classifyJokeError(error);
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
