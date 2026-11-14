(function (root) {
  'use strict';

  // Keyless dictionary lookup for the Daymark web prototype, powered by the
  // public Free Dictionary API (api.dictionaryapi.dev, no API key, no
  // account, no maintainer backend). Mirrors the releases-logic.js module
  // style: pure functions, no DOM, no storage, so it can be unit-tested
  // directly and loaded in the browser as window.DaymarkDictionary. The
  // request is HTTPS-only, timeout-guarded and read through the shared
  // bounded response reader.

  const responseBodyApi = root.DaymarkResponseBody
    || (typeof require === 'function' ? require('./response-body-logic.js') : null);

  const MAX_WORD_LENGTH = 60;
  const MAX_ENTRY_WORD_CHARS = 80;
  const MAX_PHONETIC_CHARS = 60;
  const MAX_DEFINITION_CHARS = 240;
  const MAX_EXAMPLE_CHARS = 180;
  const MAX_DEFINITIONS = 6;
  const MAX_JSON_BYTES = 256 * 1024;
  const MAX_JSON_CHARS = MAX_JSON_BYTES;
  const DEFAULT_TIMEOUT_MS = 10000;
  const DICTIONARY_ENDPOINT = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

  function hasControlCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 32 || code === 127) return true;
    }
    return false;
  }

  // Fail-closed word normalization: trim, collapse inner whitespace, cap
  // length, reject control characters and anything that is not a letter,
  // digit, space, hyphen or apostrophe. Multi-word phrases are accepted
  // because the Free Dictionary API resolves some of them; junk is not.
  function normalizeWord(value) {
    if (typeof value !== 'string') return null;
    if (hasControlCharacter(value)) return null;
    const trimmed = value.trim().replace(/\s+/g, ' ');
    if (!trimmed || trimmed.length > MAX_WORD_LENGTH) return null;
    if (!/^[\p{L}\p{N}][\p{L}\p{N}' -]*$/u.test(trimmed)) return null;
    return trimmed;
  }

  function buildDictionaryUrl(word) {
    const normalized = normalizeWord(word);
    if (!normalized) throw new Error('Type a single word to look up.');
    return DICTIONARY_ENDPOINT + encodeURIComponent(normalized);
  }

  function cleanText(value, maxChars) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, maxChars);
  }

  function parseEntry(payload) {
    if (!Array.isArray(payload) || payload.length < 1) {
      throw new Error('The dictionary response is malformed.');
    }
    const entry = payload[0];
    if (!entry || typeof entry !== 'object') {
      throw new Error('The dictionary response is malformed.');
    }
    const word = cleanText(entry.word, MAX_ENTRY_WORD_CHARS);
    if (!word) throw new Error('The dictionary response has no readable word.');
    const phonetic = cleanText(entry.phonetic, MAX_PHONETIC_CHARS);
    const definitions = [];
    const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
    for (let m = 0; m < meanings.length && definitions.length < MAX_DEFINITIONS; m += 1) {
      const meaning = meanings[m];
      if (!meaning || typeof meaning !== 'object') continue;
      const partOfSpeech = cleanText(meaning.partOfSpeech, 40);
      const defs = Array.isArray(meaning.definitions) ? meaning.definitions : [];
      for (let d = 0; d < defs.length && definitions.length < MAX_DEFINITIONS; d += 1) {
        const def = defs[d];
        if (!def || typeof def !== 'object') continue;
        const text = cleanText(def.definition, MAX_DEFINITION_CHARS);
        if (!text) continue;
        const example = cleanText(def.example, MAX_EXAMPLE_CHARS);
        definitions.push({
          partOfSpeech: partOfSpeech,
          definition: text,
          definitionTruncated: typeof def.definition === 'string' && def.definition.trim().length > MAX_DEFINITION_CHARS,
          example: example,
          exampleTruncated: typeof def.example === 'string' && def.example.trim().length > MAX_EXAMPLE_CHARS
        });
      }
    }
    if (definitions.length < 1) {
      throw new Error('The dictionary response has no readable definitions.');
    }
    return { word: word, phonetic: phonetic, definitions: definitions };
  }

  // Plain words for the failures a keyless dictionary call can hit. The
  // Free Dictionary API is a free community service, so outages happen and
  // must be explained, not hidden.
  function classifyDictionaryError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 404') !== -1) {
      return 'No definition found for that word. Check the spelling and try again.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'The dictionary service rejected the request (' + message + '). Try again in a moment.';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'The dictionary service had a server problem (' + message + '). Try again in a moment.';
    }
    if (message.indexOf('timed out') !== -1) {
      return 'The request timed out. Check your connection and try again.';
    }
    return null;
  }

  async function fetchJson(url, fetchImpl, timeoutMs) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
    let timedOut = false;
    let activeReader = null;
    const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    let timer = null;
    let timerSupported = false;
    const timeout = new Promise((resolve, reject) => {
      if (typeof root.setTimeout !== 'function') return;
      try {
        timer = root.setTimeout(() => {
          timedOut = true;
          if (controller) controller.abort();
          if (activeReader && typeof activeReader.cancel === 'function') {
            try {
              const cancellation = activeReader.cancel();
              if (cancellation && typeof cancellation.catch === 'function') cancellation.catch(() => {});
            } catch (error) { /* cancellation is best-effort */ }
          }
          reject(new Error('The dictionary request timed out.'));
        }, duration);
        timerSupported = true;
      } catch (error) {
        timer = null;
        timerSupported = false;
      }
    });
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
        tooLargeMessage: 'The dictionary response was too large to read safely.',
        malformedMessage: 'The dictionary response was malformed.',
        streamRequiredMessage: 'This browser cannot read dictionary responses with the required size limit.',
        timeoutMessage: 'The dictionary request timed out.',
        controller: controller,
        isTimedOut: () => timedOut,
        onReader: (reader) => { activeReader = reader; }
      });
      if (timedOut) throw new Error('The dictionary request timed out.');
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error('The dictionary response was malformed.');
      }
    })();
    try {
      if (!timerSupported) return await request;
      return await Promise.race([request, timeout]);
    } finally {
      if (timer !== null && typeof root.clearTimeout === 'function') root.clearTimeout(timer);
    }
  }

  async function fetchEntry(word, fetchImpl, options) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const opts = options || {};
    const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const normalized = normalizeWord(word);
    if (!normalized) throw new Error('Type a single word to look up.');
    const payload = await fetchJson(buildDictionaryUrl(normalized), fetchImpl, timeoutMs);
    const entry = parseEntry(payload);
    return { version: 1, asked: normalized, entry: entry, fetchedAt: now() };
  }

  const api = {
    normalizeWord,
    buildDictionaryUrl,
    parseEntry,
    classifyDictionaryError,
    fetchJson,
    fetchEntry,
    MAX_WORD_LENGTH,
    MAX_ENTRY_WORD_CHARS,
    MAX_PHONETIC_CHARS,
    MAX_DEFINITION_CHARS,
    MAX_EXAMPLE_CHARS,
    MAX_DEFINITIONS,
    MAX_JSON_BYTES,
    MAX_JSON_CHARS,
    DEFAULT_TIMEOUT_MS,
    DICTIONARY_ENDPOINT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkDictionary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
