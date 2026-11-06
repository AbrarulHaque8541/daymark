/*
 * Daymark browser error taxonomy engine for the web prototype.
 *
 * Pure, dependency-free logic behind the browser's error screens: it maps a
 * raw failure (a Chromium-style error code, an HTTP status, an offline
 * flag) to one of a fixed set of plain-language error categories, each with
 * a calm explanation and concrete recovery steps. Technical detail is only
 * shown when it helps the user act; URLs are reduced to a bare origin
 * (credentials, paths, queries and fragments are stripped) so tokens or
 * other secrets embedded in a URL are never echoed back to the screen.
 *
 * Fail-closed policy: any unrecognized or malformed input classifies as the
 * generic "unknown" category instead of throwing, and the unknown copy
 * says honestly that the reason could not be determined. Classification is
 * fully local; no network access happens here. TLS certificate failures are
 * never presented as retryable-bypass situations: Daymark does not offer
 * to load a page past a broken certificate check.
 */
((root) => {
  'use strict';

  // A raw error code is uppercased and capped before any matching happens.
  const MAX_CODE_CHARS = 120;

  // Stable category ids, in the order the prototype card lists them.
  const TAXONOMY_IDS = [
    'offline',
    'dns-not-found',
    'timeout',
    'tls',
    'http-client-error',
    'http-server-error',
    'blocked-navigation',
    'download-failure',
    'unknown'
  ];

  const TAXONOMY = {
    'offline': {
      label: 'Offline',
      title: 'You are offline',
      summary: 'This page could not be loaded because this device currently has no working connection. Nothing was sent anywhere.',
      recoveries: [
        'Check Wi-Fi or mobile data, then try again.',
        'Cached pages and everything stored on this device keep working without a connection.'
      ],
      retryable: true,
      severity: 'info'
    },
    'dns-not-found': {
      label: 'Site not found (DNS)',
      title: 'Site not found',
      summary: 'The web address could not be matched to any site. This is usually a small typo, or the site no longer exists.',
      recoveries: [
        'Check the spelling of the address.',
        'Try searching for the site name instead of typing its address.',
        'If you typed the address by hand, try adding or removing "www".'
      ],
      retryable: false,
      severity: 'warn'
    },
    'timeout': {
      label: 'Page timed out',
      title: 'The page took too long',
      summary: 'The site was reached, but it did not finish responding in time. The connection was given up on; nothing half-loaded is kept.',
      recoveries: [
        'Try again in a little while — slow moments usually pass.',
        'If it keeps timing out, the site may be overloaded rather than anything being wrong on this device.'
      ],
      retryable: true,
      severity: 'warn'
    },
    'tls': {
      label: 'Connection not trusted (TLS)',
      title: 'Connection not trusted',
      summary: 'The site\u2019s security certificate could not be verified. Daymark does not load a page past this check, and nothing was sent to the site.',
      recoveries: [
        'Go back — this is the only safe choice here. Daymark never offers to continue past a broken certificate check.',
        'Check the date and time on this device; a wrong clock breaks certificate checks.',
        'If you expected this (for example a private or test network), verify the address with the site\u2019s operator before trusting it.'
      ],
      retryable: false,
      severity: 'danger'
    },
    'http-client-error': {
      label: 'Page not available (4xx)',
      title: 'Page not available',
      summary: 'The site answered, but it does not have this page for you. The failure is on the site\u2019s side, not on this device.',
      recoveries: [
        'Check the address for a typo, especially after a forward slash.',
        'Go to the site\u2019s home page and look for the page from there.',
        'If a link brought you here, tell the site or the sender that the link may be old.'
      ],
      retryable: false,
      severity: 'warn'
    },
    'http-server-error': {
      label: 'Site problem (5xx)',
      title: 'The site is having trouble',
      summary: 'The site answered with an internal error. The problem is on the site\u2019s side; this device and its data are fine.',
      recoveries: [
        'Try again in a few minutes — internal errors are often temporary.',
        'If the page still fails later, the site needs to fix it; nothing on this device can change that.'
      ],
      retryable: true,
      severity: 'warn'
    },
    'blocked-navigation': {
      label: 'Link blocked',
      title: 'Link blocked',
      summary: 'This link uses a scheme Daymark refuses to open, such as javascript: or file:. It was never opened, and no code ran.',
      recoveries: [
        'Go back to the page you came from.',
        'If you expected a real page, find its normal https address and use that instead.'
      ],
      retryable: false,
      severity: 'info'
    },
    'download-failure': {
      label: 'Download failed',
      title: 'Download did not finish',
      summary: 'The file could not be downloaded completely. A partial file is not kept, and files you downloaded earlier stay untouched.',
      recoveries: [
        'Check the connection and free storage space, then try again.',
        'Restart the download from the page\u2019s own download button rather than reloading the page.'
      ],
      retryable: true,
      severity: 'warn'
    },
    'unknown': {
      label: 'Unknown failure',
      title: 'Something went wrong',
      summary: 'The page did not load, and the exact reason could not be determined. Daymark shows only what it can verify, so technical details are withheld.',
      recoveries: [
        'Try again once.',
        'Check that the device has a working connection.',
        'If it repeats, closing and reopening the browser clears most stuck states.'
      ],
      retryable: true,
      severity: 'warn'
    }
  };

  // Error-code prefixes, in the order they are consulted. More specific
  // prefixes live before broader ones.
  const CODE_PREFIXES = [
    ['ERR_INTERNET_DISCONNECTED', 'offline'],
    ['ERR_NETWORK', 'offline'],
    ['ERR_NAME_NOT_RESOLVED', 'dns-not-found'],
    ['ERR_DNS', 'dns-not-found'],
    ['ERR_ADDRESS_UNREACHABLE', 'dns-not-found'],
    ['ERR_TIMED_OUT', 'timeout'],
    ['ERR_CONNECTION_TIMED_OUT', 'timeout'],
    ['ERR_CONNECTION_RESET', 'timeout'],
    ['ERR_CONNECTION_CLOSED', 'timeout'],
    ['ERR_CERT', 'tls'],
    ['ERR_SSL', 'tls'],
    ['ERR_BLOCKED', 'blocked-navigation'],
    ['ERR_UNSAFE', 'blocked-navigation'],
    ['ERR_DOWNLOAD', 'download-failure'],
    ['DOWNLOAD', 'download-failure']
  ];

  function sanitizeCode(raw) {
    if (typeof raw !== 'string') return '';
    // Control characters and whitespace never carry meaning in error codes.
    const cleaned = raw.toUpperCase().replace(/[\u0000-\u001f\u007f\s]/g, '');
    return cleaned.slice(0, MAX_CODE_CHARS);
  }

  function sanitizeHttpStatus(raw) {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw)) return null;
    if (raw < 100 || raw > 599) return null;
    return raw;
  }

  // Reduces a URL to a bare origin: scheme://host[:port], lowercased, with
  // credentials, path, query and fragment removed. Pure regex parsing, no
  // URL constructor. Returns null for anything that is not a parseable
  // http(s) URL — an unparsable URL is safer to omit than to echo.
  function safeOrigin(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    const text = raw.trim();
    if (!text || text.length > 2048) return null;
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

  // Infers the category from a code, an HTTP status and an offline flag.
  // Every input is optional; the offline flag wins, then the code, then
  // the HTTP status. Unrecognized inputs fall through to 'unknown'.
  function inferId(code, httpStatus, offline) {
    if (offline) return 'offline';
    const cleaned = sanitizeCode(code);
    if (cleaned) {
      for (let i = 0; i < CODE_PREFIXES.length; i += 1) {
        if (cleaned.startsWith(CODE_PREFIXES[i][0])) return CODE_PREFIXES[i][1];
      }
    }
    const status = sanitizeHttpStatus(httpStatus);
    if (status !== null) {
      if (status >= 500) return 'http-server-error';
      if (status >= 400) return 'http-client-error';
    }
    return 'unknown';
  }

  // Full explanation for a known category id. Fail-closed: any unknown or
  // malformed id explains as the honest 'unknown' category instead of
  // throwing, so an error screen can never be without guidance.
  function explainError(id) {
    const known = typeof id === 'string'
      && Object.prototype.hasOwnProperty.call(TAXONOMY, id)
      ? id
      : 'unknown';
    const entry = TAXONOMY[known];
    return {
      id: known,
      label: entry.label,
      title: entry.title,
      summary: entry.summary,
      recoveries: entry.recoveries.slice(),
      retryable: entry.retryable,
      severity: entry.severity
    };
  }

  // Main entry point: classifies a raw failure and returns its explanation
  // plus the sanitized origin and status when they were knowable. Never
  // throws; malformed input classifies as 'unknown'.
  function classifyBrowserError(raw) {
    let code = null;
    let httpStatus = null;
    let offline = false;
    let url = null;
    if (typeof raw === 'string') {
      code = raw;
    } else if (raw && typeof raw === 'object') {
      if (typeof raw.code === 'string') code = raw.code;
      if (raw.httpStatus !== undefined) httpStatus = raw.httpStatus;
      if (raw.offline === true) offline = true;
      if (typeof raw.url === 'string') url = raw.url;
    }
    const id = inferId(code, httpStatus, offline);
    const result = explainError(id);
    result.origin = safeOrigin(url);
    result.httpStatus = sanitizeHttpStatus(httpStatus);
    return result;
  }

  // Stable list for pickers and tests.
  function listScenarios() {
    return TAXONOMY_IDS.map((id) => ({ id, label: TAXONOMY[id].label }));
  }

  function isKnownErrorId(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(TAXONOMY, id);
  }

  const api = {
    classifyBrowserError,
    explainError,
    safeOrigin,
    listScenarios,
    isKnownErrorId,
    TAXONOMY_IDS,
    TAXONOMY,
    MAX_CODE_CHARS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkBrowserError = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
