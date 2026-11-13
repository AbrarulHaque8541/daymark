(function (root) {
  'use strict';

  // Keyless release radar for the Daymark web prototype, powered by the
  // public GitHub REST API (no API key, no account, no maintainer backend).
  // Mirrors the weather-logic.js module style: pure functions, no DOM, no
  // storage, so it can be unit-tested directly and loaded in the browser as
  // window.DaymarkReleases. The request is HTTPS-only, timeout-guarded and
  // read through the shared bounded response reader.

  const responseBodyApi = root.DaymarkResponseBody
    || (typeof require === 'function' ? require('./response-body-logic.js') : null);

  const MAX_SLUG_LENGTH = 210;
  const MAX_TAG_CHARS = 100;
  const MAX_NAME_CHARS = 120;
  const MAX_URL_CHARS = 300;
  const MAX_BODY_CHARS = 400;
  const MAX_JSON_BYTES = 256 * 1024;
  const MAX_JSON_CHARS = MAX_JSON_BYTES;
  const DEFAULT_TIMEOUT_MS = 10000;
  const RELEASES_ENDPOINT = 'https://api.github.com/repos';

  function hasControlCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 32 || code === 127) return true;
    }
    return false;
  }

  // Accepts "owner/repo" and also a full https://github.com/owner/repo URL
  // pasted from a browser. Everything else is rejected fail-closed.
  function parseRepoSlug(value) {
    if (typeof value !== 'string') return null;
    let trimmed = value.trim().split(' ').filter((part) => part.length > 0).join(' ');
    if (!trimmed || trimmed.length > MAX_SLUG_LENGTH) return null;
    if (hasControlCharacter(trimmed)) return null;
    const lower = trimmed.toLowerCase();
    if (lower.indexOf('https://github.com/') === 0) {
      trimmed = trimmed.slice('https://github.com/'.length);
    } else if (lower.indexOf('http://github.com/') === 0 || lower.indexOf('http://') === 0 || lower.indexOf('https://') === 0) {
      return null;
    }
    trimmed = trimmed.split('?')[0].split('#')[0];
    while (trimmed.charAt(trimmed.length - 1) === '/') trimmed = trimmed.slice(0, -1);
    const parts = trimmed.split('/');
    if (parts.length !== 2) return null;
    const owner = parts[0];
    const repo = parts[1];
    if (!/^[A-Za-z0-9]$/.test(owner.charAt(0))) return null;
    if (!/^[A-Za-z0-9-]{1,39}$/.test(owner)) return null;
    if (repo.length < 1 || repo.length > 100) return null;
    if (!/^[A-Za-z0-9._-]+$/.test(repo)) return null;
    if (repo === '.' || repo === '..') return null;
    return { owner: owner, repo: repo, slug: owner + '/' + repo };
  }

  function buildReleasesUrl(slug) {
    const parsed = typeof slug === 'string' ? parseRepoSlug(slug) : slug;
    if (!parsed) throw new Error('Enter a repository as owner/repo, e.g. octocat/Hello-World.');
    return RELEASES_ENDPOINT + '/' + parsed.owner + '/' + parsed.repo + '/releases/latest';
  }

  function cleanText(value, maxChars) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, maxChars);
  }

  function parseRelease(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('The release response is malformed.');
    }
    const tag = cleanText(payload.tag_name, MAX_TAG_CHARS);
    if (!tag) throw new Error('The release response has no readable tag.');
    const url = cleanText(payload.html_url, MAX_URL_CHARS);
    if (!url || url.indexOf('https://github.com/') !== 0) {
      throw new Error('The release response has an unexpected link.');
    }
    const notes = cleanText(payload.body, MAX_BODY_CHARS);
    const publishedAt = cleanText(payload.published_at, 40);
    return {
      tag: tag,
      name: cleanText(payload.name, MAX_NAME_CHARS),
      url: url,
      prerelease: payload.prerelease === true,
      publishedAt: publishedAt,
      notes: notes,
      notesTruncated: typeof payload.body === 'string' && payload.body.trim().length > MAX_BODY_CHARS
    };
  }

  // Plain words for the failures a keyless GitHub call can hit. GitHub's
  // anonymous API quota is 60 requests per hour per address, so 403 is
  // expected sometimes and must be explained, not hidden.
  function classifyReleaseError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 403') !== -1) {
      return 'GitHub limited this request (the free anonymous quota is 60 checks per hour). Try again later.';
    }
    if (message.indexOf('HTTP 404') !== -1) {
      return 'No release found for that repository. Check the owner/repo spelling, or the repo has no releases.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'GitHub rejected the request (' + message + '). Check the repository name.';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'GitHub had a server problem (' + message + '). Try again in a moment.';
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
        reject(new Error('The release request timed out.'));
      }, duration);
    });
    const request = (async () => {
      const response = await fetchImpl(url, {
        signal: controller ? controller.signal : undefined,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        headers: { 'Accept': 'application/vnd.github+json' }
      });
      if (!response || !response.ok) throw new Error('HTTP ' + (response ? response.status : 'unknown'));
      if (!responseBodyApi || typeof responseBodyApi.readBoundedText !== 'function') {
        throw new Error('The bounded response reader is unavailable.');
      }
      const text = await responseBodyApi.readBoundedText(response, {
        maxBytes: MAX_JSON_BYTES,
        maxChars: MAX_JSON_CHARS,
        tooLargeMessage: 'The release response was too large to read safely.',
        malformedMessage: 'The release response was malformed.',
        streamRequiredMessage: 'This browser cannot read release responses with the required size limit.',
        timeoutMessage: 'The release request timed out.',
        controller: controller,
        isTimedOut: () => timedOut,
        onReader: (reader) => { activeReader = reader; }
      });
      if (timedOut) throw new Error('The release request timed out.');
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error('The release response was malformed.');
      }
    })();
    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timer !== null) root.clearTimeout(timer);
    }
  }

  async function fetchLatestRelease(slug, fetchImpl, options) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const opts = options || {};
    const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const parsed = parseRepoSlug(slug);
    if (!parsed) throw new Error('Enter a repository as owner/repo, e.g. octocat/Hello-World.');
    const payload = await fetchJson(buildReleasesUrl(parsed), fetchImpl, timeoutMs);
    const release = parseRelease(payload);
    return { version: 1, slug: parsed.slug, release: release, fetchedAt: now() };
  }

  const api = {
    parseRepoSlug,
    buildReleasesUrl,
    parseRelease,
    classifyReleaseError,
    fetchJson,
    fetchLatestRelease,
    MAX_SLUG_LENGTH,
    MAX_TAG_CHARS,
    MAX_NAME_CHARS,
    MAX_BODY_CHARS,
    MAX_JSON_BYTES,
    MAX_JSON_CHARS,
    DEFAULT_TIMEOUT_MS,
    RELEASES_ENDPOINT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkReleases = api;
})(globalThis);
