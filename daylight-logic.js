((root) => {
  'use strict';

  // Keyless daylight planner for the Daymark web prototype, powered by the
  // free Open-Meteo forecast API (no API key, no account, no maintainer
  // backend). Place lookup reuses the shared weather module's geocoding
  // helpers and bounded, timeout-guarded fetch so this card behaves exactly
  // like the weather and air-quality cards. Pure functions, no DOM, no
  // storage, so it can be unit-tested directly and loaded in the browser as
  // window.DaymarkDaylight.

  const weatherApi = root.DaymarkWeather
    || (typeof require === 'function' ? require('./weather-logic.js') : null);

  const MAX_PLACE_CHARS = 80;
  const DEFAULT_TIMEOUT_MS = 10000;
  const DAYLIGHT_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
  const DAILY_PARAMS = 'sunrise,sunset,uv_index_max';
  const MAX_FORECAST_DAYS = 3;
  const MAX_UV_INDEX = 20;
  const MAX_MINUTES_PER_DAY = 1440;

  function normalizePlaceQuery(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().replace(/\s+/g, ' ');
    if (!trimmed || trimmed.length > MAX_PLACE_CHARS) return null;
    return trimmed;
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function clampCoordinate(value, limit) {
    if (!isFiniteNumber(value) || Math.abs(value) > limit) return null;
    return Math.round(value * 10000) / 10000;
  }

  function buildDaylightUrl(latitude, longitude) {
    const lat = clampCoordinate(latitude, 90);
    const lon = clampCoordinate(longitude, 180);
    if (lat === null || lon === null) throw new Error('The place coordinates are out of range.');
    return DAYLIGHT_ENDPOINT + '?latitude=' + lat + '&longitude=' + lon
      + '&daily=' + encodeURIComponent(DAILY_PARAMS)
      + '&forecast_days=' + MAX_FORECAST_DAYS
      + '&timezone=auto';
  }

  // Open-Meteo returns local ISO timestamps without an offset when
  // timezone=auto, so the clock is read straight from the string instead of
  // shifting it through the viewer's timezone.
  function clockFromIso(isoText) {
    if (typeof isoText !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(isoText);
    if (!match) return null;
    const hours = Number(match[4]);
    const minutes = Number(match[5]);
    if (hours > 23 || minutes > 59) return null;
    return (hours < 10 ? '0' + hours : String(hours)) + ':' + (minutes < 10 ? '0' + minutes : String(minutes));
  }

  function minutesFromIso(isoText) {
    const clock = clockFromIso(isoText);
    if (!clock) return null;
    const hours = Number(clock.slice(0, 2));
    const minutes = Number(clock.slice(3, 5));
    return hours * 60 + minutes;
  }

  function daylightMinutes(sunriseIso, sunsetIso) {
    const sunrise = minutesFromIso(sunriseIso);
    const sunset = minutesFromIso(sunsetIso);
    if (sunrise === null || sunset === null) return null;
    // Fail closed: a sunset before its sunrise is not a wrapped polar day in
    // this daily feed, it is malformed data.
    if (sunset < sunrise) return null;
    return sunset - sunrise;
  }

  function formatDuration(totalMinutes) {
    if (!isFiniteNumber(totalMinutes) || totalMinutes < 0 || totalMinutes > MAX_MINUTES_PER_DAY) return 'unknown';
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) return hours + ' h';
    return hours + ' h ' + (minutes < 10 ? '0' + minutes : minutes) + ' min';
  }

  // UV index bands per the World Health Organization global solar UV index.
  function uvBand(value) {
    if (!isFiniteNumber(value) || value < 0 || value > MAX_UV_INDEX) return 'Unknown';
    if (value < 3) return 'Low';
    if (value < 6) return 'Moderate';
    if (value < 8) return 'High';
    if (value < 11) return 'Very high';
    return 'Extreme';
  }

  function parseDaylight(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('The daylight response is malformed.');
    const daily = payload.daily;
    if (!daily || typeof daily !== 'object') throw new Error('The daylight response has no daily data.');
    const sunrise = daily.sunrise;
    const sunset = daily.sunset;
    const uvIndexMax = daily.uv_index_max;
    if (!Array.isArray(sunrise) || !Array.isArray(sunset) || !Array.isArray(uvIndexMax)) {
      throw new Error('The daylight response has no daily data.');
    }
    if (sunrise.length !== sunset.length || sunrise.length !== uvIndexMax.length) {
      throw new Error('The daylight response has mismatched daily fields.');
    }
    if (sunrise.length < 1 || sunrise.length > MAX_FORECAST_DAYS) {
      throw new Error('The daylight response has an unexpected day count.');
    }
    const timezone = typeof payload.timezone === 'string' && payload.timezone.trim()
      ? payload.timezone.trim().slice(0, 60)
      : null;
    const days = sunrise.map((sunriseIso, index) => {
      const sunsetIso = sunset[index];
      const clock = clockFromIso(sunriseIso);
      const sunsetClock = clockFromIso(sunsetIso);
      if (!clock || !sunsetClock) throw new Error('The daylight response has an unreadable sunrise or sunset time.');
      const span = daylightMinutes(sunriseIso, sunsetIso);
      if (span === null || span <= 0 || span > MAX_MINUTES_PER_DAY) {
        throw new Error('The daylight response has an impossible day length.');
      }
      const uv = uvIndexMax[index];
      if (!isFiniteNumber(uv) || uv < 0 || uv > MAX_UV_INDEX) {
        throw new Error('The daylight response has an invalid UV index reading.');
      }
      return {
        sunrise: sunriseIso,
        sunset: sunsetIso,
        sunriseClock: clock,
        sunsetClock: sunsetClock,
        daylightMinutes: span,
        durationLabel: formatDuration(span),
        uvMax: uv,
        uvBand: uvBand(uv)
      };
    });
    return { days: days, timezone: timezone };
  }

  async function fetchDaylightByPlace(place, fetchImpl, options) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    if (!weatherApi || typeof weatherApi.fetchJson !== 'function'
      || typeof weatherApi.buildGeocodingUrl !== 'function'
      || typeof weatherApi.parseGeocoding !== 'function') {
      throw new Error('The shared geocoding helper is unavailable.');
    }
    const opts = options || {};
    const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const query = normalizePlaceQuery(place);
    if (!query) throw new Error('Type a place name first.');

    const geocoding = await weatherApi.fetchJson(weatherApi.buildGeocodingUrl(query), fetchImpl, timeoutMs);
    const match = weatherApi.parseGeocoding(geocoding);
    if (!match) throw new Error('No place matched that name. Try a nearby city.');

    const payload = await weatherApi.fetchJson(buildDaylightUrl(match.latitude, match.longitude), fetchImpl, timeoutMs);
    const daylight = parseDaylight(payload);
    return { version: 1, place: match, daylight: daylight, fetchedAt: now() };
  }

  const api = {
    normalizePlaceQuery,
    buildDaylightUrl,
    clockFromIso,
    daylightMinutes,
    formatDuration,
    uvBand,
    parseDaylight,
    fetchDaylightByPlace,
    MAX_PLACE_CHARS,
    MAX_FORECAST_DAYS,
    MAX_UV_INDEX,
    DEFAULT_TIMEOUT_MS,
    DAYLIGHT_ENDPOINT,
    DAILY_PARAMS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkDaylight = api;
})(globalThis);
