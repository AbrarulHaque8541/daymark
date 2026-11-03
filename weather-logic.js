((root) => {
  'use strict';

  // Keyless weather glance for the Daymark web prototype, powered by the free
  // Open-Meteo public APIs (no API key, no account, no maintainer backend).
  // Mirrors the feed-logic.js module style: pure functions, no DOM, no storage,
  // so it can be unit-tested directly and loaded in the browser as
  // window.DaymarkWeather.

  const MAX_PLACE_CHARS = 80;
  const MAX_COUNTRY_CHARS = 80;
  const MAX_LABEL_CHARS = 40;
  const MAX_JSON_CHARS = 256 * 1024;
  const MAX_LATITUDE_ABS = 90;
  const MAX_LONGITUDE_ABS = 180;
  const MIN_TEMPERATURE_C = -90;
  const MAX_TEMPERATURE_C = 60;
  const MAX_WIND_KPH = 500;
  const MIN_HUMIDITY_PERCENT = 0;
  const MAX_HUMIDITY_PERCENT = 100;
  const MAX_WEATHER_CODE = 99;
  const DEFAULT_TIMEOUT_MS = 10000;

  const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
  const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

  const WMO_LABELS = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snowfall',
    73: 'Moderate snowfall',
    75: 'Heavy snowfall',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail'
  };

  function weatherCodeLabel(code, isDay) {
    if (!Number.isInteger(code) || code < 0 || code > MAX_WEATHER_CODE) return 'Unsettled';
    if (code === 0) return isDay ? 'Clear sky' : 'Clear night';
    if (code === 1) return isDay ? 'Mainly clear' : 'Mostly clear night';
    const mapped = WMO_LABELS[code];
    return typeof mapped === 'string' ? mapped : 'Unsettled';
  }

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

  function buildGeocodingUrl(placeQuery) {
    const query = normalizePlaceQuery(placeQuery);
    if (!query) throw new Error('Type a place name first.');
    const name = encodeURIComponent(query);
    return `${GEOCODING_ENDPOINT}?name=${name}&count=1&language=en&format=json`;
  }

  function buildForecastUrl(latitude, longitude) {
    const lat = clampCoordinate(latitude, MAX_LATITUDE_ABS);
    const lon = clampCoordinate(longitude, MAX_LONGITUDE_ABS);
    if (lat === null || lon === null) throw new Error('The place coordinates are out of range.');
    const current = encodeURIComponent('temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m');
    return `${FORECAST_ENDPOINT}?latitude=${lat}&longitude=${lon}&current=${current}&wind_speed_unit=kmh`;
  }

  function parseGeocoding(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const results = payload.results;
    if (!Array.isArray(results) || results.length === 0) return null;
    const match = results[0];
    if (!match || typeof match !== 'object') return null;
    const name = typeof match.name === 'string' ? match.name.trim().slice(0, MAX_PLACE_CHARS) : '';
    const latitude = clampCoordinate(match.latitude, MAX_LATITUDE_ABS);
    const longitude = clampCoordinate(match.longitude, MAX_LONGITUDE_ABS);
    if (!name || latitude === null || longitude === null) return null;
    const country = typeof match.country === 'string' && match.country.trim()
      ? match.country.trim().slice(0, MAX_COUNTRY_CHARS)
      : null;
    return { name, country, latitude, longitude };
  }

  function parseWeather(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('The weather response is malformed.');
    const current = payload.current;
    if (!current || typeof current !== 'object') throw new Error('The weather response has no current conditions.');
    const temperatureC = current.temperature_2m;
    const feelsLikeC = current.apparent_temperature;
    const windKph = current.wind_speed_10m;
    const humidityPercent = current.relative_humidity_2m;
    if (!isFiniteNumber(temperatureC) || temperatureC < MIN_TEMPERATURE_C || temperatureC > MAX_TEMPERATURE_C) {
      throw new Error('The weather response has an invalid temperature.');
    }
    if (!isFiniteNumber(feelsLikeC) || feelsLikeC < MIN_TEMPERATURE_C || feelsLikeC > MAX_TEMPERATURE_C) {
      throw new Error('The weather response has an invalid feels-like temperature.');
    }
    if (!isFiniteNumber(windKph) || windKph < 0 || windKph > MAX_WIND_KPH) {
      throw new Error('The weather response has an invalid wind speed.');
    }
    if (!isFiniteNumber(humidityPercent) || humidityPercent < MIN_HUMIDITY_PERCENT || humidityPercent > MAX_HUMIDITY_PERCENT) {
      throw new Error('The weather response has an invalid humidity.');
    }
    const isDay = current.is_day === 1 || current.is_day === true;
    const weatherCode = current.weather_code;
    if (!Number.isInteger(weatherCode) || weatherCode < 0 || weatherCode > MAX_WEATHER_CODE) {
      throw new Error('The weather response has an invalid condition code.');
    }
    return {
      temperatureC,
      feelsLikeC,
      windKph,
      humidityPercent,
      isDay,
      weatherCode,
      label: weatherCodeLabel(weatherCode, isDay).slice(0, MAX_LABEL_CHARS)
    };
  }

  function isValidPlace(place) {
    return Boolean(place && typeof place === 'object'
      && typeof place.name === 'string' && place.name.trim().length > 0
      && place.name.length <= MAX_PLACE_CHARS
      && (place.country === null || place.country === undefined
        || (typeof place.country === 'string' && place.country.length <= MAX_COUNTRY_CHARS))
      && isFiniteNumber(place.latitude) && Math.abs(place.latitude) <= MAX_LATITUDE_ABS
      && isFiniteNumber(place.longitude) && Math.abs(place.longitude) <= MAX_LONGITUDE_ABS);
  }

  function isValidWeather(weather) {
    return Boolean(weather && typeof weather === 'object'
      && isFiniteNumber(weather.temperatureC)
      && weather.temperatureC >= MIN_TEMPERATURE_C && weather.temperatureC <= MAX_TEMPERATURE_C
      && isFiniteNumber(weather.feelsLikeC)
      && weather.feelsLikeC >= MIN_TEMPERATURE_C && weather.feelsLikeC <= MAX_TEMPERATURE_C
      && isFiniteNumber(weather.windKph) && weather.windKph >= 0 && weather.windKph <= MAX_WIND_KPH
      && isFiniteNumber(weather.humidityPercent)
      && weather.humidityPercent >= MIN_HUMIDITY_PERCENT && weather.humidityPercent <= MAX_HUMIDITY_PERCENT
      && typeof weather.isDay === 'boolean'
      && Number.isInteger(weather.weatherCode)
      && weather.weatherCode >= 0 && weather.weatherCode <= MAX_WEATHER_CODE
      && typeof weather.label === 'string' && weather.label.length > 0
      && weather.label.length <= MAX_LABEL_CHARS);
  }

  function validateWeatherCache(value) {
    return Boolean(value && typeof value === 'object'
      && value.version === 1
      && isValidPlace(value.place)
      && isValidWeather(value.weather)
      && typeof value.fetchedAt === 'string' && !Number.isNaN(Date.parse(value.fetchedAt)));
  }

  async function fetchJson(url, fetchImpl, timeoutMs) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
    let timedOut = false;
    const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    let timer = null;
    const timeout = new Promise((resolve, reject) => {
      timer = root.setTimeout(() => {
        timedOut = true;
        if (controller) controller.abort();
        reject(new Error('Weather request timed out.'));
      }, duration);
    });
    const request = (async () => {
      const response = await fetchImpl(url, {
        signal: controller ? controller.signal : undefined,
        cache: 'no-store',
        redirect: 'follow'
      });
      if (!response || !response.ok) throw new Error(`HTTP ${response ? response.status : 'unknown'}`);
      const text = await response.text();
      if (text.length > MAX_JSON_CHARS) throw new Error('The weather response was too large to parse safely.');
      if (timedOut) throw new Error('Weather request timed out.');
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error('The weather response was malformed.');
      }
    })();
    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timer !== null) root.clearTimeout(timer);
    }
  }

  async function fetchWeatherByPlace(place, fetchImpl, options) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const opts = options || {};
    const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const query = normalizePlaceQuery(place);
    if (!query) throw new Error('Type a place name first.');

    const geocoding = await fetchJson(buildGeocodingUrl(query), fetchImpl, timeoutMs);
    const match = parseGeocoding(geocoding);
    if (!match) throw new Error('No place matched that name. Try a nearby city.');

    const forecast = await fetchJson(buildForecastUrl(match.latitude, match.longitude), fetchImpl, timeoutMs);
    const weather = parseWeather(forecast);
    return { version: 1, place: match, weather, fetchedAt: now() };
  }

  const api = {
    weatherCodeLabel,
    normalizePlaceQuery,
    buildGeocodingUrl,
    buildForecastUrl,
    parseGeocoding,
    parseWeather,
    isValidPlace,
    isValidWeather,
    validateWeatherCache,
    fetchJson,
    fetchWeatherByPlace,
    MAX_PLACE_CHARS,
    MAX_COUNTRY_CHARS,
    MAX_LABEL_CHARS,
    MAX_JSON_CHARS,
    DEFAULT_TIMEOUT_MS,
    GEOCODING_ENDPOINT,
    FORECAST_ENDPOINT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkWeather = api;
})(globalThis);
