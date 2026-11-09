((root) => {
  'use strict';

  const responseBodyApi = root.DaymarkResponseBody
    || (typeof require === 'function' ? require('./response-body-logic.js') : null);

  // Keyless public-holidays lookup for the Daymark web prototype, powered by the
  // free Nager.Date public API (no API key, no account, no maintainer backend).
  // Mirrors the weather-logic.js module style: pure functions, no DOM, no
  // storage, so it can be unit-tested directly and loaded in the browser as
  // window.DaymarkHolidays. A year's holiday list is fixed data, so one
  // on-demand fetch per year is enough; the UI caches it locally.

  const MAX_NAME_CHARS = 120;
  const MAX_LOCAL_NAME_CHARS = 120;
  const MAX_JSON_BYTES = 256 * 1024;
  const MAX_JSON_CHARS = MAX_JSON_BYTES;
  const MAX_HOLIDAYS = 60;
  const DEFAULT_TIMEOUT_MS = 10000;
  const MIN_YEAR = 2000;
  const MAX_YEAR = 2200;

  const ENDPOINT = 'https://date.nager.at/api/v3/PublicHolidays';

  function normalizeCountryCode(value) {
    if (typeof value !== 'string') return null;
    const code = value.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : null;
  }

  function normalizeYear(value) {
    if (!Number.isInteger(value) || value < MIN_YEAR || value > MAX_YEAR) return null;
    return value;
  }

  function isValidIsoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const time = Date.parse(value + 'T00:00:00Z');
    if (Number.isNaN(time)) return false;
    return new Date(time).toISOString().slice(0, 10) === value;
  }

  function cleanText(value, limit) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ').slice(0, limit);
  }

  function parseHolidayEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    if (!isValidIsoDate(entry.date)) return null;
    const name = cleanText(entry.name, MAX_NAME_CHARS);
    if (!name) return null;
    return {
      date: entry.date,
      name,
      localName: cleanText(entry.localName, MAX_LOCAL_NAME_CHARS),
      global: entry.global === true
    };
  }

  function parseHolidays(payload, countryCode) {
    const code = normalizeCountryCode(countryCode);
    if (!code) throw new Error('Choose a two-letter country code first.');
    if (!Array.isArray(payload)) throw new Error('The holidays response is malformed.');
    const holidays = [];
    const seen = new Set();
    for (const entry of payload) {
      const holiday = parseHolidayEntry(entry);
      if (!holiday) continue;
      const dedupeKey = holiday.date + '|' + holiday.name;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      holidays.push(holiday);
    }
    if (!holidays.length) throw new Error('The holidays response has no readable public holidays.');
    holidays.sort((first, second) => (first.date < second.date ? -1 : first.date > second.date ? 1 : 0));
    return { countryCode: code, holidays: holidays.slice(0, MAX_HOLIDAYS) };
  }

  function isValidHoliday(holiday) {
    return Boolean(holiday && typeof holiday === 'object'
      && isValidIsoDate(holiday.date)
      && typeof holiday.name === 'string' && holiday.name.length > 0
      && holiday.name.length <= MAX_NAME_CHARS
      && typeof holiday.localName === 'string' && holiday.localName.length <= MAX_LOCAL_NAME_CHARS
      && typeof holiday.global === 'boolean');
  }

  function isValidHolidayList(holidays) {
    return Boolean(Array.isArray(holidays) && holidays.length > 0 && holidays.length <= MAX_HOLIDAYS
      && holidays.every(isValidHoliday));
  }

  function validateHolidayCache(value) {
    return Boolean(value && typeof value === 'object'
      && value.version === 1
      && typeof value.countryCode === 'string'
      && normalizeCountryCode(value.countryCode) === value.countryCode
      && Number.isInteger(value.year) && value.year >= MIN_YEAR && value.year <= MAX_YEAR
      && isValidHolidayList(value.holidays)
      && typeof value.fetchedAt === 'string' && !Number.isNaN(Date.parse(value.fetchedAt)));
  }

  function buildHolidaysUrl(countryCode, year) {
    const code = normalizeCountryCode(countryCode);
    if (!code) throw new Error('Choose a two-letter country code first.');
    const normalizedYear = normalizeYear(year);
    if (normalizedYear === null) throw new Error('The holidays year is out of range.');
    return `${ENDPOINT}/${normalizedYear}/${code}`;
  }

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
        reject(new Error('Holidays request timed out.'));
      }, duration);
    });
    const request = (async () => {
      const response = await fetchImpl(url, {
        signal: controller ? controller.signal : undefined,
        cache: 'no-store',
        redirect: 'follow'
      });
      if (!response || !response.ok) throw new Error(`HTTP ${response ? response.status : 'unknown'}`);
      if (!responseBodyApi || typeof responseBodyApi.readBoundedText !== 'function') {
        throw new Error('The bounded response reader is unavailable.');
      }
      const text = await responseBodyApi.readBoundedText(response, {
        maxBytes: MAX_JSON_BYTES,
        maxChars: MAX_JSON_CHARS,
        tooLargeMessage: 'The holidays response was too large to parse safely.',
        malformedMessage: 'The holidays response was malformed.',
        streamRequiredMessage: 'This browser cannot read holiday responses with the required size limit.',
        timeoutMessage: 'Holidays request timed out.',
        controller,
        isTimedOut: () => timedOut,
        onReader: (reader) => { activeReader = reader; }
      });
      if (timedOut) throw new Error('Holidays request timed out.');
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error('The holidays response was malformed.');
      }
    })();
    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timer !== null) root.clearTimeout(timer);
    }
  }

  async function fetchHolidays(countryCode, fetchImpl, options) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const opts = options || {};
    const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const code = normalizeCountryCode(countryCode);
    if (!code) throw new Error('Choose a two-letter country code first.');
    const year = normalizeYear(Number.isInteger(opts.year)
      ? opts.year
      : Number.parseInt(now().slice(0, 4), 10));
    if (year === null) throw new Error('The holidays year is out of range.');
    const payload = await fetchJson(buildHolidaysUrl(code, year), fetchImpl, timeoutMs);
    const parsed = parseHolidays(payload, code);
    return {
      version: 1,
      countryCode: code,
      year,
      holidays: parsed.holidays,
      fetchedAt: now()
    };
  }

  const api = {
    normalizeCountryCode,
    normalizeYear,
    isValidIsoDate,
    parseHolidays,
    isValidHoliday,
    isValidHolidayList,
    validateHolidayCache,
    buildHolidaysUrl,
    fetchJson,
    fetchHolidays,
    MAX_NAME_CHARS,
    MAX_LOCAL_NAME_CHARS,
    MAX_JSON_CHARS,
    MAX_JSON_BYTES,
    MAX_HOLIDAYS,
    DEFAULT_TIMEOUT_MS,
    MIN_YEAR,
    MAX_YEAR,
    ENDPOINT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkHolidays = api;
})(globalThis);
