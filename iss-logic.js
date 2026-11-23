(function (root) {
  'use strict';
  const responseBodyApi = root.DaymarkResponseBody
    || (typeof require === 'function' ? require('./response-body-logic.js') : null);
  const MAX_LAT = 90;
  const MAX_LON = 180;
  const MAX_ALT_KM = 1000;
  const MAX_VELOCITY = 30000;
  const MAX_URL_CHARS = 300;
  const MAX_JSON_BYTES = 256 * 1024;
  const MAX_JSON_CHARS = MAX_JSON_BYTES;
  const DEFAULT_TIMEOUT_MS = 10000;
  const ISS_ENDPOINT = 'https://api.wheretheiss.at/v1/satellites/25544';
  function hasControlCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 32 || code === 127) return true;
    }
    return false;
  }
  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }
  function truncatedName(value) {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed || hasControlCharacter(trimmed)) return '';
    return trimmed.slice(0, 60);
  }
  // Only absolute HTTPS URLs computed from validated numbers are exposed.
  function safeUrl(value) {
    if (typeof value !== 'string' || !value) return null;
    if (value.length > MAX_URL_CHARS) return null;
    if (value.indexOf('https://') !== 0) return null;
    if (hasControlCharacter(value)) return null;
    return value;
  }
  function truncatedMapUrl(latitude, longitude) {
    const zoomLat = round4(latitude);
    const zoomLon = round4(longitude);
    return safeUrl('https://www.openstreetmap.org/?mlat=' + latitude
      + '&mlon=' + longitude + '#map=5/' + zoomLat + '/' + zoomLon);
  }
  function round4(value) {
    return Math.round(value * 10000) / 10000;
  }
  function cardinal(value, positive, negative) {
    return (value >= 0 ? positive : negative);
  }
  // Parses and validates one wheretheiss.at satellite record, fail-closed.
  function parseIss(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('The space-station feed response is malformed.');
    }
    const latitude = round4(Number(payload.latitude));
    const longitude = round4(Number(payload.longitude));
    const altitude = Number(payload.altitude);
    const velocity = Number(payload.velocity);
    const timestamp = Number(payload.timestamp);
    if (!isFiniteNumber(latitude) || latitude < -MAX_LAT || latitude > MAX_LAT) {
      throw new Error('The space-station feed gave an unreadable latitude.');
    }
    if (!isFiniteNumber(longitude) || longitude < -MAX_LON || longitude > MAX_LON) {
      throw new Error('The space-station feed gave an unreadable longitude.');
    }
    if (!isFiniteNumber(altitude) || altitude < 0 || altitude > MAX_ALT_KM) {
      throw new Error('The space-station feed gave an unreadable altitude.');
    }
    if (!isFiniteNumber(velocity) || velocity < 0 || velocity > MAX_VELOCITY) {
      throw new Error('The space-station feed gave an unreadable speed.');
    }
    if (!Number.isInteger(timestamp) || timestamp <= 0) {
      throw new Error('The space-station feed gave an unreadable position age.');
    }
    let visibility = 'unknown';
    if (payload.visibility === 'daylight' || payload.visibility === 'eclipsed') {
      visibility = payload.visibility;
    }
    const name = truncatedName(payload.name) || 'ISS';
    return {
      version: 1,
      name: name,
      latitude: latitude,
      longitude: longitude,
      latitudeLabel: Math.abs(latitude) + '° ' + cardinal(latitude, 'N', 'S'),
      longitudeLabel: Math.abs(longitude) + '° ' + cardinal(longitude, 'E', 'W'),
      hemisphere: latitude >= 0 ? 'northern hemisphere' : 'southern hemisphere',
      altitude: Math.round(altitude * 10) / 10,
      velocity: Math.round(velocity),
      visibility: visibility,
      timestamp: timestamp,
      mapUrl: truncatedMapUrl(latitude, longitude)
    };
  }
  // Plain words for the failures a keyless wheretheiss.at call can hit.
  function classifyIssError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 403') !== -1 || message.indexOf('HTTP 429') !== -1) {
      return 'The space-station feed limited this request. Wait a moment and try again.';
    }
    if (message.indexOf('HTTP 404') !== -1) {
      return 'The space-station feed has no entry for that satellite id right now.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'The space-station feed rejected the request (' + message + ')';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'The space-station feed had a server problem (' + message + '). Try again in a moment.';
    }
    if (message.indexOf('timed out') !== -1) {
      return 'The request timed out. Check your connection and try again.';
    }
    if (message.indexOf('too large') !== -1) {
      return 'The space-station feed sent more data than this card will safely read.';
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
        reject(new Error('The space-station request timed out.'));
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
        tooLargeMessage: 'The space-station response was too large to read safely.',
        malformedMessage: 'The space-station response was malformed.',
        streamRequiredMessage: 'This browser cannot read space-station responses with the required size limit.',
        timeoutMessage: 'The space-station request timed out.',
        controller: controller,
        isTimedOut: () => timedOut,
        onReader: (reader) => { activeReader = reader; }
      });
      if (timedOut) throw new Error('The space-station request timed out.');
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error('The space-station response was malformed.');
      }
    })();
    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timer !== null) root.clearTimeout(timer);
    }
  }
  // Stateless: one manual fetch, one plain record. No cache, no polling.
  async function fetchIss(fetchImpl, options) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const opts = options || {};
    const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const payload = await fetchJson(buildIssUrl(), fetchImpl, timeoutMs);
    const position = parseIss(payload);
    position.fetchedAt = now();
    return position;
  }
  function buildIssUrl() {
    return ISS_ENDPOINT;
  }
  const api = {
    buildIssUrl: buildIssUrl,
    parseIss: parseIss,
    classifyIssError: classifyIssError,
    fetchJson: fetchJson,
    fetchIss: fetchIss,
    MAX_LAT: MAX_LAT,
    MAX_LON: MAX_LON,
    MAX_ALT_KM: MAX_ALT_KM,
    MAX_VELOCITY: MAX_VELOCITY,
    MAX_URL_CHARS: MAX_URL_CHARS,
    MAX_JSON_BYTES: MAX_JSON_BYTES,
    MAX_JSON_CHARS: MAX_JSON_CHARS,
    DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
    ISS_ENDPOINT: ISS_ENDPOINT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkIss = api;
})(globalThis);