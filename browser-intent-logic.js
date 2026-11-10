/*
 * Daymark app-link and intent handoff planner for the web prototype.
 *
 * Pure, dependency-free logic behind the "App links, planned safely"
 * card. It classifies a pasted link the way the Daymark address bar
 * does (mirroring browser-address-logic.js and the Android
 * BrowserExternalLinkPolicy / BrowserIntentLinkPolicy source guards)
 * and explains, in plain words, what would happen if the user followed
 * it: a normal web navigation, a user-triggered handoff to another app
 * (mailto/tel/sms), a Telegram deep link, an Android intent:// URI with
 * its package, fallback URL and chooser behavior, a blocked scheme, or
 * an honest refusal for anything this prototype cannot prove.
 *
 * Fail-closed policy: malformed or unknown input never produces a
 * "safe to open" verdict; it produces an explicit explanation of why
 * nothing was planned. Nothing here opens anything, touches the
 * network, or reads storage. Credentials embedded in a link are
 * detected and disclosed, never echoed back.
 */
((root) => {
  'use strict';

  const MAX_INPUT_CHARS = 2048;
  const MAX_ECHO_CHARS = 160;

  const WEB_SCHEMES = ['http', 'https'];
  const EXTERNAL_SCHEMES = ['mailto', 'tel', 'sms'];
  const TELEGRAM_SCHEME = 'tg';
  const INTENT_SCHEME = 'intent';
  // Schemes that must never be treated as navigation or handoff targets.
  const BLOCKED_SCHEMES = [
    'javascript', 'data', 'vbscript', 'file', 'blob', 'about', 'chrome',
    'chrome-extension', 'market', 'view-source', 'ws', 'wss', 'ftp', 'ftps',
    'gopher', 'content'
  ];

  // --- character helpers (code-point based, locale independent) ---------

  function isWhitespaceChar(ch) {
    const c = ch.charCodeAt(0);
    return c === 32 || (c >= 9 && c <= 13);
  }

  function containsWhitespace(text) {
    for (let i = 0; i < text.length; i += 1) {
      if (isWhitespaceChar(text[i])) return true;
    }
    return false;
  }

  function hasControlChar(text) {
    for (let i = 0; i < text.length; i += 1) {
      const c = text.charCodeAt(i);
      if (c <= 31 || c === 127) return true;
    }
    return false;
  }

  function startsWithWebScheme(text) {
    const head = String(text).slice(0, 8).toLowerCase();
    return head.indexOf('http://') === 0 || head.indexOf('https://') === 0;
  }

  function truncateForEcho(text) {
    const value = String(text);
    if (value.length <= MAX_ECHO_CHARS) return value;
    return value.slice(0, MAX_ECHO_CHARS) + '... (truncated)';
  }

  function schemeOf(raw) {
    const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/.exec(raw);
    return match ? { scheme: match[1].toLowerCase(), rest: match[2] } : null;
  }

  // --- Android intent:// URI parsing (fail-closed) -----------------------

  const INTENT_METADATA_KEYS = [
    'scheme', 'package', 'action', 'category', 'S.browser_fallback_url'
  ];
  const INTENT_BLOCKED_SCHEMES = [
    'intent', 'javascript', 'vbscript', 'file', 'content', 'data', 'blob', 'about'
  ];
  const INTENT_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]{0,63}$/;
  const INTENT_PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;

  function decodeIntentMetadata(value) {
    // decodeURIComponent preserves literal '+'; Android's URLDecoder adapter
    // explicitly protects '+' for the same percent-encoding contract.
    return decodeURIComponent(value);
  }

  function isValidIntentHost(host) {
    if (!host || /[^\x00-\x7f]/.test(host)) return false;
    if (host.startsWith('[') && host.endsWith(']')) {
      const addressApi = root.DaymarkBrowserAddress;
      return !!(addressApi && typeof addressApi.isValidIpv6Literal === 'function'
        && addressApi.isValidIpv6Literal(host.slice(1, -1)));
    }
    if (host.indexOf('[') !== -1 || host.indexOf(']') !== -1
        || host.indexOf(':') !== -1 || host.indexOf('%') !== -1) return false;
    const value = host.endsWith('.') ? host.slice(0, -1) : host;
    if (!value || value.length > 253) return false;
    const labels = value.split('.');
    if (labels.some((label) => !label || label.length > 63
        || !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label))) return false;
    if (labels.length > 1 && !/^[A-Za-z]/.test(labels[labels.length - 1])) {
      // java.net.URI accepts canonical four-octet decimal IPv4 (including
      // leading zeroes) but rejects shortened, integer and numeric-TLD hosts.
      return labels.length === 4 && labels.every((label) => {
        if (!/^\d{1,3}$/.test(label)) return false;
        return Number(label) <= 255;
      });
    }
    return true;
  }

  function parseIntentAuthority(base) {
    const rest = base.slice('intent://'.length);
    const boundary = rest.search(/[/?#]/);
    const authority = boundary === -1 ? rest : rest.slice(0, boundary);
    if (!authority || authority.indexOf('@') !== -1 || /[\s\\]/.test(authority)) return null;

    let host;
    let portText = null;
    if (authority.startsWith('[')) {
      const close = authority.indexOf(']');
      if (close < 0) return null;
      host = authority.slice(0, close + 1);
      const suffix = authority.slice(close + 1);
      if (suffix !== '') {
        if (!suffix.startsWith(':') || suffix.length === 1) return null;
        portText = suffix.slice(1);
      }
    } else {
      const colon = authority.lastIndexOf(':');
      if (colon >= 0) {
        if (authority.indexOf(':') !== colon) return null;
        host = authority.slice(0, colon);
        portText = authority.slice(colon + 1);
      } else {
        host = authority;
      }
    }

    if (!isValidIntentHost(host)) return null;
    let port = null;
    if (portText !== null) {
      if (!/^\d{1,5}$/.test(portText)) return null;
      port = Number(portText);
      if (port < 1 || port > 65535) return null;
    }
    return { host, port };
  }

  function parseIntentBase(base) {
    if (!base.startsWith('intent://') || base.indexOf('#') !== -1
        || /[\s\\<>"{}|^\x60]/.test(base)
        || /%(?![0-9A-Fa-f]{2})/.test(base)) return null;
    const authority = parseIntentAuthority(base);
    if (!authority) return null;
    try {
      const parsed = new URL(base);
      if (parsed.protocol !== 'intent:' || !parsed.hostname
          || parsed.username || parsed.password || parsed.hash) return null;
      if (parsed.hostname.toLowerCase() !== authority.host.toLowerCase()) return null;
      if ((parsed.port === '' ? null : Number(parsed.port)) !== authority.port) return null;
    } catch (error) {
      return null;
    }
    return authority;
  }

  function endsInWhatwgIpv4Number(label) {
    return /^[0-9]+$/.test(label)
      || /^0[xX][0-9a-fA-F]*$/.test(label)
      || (label.length > 1 && label[0] === '0' && /^[0-7]+$/.test(label.slice(1)));
  }

  function isCanonicalWebIpv4(host) {
    const parts = host.split('.');
    if (parts.length !== 4) return false;
    return parts.every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
  }

  function normalizeIntentWebHost(rawHost) {
    const addressApi = root.DaymarkBrowserAddress;
    let host = rawHost;
    if (/[^\x00-\x7f]/.test(host)) {
      if (!addressApi || typeof addressApi.normalizeHost !== 'function') return null;
      const trailingDot = host.endsWith('.');
      const candidate = trailingDot ? host.slice(0, -1) : host;
      const singleLabel = candidate.indexOf('.') === -1;
      const normalized = addressApi.normalizeHost(singleLabel ? candidate + '.daymark.invalid' : candidate);
      if (!normalized) return null;
      host = singleLabel
        ? normalized.host.replace(/\.daymark\.invalid$/, '')
        : normalized.host;
      if (trailingDot) host += '.';
    }
    if (!isValidIntentHost(host)) return null;
    const withoutTrailingDot = host.endsWith('.') ? host.slice(0, -1) : host;
    const labels = withoutTrailingDot.split('.');
    const last = labels[labels.length - 1];
    if (endsInWhatwgIpv4Number(last) && !isCanonicalWebIpv4(withoutTrailingDot)) return null;
    return host;
  }

  function validateIntentWebUrl(value) {
    const input = String(value == null ? '' : value);
    if (!input || input.length > MAX_INPUT_CHARS + 8
        || /[\u0000-\u0020\u007f\\<>"{}|^\x60]/.test(input)
        || /%(?![0-9A-Fa-f]{2})/.test(input)) return null;
    const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/(.*)$/.exec(input);
    if (!match) return null;
    const scheme = match[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') return null;
    const rest = match[2];
    const boundary = rest.search(/[/?#]/);
    const authority = boundary === -1 ? rest : rest.slice(0, boundary);
    if (!authority || authority.indexOf('@') !== -1) return null;

    let rawHost;
    let portText = null;
    if (authority.startsWith('[')) {
      const close = authority.indexOf(']');
      if (close < 0) return null;
      rawHost = authority.slice(0, close + 1);
      const suffix = authority.slice(close + 1);
      if (suffix !== '') {
        if (!suffix.startsWith(':') || suffix.length === 1) return null;
        portText = suffix.slice(1);
      }
    } else {
      const colon = authority.lastIndexOf(':');
      if (colon >= 0) {
        if (authority.indexOf(':') !== colon) return null;
        rawHost = authority.slice(0, colon);
        portText = authority.slice(colon + 1);
      } else {
        rawHost = authority;
      }
    }

    const host = normalizeIntentWebHost(rawHost);
    if (!host) return null;
    if (portText !== null) {
      if (!/^\d{1,5}$/.test(portText)) return null;
      const port = Number(portText);
      if (port < 1 || port > 65535) return null;
    }

    let parsed;
    try {
      parsed = new URL(input);
    } catch (error) {
      return null;
    }
    if (parsed.protocol !== scheme + ':' || !parsed.hostname
        || parsed.username || parsed.password) return null;
    if (parsed.hostname.toLowerCase() !== host.toLowerCase()) return null;
    const parsedPort = parsed.port === '' ? null : Number(parsed.port);
    if (parsedPort !== null && parsedPort !== Number(portText)) return null;
    if (parsedPort === null && portText !== null
        && Number(portText) !== (scheme === 'https' ? 443 : 80)) return null;

    // java.net.URI.normalize() removes dot segments but preserves an absent
    // path and an explicitly supplied default port; reconstruct both details
    // instead of relying on WHATWG URL.href's default-port elision.
    const suffix = rest.slice(authority.length);
    const path = suffix.startsWith('/') ? parsed.pathname : '';
    return scheme + '://' + host + (portText === null ? '' : ':' + portText)
      + path + parsed.search + parsed.hash;
  }

  function parseIntentUri(raw) {
    const fail = (reason) => ({ ok: false, reason });
    const input = String(raw == null ? '' : raw);
    if (input.length > MAX_INPUT_CHARS) {
      return fail('the intent URI exceeds the 2048 character limit');
    }
    if (!input.startsWith('intent://')) {
      return fail('an intent URI must start with intent://');
    }
    if (hasControlChar(input) || containsWhitespace(input)) {
      return fail('the intent URI contains whitespace or control characters');
    }

    const marker = '#Intent;';
    const hashIndex = input.indexOf(marker);
    if (hashIndex === -1) {
      return fail('an intent URI needs a #Intent; parameter section');
    }
    if (input.slice(-4) !== ';end' || input.indexOf('#', hashIndex + 1) !== -1) {
      return fail('the intent parameter section must end with ;end and contain no fragment');
    }

    const base = input.slice(0, hashIndex);
    const baseAuthority = parseIntentBase(base);
    if (!baseAuthority) return fail('the intent base address is invalid');
    const body = input.slice(hashIndex + marker.length, -4);
    const fields = body === '' ? [] : body.split(';');
    const values = Object.create(null);

    for (const field of fields) {
      if (!field) return fail('the intent metadata contains an empty field');
      const equals = field.indexOf('=');
      if (equals <= 0) return fail('the intent metadata contains an unsupported flag or field');
      const key = field.slice(0, equals);
      if (INTENT_METADATA_KEYS.indexOf(key) === -1) {
        return fail('the intent metadata requests an unsupported capability');
      }
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        return fail('the intent metadata contains duplicate fields');
      }
      try {
        values[key] = decodeIntentMetadata(field.slice(equals + 1));
      } catch (error) {
        return fail('the intent metadata encoding is invalid');
      }
    }

    let scheme = values.scheme;
    if (typeof scheme !== 'string' || !INTENT_SCHEME_PATTERN.test(scheme)) {
      return fail('the intent URI has no valid target scheme');
    }
    scheme = scheme.toLowerCase();
    if (INTENT_BLOCKED_SCHEMES.indexOf(scheme) !== -1) {
      return fail('the intent target scheme is blocked');
    }

    const action = values.action == null ? null : values.action;
    if (action !== null && action !== 'android.intent.action.VIEW') {
      return fail('only ordinary VIEW actions are supported');
    }
    const category = values.category == null ? null : values.category;
    if (category !== null && category !== 'android.intent.category.BROWSABLE') {
      return fail('only the BROWSABLE category is supported');
    }

    const packageName = values.package == null ? null : values.package;
    if (packageName !== null && !INTENT_PACKAGE_PATTERN.test(packageName)) {
      return fail('the intent package name is invalid');
    }

    const target = scheme + ':' + base.slice('intent:'.length);
    let targetUri;
    try {
      const parsedTarget = new URL(target);
      if (parsedTarget.protocol !== scheme + ':' || !parsedTarget.hostname
          || parsedTarget.username || parsedTarget.password || parsedTarget.hash) {
        return fail('the intent target URI is invalid');
      }
      targetUri = target;
    } catch (error) {
      return fail('the intent target URI is invalid');
    }
    if (scheme === 'http' || scheme === 'https') {
      targetUri = validateIntentWebUrl(target);
      if (!targetUri) return fail('the HTTP or HTTPS intent target is not a valid Daymark web address');
    }

    let fallbackUrl = null;
    if (Object.prototype.hasOwnProperty.call(values, 'S.browser_fallback_url')) {
      fallbackUrl = validateIntentWebUrl(values['S.browser_fallback_url']);
      if (!fallbackUrl) {
        return fail('the browser fallback must be a valid HTTP or HTTPS address without credentials');
      }
    }

    return {
      ok: true,
      host: baseAuthority.host,
      scheme,
      packageName,
      action,
      category,
      targetUri,
      fallbackUrl,
      fallbackHonored: fallbackUrl !== null,
      extraKeys: []
    };
  }

  // --- link classification ----------------------------------------------

  function authorityOf(rest) {
    let body = rest;
    if (body.slice(0, 2) === '//') body = body.slice(2);
    let cut = body.length;
    for (let i = 0; i < body.length; i += 1) {
      const ch = body[i];
      if (ch === '/' || ch === '?' || ch === '#') { cut = i; break; }
    }
    return body.slice(0, cut);
  }

  function classifyLink(raw) {
    const input = typeof raw === 'string' ? raw.trim() : '';
    if (!input) {
      return { kind: 'none', scheme: null, reason: 'empty input' };
    }
    if (input.length > MAX_INPUT_CHARS) {
      return { kind: 'malformed', scheme: null, reason: 'the link exceeds the 2048 character limit' };
    }
    if (hasControlChar(input)) {
      return { kind: 'malformed', scheme: null, reason: 'control characters are not valid link input' };
    }
    const parsed = schemeOf(input);
    if (!parsed) {
      return {
        kind: 'no-scheme',
        scheme: null,
        reason: 'no scheme, so this is not a link on its own; the address bar, not this card, decides what happens'
      };
    }
    const scheme = parsed.scheme;
    const rest = parsed.rest;
    if (WEB_SCHEMES.indexOf(scheme) !== -1) {
      const authority = authorityOf(rest);
      const credentialsRefused = authority.indexOf('@') !== -1;
      return {
        kind: 'web',
        scheme: scheme,
        host: authority.split('@').pop(),
        credentialsRefused: credentialsRefused,
        reason: credentialsRefused
          ? 'a web address with embedded credentials; the credentials are refused before any navigation'
          : 'a normal web page; it opens in the browser viewport and no other app is involved'
      };
    }
    if (EXTERNAL_SCHEMES.indexOf(scheme) !== -1) {
      if (!rest || containsWhitespace(rest)) {
        return { kind: 'malformed', scheme: scheme, reason: 'malformed external handoff; nothing was planned' };
      }
      return {
        kind: 'external-handoff',
        scheme: scheme,
        target: truncateForEcho(rest),
        reason: 'a user-triggered handoff to another app; Daymark only follows it from an explicit tap'
      };
    }
    if (scheme === TELEGRAM_SCHEME) {
      return {
        kind: 'telegram-deep-link',
        scheme: scheme,
        target: truncateForEcho(rest),
        reason: 'hands off to the Telegram app when it is installed; when it is not, nothing opens and Daymark stays in front'
      };
    }
    if (scheme === INTENT_SCHEME) {
      const parsedIntent = parseIntentUri(input);
      return parsedIntent.ok
        ? { kind: 'android-intent', scheme: scheme, intent: parsedIntent, reason: 'an Android app handoff with explicit parameters' }
        : { kind: 'malformed', scheme: scheme, reason: parsedIntent.reason };
    }
    if (BLOCKED_SCHEMES.indexOf(scheme) !== -1) {
      return { kind: 'blocked', scheme: scheme, reason: 'the ' + scheme + ': scheme is blocked in Daymark' };
    }
    return {
      kind: 'unknown-scheme',
      scheme: scheme,
      reason: 'this prototype cannot prove what the ' + scheme + ': scheme would do, so it plans nothing'
    };
  }

  // --- plain-words planning ----------------------------------------------

  function planIntentHandoff(raw) {
    const result = classifyLink(raw);
    const base = {
      kind: result.kind,
      verdict: 'not-planned',
      title: '',
      summary: '',
      lines: [],
      network: 'None here. This card only classifies text locally; following a link is always an explicit user action.'
    };
    if (result.kind === 'none') {
      base.title = 'Nothing to plan yet';
      base.summary = 'Paste a link above and press Plan. Nothing is fetched and nothing opens.';
      return base;
    }
    if (result.kind === 'web') {
      base.verdict = 'opens-in-browser';
      base.title = 'Stays in the browser';
      base.summary = result.reason;
      base.lines = [
        'Opens in · the browser viewport (' + result.host + ')',
        'Handoff · none, no other app is involved'
      ];
      if (result.credentialsRefused) {
        base.lines.push('Credentials · embedded username:password is refused before navigation');
      }
      return base;
    }
    if (result.kind === 'external-handoff') {
      base.verdict = 'handoff';
      base.title = 'Handoff to another app';
      base.summary = result.reason;
      base.lines = [
        'Target · a ' + result.scheme + ' link (' + result.target + ')',
        'Trigger · only an explicit user tap starts it',
        'If no app handles it · the handoff fails visibly and nothing else runs',
        'Return · control stays with Daymark'
      ];
      return base;
    }
    if (result.kind === 'telegram-deep-link') {
      base.verdict = 'handoff';
      base.title = 'Telegram deep link';
      base.summary = result.reason;
      base.lines = [
        'Target · the Telegram app (' + result.target + ')',
        'If Telegram is installed · Telegram opens on that link',
        'If it is not installed · nothing opens; no store redirect and no web fallback',
        'Return · Daymark stays in front either way'
      ];
      return base;
    }
    if (result.kind === 'android-intent') {
      const intent = result.intent;
      let fallbackOrigin = null;
      if (intent.fallbackUrl) {
        try {
          fallbackOrigin = new URL(intent.fallbackUrl).origin;
        } catch (error) {
          fallbackOrigin = 'a validated web address';
        }
      }
      base.verdict = 'handoff';
      base.title = 'Android intent handoff';
      base.summary = 'A strict, allowlisted Android VIEW handoff; unsupported or ambiguous Intent fields are refused.';
      base.lines = [
        intent.packageName
          ? 'Target app · ' + intent.packageName + ' (pinned by the link)'
          : 'Target app · none pinned, so Android would show the app chooser',
        'Inner scheme · ' + intent.scheme,
        fallbackOrigin
          ? 'Fallback · if no app handles it, the browser fallback origin is ' + fallbackOrigin + ' (path and query are hidden)'
          : 'Fallback · none; if no app handles the intent, nothing opens',
        'Intent policy · only VIEW and BROWSABLE metadata are accepted; component, selector, flags and arbitrary extras are refused',
        'Trigger · only an explicit user tap starts it'
      ];
      return base;
    }
    if (result.kind === 'blocked') {
      base.verdict = 'refused';
      base.title = 'Blocked scheme';
      base.summary = result.reason;
      base.lines = ['Action · nothing opens'];
      return base;
    }
    if (result.kind === 'malformed') {
      base.verdict = 'refused';
      base.title = 'Not planned';
      base.summary = result.reason;
      base.lines = ['Action · nothing opens'];
      return base;
    }
    if (result.kind === 'unknown-scheme') {
      base.verdict = 'refused';
      base.title = 'Unknown scheme, so nothing is planned';
      base.summary = result.reason;
      base.lines = ['Daymark never guesses with unprompted app handoffs.'];
      return base;
    }
    if (result.kind === 'no-scheme') {
      base.verdict = 'not-planned';
      base.title = 'Not a link on its own';
      base.summary = result.reason;
      base.lines = [];
      return base;
    }
    base.title = 'Not planned';
    base.summary = 'This prototype has no honest explanation for this input, so nothing was planned.';
    return base;
  }

  const api = {
    classifyLink,
    planIntentHandoff,
    parseIntentUri,
    schemeOf,
    truncateForEcho,
    WEB_SCHEMES,
    EXTERNAL_SCHEMES,
    TELEGRAM_SCHEME,
    INTENT_SCHEME,
    BLOCKED_SCHEMES,
    MAX_INPUT_CHARS,
    MAX_ECHO_CHARS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkBrowserIntent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
