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

  function safePercentDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  // Parses intent://host/path#Intent;key=value;...;end and returns the
  // pieces Daymark would act on. The browser fallback URL is only honored
  // when it decodes to http(s); anything else is reported as ignored
  // rather than silently dropped.
  function parseIntentUri(raw) {
    const fail = (reason) => ({ ok: false, reason: reason });
    const input = String(raw == null ? '' : raw);
    if (input.slice(0, 9).toLowerCase() !== 'intent://') {
      return fail('an intent URI must start with intent://');
    }
    const marker = '#Intent;';
    const hashIndex = input.indexOf(marker);
    if (hashIndex === -1) {
      return fail('an intent URI needs a #Intent; parameter section');
    }
    const hostSection = input.slice(9, hashIndex);
    const paramSection = input.slice(hashIndex + marker.length);
    if (paramSection.slice(-4) !== ';end') {
      return fail('the intent parameter section must end with ;end');
    }
    const body = paramSection.slice(0, -4);
    const slashIndex = hostSection.indexOf('/');
    const host = slashIndex === -1 ? hostSection : hostSection.slice(0, slashIndex);
    const path = slashIndex === -1 ? '' : hostSection.slice(slashIndex);
    const params = body === '' ? [] : body.split(';');
    let scheme = null;
    let packageName = null;
    let fallbackUrl = null;
    let fallbackHonored = false;
    let fallbackIgnoredReason = null;
    const extraKeys = [];
    for (let i = 0; i < params.length; i += 1) {
      const param = params[i];
      if (param === '' || param === 'end') continue;
      const eq = param.indexOf('=');
      const key = eq === -1 ? param : param.slice(0, eq);
      const value = eq === -1 ? '' : param.slice(eq + 1);
      if (key === 'scheme') {
        scheme = value === '' ? null : value;
      } else if (key === 'package') {
        packageName = value === '' ? null : value;
      } else if (key === 'S.browser_fallback_url') {
        fallbackUrl = safePercentDecode(value);
        fallbackHonored = startsWithWebScheme(fallbackUrl);
        if (!fallbackHonored) {
          fallbackIgnoredReason = 'the fallback URL is not http(s), so Daymark would ignore it';
        }
      } else {
        extraKeys.push(key);
      }
    }
    return {
      ok: true,
      host: host,
      path: path,
      scheme: scheme,
      packageName: packageName,
      fallbackUrl: fallbackUrl,
      fallbackHonored: fallbackHonored,
      fallbackIgnoredReason: fallbackIgnoredReason,
      extraKeys: extraKeys
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
      base.verdict = 'handoff';
      base.title = 'Android intent handoff';
      base.summary = result.reason;
      base.lines = [
        intent.packageName
          ? 'Target app · ' + intent.packageName + ' (pinned by the link)'
          : 'Target app · none pinned, so Android would show the app chooser',
        'Inner scheme · ' + (intent.scheme || 'not set by the link'),
        intent.fallbackUrl === null
          ? 'Fallback · none; if no app handles the intent, nothing opens'
          : (intent.fallbackHonored
            ? 'Fallback · if no app handles it, the browser would open ' + truncateForEcho(intent.fallbackUrl)
            : 'Fallback · ignored (' + intent.fallbackIgnoredReason + ')'),
        'Extra parameters · ' + intent.extraKeys.length + ' passed through, never logged',
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
