(function (root) {
  'use strict';

  // Keyless country glance for the Daymark web prototype, powered by the
  // public REST Countries API (restcountries.com). No API key, no account,
  // no maintainer backend. Request is HTTPS-only, timeout-guarded, and read
  // through the shared bounded response reader. Nothing is saved on device.

  const responseBodyApi = root.DaymarkResponseBody
    || (typeof require === 'function' ? require('./response-body-logic.js') : null);

  const COUNTRIES_ENDPOINT = 'https://restcountries.com/v3.1/name/';
  const DEFAULT_TIMEOUT_MS = 10000;
  const MAX_JSON_BYTES = 256 * 1024;

  function hasControlCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 32 || code === 127) return true;
    }
    return false;
  }

  function normalizeQuery(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 60 || hasControlCharacter(trimmed)) return null;
    return trimmed;
  }

  function buildCountriesUrl(query) {
    const parsed = normalizeQuery(query);
    if (!parsed) throw new Error('Enter a country name (2-60 characters).');
    return COUNTRIES_ENDPOINT + encodeURIComponent(parsed);
  }

  function formatPopulation(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function parseCountry(item) {
    if (!item || typeof item !== 'object') return null;
    const name = item.name && typeof item.name.common === 'string' ? item.name.common : null;
    const capital = Array.isArray(item.capital) && item.capital.length ? item.capital[0] : null;
    const population = formatPopulation(item.population);
    const region = typeof item.region === 'string' ? item.region : null;
    if (!name) return null;
    return { name, capital: capital || '—', population: population || '—', region: region || '—' };
  }

  function parseResponse(jsonText) {
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (error) {
      throw new Error('The country service returned an unexpected response.');
    }
    if (!Array.isArray(data) || !data.length) {
      throw new Error('No matching country found.');
    }
    const countries = data.slice(0, 5).map(parseCountry).filter(Boolean);
    if (!countries.length) throw new Error('No matching country found.');
    return { countries, truncated: data.length > 5 };
  }

  async function lookupCountry(query, options) {
    const url = buildCountriesUrl(query);
    const timeoutMs = (options && options.timeoutMs) || DEFAULT_TIMEOUT_MS;
    const fetchImpl = (options && options.fetch) || (typeof fetch === 'function' ? fetch : null);
    if (typeof fetchImpl !== 'function') throw new Error('Network unavailable.');

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller && timeoutMs
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    try {
      const response = await fetchImpl(url, {
        signal: controller ? controller.signal : undefined,
        headers: { Accept: 'application/json' }
      });
      if (timer) clearTimeout(timer);
      if (!response.ok) {
        if (response.status === 404) throw new Error('No matching country found.');
        if (response.status === 429) throw new Error('The country service is rate-limiting requests. Try again shortly.');
        throw new Error('The country service is unavailable right now.');
      }
      const reader = responseBodyApi && responseBodyApi.readBoundedResponse
        ? responseBodyApi.readBoundedResponse
        : null;
      let text;
      if (reader) {
        text = await reader(response, MAX_JSON_BYTES);
      } else {
        text = await response.text();
        if (text.length > MAX_JSON_BYTES) throw new Error('The country response was too large.');
      }
      return parseResponse(text);
    } catch (error) {
      if (timer) clearTimeout(timer);
      if (error && error.name === 'AbortError') throw new Error('The country lookup timed out.');
      throw error;
    }
  }

  const api = {
    normalizeQuery,
    buildCountriesUrl,
    parseResponse,
    lookupCountry
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DaymarkCountries = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
