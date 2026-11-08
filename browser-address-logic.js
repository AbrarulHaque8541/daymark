/*
 * Daymark browser address-bar parsing engine for the web prototype.
 *
 * Pure, dependency-free logic behind the browser address bar: it decides
 * what the user's typed text means — an http(s) URL to open, a web search,
 * a safe external handoff (mailto/tel/sms), or a blocked scheme — and
 * normalizes what it can prove: Unicode/IDN hosts are punycode-encoded
 * (RFC 3492), ports must be 1..65535, IPv4 and bracketed IPv6 literals are
 * validated, credentials are refused, and malformed input falls back to an
 * explicit search instead of guessing. Search-provider switching rebuilds
 * the search URL from the ORIGINAL typed text, so the query can never be
 * lost or double-encoded when the provider changes.
 *
 * Mirrors the established repo policy (BrowserHttpPolicy, PR #368):
 * both http and https are allowed deliberately; https reports "encrypted",
 * http reports "not encrypted" and never gets silently rewritten to https.
 * No network access happens here — classification is fully local.
 */
((root) => {
  'use strict';

  const MAX_INPUT_CHARS = 2048;
  const MAX_HOST_LABEL_CHARS = 63;
  const MAX_HOST_LABELS = 127;

  // Deliberate HTTP+HTTPS browsing policy (AGENTS.md / BrowserHttpPolicy).
  const ALLOWED_WEB_SCHEMES = ['http', 'https'];
  // Schemes that only make sense as a user-triggered handoff to another app.
  const EXTERNAL_SCHEMES = ['mailto', 'tel', 'sms'];
  // Schemes that must never be treated as navigation or handoff targets.
  const BLOCKED_SCHEMES = [
    'javascript', 'data', 'vbscript', 'file', 'blob', 'about', 'chrome', 'chrome-extension',
    'intent', 'content', 'ws', 'wss', 'ftp', 'ftps', 'gopher', 'market', 'view-source'
  ];

  const SEARCH_PROVIDERS = {
    duckduckgo: { name: 'DuckDuckGo', build: (encoded) => 'https://duckduckgo.com/?q=' + encoded },
    wikipedia: { name: 'Wikipedia', build: (encoded) => 'https://en.wikipedia.org/w/index.php?search=' + encoded },
    google: { name: 'Google', build: (encoded) => 'https://www.google.com/search?q=' + encoded },
    bing: { name: 'Bing', build: (encoded) => 'https://www.bing.com/search?q=' + encoded }
  };
  const DEFAULT_SEARCH_PROVIDER = 'duckduckgo';

  // --- RFC 3492 punycode encoding (label level) -------------------------

  const PUNYCODE_BASE = 36;
  const PUNYCODE_TMIN = 1;
  const PUNYCODE_TMAX = 26;
  const PUNYCODE_SKEW = 38;
  const PUNYCODE_DAMP = 700;
  const PUNYCODE_INITIAL_BIAS = 72;

  function punycodeAdapt(delta, numPoints, firstTime) {
    delta = firstTime ? Math.floor(delta / PUNYCODE_DAMP) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    let k = 0;
    while (delta > ((PUNYCODE_BASE - PUNYCODE_TMIN) * PUNYCODE_TMAX) / 2) {
      delta = Math.floor(delta / (PUNYCODE_BASE - PUNYCODE_TMIN));
      k += PUNYCODE_BASE;
    }
    return k + Math.floor(
      ((PUNYCODE_BASE - PUNYCODE_TMIN + 1) * delta) / (delta + PUNYCODE_SKEW));
  }

  function punycodeDigitToBasic(digit) {
    // 0..25 map to a..z, 26..35 map to 0..9 (lowercase form, RFC 3492 6.3).
    return digit + (digit < 26 ? 97 : 22);
  }

  // Returns the xn-- form for a label containing non-ASCII code points,
  // or null when the label is already pure ASCII.
  function punycodeEncodeLabel(label) {
    const cps = Array.from(label).map((ch) => ch.codePointAt(0));
    const output = [];
    let basicLength = 0;
    for (let i = 0; i < cps.length; i += 1) {
      if (cps[i] < 128) {
        output.push(String.fromCharCode(cps[i]));
        basicLength += 1;
      }
    }
    if (basicLength === cps.length) return null;
    if (basicLength > 0) output.push('-');
    let n = 128;
    let delta = 0;
    let bias = PUNYCODE_INITIAL_BIAS;
    let handled = basicLength;
    while (handled < cps.length) {
      let m = Infinity;
      for (let i = 0; i < cps.length; i += 1) {
        if (cps[i] >= n && cps[i] < m) m = cps[i];
      }
      delta += (m - n) * (handled + 1);
      n = m;
      for (let i = 0; i < cps.length; i += 1) {
        const cp = cps[i];
        if (cp < n) delta += 1;
        if (cp === n) {
          let q = delta;
          for (let k = PUNYCODE_BASE; ; k += PUNYCODE_BASE) {
            const t = k <= bias
              ? PUNYCODE_TMIN
              : (k >= bias + PUNYCODE_TMAX ? PUNYCODE_TMAX : k - bias);
            if (q < t) break;
            output.push(String.fromCharCode(punycodeDigitToBasic(t + ((q - t) % (PUNYCODE_BASE - t)))));
            q = Math.floor((q - t) / (PUNYCODE_BASE - t));
          }
          output.push(String.fromCharCode(punycodeDigitToBasic(q)));
          bias = punycodeAdapt(delta, handled + 1, handled === basicLength);
          delta = 0;
          handled += 1;
        }
      }
      delta += 1;
      n += 1;
    }
    return 'xn--' + output.join('');
  }

  // --- host validation --------------------------------------------------

  function isValidIpv4(text) {
    const parts = String(text).split('.');
    if (parts.length !== 4) return false;
    for (const part of parts) {
      // Reject legacy WHATWG IPv4 spellings such as 010.0.0.1 before WebView
      // can reinterpret an octet as octal or collapse leading-zero components.
      if (!/^(?:0|[1-9]\d{0,2})$/.test(part)) return false;
      const value = Number(part);
      if (value > 255) return false;
    }
    return true;
  }

  // WHATWG URL treats hosts whose final label is an IPv4 number as IPv4
  // candidates, including shortened, integer, octal, and hexadecimal forms.
  // Reject these unless the entire host was already accepted as canonical
  // four-octet decimal IPv4 above; otherwise Chromium may navigate elsewhere.
  function endsInWhatwgIpv4Number(label) {
    return /^[0-9]+$/.test(label)
      || /^0[xX][0-9a-fA-F]*$/.test(label)
      || (label.length > 1 && label[0] === '0' && /^[0-7]+$/.test(label.slice(1)));
  }

  function isValidIpv6Literal(text) {
    const body = String(text);
    if (!/^[0-9a-fA-F:.]+$/.test(body)) return false;
    const doubleColons = body.match(/::/g) || [];
    if (doubleColons.length > 1) return false;
    let head;
    let tail = null;
    if (doubleColons.length === 1) {
      const pieces = body.split('::');
      head = pieces[0];
      tail = pieces[1];
    } else {
      head = body;
    }
    const groups = (head === '' ? [] : head.split(':'))
      .concat(tail === null || tail === '' ? [] : tail.split(':'));
    if (groups.length > 8) return false;
    let addressUnits = 0;
    for (let i = 0; i < groups.length; i += 1) {
      const group = groups[i];
      if (group.includes('.')) {
        // An IPv4 tail occupies two 16-bit IPv6 groups and must be last.
        // With "::", it must be in the post-compression tail: groups omitted
        // by "::" are to the right, so an IPv4 group before "::" is not last.
        const followsCompression = doubleColons.length === 0 || (tail !== null && tail !== '');
        if (i !== groups.length - 1 || !followsCompression || !isValidIpv4(group)) return false;
        addressUnits += 2;
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return false;
      addressUnits += 1;
    }
    // Without "::" exactly eight 16-bit units are required. With "::",
    // at least one unit must be compressed (except the all-zero "::" form).
    if (doubleColons.length === 0 && addressUnits !== 8) return false;
    if (doubleColons.length === 1 && addressUnits >= 8 && body !== '::') return false;
    return true;
  }

  function isValidHostLabel(label) {
    if (!label || label.length > MAX_HOST_LABEL_CHARS) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
    // Letters (any script), digits, underscore, hyphen are accepted; the
    // label is either pure ASCII or punycode-encodable Unicode.
    return /^[\p{L}\p{N}_-]+$/u.test(label);
  }

  // Validates and normalizes a host (no scheme, no port, brackets for IPv6).
  // Returns { host, idn } or null when the host is not a valid navigation host.
  function normalizeHost(rawHost) {
    if (!rawHost) return null;
    let host = String(rawHost);
    if (host.startsWith('[')) {
      if (!host.endsWith(']')) return null;
      const inner = host.slice(1, -1);
      if (!isValidIpv6Literal(inner)) return null;
      return { host: '[' + inner.toLowerCase() + ']', idn: false, literal: 'ipv6' };
    }
    if (host.includes('[') || host.includes(']')) return null;
    host = host.replace(/\.$/, ''); // a single trailing dot is legal
    if (!host) return null;
    if (isValidIpv4(host)) return { host, idn: false, literal: 'ipv4' };
    // A host whose last label is purely numeric is only valid as a full IPv4
    // literal; "999.1.1.1" and "1.2.3" are not navigation hosts.
    const labels = host.split('.');
    if (labels.length > MAX_HOST_LABELS) return null;
    if (endsInWhatwgIpv4Number(labels[labels.length - 1])) return null;
    let idn = false;
    const encodedLabels = [];
    for (const label of labels) {
      if (!isValidHostLabel(label)) return null;
      if (!/^[\x00-\x7F]+$/.test(label)) idn = true;
      encodedLabels.push(punycodeEncodeLabel(label) || label.toLowerCase());
    }
    const normalized = encodedLabels.join('.');
    // A host must be a real name: dot-separated, or localhost, never bare.
    if (labels.length < 2 && normalized !== 'localhost') return null;
    return { host: normalized, idn, literal: null };
  }

  // --- search -----------------------------------------------------------

  function isKnownProvider(provider) {
    return typeof provider === 'string' && Object.prototype.hasOwnProperty.call(SEARCH_PROVIDERS, provider);
  }

  function buildSearchUrl(query, provider) {
    const chosen = isKnownProvider(provider) ? provider : DEFAULT_SEARCH_PROVIDER;
    const text = String(query == null ? '' : query).trim().slice(0, MAX_INPUT_CHARS);
    if (!text) throw new Error('A search query is required.');
    return SEARCH_PROVIDERS[chosen].build(encodeURIComponent(text));
  }

  function searchResult(query, provider, reason) {
    const chosen = isKnownProvider(provider) ? provider : DEFAULT_SEARCH_PROVIDER;
    const text = String(query == null ? '' : query).trim().slice(0, MAX_INPUT_CHARS);
    return {
      kind: 'search',
      url: buildSearchUrl(text, chosen),
      provider: chosen,
      providerName: SEARCH_PROVIDERS[chosen].name,
      searchQuery: text,
      security: 'encrypted',
      scheme: 'https',
      host: newUrlHost(buildSearchUrl(text, chosen)),
      reason: reason || 'treated as a search'
    };
  }

  function newUrlHost(url) {
    const match = /^https:\/\/([^/?#]+)/.exec(url);
    return match ? match[1] : null;
  }

  // --- main entry point --------------------------------------------------

  function parseAddressInput(raw, options) {
    const input = typeof raw === 'string' ? raw.trim() : '';
    if (!input) {
      return { kind: 'none', url: null, security: null, scheme: null, host: null, reason: 'empty input' };
    }
    if (input.length > MAX_INPUT_CHARS) {
      return searchResult(input, options && options.provider, 'input exceeds the address-bar limit; treated as a search');
    }
    if (/[\u0000-\u001f\u007f]/.test(input)) {
      return searchResult(input, options && options.provider, 'control characters are not valid navigation input; treated as a search');
    }

    const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/.exec(input);
    if (schemeMatch) {
      const scheme = schemeMatch[1].toLowerCase();
      const rest = schemeMatch[2];
      // "example.com:8080" also matches this regex; only treat the prefix as
      // a real scheme for scheme URLs ("scheme://..."), or for schemes we
      // explicitly handle (web, external, blocked). Anything else falls
      // through to the bare-host / search logic below.
      const looksLikeSchemeUrl = rest.startsWith('//')
        || ALLOWED_WEB_SCHEMES.indexOf(scheme) !== -1
        || EXTERNAL_SCHEMES.indexOf(scheme) !== -1
        || BLOCKED_SCHEMES.indexOf(scheme) !== -1;
      if (looksLikeSchemeUrl) {
        if (ALLOWED_WEB_SCHEMES.indexOf(scheme) !== -1) {
          return parseWebUrl(scheme, rest, options);
        }
        if (EXTERNAL_SCHEMES.indexOf(scheme) !== -1) {
          if (!rest || /[\s]/.test(rest)) {
            return searchResult(input, options && options.provider, 'malformed external handoff; treated as a search');
          }
          return {
            kind: 'external',
            url: scheme + ':' + rest,
            scheme,
            security: null,
            host: null,
            reason: 'safe external handoff (mailto/tel/sms only, user-triggered)'
          };
        }
        if (BLOCKED_SCHEMES.indexOf(scheme) !== -1) {
          return {
            kind: 'blocked',
            url: null,
            scheme,
            security: null,
            host: null,
            reason: 'the ' + scheme + ': scheme is blocked in the address bar'
          };
        }
        return searchResult(input, options && options.provider, 'unknown scheme ' + scheme + '; searching instead of guessing');
      }
    }

    // No scheme: either a bare host (https assumed) or a search query.
    if (/\s/.test(input)) {
      return searchResult(input, options && options.provider, 'free text; treated as a search');
    }
    return parseWebUrl('https', input, options, true);
  }

  function parseWebUrl(scheme, rest, options, bareForm) {
    // The original typed text is what a search fallback must search for.
    const search = () => searchResult(
      bareForm ? rest : scheme + ':' + rest,
      options && options.provider,
      'malformed URL; treated as a search'
    );

    let authority = rest;
    let path = '';
    if (!bareForm) {
      if (!rest.startsWith('//')) return search();
      const afterSlashes = rest.slice(2);
      const cut = afterSlashes.search(/[/?#]/);
      authority = cut === -1 ? afterSlashes : afterSlashes.slice(0, cut);
      path = cut === -1 ? '' : afterSlashes.slice(cut);
    } else {
      const cut = rest.search(/[/?#]/);
      authority = cut === -1 ? rest : rest.slice(0, cut);
      path = cut === -1 ? '' : rest.slice(cut);
    }
    if (!authority) return search();
    if (/[\s]/.test(authority)) return search();
    if (authority.includes('@')) {
      return searchResult(
        scheme + '://' + rest,
        options && options.provider,
        'embedded credentials are refused in the address bar; treated as a search'
      );
    }

    let hostPart = authority;
    let portText = null;
    if (authority.startsWith('[')) {
      const close = authority.indexOf(']');
      if (close === -1) return search();
      hostPart = authority.slice(0, close + 1);
      const after = authority.slice(close + 1);
      if (after.startsWith(':')) {
        portText = after.slice(1);
      } else if (after !== '') {
        return search();
      }
    } else {
      const colon = authority.indexOf(':');
      if (colon !== -1) {
        hostPart = authority.slice(0, colon);
        portText = authority.slice(colon + 1);
      }
    }

    if (portText !== null && portText !== '') {
      if (!/^\d+$/.test(portText)) return search();
      const port = Number(portText);
      if (port < 1 || port > 65535) return search();
    } else if (portText === '') {
      portText = null; // "host:" means the default port; strip it
    }

    const normalized = normalizeHost(hostPart);
    if (!normalized) return search();

    let port = null;
    if (portText !== null) {
      const value = Number(portText);
      if (value < 1 || value > 65535) return search();
      const defaultPort = scheme === 'https' ? 443 : 80;
      port = value === defaultPort ? null : value;
    }

    const hostWithPort = normalized.host + (port === null ? '' : ':' + port);
    const pathPart = path || '';
    const url = scheme + '://' + hostWithPort + (pathPart.startsWith('/') || pathPart === '' ? pathPart : '/' + pathPart);

    return {
      kind: 'navigate',
      url,
      scheme,
      host: normalized.host,
      hostLiteral: normalized.literal,
      idn: normalized.idn,
      port,
      security: scheme === 'https' ? 'encrypted' : 'not-encrypted',
      reason: scheme === 'https' ? 'secure page (HTTPS)' : 'plain HTTP page: transport is not encrypted'
    };
  }

  // Switching providers must never lose or double-encode the query: the
  // search URL is always rebuilt from the original typed text.
  function switchSearchProvider(raw, provider) {
    const result = parseAddressInput(raw, { provider });
    return result.kind === 'search' ? result : searchResult(raw, provider, 're-classified as a search after provider switch');
  }

  const api = {
    parseAddressInput,
    switchSearchProvider,
    buildSearchUrl,
    isKnownProvider,
    punycodeEncodeLabel,
    normalizeHost,
    isValidIpv4,
    isValidIpv6Literal,
    ALLOWED_WEB_SCHEMES,
    EXTERNAL_SCHEMES,
    BLOCKED_SCHEMES,
    SEARCH_PROVIDERS,
    DEFAULT_SEARCH_PROVIDER,
    MAX_INPUT_CHARS,
    MAX_HOST_LABEL_CHARS,
    MAX_HOST_LABELS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkBrowserAddress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
