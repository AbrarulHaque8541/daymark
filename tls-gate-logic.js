/*
 * Daymark TLS gate engine for the web prototype.
 *
 * Pure, dependency-free logic behind two P0 browser guarantees from the
 * browser UX checklist (issue #348):
 *
 * 1. Strict TLS certificate failure handling: a certificate failure is
 *    explained in plain words, is never presented as bypassable, and the
 *    page is never loaded past the broken check. The engine maps a
 *    Chromium-style certificate error code to one of a fixed set of
 *    certificate-failure categories, each with a calm explanation and
 *    concrete recovery steps.
 *
 * 2. The fresh-install Offline / explicit Online consent gate: until the
 *    user makes an explicit choice, the prototype plans no network access
 *    at all. The engine models the three consent states (undecided,
 *    offline, online), what each state allows and blocks, and which
 *    transitions between states are valid. Fail-closed: an unknown state
 *    is treated as undecided, never as online.
 *
 * Classification is fully local; no network access happens here. URLs are
 * reduced to a bare origin (credentials, paths, queries and fragments are
 * stripped) so tokens or other secrets embedded in a URL are never echoed
 * back to the screen.
 */
((root) => {
  'use strict';

  // A raw error code is uppercased, stripped of control characters and
  // whitespace, and capped before any matching happens.
  const MAX_CODE_CHARS = 120;

  // Stable certificate-failure category ids, in the order the card lists them.
  const TLS_FAILURE_IDS = [
    'cert-date-invalid',
    'cert-authority-invalid',
    'cert-name-mismatch',
    'cert-revoked',
    'cert-protocol',
    'cert-generic'
  ];

  const TLS_FAILURES = {
    'cert-date-invalid': {
      label: 'Certificate date invalid',
      title: 'Certificate not valid yet or expired',
      summary: 'The site\u2019s security certificate is being used outside its valid dates, most often because the certificate expired or this device\u2019s clock is wrong. Daymark does not load the page past this check, and nothing was sent to the site.',
      recoveries: [
        'Go back \u2014 Daymark never offers to continue past a broken certificate check.',
        'Check the date and time on this device; a wrong clock breaks certificate checks.',
        'If the clock is right, the site\u2019s operator needs to renew the certificate.'
      ],
      severity: 'danger'
    },
    'cert-authority-invalid': {
      label: 'Certificate authority invalid',
      title: 'Certificate from an unknown source',
      summary: 'The site\u2019s certificate was not issued by an authority this device knows, so the connection cannot be proven genuine. Daymark does not load the page past this check, and nothing was sent to the site.',
      recoveries: [
        'Go back \u2014 this is the only safe choice here.',
        'If you expected this (a private or test network), verify the address with the site\u2019s operator before trusting it.',
        'Do not re-enter the address expecting a different result; the check is deliberate.'
      ],
      severity: 'danger'
    },
    'cert-name-mismatch': {
      label: 'Certificate name mismatch',
      title: 'Certificate is for a different name',
      summary: 'The certificate was issued for a different web address than the one you visited, which is a classic sign of a misconfigured or hostile endpoint. Daymark does not load the page past this check.',
      recoveries: [
        'Go back and check the address for a typo, especially look-alike characters.',
        'If the address is correct, the site\u2019s operator must fix the certificate.',
        'Never proceed from here to the same site with credentials or personal data.'
      ],
      severity: 'danger'
    },
    'cert-revoked': {
      label: 'Certificate revoked',
      title: 'Certificate has been revoked',
      summary: 'The certificate\u2019s issuer has withdrawn it before its expiry, usually because it was compromised. Daymark does not load the page past this check.',
      recoveries: [
        'Go back \u2014 a revoked certificate does not become valid again by retrying.',
        'Reach the site through its official app or a channel you already trust.',
        'Wait for the site\u2019s operator to issue a replacement certificate.'
      ],
      severity: 'danger'
    },
    'cert-protocol': {
      label: 'TLS protocol error',
      title: 'Secure connection could not be negotiated',
      summary: 'This device and the site could not agree on a secure connection protocol, so the connection was abandoned before any page data moved. Daymark does not weaken its protocol requirements to force the page to load.',
      recoveries: [
        'Go back and try again later; a site mid-upgrade can cause this.',
        'If it repeats, the site is running TLS Daymark will not negotiate.',
        'Check that a proxy or filtering tool on this network is not intercepting connections.'
      ],
      severity: 'danger'
    },
    'cert-generic': {
      label: 'Certificate problem',
      title: 'Connection not trusted',
      summary: 'The site\u2019s security certificate could not be verified, and the exact reason could not be determined. Daymark does not load a page past this check, and nothing was sent to the site.',
      recoveries: [
        'Go back \u2014 this is the only safe choice here. Daymark never offers to continue past a broken certificate check.',
        'Check the date and time on this device; a wrong clock breaks certificate checks.',
        'If you expected this (for example a private or test network), verify the address with the site\u2019s operator before trusting it.'
      ],
      severity: 'danger'
    }
  };

  // Error-code prefixes, in the order they are consulted. More specific
  // prefixes live before broader ones.
  const TLS_CODE_PREFIXES = [
    ['ERR_CERT_DATE_INVALID', 'cert-date-invalid'],
    ['ERR_CERT_AUTHORITY_INVALID', 'cert-authority-invalid'],
    ['ERR_CERT_COMMON_NAME_INVALID', 'cert-name-mismatch'],
    ['ERR_CERT_WEAK_SIGNATURE_ALGORITHM', 'cert-authority-invalid'],
    ['ERR_CERT_REVOKED', 'cert-revoked'],
    ['ERR_SSL_PROTOCOL_ERROR', 'cert-protocol'],
    ['ERR_CERT', 'cert-generic'],
    ['ERR_SSL', 'cert-generic']
  ];

  // Fresh-install consent states. 'undecided' is the fail-closed default.
  const CONSENT_STATES = ['undecided', 'offline', 'online'];

  const CONSENT_GATE = {
    'undecided': {
      label: 'No choice made yet',
      title: 'Daymark will not use the network yet',
      summary: 'On a fresh install nothing has been chosen. Until you explicitly pick Offline or Online, the prototype plans no network access at all \u2014 no prefetch, no telemetry, no background fetch of any kind.',
      allowed: [
        'Everything stored on this device: tasks, Focus sessions, exports and imports.',
        'All offline planner cards, which compute locally and fetch nothing.'
      ],
      blocked: [
        'Any page load, feed refresh or API call \u2014 nothing is sent anywhere.'
      ],
      networkNote: 'No network access is planned in this state.'
    },
    'offline': {
      label: 'Offline',
      title: 'Offline mode, by your choice',
      summary: 'You chose Offline. The prototype stays fully usable with everything already on this device, and it will not send anything over the network. Switching to Online later is always an explicit action.',
      allowed: [
        'Everything stored on this device, exactly as in the undecided state.',
        'Cached pages and data already downloaded while Online.'
      ],
      blocked: [
        'Every network request, including retries of pages that failed earlier.'
      ],
      networkNote: 'No network access is planned in this state.'
    },
    'online': {
      label: 'Online (explicit consent)',
      title: 'Online mode, because you chose it',
      summary: 'You explicitly consented to network use. Pages load, feeds and glance cards fetch directly from their services, and HTTP pages are labelled \u201cNot encrypted\u201d. Consent is per choice, not a blanket permission: the updater and other app-level clients stay HTTPS-only regardless.',
      allowed: [
        'Page loads, feed refreshes and keyless card fetches you trigger.',
        'Cached data written locally so later Offline sessions still work.'
      ],
      blocked: [
        'Loading a page past a failed certificate check \u2014 consent never overrides TLS.',
        'Updater and other app-level clients keep HTTPS-only transport.'
      ],
      networkNote: 'Network access only for actions you trigger; nothing loads past a broken certificate check.'
    }
  };

  function sanitizeCode(raw) {
    if (typeof raw !== 'string') return '';
    const cleaned = raw.toUpperCase().replace(/[\u0000-\u001f\u007f\s]/g, '');
    return cleaned.slice(0, MAX_CODE_CHARS);
  }

  // Reduces a URL to a bare origin: scheme://host[:port], lowercased, with
  // credentials, path, query and fragment removed. Pure regex parsing, no
  // URL constructor. Returns null for anything that is not a parseable
  // http(s) URL \u2014 an unparsable URL is safer to omit than to echo.
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

  // Maps a raw certificate error code to a category id. Returns null when
  // the code is not a certificate failure at all \u2014 the caller decides how
  // to present that (this engine only explains certificate failures).
  function classifyTlsCode(raw) {
    const cleaned = sanitizeCode(raw);
    if (!cleaned) return null;
    for (let i = 0; i < TLS_CODE_PREFIXES.length; i += 1) {
      if (cleaned.startsWith(TLS_CODE_PREFIXES[i][0])) return TLS_CODE_PREFIXES[i][1];
    }
    return null;
  }

  // Full explanation for a known certificate-failure id. Fail-closed: any
  // unknown or malformed input explains as the honest cert-generic category
  // instead of throwing or inventing detail. Every entry is non-bypassable.
  function explainTlsFailure(raw) {
    const known = classifyTlsCode(raw) || 'cert-generic';
    const entry = TLS_FAILURES[known];
    return {
      id: known,
      label: entry.label,
      title: entry.title,
      summary: entry.summary,
      recoveries: entry.recoveries.slice(),
      severity: entry.severity,
      bypassable: false
    };
  }

  // Consent-gate plan for a state. Fail-closed: an unknown state is planned
  // as undecided, never as online.
  function normalizeConsentState(state) {
    return typeof state === 'string'
      && Object.prototype.hasOwnProperty.call(CONSENT_GATE, state)
      ? state
      : 'undecided';
  }

  function planConsentGate(state) {
    const known = normalizeConsentState(state);
    const entry = CONSENT_GATE[known];
    return {
      state: known,
      label: entry.label,
      title: entry.title,
      summary: entry.summary,
      allowed: entry.allowed.slice(),
      blocked: entry.blocked.slice(),
      networkNote: entry.networkNote
    };
  }

  // Valid transitions. Only the three known states are valid targets, and
  // the target is validated as given (fail-closed): an unknown or malformed
  // target state is never silently normalized into a reachable state.
  function canTransition(fromState, toState) {
    normalizeConsentState(fromState);
    return CONSENT_STATES.indexOf(toState) !== -1;
  }

  // Combined journey plan: explain a TLS failure and the current consent
  // state together, with a sanitized origin. Never throws; malformed input
  // degrades to the honest generic categories.
  function planTlsJourney(raw) {
    let code = null;
    let url = null;
    let consentState = null;
    if (typeof raw === 'string') {
      code = raw;
    } else if (raw && typeof raw === 'object') {
      if (typeof raw.code === 'string') code = raw.code;
      if (typeof raw.url === 'string') url = raw.url;
      if (raw.consentState !== undefined) consentState = raw.consentState;
    }
    const tls = explainTlsFailure(code);
    const gate = planConsentGate(consentState);
    return {
      tls,
      gate,
      origin: safeOrigin(url),
      bypassable: false
    };
  }

  // Stable lists for pickers and tests.
  function listTlsScenarios() {
    return TLS_FAILURE_IDS.map((id) => ({ id, label: TLS_FAILURES[id].label }));
  }

  function listConsentStates() {
    return CONSENT_STATES.map((state) => ({ state, label: CONSENT_GATE[state].label }));
  }

  function isKnownTlsId(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(TLS_FAILURES, id);
  }

  const api = {
    classifyTlsCode,
    explainTlsFailure,
    planConsentGate,
    canTransition,
    planTlsJourney,
    safeOrigin,
    listTlsScenarios,
    listConsentStates,
    isKnownTlsId,
    TLS_FAILURE_IDS,
    TLS_FAILURES,
    CONSENT_STATES,
    CONSENT_GATE,
    MAX_CODE_CHARS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkTlsGate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
