(function (root) {
  'use strict';

  // Keyless XKCD comic glance card for the Daymark web prototype, powered by
  // the public xkcd.com JSON metadata endpoint (no API key, no account, no
  // maintainer backend). Stateless like hijri-logic.js: no DOM, no storage,
  // so it is directly unit-testable and safe to reuse. The comic image itself
  // is loaded lazily by the browser from the HTTPS-only img URL returned by
  // the API after that URL is validated here.
  const MAX_COMIC_NUMBER = 999999;
  const MAX_ALT_CHARS = 400;

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const api = {
    mechanism: 'bounded fetch',
    endpointBase: 'https://xkcd.com',
    maxPayloadBytes: 256 * 1024,
    maxComicNumber: MAX_COMIC_NUMBER,
    maxAltChars: MAX_ALT_CHARS,
    monthNames: MONTH_NAMES,
    normalizeComicNumber: normalizeComicNumber,
    buildsXkcdUrl: buildXkcdUrl,
    parsesXkcd: parseXkcd,
    describesComicDate: describeComicDate,
    classifiesError: classifyXkcdError,
    fetchesXkcd: fetchXkcd
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  root.DaymarkXkcd = api;

  function isDigits(text) {
    if (typeof text !== 'string') return false;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code < 48 || code > 57) return false;
    }
    return true;
  }

  function nonEmptyText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  // Empty or absent means "the latest comic". A present value must be an
  // integer between 1 and MAX_COMIC_NUMBER; anything else fails closed.
  function normalizeComicNumber(value) {
    if (value === null || value === undefined) return 0;
    const text = String(value).trim();
    if (!text) return 0;
    if (!isDigits(text)) return -1;
    const number = Number(text);
    if (!Number.isFinite(number) || number < 1 || number > MAX_COMIC_NUMBER) return -1;
    return Math.floor(number);
  }

  function buildXkcdUrl(value) {
    const normalized = normalizeComicNumber(value);
    if (normalized === -1) throw new Error('The comic number was not recognized.');
    if (normalized === 0) return api.endpointBase + '/info.0.json';
    return api.endpointBase + '/' + String(normalized) + '/info.0.json';
  }

  function describeComicDate(day, month, year) {
    if (!isDigits(day) || !isDigits(month) || !isDigits(year)) return null;
    const dayNumber = Number(day);
    const monthNumber = Number(month);
    const yearNumber = Number(year);
    if (dayNumber < 1 || dayNumber > 31) return null;
    if (monthNumber < 1 || monthNumber > 12) return null;
    if (yearNumber < 1990 || yearNumber > 9999) return null;
    const dayText = day.length < 2 ? ' ' + day : day;
    return MONTH_NAMES[monthNumber - 1] + ' ' + dayText.trim() + ', ' + year;
  }

  function truncateWithHonesty(text) {
    if (typeof text !== 'string') return { text: '', truncated: false };
    if (text.length <= MAX_ALT_CHARS) return { text: text, truncated: false };
    return { text: text.slice(0, MAX_ALT_CHARS), truncated: true };
  }

  function parseXkcd(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('The XKCD response was malformed.');
    }
    const numRaw = payload.num;
    const num = typeof numRaw === 'number' && Number.isFinite(numRaw)
      ? Math.floor(numRaw) : -1;
    if (num < 1 || num > MAX_COMIC_NUMBER) {
      throw new Error('The XKCD response was malformed.');
    }
    const img = nonEmptyText(payload.img);
    if (!img || img.indexOf('https://imgs.xkcd.com/') !== 0) {
      throw new Error('The XKCD response was malformed.');
    }
    if (img.length > 300) {
      throw new Error('The XKCD response was malformed.');
    }
    const title = nonEmptyText(payload.title) || nonEmptyText(payload.safe_title);
    if (!title) throw new Error('The XKCD response was malformed.');
    const day = typeof payload.day === 'string' ? payload.day : '';
    const month = typeof payload.month === 'string' ? payload.month : '';
    const year = typeof payload.year === 'string' ? payload.year : '';
    const comicDate = describeComicDate(day, month, year);
    if (!comicDate) throw new Error('The XKCD response was malformed.');
    const altText = typeof payload.alt === 'string' ? payload.alt : '';
    const alt = truncateWithHonesty(altText);
    if (alt.truncated && alt.text.length === 0) {
      throw new Error('The XKCD response was malformed.');
    }
    return {
      num: num,
      title: title,
      alt: alt.text,
      altTruncated: alt.truncated,
      img: img,
      day: day,
      month: month,
      year: year,
      comicDate: comicDate,
      link: api.endpointBase + '/' + String(num) + '/'
    };
  }

  function classifyXkcdError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 403') !== -1) {
      return 'The xkcd.com endpoint limited this request. Try again in a moment.';
    }
    if (message.indexOf('HTTP 404') !== -1) {
      return 'That comic was not found at xkcd.com. Check the number and try again.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'The xkcd.com endpoint rejected the request (' + message + ')';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'The xkcd.com endpoint had a server problem. Try again in a moment.';
    }
    if (message.indexOf('timed out') !== -1) {
      return 'The request timed out. Check your connection and try again.';
    }
    if (message.indexOf('malformed') !== -1) {
      return 'The XKCD response could not be read. Try again in a moment.';
    }
    if (message.indexOf('too large') !== -1) {
      return 'The XKCD response was too large to read safely. Try again later.';
    }
    if (message.indexOf('comic number was not recognized') !== -1) {
      return 'Please enter a comic number between 1 and 999999, or leave it empty for the latest.';
    }
    if (message.indexOf('unavailable in this environment') !== -1) {
      return 'The XKCD comic glance is unavailable in this environment.';
    }
    return null;
  }

  async function fetchXkcd(fetch, comicNumber) {
    if (typeof fetch !== 'function') throw new Error('fetch is unavailable in this environment.');
    let url;
    try {
      url = buildXkcdUrl(comicNumber);
    } catch (error) {
      const friendly = classifyXkcdError(error);
      throw new Error(friendly === null
        ? (error && error.message ? String(error.message) : 'The comic number was not recognized.')
        : friendly);
    }
    let response = null;
    try {
      response = await fetch(url, { cache: 'no-store' });
      if (!response || typeof response !== 'object') {
        throw new Error('The XKCD request returned no response.');
      }
      if (!response.ok) throw new Error('HTTP ' + String(response.status));
      const responseBodyModule = (typeof require === 'function')
        ? require('./response-body-logic.js')
        : (root.DaymarkResponseBody || null);
      const readBoundedText = responseBodyModule && typeof responseBodyModule.readBoundedText === 'function'
        ? responseBodyModule.readBoundedText
        : null;
      if (!readBoundedText) throw new Error('The XKCD response could not be read.');
      const text = await readBoundedText(response, {
        maxBytes: api.maxPayloadBytes,
        tooLargeMessage: 'The XKCD response was too large to read safely. Try again later.',
        malformedMessage: 'The XKCD response was malformed.',
        timeoutMessage: 'The XKCD request timed out.',
        streamRequiredMessage: 'The XKCD response could not be read.'
      });
      let payload;
      try { payload = JSON.parse(text); } catch (error) {
        throw new Error('The XKCD response was malformed.');
      }
      const record = parseXkcd(payload);
      record.url = url;
      return record;
    } catch (error) {
      const friendly = classifyXkcdError(error);
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

