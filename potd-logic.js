(function (root) {
  'use strict';
  const responseBodyApi = root.DaymarkResponseBody
    || (typeof require === 'function' ? require('./response-body-logic.js') : null);
  const MAX_MONTH = 12;
  const MAX_DAY = 31;
  const MAX_TITLE_CHARS = 200;
  const MAX_DESC_CHARS = 400;
  const MAX_CREDIT_CHARS = 200;
  const MAX_URL_CHARS = 300;
  const MAX_JSON_BYTES = 256 * 1024;
  const MAX_JSON_CHARS = MAX_JSON_BYTES;
  const DEFAULT_TIMEOUT_MS = 10000;
  const FEED_ENDPOINT = 'https://api.wikimedia.org/feed/v1/wikipedia/en/featured';
  const WS = /[ \t\r\n\f\v]+/g;
  function hasControlCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 32 || code === 127) return true;
    }
    return false;
  }
  function isDigits(value) {
    if (typeof value !== 'string' || !value.length) return false;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 48 || code > 57) return false;
    }
    return true;
  }
  // Accepts numbers, numeric strings, or an 'MM-DD' / 'MM/DD' string. Anything
  // outside a real calendar month/day range is rejected fail-closed.
  function normalizeDateParts(month, day) {
    let m = month;
    let d = day;
    if (typeof month === 'string' && day === undefined) {
      const parts = month.trim().split(/[-/]/);
      if (parts.length !== 2) return null;
      m = parts[0];
      d = parts[1];
    }
    if (typeof m === 'string' && !isDigits(m)) return null;
    if (typeof d === 'string' && !isDigits(d)) return null;
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
    if (iso.length < 10) return null;
    return normalizeDateParts(iso.slice(5, 7), iso.slice(8, 10));
  }
  function buildPotdUrl(month, day) {
    const parsed = normalizeDateParts(month, day);
    if (!parsed) throw new Error('Enter a real calendar date (month 1-12, day 1-31).');
    return FEED_ENDPOINT + '/' + parsed.padded;
  }
  function cleanText(value, maxChars) {
    if (typeof value !== 'string') return null;
    const trimmed = value.replace(WS, ' ').trim();
    if (!trimmed) return null;
    if (hasControlCharacter(trimmed)) return null;
    return trimmed.slice(0, maxChars);
  }
  // Only absolute HTTPS URLs from the feed are ever handed to the page.
  function safeUrl(value) {
    if (typeof value !== 'string' || !value) return null;
    if (value.length > MAX_URL_CHARS) return null;
    if (value.indexOf('https://') !== 0) return null;
    if (hasControlCharacter(value)) return null;
    return value;
  }
  // The featured feed carries the picture of the day under 'image'. Its
  // fields (title, description, artist, license, file_page) are the Wikimedia
  // attribution data, so the card can credit the photographer honestly. The
  // full image and the thumbnail both live on Wikimedia upload servers;
  // whichever readable HTTPS source exists is kept.
  function parsePotd(payload) {
    if (!payload || typeof payload !== 'object' || !payload.image || typeof payload.image !== 'object') {
      throw new Error('The picture-of-the-day feed response is malformed.');
    }
    const potd = payload.image;
    const full = potd.image && typeof potd.image === 'object' ? potd.image : null;
    const thumb = potd.thumbnail && typeof potd.thumbnail === 'object' ? potd.thumbnail : null;
    const imageUrl = safeUrl(full && full.source);
    const thumbUrl = safeUrl(thumb && thumb.source);
    if (!imageUrl && !thumbUrl) {
      throw new Error('No readable picture of the day came back for that date.');
    }
    const source = (imageUrl ? full : thumb) || {};
    let rawTitle = typeof potd.title === 'string' ? potd.title : '';
    if (rawTitle.indexOf('File:') === 0) rawTitle = rawTitle.slice(5);
    const title = cleanText(rawTitle, MAX_TITLE_CHARS) || '';
    const rawDescription = potd.description && typeof potd.description === 'object'
      ? potd.description.text
      : null;
    const description = cleanText(rawDescription, MAX_DESC_CHARS) || '';
    const artistRaw = potd.artist && typeof potd.artist === 'object' && typeof potd.artist.text === 'string'
      ? potd.artist.text.replace(/<[^>]{0,200}>/g, ' ')
      : null;
    const artist = cleanText(artistRaw, MAX_CREDIT_CHARS) || '';
    let licenseText = null;
    if (potd.license && typeof potd.license === 'object') {
      if (typeof potd.license.text === 'string' && potd.license.text) licenseText = potd.license.text;
      else if (typeof potd.license.code === 'string') licenseText = potd.license.code;
    }
    const license = licenseText ? (cleanText(licenseText, MAX_CREDIT_CHARS) || '') : '';
    const filePage = safeUrl(potd.file_page);
    const width = Number(source.width);
    const height = Number(source.height);
    return {
      title: title,
      description: description,
      descriptionTruncated: Boolean(description) && typeof rawDescription === 'string'
        && rawDescription.replace(WS, ' ').trim().length > MAX_DESC_CHARS,
      artist: artist,
      license: license,
      filePage: filePage,
      imageUrl: imageUrl,
      thumbUrl: thumbUrl,
      width: Number.isInteger(width) && width > 0 ? width : null,
      height: Number.isInteger(height) && height > 0 ? height : null
    };
  }
  // Plain words for the failures a keyless Wikimedia call can hit.
  function classifyPotdError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 403') !== -1) {
      return 'Wikimedia limited this request (the free feed is rate-limited). Try again in a moment.';
    }
    if (message.indexOf('HTTP 404') !== -1) {
      return 'No picture feed exists for that date. Check the month and day.';
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
        reject(new Error('The picture request timed out.'));
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
        tooLargeMessage: 'The picture-of-the-day response was too large to read safely.',
        malformedMessage: 'The picture-of-the-day response was malformed.',
        streamRequiredMessage: 'This browser cannot read picture-of-the-day responses with the required size limit.',
        timeoutMessage: 'The picture request timed out.',
        controller: controller,
        isTimedOut: () => timedOut,
        onReader: (reader) => { activeReader = reader; }
      });
      if (timedOut) throw new Error('The picture request timed out.');
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error('The picture-of-the-day response was malformed.');
      }
    })();
    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timer !== null) root.clearTimeout(timer);
    }
  }
  // Stateless: fetches the feed for one date and returns a plain record.
  async function fetchPotd(fetchImpl, options) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const opts = options || {};
    const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const iso = now();
    const parts = opts.month !== undefined || opts.day !== undefined
      ? normalizeDateParts(opts.month, opts.day)
      : datePartsFromIso(iso);
    if (!parts) throw new Error('Enter a real calendar date (month 1-12, day 1-31).');
    const payload = await fetchJson(buildPotdUrl(parts.month, parts.day), fetchImpl, timeoutMs);
    const picture = parsePotd(payload);
    return { version: 1, month: parts.month, day: parts.day, picture: picture, fetchedAt: now() };
  }
  const api = {
    normalizeDateParts: normalizeDateParts,
    datePartsFromIso: datePartsFromIso,
    buildPotdUrl: buildPotdUrl,
    parsePotd: parsePotd,
    classifyPotdError: classifyPotdError,
    fetchJson: fetchJson,
    fetchPotd: fetchPotd,
    MAX_MONTH: MAX_MONTH,
    MAX_DAY: MAX_DAY,
    MAX_TITLE_CHARS: MAX_TITLE_CHARS,
    MAX_DESC_CHARS: MAX_DESC_CHARS,
    MAX_CREDIT_CHARS: MAX_CREDIT_CHARS,
    MAX_URL_CHARS: MAX_URL_CHARS,
    MAX_JSON_BYTES: MAX_JSON_BYTES,
    MAX_JSON_CHARS: MAX_JSON_CHARS,
    DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
    FEED_ENDPOINT: FEED_ENDPOINT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkPotd = api;
})(globalThis);
