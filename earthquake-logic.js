(function (root) {
  'use strict';

  // Keyless earthquake glance card for the Daymark web prototype, powered by
  // the public USGS earthquake feed (earthquake.usgs.gov, no API key, no
  // account, no maintainer backend). Lifecycle mirrors releases-logic.js:
  // a pure module that formats, describes, parses and fetches without DOM
  // or storage, so it is directly unit-testable and safe to reuse.
  const api = {
    mechanism: 'bounded fetch',
    endpoint: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson',
    maxPayloadBytes: 256 * 1024,
    maxItems: 8,
    formatsMagnitude: formatMagnitude,
    describesMagnitude: describeMagnitude,
    formatsEventTime: formatEventTime,
    parsesQuake: parseQuake,
    parsesQuakes: parseQuakes,
    classifiesError: classifyEarthquakeError,
    fetchesRecent: fetchRecentEarthquakes
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  root.DaymarkEarthquakes = api;

  function formatMagnitude(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 12) return null;
    const oneDecimal = Math.round(value * 10) / 10;
    return oneDecimal.toFixed(1);
  }

  function describeMagnitude(magnitudeText) {
    if (magnitudeText === null) return 'unrated';
    const value = Number(magnitudeText);
    if (!Number.isFinite(value)) return 'unrated';
    if (value < 3) return 'minor';
    if (value < 4) return 'light';
    if (value < 5) return 'moderate';
    if (value < 6) return 'strong';
    if (value < 7) return 'major';
    return 'great';
  }

  function formatEventTime(epochMillis) {
    if (typeof epochMillis !== 'number' || !Number.isSafeInteger(epochMillis) || epochMillis < 0) return null;
    const date = new Date(epochMillis);
    if (Number.isNaN(date.getTime())) return null;
    let text;
    try { text = date.toISOString(); } catch (error) { return null; }
    // '2026-11-21T18:30:00.000Z' -> '2026-11-21 18:30 UTC' without regex.
    return text.slice(0, 10) + ' ' + text.slice(11, 16) + ' UTC';
  }

  function parseQuake(feature) {
    if (!feature || typeof feature !== 'object') return null;
    const properties = feature.properties;
    if (!properties || typeof properties !== 'object') return null;
    const magnitude = formatMagnitude(properties.mag);
    const place = typeof properties.place === 'string' && properties.place.trim() ? properties.place.trim() : null;
    if (magnitude === null && place === null) return null;
    const url = typeof properties.url === 'string' && properties.url.indexOf('https://earthquake.usgs.gov/') === 0
      ? properties.url
      : null;
    return {
      magnitude: magnitude,
      place: place,
      time: formatEventTime(properties.time),
      depthKm: Number.isFinite(Number(properties.depth)) ? Number(properties.depth) : null,
      tsunami: properties.tsunami === 1,
      url: url
    };
  }

  function parseQuakes(payload) {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.features)) {
      throw new Error('The earthquake response was malformed.');
    }
    const all = [];
    let dropped = 0;
    for (let i = 0; i < payload.features.length; i += 1) {
      const quake = parseQuake(payload.features[i]);
      if (quake) all.push(quake);
      else dropped += 1;
    }
    all.sort((a, b) => {
      const aVal = a.magnitude === null ? -1 : Number(a.magnitude);
      const bVal = b.magnitude === null ? -1 : Number(b.magnitude);
      if (bVal !== aVal) return bVal - aVal;
      if (a.time === null && b.time === null) return 0;
      if (a.time === null) return 1;
      if (b.time === null) return -1;
      return b.time.localeCompare(a.time);
    });
    const quakes = all.slice(0, api.maxItems);
    const hidden = dropped + (all.length - quakes.length);
    return { quakes: quakes, count: quakes.length, hidden: hidden };
  }

  function classifyEarthquakeError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 403') !== -1) {
      return 'The public USGS feed limited this request. Try again in a moment.';
    }
    if (message.indexOf('HTTP 404') !== -1) {
      return 'The USGS earthquake feed was not found. Try again later.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'The USGS feed rejected the request (' + message + ')';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'The USGS feed had a server problem. Try again in a moment.';
    }
    if (message.indexOf('timed out') !== -1) {
      return 'The request timed out. Check your connection and try again.';
    }
    if (message.indexOf('malformed') !== -1) {
      return 'The USGS response could not be read. Try again in a moment.';
    }
    if (message.indexOf('too large') !== -1) {
      return 'The USGS response was too large to read safely. Try again later.';
    }
    if (message.indexOf('unavailable in this environment') !== -1) {
      return 'The earthquake glance is unavailable in this environment.';
    }
    return null;
  }

  async function fetchRecentEarthquakes(fetch) {
    if (typeof fetch !== 'function') throw new Error('fetch is unavailable in this environment.');
    let response = null;
    try {
      response = await fetch(api.endpoint, { cache: 'no-store' });
      if (!response || typeof response !== 'object') {
        throw new Error('The earthquake request returned no response.');
      }
      if (!response.ok) throw new Error('HTTP ' + String(response.status));
      const responseBodyModule = (typeof require === 'function')
        ? require('./response-body-logic.js')
        : (root.DaymarkResponseBody || null);
      const readBoundedText = responseBodyModule && typeof responseBodyModule.readBoundedText === 'function'
        ? responseBodyModule.readBoundedText
        : null;
      if (!readBoundedText) throw new Error('The earthquake response could not be read.');
      const text = await readBoundedText(response, {
        maxBytes: api.maxPayloadBytes,
        tooLargeMessage: 'The USGS response was too large to read safely. Try again later.',
        malformedMessage: 'The earthquake response was malformed.',
        timeoutMessage: 'The earthquake request timed out.',
        streamRequiredMessage: 'The earthquake response could not be read.'
      });
      let payload;
      try { payload = JSON.parse(text); } catch (error) {
        throw new Error('The earthquake response was malformed.');
      }
      return parseQuakes(payload);
    } catch (error) {
      const friendly = classifyEarthquakeError(error);
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