((root) => {
  'use strict';

  // Keyless air-quality glance for the Daymark web prototype, powered by the
  // free Open-Meteo Air Quality public API (no API key, no account, no
  // maintainer backend). Place lookup reuses the shared weather module's
  // geocoding helpers and bounded, timeout-guarded fetch so both cards behave
  // identically. Pure functions, no DOM, no storage, so it can be unit-tested
  // directly and loaded in the browser as window.DaymarkAirQuality.

  const weatherApi = root.DaymarkWeather
    || (typeof require === 'function' ? require('./weather-logic.js') : null);

  const MAX_PLACE_CHARS = 80;
  const MAX_LATITUDE_ABS = 90;
  const MAX_LONGITUDE_ABS = 180;
  const DEFAULT_TIMEOUT_MS = 10000;
  const AIR_QUALITY_ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality';
  const CURRENT_PARAMS = 'european_aqi,us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide';

  const MAX_EUROPEAN_AQI = 300;
  const MAX_US_AQI = 500;
  const MAX_PM25_UG_M3 = 1000;
  const MAX_PM10_UG_M3 = 2000;
  const MAX_GAS_UG_M3 = 1000;

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

  function requireReading(value, min, max, label) {
    if (!isFiniteNumber(value) || value < min || value > max) {
      throw new Error('The air-quality response has an invalid ' + label + ' reading.');
    }
    return value;
  }

  function buildAirQualityUrl(latitude, longitude) {
    const lat = clampCoordinate(latitude, MAX_LATITUDE_ABS);
    const lon = clampCoordinate(longitude, MAX_LONGITUDE_ABS);
    if (lat === null || lon === null) throw new Error('The place coordinates are out of range.');
    return AIR_QUALITY_ENDPOINT + '?latitude=' + lat + '&longitude=' + lon
      + '&current=' + encodeURIComponent(CURRENT_PARAMS);
  }

  // European AQI bands per the European Environment Agency index.
  function europeanAqiBand(value) {
    if (!isFiniteNumber(value) || value < 0 || value > MAX_EUROPEAN_AQI) return 'Unknown';
    if (value <= 20) return 'Good';
    if (value <= 40) return 'Fair';
    if (value <= 60) return 'Moderate';
    if (value <= 80) return 'Poor';
    if (value <= 100) return 'Very poor';
    return 'Extremely poor';
  }

  // US AQI bands per the US EPA index.
  function usAqiBand(value) {
    if (!isFiniteNumber(value) || value < 0 || value > MAX_US_AQI) return 'Unknown';
    if (value <= 50) return 'Good';
    if (value <= 100) return 'Moderate';
    if (value <= 150) return 'Unhealthy for sensitive groups';
    if (value <= 200) return 'Unhealthy';
    if (value <= 300) return 'Very unhealthy';
    return 'Hazardous';
  }

  function parseAirQuality(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('The air-quality response is malformed.');
    const current = payload.current;
    if (!current || typeof current !== 'object') throw new Error('The air-quality response has no current readings.');
    const europeanAqi = requireReading(current.european_aqi, 0, MAX_EUROPEAN_AQI, 'European AQI');
    const usAqi = requireReading(current.us_aqi, 0, MAX_US_AQI, 'US AQI');
    const pm25 = requireReading(current.pm2_5, 0, MAX_PM25_UG_M3, 'PM2.5');
    const pm10 = requireReading(current.pm10, 0, MAX_PM10_UG_M3, 'PM10');
    const ozone = requireReading(current.ozone, 0, MAX_GAS_UG_M3, 'ozone');
    const nitrogenDioxide = requireReading(current.nitrogen_dioxide, 0, MAX_GAS_UG_M3, 'nitrogen dioxide');
    return {
      europeanAqi: europeanAqi,
      europeanBand: europeanAqiBand(europeanAqi),
      usAqi: usAqi,
      usBand: usAqiBand(usAqi),
      pm25: pm25,
      pm10: pm10,
      ozone: ozone,
      nitrogenDioxide: nitrogenDioxide
    };
  }

  async function fetchAirQualityByPlace(place, fetchImpl, options) {
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

    const payload = await weatherApi.fetchJson(buildAirQualityUrl(match.latitude, match.longitude), fetchImpl, timeoutMs);
    const air = parseAirQuality(payload);
    return { version: 1, place: match, air: air, fetchedAt: now() };
  }

  const api = {
    normalizePlaceQuery,
    buildAirQualityUrl,
    europeanAqiBand,
    usAqiBand,
    parseAirQuality,
    fetchAirQualityByPlace,
    MAX_PLACE_CHARS,
    MAX_EUROPEAN_AQI,
    MAX_US_AQI,
    DEFAULT_TIMEOUT_MS,
    AIR_QUALITY_ENDPOINT,
    CURRENT_PARAMS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkAirQuality = api;
})(globalThis);
