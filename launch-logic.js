(function (root) {
  'use strict';

  // Keyless rocket-launch schedule for the Daymark web prototype, powered by
  // the public Launch Library 2 API (ll.thespacedevs.com, no API key, no
  // account, no maintainer backend). Mirrors crypto-logic.js: pure functions,
  // no DOM, no storage. The request is HTTPS-only, timeout-guarded and read
  // through the shared bounded response reader. Nothing is saved on this
  // device, and there are no timers or polling: the card only asks the
  // network when the user taps Check.

  const responseBodyApi = root.DaymarkResponseBody
    || (typeof require === 'function' ? require('./response-body-logic.js') : null);

  const LAUNCH_ENDPOINT = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/';
  const DEFAULT_TIMEOUT_MS = 10000;
  const MAX_JSON_BYTES = 256 * 1024;
  const MAX_JSON_CHARS = MAX_JSON_BYTES;
  const MIN_COUNT = 1;
  const MAX_COUNT = 10;
  const MAX_LAUNCHES = 8;
  const MAX_NAME_CHARS = 200;
  const MAX_FIELD_CHARS = 120;

  function hasControlCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 32 || code === 127) return true;
    }
    return false;
  }

  function normalizeCount(value) {
    const parsed = typeof value === 'number' ? value : Number(String(value == null ? '' : value).trim());
    if (!Number.isInteger(parsed) || parsed < MIN_COUNT || parsed > MAX_COUNT) return null;
    return parsed;
  }

  // Truncate a long API string to a hard cap and say so honestly, so no
  // unbounded text ever reaches the page.
  function capText(value, cap) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || hasControlCharacter(trimmed)) return null;
    if (trimmed.length <= cap) return { text: trimmed, truncated: false };
    return { text: trimmed.slice(0, cap), truncated: true };
  }

  function buildLaunchesUrl(count) {
    const parsed = normalizeCount(count);
    if (!parsed) {
      throw new Error('Pick a launch count between 1 and 10.');
    }
    return LAUNCH_ENDPOINT + '?limit=' + parsed;
  }

  function readField(value, cap) {
    const capped = capText(value, cap);
    return capped ? capped.text : '';
  }

  // Plain-words status line from the API status abbreviation. Unknown or
  // missing abbreviations fall back to the raw value, never a guess.
  function describeStatus(abbrev) {
    if (typeof abbrev !== 'string' || !abbrev.trim()) return 'Status unknown';
    const key = abbrev.trim();
    if (key === 'Go') return 'On schedule';
    if (key === 'TBC' || key === 'TBD') return 'Date not final yet';
    if (key === 'Hold') return 'On hold';
    if (key === 'Success') return 'Already flown';
    return 'Reported as ' + key;
  }

  // Deterministic UTC time text: YYYY-MM-DD HH:MM UTC, or null when the API
  // date cannot be trusted.
  function formatLaunchTime(net) {
    if (typeof net !== 'string' || !net.trim()) return null;
    const parsed = new Date(net.trim());
    if (isNaN(parsed.getTime())) return null;
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return parsed.getUTCFullYear() + '-' + pad(parsed.getUTCMonth() + 1) + '-'
      + pad(parsed.getUTCDate()) + ' ' + pad(parsed.getUTCHours()) + ':'
      + pad(parsed.getUTCMinutes()) + ' UTC';
  }

  function parseLaunches(payload, requestedCount) {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.results)) {
      throw new Error('The launch-schedule response is malformed.');
    }
    const want = normalizeCount(requestedCount);
    const limit = want ? Math.min(want, MAX_LAUNCHES) : MAX_LAUNCHES;
    const launches = [];
    let truncatedFields = 0;
    for (let index = 0; index < payload.results.length && launches.length < limit; index += 1) {
      const item = payload.results[index];
      if (!item || typeof item !== 'object') continue;
      const nameCapped = capText(item.name, MAX_NAME_CHARS);
      if (!nameCapped) continue;
      if (nameCapped.truncated) truncatedFields += 1;
      const provider = readField(
        item.launch_service_provider && typeof item.launch_service_provider === 'object'
          ? item.launch_service_provider.name
          : '',
        MAX_FIELD_CHARS
      );
      const rocket = readField(
        item.rocket && typeof item.rocket === 'object'
          && item.rocket.configuration && typeof item.rocket.configuration === 'object'
          ? item.rocket.configuration.name
          : '',
        MAX_FIELD_CHARS
      );
      const pad = readField(
        item.pad && typeof item.pad === 'object'
          && item.pad.location && typeof item.pad.location === 'object'
          ? item.pad.location.name
          : '',
        MAX_FIELD_CHARS
      );
      const whenText = formatLaunchTime(item.net);
      const status = item.status && typeof item.status === 'object' ? item.status.abbrev : '';
      launches.push({
        name: nameCapped.text,
        provider: provider,
        rocket: rocket,
        pad: pad,
        when: whenText,
        whenText: whenText || 'No readable launch time',
        statusAbbrev: typeof status === 'string' ? status.trim() : '',
        statusText: describeStatus(status)
      });
    }
    if (!launches.length) {
      throw new Error('No readable upcoming launches in the response.');
    }
    return { launches: launches, truncatedFields: truncatedFields };
  }

  // Plain words for the failures a keyless public API call can hit. The free
  // Launch Library interface is rate limited, so 429 must be explained.
  function classifyLaunchError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 429') !== -1 || message.indexOf('HTTP 403') !== -1) {
      return 'The public launch service limited this request. Wait a few minutes and try again.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'The launch service rejected the request (' + message + '). Try a smaller launch count.';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'The launch service had a server problem (' + message + '). Try again in a moment.';
    }
    if (message.indexOf('timed out') !== -1) {
      return 'The request timed out. Check your connection and try again.';
    }
    if (message.indexOf('too large') !== -1) {
      return 'The launch response was too large to read safely. Try a smaller launch count.';
    }
    return null;
  }

  function timersUsable() {
    try {
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
          reject(new Error('The launch request timed out.'));
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
        tooLargeMessage: 'The launch response was too large to read safely.',
        malformedMessage: 'The launch response was malformed.',
        streamRequiredMessage: 'This browser cannot read launch responses with the required size limit.',
        timeoutMessage: 'The launch request timed out.',
        controller: controller,
        isTimedOut: () => timedOut,
        onReader: (reader) => { activeReader = reader; }
      });
      if (timedOut) throw new Error('The launch request timed out.');
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error('The launch response was malformed.');
      }
    })();
    try {
      return timeout ? await Promise.race([request, timeout]) : await request;
    } finally {
      if (timer !== null && typeof root.clearTimeout === 'function') root.clearTimeout(timer);
    }
  }

  async function fetchUpcomingLaunches(count, fetchImpl, options) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const opts = options || {};
    const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const parsedCount = normalizeCount(count);
    if (!parsedCount) throw new Error('Pick a launch count between 1 and 10.');
    const payload = await fetchJson(buildLaunchesUrl(parsedCount), fetchImpl, timeoutMs);
    const parsed = parseLaunches(payload, parsedCount);
    return {
      version: 1,
      count: parsedCount,
      launches: parsed.launches,
      truncatedFields: parsed.truncatedFields,
      fetchedAt: now()
    };
  }

  const api = {
    normalizeCount,
    buildLaunchesUrl,
    capText,
    describeStatus,
    formatLaunchTime,
    parseLaunches,
    classifyLaunchError,
    fetchJson,
    fetchUpcomingLaunches,
    MIN_COUNT,
    MAX_COUNT,
    MAX_LAUNCHES,
    MAX_NAME_CHARS,
    MAX_FIELD_CHARS,
    MAX_JSON_BYTES,
    MAX_JSON_CHARS,
    DEFAULT_TIMEOUT_MS,
    LAUNCH_ENDPOINT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkLaunch = api;
})(globalThis);
