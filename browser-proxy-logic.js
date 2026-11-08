/*
 * Daymark browser proxy profile planner for the web prototype.
 *
 * Pure, dependency-free logic behind the "Proxy, planned honestly" card: the
 * user types a proxy address (host:port, with an optional http/https/socks5
 * scheme) and this module validates it and produces an honest plan of what
 * an optional, explicit, per-session proxy profile would mean: which kind of
 * proxy it is, what it can and cannot hide, where Android WebView actually
 * stands on per-app proxies today, how failures behave (fail closed, no
 * silent fallback to a direct connection), and why an ordinary proxy is not
 * Tor and promises no anonymity.
 *
 * Fail-closed policy: an address that cannot be parsed plans as "could not
 * be checked" instead of guessing. Credentials embedded in the address are
 * stripped and disclosed, never echoed back in full. No network access
 * happens here; nothing is routed anywhere.
 */
((root) => {
  'use strict';

  const MAX_ADDRESS_CHARS = 512;

  // Schemes a profile may be written with. The default, when the user types
  // a bare host:port, is an HTTP proxy.
  const SCHEMES = {
    http: { label: 'HTTP proxy', defaultPort: 8080, dns: 'remote' },
    https: { label: 'HTTPS proxy (TLS to the proxy)', defaultPort: 443, dns: 'remote' },
    socks5: { label: 'SOCKS5 proxy', defaultPort: 1080, dns: 'local' },
    socks5h: { label: 'SOCKS5 proxy with remote DNS', defaultPort: 1080, dns: 'remote' }
  };

  const NOT_CHECKABLE = {
    ok: false,
    summary: 'This proxy address could not be checked, so nothing is planned.',
    lines: [],
    notices: []
  };

  // Documented, honest facts about proxy support in Android WebView. These
  // are research conclusions, not features: Daymark does not implement a
  // proxy today, and this module never claims it does.
  const WEBVIEW_PROXY_FACTS = [
    'Android WebView has no public per-app proxy API; it follows the device-level network and proxy settings.',
    'The standard Wi-Fi manual proxy offers only host and port for an HTTP proxy; there is no SOCKS or proxy-username field there.',
    'WebView does not prompt for proxy authentication, so proxies that need a login cannot be used through the device setting alone.',
    'Per-app proxy routing would require a local VPN service, which is a new service component and an explicit owner decision, not a quiet settings toggle.',
    'An ordinary HTTP or SOCKS proxy is not Tor and provides no anonymity guarantee; it only moves trust from your network to the proxy operator.'
  ];

  // Reduces a host to its bare form: a normal hostname, an IPv4 literal or a
  // bracketed IPv6 literal. Anything else fails closed to null.
  function parseHost(text) {
    if (typeof text !== 'string' || !text) return null;
    const host = text.toLowerCase();
    if (host.startsWith('[')) {
      const close = host.indexOf(']');
      if (close === -1) return null;
      const inner = host.slice(1, close);
      if (!/^[0-9a-f:.]+$/.test(inner)) return null;
      return host.slice(0, close + 1);
    }
    if (!/^[0-9a-z._-]+$/.test(host)) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const parts = host.split('.');
      for (let i = 0; i < parts.length; i += 1) {
        const value = Number(parts[i]);
        if (parts[i].length > 3 || value > 255) return null;
      }
      return host;
    }
    return host;
  }

  // Parses a user-entered proxy address into a structured profile.
  // Accepts "host:port" (HTTP proxy by default) and
  // "scheme://[user:pass@]host[:port]" for http, https, socks5 and socks5h.
  // Credentials are stripped and reported, never returned. Returns null
  // when nothing honest can be parsed.
  function parseProxyAddress(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    let text = raw.trim();
    if (!text || text.length > MAX_ADDRESS_CHARS) return null;
    if (/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(text)) return null;

    let scheme = 'http';
    const schemeMatch = /^([a-zA-Z0-9+.-]+):\/\//.exec(text);
    let credentialsStripped = false;
    if (schemeMatch) {
      scheme = schemeMatch[1].toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(SCHEMES, scheme)) return null;
      text = text.slice(schemeMatch[0].length);
    }
    if (!text || /\//.test(text)) return null;

    // Strip and disclose any user:password embedded in the address; the
    // plan never echoes credentials back.
    const at = text.lastIndexOf('@');
    if (at !== -1) {
      text = text.slice(at + 1);
      credentialsStripped = true;
    }

    let hostText = text;
    let portText = null;
    if (text.startsWith('[')) {
      const close = text.indexOf(']');
      if (close === -1) return null;
      hostText = text.slice(0, close + 1);
      const after = text.slice(close + 1);
      if (after) {
        if (!after.startsWith(':')) return null;
        portText = after.slice(1);
      }
    } else {
      const colon = text.lastIndexOf(':');
      if (colon !== -1) {
        hostText = text.slice(0, colon);
        portText = text.slice(colon + 1);
      }
    }
    const host = parseHost(hostText);
    if (!host) return null;

    let port = null;
    if (portText !== null && portText !== '') {
      if (!/^\d{1,5}$/.test(portText)) return null;
      const value = Number(portText);
      if (value < 1 || value > 65535) return null;
      port = value;
    }

    return {
      scheme,
      host,
      port,
      explicitPort: port !== null,
      credentialsStripped
    };
  }

  // The honest plan for a proxy profile. Never throws; malformed input
  // plans as "could not be checked".
  function planProfile(raw) {
    const profile = parseProxyAddress(raw);
    if (!profile) return NOT_CHECKABLE;

    const schemeInfo = SCHEMES[profile.scheme];
    const port = profile.explicitPort ? profile.port : schemeInfo.defaultPort;
    const notices = [];
    if (profile.credentialsStripped) {
      notices.push('The address contained a username or password. It was removed; a plan never repeats credentials.');
    }
    if (!profile.explicitPort) {
      notices.push('No port was given, so the usual ' + schemeInfo.defaultPort + ' port for this proxy kind is written into the plan; check it against your provider.');
    }
    if (profile.port !== null && profile.port < 1024) {
      notices.push('Ports below 1024 are usually reserved on the proxy machine; double-check the port number with your provider.');
    }
    if (profile.host === '127.0.0.1' || profile.host === '[::1]' || profile.host === 'localhost') {
      notices.push('This is a loopback address: the proxy would run on this same device, so traffic leaves only after the proxy app sends it.');
    }
    if (profile.scheme === 'socks5') {
      notices.push('Plain SOCKS5 resolves site names on this device; with socks5h the proxy resolves them instead.');
    }
    if (profile.scheme === 'https') {
      notices.push('HTTPS proxy means the connection to the proxy is encrypted; the sites you visit still carry their own HTTPS.');
    }

    const lines = [
      'Address: ' + profile.scheme + '://' + profile.host + ':' + port,
      'Kind: ' + schemeInfo.label + '. The operator of the proxy can see which hosts you visit; HTTPS sites still keep their page contents encrypted.',
      'DNS: ' + (schemeInfo.dns === 'remote'
        ? 'site names are sent to the proxy to resolve (remote DNS).'
        : 'site names are resolved on this device first (local DNS).'),
      'Explicit session: the profile is off until you turn it on, applies only to this browsing session, and resets when it ends. Nothing routes through a hidden third party.',
      'Where Daymark stands: ' + WEBVIEW_PROXY_FACTS[0] + ' ' + WEBVIEW_PROXY_FACTS[3],
      'If it fails: the session shows the failure and stays where it is. It never silently falls back to a direct connection.',
      'Not Tor: an ordinary proxy hides you from your network, not from the proxy operator. No anonymity is promised.'
    ];

    const summary = notices.length > 0
      ? notices[0]
      : 'Planned. Read the lines below before trusting this profile.';

    return {
      ok: true,
      scheme: profile.scheme,
      host: profile.host,
      port,
      credentialsStripped: profile.credentialsStripped,
      summary,
      lines,
      notices
    };
  }

  // The documented research findings behind the card, for the UI and tests.
  function webviewProxyFacts() {
    return WEBVIEW_PROXY_FACTS.slice();
  }

  const api = {
    parseProxyAddress,
    planProfile,
    webviewProxyFacts,
    SCHEMES,
    MAX_ADDRESS_CHARS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkBrowserProxy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
