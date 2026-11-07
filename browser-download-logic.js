/*
 * Daymark browser download safety engine for the web prototype.
 *
 * Pure, dependency-free logic behind the browser's download decisions: given
 * a download journey (a redirect chain, the final address, a
 * Content-Disposition header, a MIME type and an HTTP status) it plans, fully
 * locally, how Daymark treats that download: which filename is safe to save
 * under and where that name came from, whether the file type is known or must
 * ask before opening, whether the chain ever left the starting site, whether
 * retrying makes sense, and how duplicate taps are coalesced so one tap
 * saves one file.
 *
 * Fail-closed policy: nothing here ever guesses a "safe" answer. Filenames
 * are stripped of control characters, bidi/format spoofing characters, path
 * separators and quotes before use; a Content-Disposition value that cannot
 * be parsed is ignored rather than trusted; an unverifiable address in a
 * redirect chain marks the chain untrusted; unknown MIME types are never
 * presented as known; malformed input produces an honest "could not be
 * checked" plan instead of throwing. No network access happens here.
 */
((root) => {
  'use strict';

  const MAX_URL_CHARS = 2048;
  const MAX_HEADER_CHARS = 1024;
  const MAX_FILENAME_CHARS = 120;
  const MAX_RAW_FILENAME_CHARS = 512;
  const MAX_REDIRECT_HOPS = 12;
  const DUPLICATE_TAP_WINDOW_MS = 1500;

  // Stable scenario ids, in the order the prototype card lists them. Every
  // entry is a small sample journey the card can plan offline.
  const SCENARIO_IDS = [
    'same-origin-redirects',
    'cross-origin-redirect',
    'server-filename',
    'unknown-mime',
    'expired-link',
    'installable-app',
    'spoofed-filename'
  ];

  const SCENARIOS = {
    'same-origin-redirects': {
      label: 'Redirects, same site',
      input: {
        url: 'https://example.com/files/report.pdf',
        redirects: [
          'https://example.com/start',
          'https://example.com/step',
          'https://example.com/files/report.pdf'
        ],
        mimeType: 'application/pdf'
      }
    },
    'cross-origin-redirect': {
      label: 'Redirects to another site',
      input: {
        url: 'https://files.other.net/get/file.zip',
        redirects: [
          'https://example.com/dl',
          'https://cdn.example.com/track',
          'https://files.other.net/get/file.zip'
        ],
        mimeType: 'application/zip'
      }
    },
    'server-filename': {
      label: 'Server-chosen filename',
      input: {
        url: 'https://example.com/get?id=7',
        contentDisposition: 'attachment; filename="old-name.bin"; filename*=UTF-8\'\'quarterly%20r%C3%A9port.pdf',
        mimeType: 'application/pdf'
      }
    },
    'unknown-mime': {
      label: 'Unknown file type',
      input: {
        url: 'https://example.com/blob.dat',
        mimeType: 'application/octet-stream'
      }
    },
    'expired-link': {
      label: 'Expired link',
      input: {
        url: 'https://example.com/files/old.pdf',
        httpStatus: 410,
        mimeType: 'application/pdf'
      }
    },
    'installable-app': {
      label: 'Installable app file',
      input: {
        url: 'https://example.com/app.apk',
        contentDisposition: 'attachment; filename="update.apk"',
        mimeType: 'application/vnd.android.package-archive'
      }
    },
    'spoofed-filename': {
      label: 'Suspicious filename',
      input: {
        url: 'https://example.com/d/1',
        contentDisposition: 'attachment; filename="..\/..\/\u202Eevilexe.exe"',
        mimeType: 'application/octet-stream'
      }
    }
  };

  // Known MIME types Daymark opens without extra ceremony. Anything outside
  // this table (and outside image/audio/video) is "unknown" and must ask.
  // The APK entry is deliberately NOT "unknown": it is known, but it is an
  // installable app file, so it carries its own stronger caution.
  const MIME_TABLE = {
    'application/pdf': { label: 'PDF document', known: true, ext: 'pdf' },
    'text/plain': { label: 'Text file', known: true, ext: 'txt' },
    'text/csv': { label: 'CSV table', known: true, ext: 'csv' },
    'text/calendar': { label: 'Calendar file', known: true, ext: 'ics' },
    'application/json': { label: 'JSON data', known: true, ext: 'json' },
    'application/zip': { label: 'Zip archive', known: true, ext: 'zip' },
    'image/png': { label: 'PNG image', known: true, ext: 'png' },
    'image/jpeg': { label: 'JPEG image', known: true, ext: 'jpg' },
    'image/gif': { label: 'GIF image', known: true, ext: 'gif' },
    'image/webp': { label: 'WebP image', known: true, ext: 'webp' },
    'audio/mpeg': { label: 'MP3 audio', known: true, ext: 'mp3' },
    'video/mp4': { label: 'MP4 video', known: true, ext: 'mp4' },
    'application/vnd.android.package-archive': {
      label: 'Installable app file (APK)', known: true, ext: 'apk',
      caution: 'This is an installable app file. It is handed to you to review, never opened silently.'
    }
  };

  const MIME_TOKEN = /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/;

  // Reduces a URL to a bare origin (scheme://host[:port]) with credentials,
  // path, query and fragment stripped — the same rules as the error engine,
  // so tokens embedded in URLs are never echoed to the screen.
  function safeOrigin(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    const text = raw.trim();
    if (!text || text.length > MAX_URL_CHARS) return null;
    if (/[\u0000-\u001f\u007f]/.test(text)) return null;
    const match = /^(https?):\/\/([^\/?#]+)/i.exec(text);
    if (!match) return null;
    const scheme = match[1].toLowerCase();
    let authority = match[2];
    const at = authority.lastIndexOf('@');
    if (at !== -1) authority = authority.slice(at + 1);
    if (!authority) return null;
    let host;
    let portText = null;
    if (authority.startsWith('[')) {
      const close = authority.indexOf(']');
      if (close === -1) return null;
      host = authority.slice(0, close + 1).toLowerCase();
      const after = authority.slice(close + 1);
      if (after) {
        if (!after.startsWith(':')) return null;
        portText = after.slice(1);
      }
    } else {
      const colon = authority.indexOf(':');
      if (colon === -1) {
        host = authority.toLowerCase();
      } else {
        host = authority.slice(0, colon).toLowerCase();
        portText = authority.slice(colon + 1);
      }
    }
    if (!host) return null;
    if (host.startsWith('[')) {
      if (!/^\[[0-9a-f:.]+\]$/.test(host)) return null;
    } else if (!/^[0-9a-z.\-_]+$/.test(host)) {
      return null;
    }
    let port = null;
    if (portText !== null && portText !== '') {
      if (!/^\d{1,5}$/.test(portText)) return null;
      const value = Number(portText);
      if (value < 1 || value > 65535) return null;
      const defaultPort = scheme === 'https' ? 443 : 80;
      port = value === defaultPort ? null : value;
    }
    return scheme + '://' + host + (port === null ? '' : ':' + port);
  }

  // Strips everything a filename must never carry: control characters,
  // bidi/format spoofing characters (such as the U+202E override), path
  // separators, quotes, and leading dots. Returns null when nothing honest
  // remains — an unusable name is safer to drop than to guess at.
  function sanitizeFilename(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    if (raw.length > MAX_RAW_FILENAME_CHARS) return null;
    let name = raw
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/[\\\/]+/g, ' ')
      .replace(/"/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[\s.]+/, '')
      .trim();
    if (!name) return null;
    if (name.length > MAX_FILENAME_CHARS) {
      name = name.slice(0, MAX_FILENAME_CHARS).trim();
    }
    return name || null;
  }

  // Percent-decoding for RFC 5987 filename* values. Any malformed escape
  // fails closed to null; no partial guess is made.
  function percentDecode(text) {
    if (typeof text !== 'string' || !text) return null;
    if (/%(?![0-9A-Fa-f]{2})/.test(text)) return null;
    if (text.indexOf('%') === -1) return text;
    try {
      return decodeURIComponent(text);
    } catch (err) {
      return null;
    }
  }

  // Parses a Content-Disposition header the way a careful client should:
  // an RFC 5987 filename* (UTF-8 only) wins, then a quoted filename, then a
  // bare token filename. The result is reported together with a "changed"
  // flag when sanitization had to remove something, so the caller can tell
  // the user honestly. Returns null when the header carries no usable name.
  function parseDisposition(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    const header = raw.trim();
    if (!header || header.length > MAX_HEADER_CHARS) return null;
    const type = header.split(';', 1)[0].trim().toLowerCase();
    if (type !== 'attachment' && type !== 'inline') return null;

    const star = /filename\*\s*=\s*([^;]+)/i.exec(header);
    if (star) {
      const parts = /^([A-Za-z0-9-]+)'[^']*'(.*)$/.exec(star[1].trim());
      if (parts) {
        const charset = parts[1].toLowerCase();
        if (charset === 'utf-8' || charset === 'utf8') {
          const decoded = percentDecode(parts[2].trim());
          if (decoded !== null) {
            const safe = sanitizeFilename(decoded);
            if (safe) return { name: safe, changed: safe !== decoded };
          }
        }
      }
    }

    const quoted = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(header);
    if (quoted) {
      const inner = quoted[1].replace(/\\(.)/g, '$1');
      const safe = sanitizeFilename(inner);
      if (safe) return { name: safe, changed: safe !== inner };
    }

    const bare = /filename\s*=\s*([^;]+)/i.exec(header);
    if (bare) {
      const token = bare[1].trim();
      const safe = sanitizeFilename(token);
      if (safe) return { name: safe, changed: safe !== token };
    }
    return null;
  }

  function filenameFromDisposition(raw) {
    const parsed = parseDisposition(raw);
    return parsed ? parsed.name : null;
  }

  // Proposes a filename from the final URL's last path segment (query and
  // fragment removed). Only web URLs are consulted — anything that is not
  // an explicit http(s) address has no honest name to offer. Returns null
  // when there is no usable name.
  function filenameFromUrl(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    const text = raw.trim();
    if (!text || text.length > MAX_URL_CHARS) return null;
    if (!/^https?:\/\//i.test(text)) return null;
    const noFragment = text.split('#')[0];
    const path = noFragment.split('?')[0];
    const slash = path.lastIndexOf('/');
    const candidate = slash === -1 ? path : path.slice(slash + 1);
    if (!candidate) return null;
    const decoded = percentDecode(candidate);
    if (decoded === null) return null;
    return sanitizeFilename(decoded);
  }

  // Classifies a MIME type. Unknown or malformed input is reported as
  // unknown — never as known.
  function classifyMime(raw) {
    if (typeof raw !== 'string' || !raw || raw.length > 80 || !MIME_TOKEN.test(raw.trim())) {
      return { mime: null, label: 'Unknown file type', known: false, ext: null, caution: null };
    }
    const mime = raw.trim().toLowerCase();
    const entry = MIME_TABLE[mime];
    if (entry) {
      return { mime, label: entry.label, known: true, ext: entry.ext, caution: entry.caution || null };
    }
    // SVG images can carry scripts, so they are deliberately NOT treated
    // as known even though the image prefix would otherwise match.
    if (/^image\//.test(mime) && mime !== 'image/svg+xml') {
      return { mime, label: 'Image', known: true, ext: null, caution: null };
    }
    if (/^audio\//.test(mime)) {
      return { mime, label: 'Audio', known: true, ext: null, caution: null };
    }
    if (/^video\//.test(mime)) {
      return { mime, label: 'Video', known: true, ext: null, caution: null };
    }
    return { mime, label: 'Unknown file type', known: false, ext: null, caution: null };
  }

  // Retry advice from the final HTTP status. Expired and refused links are
  // never presented as "try again"; server trouble and busy sites are.
  function classifyRetry(rawStatus) {
    if (typeof rawStatus !== 'number' || !Number.isFinite(rawStatus) || !Number.isInteger(rawStatus)
      || rawStatus < 100 || rawStatus > 599) {
      return { retryable: true, reason: 'unknown', advice: 'If it fails, trying again once is safe.' };
    }
    if (rawStatus === 404 || rawStatus === 410) {
      return {
        retryable: false, reason: 'link-expired',
        advice: 'This link looks old or expired. Get a fresh link from the page instead of retrying.'
      };
    }
    if (rawStatus === 401 || rawStatus === 403) {
      return {
        retryable: false, reason: 'not-allowed',
        advice: 'The site refused this download; it may need a sign-in.'
      };
    }
    if (rawStatus === 429) {
      return {
        retryable: true, reason: 'busy',
        advice: 'The site is busy. Wait a moment, then try again.'
      };
    }
    if (rawStatus >= 500) {
      return {
        retryable: true, reason: 'site-trouble',
        advice: 'The site had trouble serving the file. Trying again in a few minutes usually works.'
      };
    }
    return { retryable: true, reason: 'fine', advice: 'If it fails, trying again once is safe.' };
  }

  // Analyzes a redirect chain: how many hops could be verified, which
  // origins they touched, and whether the chain ever left the starting
  // site. Entries that are not strings, do not parse as web URLs, or fall
  // beyond the hop cap are counted as unverifiable and make the chain
  // untrusted (fail closed).
  function analyzeRedirects(rawRedirects) {
    if (!Array.isArray(rawRedirects)) {
      return { count: 0, invalid: 0, crossOrigin: false, origins: [], untrusted: false };
    }
    const origins = [];
    let validHops = 0;
    let invalid = 0;
    for (let i = 0; i < rawRedirects.length; i += 1) {
      if (validHops >= MAX_REDIRECT_HOPS) { invalid += 1; continue; }
      const entry = rawRedirects[i];
      if (typeof entry !== 'string') { invalid += 1; continue; }
      const origin = safeOrigin(entry);
      if (!origin) { invalid += 1; continue; }
      validHops += 1;
      if (origins.indexOf(origin) === -1) origins.push(origin);
    }
    const crossOrigin = origins.length > 1;
    return {
      count: validHops,
      invalid,
      crossOrigin,
      origins,
      untrusted: invalid > 0
    };
  }

  const SOURCE_LABELS = {
    disposition: 'chosen by the site',
    url: 'from the link',
    mime: 'a safe default for this file type',
    default: 'a safe default'
  };

  // Duplicate-tap coalescing: a second tap for the same key inside the
  // window is ignored, so one tap saves one file. Unverifiable keys or an
  // unusable state fail closed to "ignore" — never to a second download.
  function coalesceTaps(state, key, nowMs) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return { action: 'ignore', reason: 'unverifiable' };
    }
    if (typeof key !== 'string' || !key || key.length > MAX_URL_CHARS) {
      return { action: 'ignore', reason: 'unverifiable' };
    }
    const now = (typeof nowMs === 'number' && Number.isFinite(nowMs)) ? nowMs : 0;
    const last = state[key];
    if (typeof last === 'number' && Number.isFinite(last)
      && now - last >= 0 && now - last < DUPLICATE_TAP_WINDOW_MS) {
      return { action: 'ignore', reason: 'duplicate' };
    }
    state[key] = now;
    return { action: 'start', reason: 'new' };
  }

  // Main entry point: builds the full, honest plan for a download journey.
  // Never throws; anything malformed plans as "could not be checked".
  function planDownload(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {
        ok: false,
        filename: null,
        summary: 'This download could not be checked, so nothing is started.',
        lines: [],
        notices: [],
        retryable: false
      };
    }
    const url = typeof raw.url === 'string' ? raw.url : '';
    const origin = safeOrigin(url);
    const disposition = parseDisposition(typeof raw.contentDisposition === 'string' ? raw.contentDisposition : '');
    const urlName = filenameFromUrl(url);
    const mimeInfo = classifyMime(raw.mimeType);
    const retry = classifyRetry(raw.httpStatus);
    const redirects = analyzeRedirects(raw.redirects);

    let name;
    let source;
    let nameChanged = false;
    if (disposition) {
      name = disposition.name;
      source = 'disposition';
      nameChanged = disposition.changed;
    } else if (urlName) {
      name = urlName;
      source = 'url';
    } else if (mimeInfo.ext) {
      name = 'download.' + mimeInfo.ext;
      source = 'mime';
    } else {
      name = 'download';
      source = 'default';
    }

    const notices = [];
    if (redirects.untrusted) {
      notices.push('Part of the redirect chain could not be verified, so the whole chain is treated as untrusted.');
    }
    if (redirects.crossOrigin) {
      const first = redirects.origins[0];
      const last = redirects.origins[redirects.origins.length - 1];
      notices.push('The file arrives from ' + last + ' after leaving ' + first + '.');
    }
    if (nameChanged) {
      notices.push('The server-suggested filename contained unsafe characters; they were removed.');
    }
    if (!mimeInfo.known) {
      notices.push('The file type is unknown, so it is opened only after you agree.');
    }
    if (mimeInfo.caution) {
      notices.push(mimeInfo.caution);
    }

    let redirectsLine;
    if (redirects.count === 0) {
      redirectsLine = 'Redirects: direct download, no redirects.';
    } else if (redirects.crossOrigin) {
      redirectsLine = 'Redirects: ' + redirects.count + ' stops across '
        + redirects.origins.length + ' site(s), ending at ' + redirects.origins[redirects.origins.length - 1] + '.';
    } else {
      redirectsLine = 'Redirects: ' + redirects.count + ' stop(s), all within ' + redirects.origins[0] + '.';
    }

    const lines = [
      'Filename: ' + name + ' (' + SOURCE_LABELS[source] + ').',
      'Type: ' + mimeInfo.label + '.',
      redirectsLine,
      'Retry: ' + retry.advice,
      'Duplicate taps: a second tap within 1.5 seconds is ignored, so one file is saved, not many.'
    ];

    const summary = notices.length > 0
      ? notices[0]
      : 'Nothing suspicious was found. Check the details before saving.';

    return {
      ok: true,
      filename: name,
      filenameSource: source,
      origin,
      type: mimeInfo,
      redirects: { count: redirects.count, crossOrigin: redirects.crossOrigin, origins: redirects.origins.slice() },
      retryable: retry.retryable,
      summary,
      lines,
      notices
    };
  }

  // Plans one of the fixed sample journeys; unknown ids plan as "could not
  // be checked" instead of guessing.
  function planScenario(id) {
    const known = typeof id === 'string'
      && Object.prototype.hasOwnProperty.call(SCENARIOS, id)
      ? id
      : null;
    if (!known) {
      return {
        ok: false,
        filename: null,
        summary: 'This download journey is not known, so nothing is planned.',
        lines: [],
        notices: [],
        retryable: false
      };
    }
    return planDownload(SCENARIOS[known].input);
  }

  function listScenarios() {
    return SCENARIO_IDS.map((id) => ({ id, label: SCENARIOS[id].label }));
  }

  function isKnownScenarioId(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(SCENARIOS, id);
  }

  const api = {
    planDownload,
    planScenario,
    listScenarios,
    isKnownScenarioId,
    coalesceTaps,
    safeOrigin,
    sanitizeFilename,
    percentDecode,
    filenameFromDisposition,
    filenameFromUrl,
    classifyMime,
    classifyRetry,
    analyzeRedirects,
    SCENARIO_IDS,
    DUPLICATE_TAP_WINDOW_MS,
    MAX_REDIRECT_HOPS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkBrowserDownload = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
