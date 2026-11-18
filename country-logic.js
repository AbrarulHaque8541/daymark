(function (root) {
  'use strict';

  // Keyless country glance card for the web prototype, powered by the public
  // REST Countries API (restcountries.com, no API key, no account, no
  // maintainer backend). Mirrors launch-logic.js: pure functions, no DOM, no
  // storage. The request is HTTPS-only, timeout-guarded and read through the
  // shared bounded response reader. Nothing is saved on this device and there
  // is no polling: the card only asks the network when the user taps Check.

  const responseBodyApi = root.DaymarkResponseBody
    || (typeof require === 'function' ? require('./response-body-logic.js') : null);

  const COUNTRY_ENDPOINT = 'https://restcountries.com/v3.1/name/';
  const COUNTRY_FIELDS = 'name,cca2,cca3,capital,region,subregion,population,timezones,currencies,flag';
  const DEFAULT_TIMEOUT_MS = 10000;
  const MAX_JSON_BYTES = 256 * 1024;
  const MAX_JSON_CHARS = MAX_JSON_BYTES;
  const MAX_COUNTRIES = 5;
  const MIN_QUERY_CHARS = 2;
  const MAX_QUERY_CHARS = 60;
  const MAX_NAME_CHARS = 80;
  const MAX_FIELD_CHARS = 80;
  const MAX_TIMEZONES_SHOWN = 4;
  const MAX_CURRENCIES_SHOWN = 4;

  function hasControlCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 32 || code === 127) return true;
    }
    return false;
  }

  function normalizeQuery(value) {
    if (typeof value !== 'string') return null;
    if (hasControlCharacter(value)) return null;
    const trimmed = value.trim().replace(/\s+/g, ' ');
    if (trimmed.length < MIN_QUERY_CHARS || trimmed.length > MAX_QUERY_CHARS) return null;
    if (!/^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F0-9 .'\u2010-\u2015-]*$/.test(trimmed)) return null;
    if (!/[A-Za-z\u00C0-\u024F]/.test(trimmed)) return null;
    return trimmed;
  }

  function buildCountriesUrl(query) {
    const parsed = normalizeQuery(typeof query === 'string' ? query : '');
    if (!parsed) {
      throw new Error('Enter a country name between 2 and 60 letters.');
    }
    return COUNTRY_ENDPOINT + encodeURIComponent(parsed) + '?fields=' + COUNTRY_FIELDS;
  }

  function capText(value, cap) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || hasControlCharacter(trimmed)) return null;
    if (trimmed.length <= cap) return { text: trimmed, truncated: false };
    return { text: trimmed.slice(0, cap), truncated: true };
  }

  function readField(value, cap) {
    const capped = capText(value, cap);
    return capped ? capped.text : '';
  }

  // Deterministic grouped digits, no Intl dependency: 1408712000 ->
  // '1,408,712,000'. Non-finite or negative values are refused, never guessed.
  function formatPopulation(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const rounded = Math.round(value);
    if (rounded < 0 || !Number.isSafeInteger(rounded)) return null;
    return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function parseCurrencies(currencies) {
    const out = [];
    let omitted = 0;
    if (!currencies || typeof currencies !== 'object' || Array.isArray(currencies)) {
      return { currencies: out, omitted: omitted };
    }
    const codes = Object.keys(currencies).sort();
    codes.forEach((code) => {
      if (out.length >= MAX_CURRENCIES_SHOWN) { omitted += 1; return; }
      if (!/^[A-Za-z]{2,6}$/.test(String(code))) { return; }
      const entry = currencies[code];
      const info = entry && typeof entry === 'object' ? entry : {};
      out.push({
        code: String(code),
        name: readField(info.name, MAX_FIELD_CHARS),
        symbol: readField(info.symbol, 8)
      });
    });
    return { currencies: out, omitted: omitted };
  }

  function describeCurrency(entry) {
    if (!entry || typeof entry !== 'object') return '';
    const code = typeof entry.code === 'string' ? entry.code : '';
    if (!code) return '';
    const parts = [code];
    if (entry.name) parts.push(entry.name);
    if (entry.symbol) parts.push('(' + entry.symbol + ')');
    return parts.join(' ');
  }

  function parseCountries(payload) {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload)) {
      throw new Error('The country response is malformed.');
    }
    const countries = [];
    let truncatedFields = 0;
    for (let index = 0; index < payload.length && countries.length < MAX_COUNTRIES; index += 1) {
      const item = payload[index];
      if (!item || typeof item !== 'object') continue;
      const officialRaw = item.name && typeof item.name === 'object' ? item.name.official : '';
      const name = capText(item.name && typeof item.name === 'object' ? item.name.common : '', MAX_NAME_CHARS);
      if (!name) continue;
      const officialCapped = capText(officialRaw, MAX_FIELD_CHARS);
      if (officialCapped && officialCapped.truncated) truncatedFields += 1;
      const official = officialCapped ? officialCapped.text : '';
      const capitalList = Array.isArray(item.capital) && item.capital.length ? item.capital : null;
      const capital = capitalList ? readField(capitalList[0], MAX_FIELD_CHARS) : '';
      const region = readField(item.region, 40);
      const subregion = readField(item.subregion, 40);
      const populationText = formatPopulation(item.population) || 'Not published';
      const timezonesRaw = Array.isArray(item.timezones) ? item.timezones : [];
      const timezones = [];
      for (let t = 0; t < timezonesRaw.length && timezones.length < MAX_TIMEZONES_SHOWN; t += 1) {
        const zone = readField(timezonesRaw[t], 40);
        if (zone) timezones.push(zone);
      }
      const timezonesOmitted = Math.max(0, timezonesRaw.length - timezones.length);
      const money = parseCurrencies(item.currencies);
      truncatedFields += money.omitted;
      const flag = readField(item.flag, 16);
      const cca2 = typeof item.cca2 === 'string' && /^[A-Za-z]{2}$/.test(item.cca2) ? item.cca2.toUpperCase() : '';
      const cca3 = typeof item.cca3 === 'string' && /^[A-Za-z]{3}$/.test(item.cca3) ? item.cca3.toUpperCase() : '';
      countries.push({
        name: name.text,
        officialName: official || name.text,
        cca2: cca2,
        cca3: cca3,
        capital: capital || 'No capital published',
        region: region || 'Region not published',
        subregion: subregion || '',
        populationText: populationText,
        timezones: timezones,
        timezonesOmitted: timezonesOmitted,
        currencies: money.currencies.map(describeCurrency).filter((text) => text),
        currenciesOmitted: money.omitted,
        flag: flag || ''
      });
      if (name.truncated) truncatedFields += 1;
    }
    if (!countries.length) {
      throw new Error('No readable country data in the response.');
    }
    return { countries: countries, truncatedFields: truncatedFields };
  }

  function classifyCountryError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 404') !== -1) {
      return 'No country matched that name in the public list. Check the spelling and try again.';
    }
    if (message.indexOf('HTTP 429') !== -1 || message.indexOf('HTTP 403') !== -1) {
      return 'The public country service limited this request. Wait a few minutes and try again.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'The country service rejected the request (' + message + '). Try a simpler name.';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'The country service had a server problem (' + message + '). Try again in a moment.';
    }
    if (message.indexOf('timed out') !== -1) {
      return 'The request timed out. Check your connection and try again.';
    }
    if (message.indexOf('too large') !== -1) {
      return 'The country response was too large to read safely. Try a more specific name.';
    }
    return null;
  }

  function timersUsable() {
    try {
      if (typeof root.setTimeout !== 'function') return false;
      const id = root.setTimeout(() => {}, 1);
      if (typeof root.clearTimeout === 'function') root.clearTimeout(id);
      return true;
    } catch (error) {
      return false;
    }
  }

  async function fetchJson(url, fetchImpl, timeoutMs) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
    const usableTimers = timersUsable();
    let timedOut = false;
    let activeReader = null;
    const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    let timer = null;
    let timeout = null;
    if (usableTimers && typeof root.clearTimeout === 'function') {
      timeout = new Promise((resolve, reject) => {
        timer = root.setTimeout(() => {
          timedOut = true;
          if (controller) controller.abort();
          if (activeReader && typeof activeReader.cancel === 'function') {
            try {
              const cancellation = activeReader.cancel();
              if (cancellation && typeof cancellation.catch === 'function') cancellation.catch(() => {});
            } catch (error) { /* cancellation is best-effort */ }
          }
          reject(new Error('The country request timed out.'));
        }, duration);
      });
    }
    const request = (async () => {
      const response = await fetchImpl(url, {
        signal: controller ? controller.signal : undefined,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        headers: { 'Accept': 'application/json' }
      });
      if (!response || !response.ok) throw new Error('HTTP ' + (response ? response.status : 'unknown'));
      if (!responseBodyApi || typeof responseBodyApi.readBoundedText !== 'function') {
        throw new Error('The bounded response reader is unavailable.');
      }
      const text = await responseBodyApi.readBoundedText(response, {
        maxBytes: MAX_JSON_BYTES,
        maxChars: MAX_JSON_CHARS,
        tooLargeMessage: 'The country response was too large to read safely.',
        malformedMessage: 'The country response was malformed.',
        streamRequiredMessage: 'This browser cannot read country responses with the required size limit.',
        timeoutMessage: 'The country request timed out.',
        controller: controller,
        isTimedOut: () => timedOut,
        onReader: (reader) => { activeReader = reader; }
      });
      if (timedOut) throw new Error('The country request timed out.');
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error('The country response was malformed.');
      }
    })();
    try {
      return timeout ? await Promise.race([request, timeout]) : await request;
    } finally {
      if (timer !== null && typeof root.clearTimeout === 'function') root.clearTimeout(timer);
    }
  }

  async function fetchCountries(query, fetchImpl, options) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const opts = options || {};
    const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const parsedQuery = normalizeQuery(typeof query === 'string' ? query : '');
    if (!parsedQuery) throw new Error('Enter a country name between 2 and 60 letters.');
    const payload = await fetchJson(buildCountriesUrl(parsedQuery), fetchImpl, timeoutMs);
    const parsed = parseCountries(payload);
    return {
      version: 1,
      query: parsedQuery,
      countries: parsed.countries,
      truncatedFields: parsed.truncatedFields,
      fetchedAt: now()
    };
  }

  const api = {
    normalizeQuery, buildCountriesUrl, capText, formatPopulation, parseCurrencies,
    describeCurrency, parseCountries, classifyCountryError, fetchJson, fetchCountries,
    COUNTRY_ENDPOINT, COUNTRY_FIELDS, MAX_COUNTRIES, MIN_QUERY_CHARS, MAX_QUERY_CHARS,
    MAX_NAME_CHARS, MAX_FIELD_CHARS, MAX_TIMEZONES_SHOWN, MAX_CURRENCIES_SHOWN,
    MAX_JSON_BYTES, MAX_JSON_CHARS, DEFAULT_TIMEOUT_MS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkCountries = api;
})(globalThis);
