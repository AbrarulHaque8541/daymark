(function (root) {
  'use strict';

  // Keyless advice glance card for the Daymark web prototype, powered by the
  // public adviceslip.com JSON endpoint (no API key, no account, no
  // maintainer backend). Stateless like xkcd-logic.js: no DOM, no storage,
  // so it is directly unit-testable and safe to reuse. Leave the id empty for
  // a random slip, or request a specific slip id (1 to 99999).
  const MAX_SLIP_ID = 99999;
  const MAX_ADVICE_CHARS = 400;

  const api = {
    mechanism: 'bounded fetch',
    endpointBase: 'https://api.adviceslip.com',
    maxPayloadBytes: 256 * 1024,
    maxSlipId: MAX_SLIP_ID,
    maxAdviceChars: MAX_ADVICE_CHARS,
    normalizeSlipId: normalizeSlipId,
    buildsAdviceUrl: buildAdviceUrl,
    parsesAdvice: parseAdvice,
    truncateWithHonesty: truncateWithHonesty,
    classifiesError: classifyAdviceError,
    fetchesAdvice: fetchAdvice
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  root.DaymarkAdvice = api;

  function isDigits(text) {
    if (typeof text !== 'string') return false;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code < 48 || code > 57) return false;
    }
    return true;
  }

  // Empty or absent means "a random slip". A present value must be an
  // integer between 1 and MAX_SLIP_ID; anything else fails closed with -1.
  function normalizeSlipId(value) {
    if (value === null || value === undefined) return 0;
    const text = String(value).trim();
    if (!text) return 0;
    if (!isDigits(text)) return -1;
    const number = Number(text);
    if (!Number.isFinite(number) || number < 1 || number > MAX_SLIP_ID) return -1;
    return Math.floor(number);
  }

  function buildAdviceUrl(value) {
    const normalized = normalizeSlipId(value);
    if (normalized === -1) throw new Error('The advice id was not recognized.');
    if (normalized === 0) return api.endpointBase + '/advice';
    return api.endpointBase + '/advice/' + String(normalized);
  }

  function truncateWithHonesty(text) {
    if (typeof text !== 'string') return { text: '', truncated: false };
    if (text.length <= MAX_ADVICE_CHARS) return { text: text, truncated: false };
    return { text: text.slice(0, MAX_ADVICE_CHARS), truncated: true };
  }

  function parseAdvice(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('The advice response was malformed.');
    }
    const slip = payload.slip;
    if (!slip || typeof slip !== 'object') {
      throw new Error('The advice response was malformed.');
    }
    const idRaw = slip.id;
    const id = typeof idRaw === 'number' && Number.isFinite(idRaw)
      ? Math.floor(idRaw) : -1;
    if (id < 1 || id > MAX_SLIP_ID) {
      throw new Error('The advice response was malformed.');
    }
    const adviceText = typeof slip.advice === 'string' ? slip.advice.trim() : '';
    if (!adviceText) {
      throw new Error('The advice response was malformed.');
    }
    const advice = truncateWithHonesty(adviceText);
    if (advice.truncated && advice.text.length === 0) {
      throw new Error('The advice response was malformed.');
    }
    return {
      id: id,
      advice: advice.text,
      adviceTruncated: advice.truncated,
      link: 'https://adviceslip.com/advice/' + String(id)
    };
  }

  function classifyAdviceError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 403') !== -1) {
      return 'The adviceslip.com endpoint limited this request. Try again in a moment.';
    }
    if (message.indexOf('HTTP 404') !== -1) {
      return 'That advice slip was not found at adviceslip.com. Check the id and try again.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'The adviceslip.com endpoint rejected the request (' + message + ')';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'The adviceslip.com endpoint had a server problem. Try again in a moment.';
    }
    if (message.indexOf('timed out') !== -1) {
      return 'The request timed out. Check your connection and try again.';
    }
    if (message.indexOf('malformed') !== -1) {
      return 'The advice response could not be read. Try again in a moment.';
    }
    if (message.indexOf('too large') !== -1) {
      return 'The advice response was too large to read safely. Try again later.';
    }
    if (message.indexOf('advice id was not recognized') !== -1) {
      return 'Please enter an advice id between 1 and 99999, or leave it empty for a random slip.';
    }
    if (message.indexOf('unavailable in this environment') !== -1) {
      return 'The advice glance is unavailable in this environment.';
    }
    return null;
  }

  async function fetchAdvice(fetch, slipId) {
    if (typeof fetch !== 'function') throw new Error('fetch is unavailable in this environment.');
    let url;
    try {
      url = buildAdviceUrl(slipId);
    } catch (error) {
      const friendly = classifyAdviceError(error);
      throw new Error(friendly === null
        ? (error && error.message ? String(error.message) : 'The advice id was not recognized.')
        : friendly);
    }
    let response = null;
    try {
      response = await fetch(url, { cache: 'no-store' });
      if (!response || typeof response !== 'object') {
        throw new Error('The advice request returned no response.');
      }
      if (!response.ok) throw new Error('HTTP ' + String(response.status));
      const responseBodyModule = (typeof require === 'function')
        ? require('./response-body-logic.js')
        : (root.DaymarkResponseBody || null);
      const readBoundedText = responseBodyModule && typeof responseBodyModule.readBoundedText === 'function'
        ? responseBodyModule.readBoundedText
        : null;
      if (!readBoundedText) throw new Error('The advice response could not be read.');
      const text = await readBoundedText(response, {
        maxBytes: api.maxPayloadBytes,
        tooLargeMessage: 'The advice response was too large to read safely. Try again later.',
        malformedMessage: 'The advice response was malformed.',
        timeoutMessage: 'The advice request timed out.',
        streamRequiredMessage: 'The advice response could not be read.'
      });
      let payload;
      try { payload = JSON.parse(text); } catch (error) {
        throw new Error('The advice response was malformed.');
      }
      const record = parseAdvice(payload);
      record.url = url;
      return record;
    } catch (error) {
      const friendly = classifyAdviceError(error);
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
