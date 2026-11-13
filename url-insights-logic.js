/*
 * Daymark address-bar insights for the web prototype.
 *
 * Pure, dependency-free logic behind the "Address bar, explained"
 * card. It reads a pasted address or search text the way the Daymark
 * address bar does (mirroring browser-address-logic.js) and explains,
 * in plain words: the scheme, the host kind (hostname, IPv4 literal,
 * bracketed IPv6 literal, or a non-ASCII IDN host with a look-alike
 * caution), the port and its scheme default, embedded credentials,
 * and whether the input reads as a web address or as a search query
 * that stays intact when the search provider changes.
 *
 * Fail-closed policy: malformed input never produces a "safe to open"
 * verdict; it produces an explicit reason why nothing was planned.
 * Nothing here opens anything, fetches anything, or reads storage.
 * Credentials embedded in an address are detected and disclosed,
 * never echoed back.
 */
((root) => {
  'use strict';

  const MAX_INPUT_CHARS = 2048;
  const MAX_ECHO_CHARS = 160;
  const DEFAULT_PORTS = { http: '80', https: '443' };

  function hasControlChar(text) {
    for (let i = 0; i < text.length; i += 1) {
      const c = text.charCodeAt(i);
      if (c <= 31 || c === 127) return true;
    }
    return false;
  }

  function containsWhitespace(text) {
    for (let i = 0; i < text.length; i += 1) {
      const c = text.charCodeAt(i);
      if (c === 32 || (c >= 9 && c <= 13)) return true;
    }
    return false;
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

  function isCanonicalIpv4(host) {
    const parts = host.split('.');
    if (parts.length !== 4) return false;
    return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  }

  function isValidIpv6Literal(host) {
    if (!host || host.length > 45) return false;
    const sections = host.split('::');
    if (sections.length > 2) return false;
    const groupsOf = (s) => (s === '' ? [] : s.split(':'));
    const head = groupsOf(sections[0]);
    const tail = sections.length === 2 ? groupsOf(sections[1]) : [];
    const hex = /^[0-9A-Fa-f]{1,4}$/;
    const all = head.concat(tail);
    for (let i = 0; i < all.length; i += 1) {
      if (!hex.test(all[i])) return false;
    }
    const total = all.length;
    if (sections.length === 2) return total >= 1 && total <= 7;
    return total === 8;
  }

  function isValidHostnameLabel(label) {
    if (!label || label.length > 63) return false;
    if (label.charAt(0) === '-' || label.charAt(label.length - 1) === '-') return false;
    return !/[\s%@:/\\[\]<>"]/.test(label);
  }

  function isValidHostname(host) {
    if (!host || host.length > 253) return false;
    const labels = host.split('.');
    return labels.every(isValidHostnameLabel);
  }

  function portLine(scheme, port, portIsDefault) {
    if (port === null) {
      return 'Port · none typed; the ' + scheme + ' default (' + DEFAULT_PORTS[scheme] + ') applies';
    }
    if (portIsDefault) {
      return 'Port · ' + port + ' (the ' + scheme + ' default; it can be omitted)';
    }
    return 'Port · ' + port + ' (explicit)';
  }

  function parseAddress(raw) {
    const input = typeof raw === 'string' ? raw.trim() : '';
    if (!input) return { kind: 'none', reason: 'empty input' };
    if (input.length > MAX_INPUT_CHARS) {
      return { kind: 'malformed', reason: 'the input exceeds the 2048 character limit' };
    }
    if (hasControlChar(input)) {
      return { kind: 'malformed', reason: 'control characters are not valid address input' };
    }

    const parsed = schemeOf(input);
    if (parsed) {
      const scheme = parsed.scheme;
      const rest = parsed.rest;
      if (scheme !== 'http' && scheme !== 'https') {
        return {
          kind: 'malformed',
          scheme,
          reason: 'the ' + scheme + ': scheme is not a web page address; Daymark loads http and https pages only, and app handoff schemes are covered by the App links card'
        };
      }
      let body = rest;
      if (body.slice(0, 2) === '//') body = body.slice(2);
      if (containsWhitespace(body)) {
        return { kind: 'malformed', scheme, reason: 'a web address cannot contain spaces' };
      }
      const cut = body.search(/[/?#]/);
      const authority = cut === -1 ? body : body.slice(0, cut);
      const suffix = cut === -1 ? '' : body.slice(cut);
      if (!authority) {
        return { kind: 'malformed', scheme, reason: 'the address has no host after the scheme' };
      }

      const at = authority.lastIndexOf('@');
      const credentialsRefused = at !== -1;
      const hostPort = credentialsRefused ? authority.slice(at + 1) : authority;

      let host;
      let portText = null;
      if (hostPort.startsWith('[')) {
        const close = hostPort.indexOf(']');
        if (close === -1) {
          return { kind: 'malformed', scheme, reason: 'an IPv6 host must close its bracket' };
        }
        host = hostPort.slice(1, close);
        const tail = hostPort.slice(close + 1);
        if (tail !== '') {
          if (!tail.startsWith(':') || tail.length === 1) {
            return { kind: 'malformed', scheme, reason: 'the text after an IPv6 bracket is not a valid port' };
          }
          portText = tail.slice(1);
        }
      } else {
        const firstColon = hostPort.indexOf(':');
        const lastColon = hostPort.lastIndexOf(':');
        if (firstColon !== -1 && firstColon !== lastColon) {
          return { kind: 'malformed', scheme, reason: 'a host without brackets cannot contain more than one colon' };
        }
        if (lastColon !== -1) {
          host = hostPort.slice(0, lastColon);
          portText = hostPort.slice(lastColon + 1);
        } else {
          host = hostPort;
        }
      }

      const notes = [];
      let hostKind;
      if (/^[0-9.]+$/.test(host)) {
        if (isCanonicalIpv4(host)) {
          hostKind = 'ipv4';
          notes.push('Host note · an IPv4 literal; four numeric octets, no domain name in sight');
        } else {
          return {
            kind: 'malformed',
            scheme,
            reason: 'a numeric host must be a full four-part IPv4 literal such as 192.168.1.10'
          };
        }
      } else if (isValidIpv6Literal(host)) {
        hostKind = 'ipv6';
        notes.push('Host note · an IPv6 literal written inside brackets');
      } else if (host.indexOf(':') !== -1) {
        return {
          kind: 'malformed',
          scheme,
          reason: 'the IPv6 host is not valid; IPv6 needs brackets and valid hex groups'
        };
      } else {
        if (!isValidHostname(host)) {
          return { kind: 'malformed', scheme, reason: 'the host name contains characters a host cannot use' };
        }
        hostKind = /[^\x00-\x7f]/.test(host) ? 'idn' : 'hostname';
        if (hostKind === 'idn') {
          notes.push('Caution · non-ASCII (IDN) host: browsers convert it to punycode, and look-alike spellings can imitate real sites; check the exact characters');
        }
      }

      let port = null;
      let portIsDefault = false;
      if (portText !== null) {
        if (!/^\d{1,5}$/.test(portText)) {
          return { kind: 'malformed', scheme, reason: 'the port must be a number between 1 and 65535' };
        }
        port = Number(portText);
        if (port < 1 || port > 65535) {
          return { kind: 'malformed', scheme, reason: 'the port must be a number between 1 and 65535' };
        }
        portIsDefault = String(port) === DEFAULT_PORTS[scheme];
      }

      if (credentialsRefused) {
        notes.push('Credentials · text before the host is refused before navigation and never echoed');
      }

      return {
        kind: 'web',
        scheme,
        host,
        hostKind,
        port,
        portIsDefault,
        credentialsRefused,
        hasPath: suffix !== '',
        bareDomain: false,
        notes,
        reason: 'a normal web address; it opens in the browser viewport'
      };
    }

    if (containsWhitespace(input)) {
      return {
        kind: 'search',
        query: input,
        reason: 'spaces mean this reads as a search, not an address',
        notes: []
      };
    }
    const looksLikeHost = input.indexOf('.') !== -1
      || input.toLowerCase() === 'localhost'
      || input.startsWith('[');
    if (looksLikeHost) {
      const reparsed = parseAddress('https://' + input);
      if (reparsed.kind === 'web') {
        reparsed.bareDomain = true;
        reparsed.notes.unshift('Scheme · none typed, so Daymark defaults a bare domain to HTTPS');
        return reparsed;
      }
      return reparsed;
    }
    return {
      kind: 'search',
      query: input,
      reason: 'no scheme and no dot, so this reads as a search',
      notes: []
    };
  }

  function explainAddress(raw) {
    const result = parseAddress(raw);
    const plan = {
      kind: result.kind,
      verdict: 'not-planned',
      title: '',
      summary: result.reason || '',
      lines: [],
      network: 'None here. This card only reads text locally; nothing is fetched and nothing opens.'
    };
    if (result.kind === 'none') {
      plan.title = 'Nothing to explain yet';
      plan.summary = 'Paste an address or search words above and press Explain.';
      return plan;
    }
    if (result.kind === 'web') {
      plan.verdict = 'explained';
      plan.title = 'Reads as a web address';
      plan.lines = [
        'Scheme · ' + result.scheme + (result.bareDomain ? ' (defaulted; nothing was typed)' : ''),
        'Host · ' + result.host + ' (' + result.hostKind + ')',
        portLine(result.scheme, result.port, result.portIsDefault),
        result.hasPath
          ? 'Path · the address carries a path, query or fragment'
          : 'Path · none, the site root is loaded'
      ];
      for (let i = 0; i < result.notes.length; i += 1) plan.lines.push(result.notes[i]);
      return plan;
    }
    if (result.kind === 'search') {
      plan.verdict = 'search';
      plan.title = 'Reads as a search';
      plan.lines = [
        'Query kept · ' + truncateForEcho(result.query),
        'Provider switch · the full query text stays the query when you switch search providers; nothing is trimmed away',
        'No navigation · this card opens nothing; the address bar decides the actual handoff'
      ];
      return plan;
    }
    plan.verdict = 'refused';
    plan.title = 'Not a readable address';
    plan.lines = ['Action · nothing opens'];
    return plan;
  }

  function planSearchHandoff(raw) {
    const result = parseAddress(raw);
    if (result.kind !== 'search') {
      return { ok: false, reason: 'the input does not read as a search' };
    }
    return {
      ok: true,
      query: result.query,
      preserved: true,
      note: 'The query is kept word for word when the provider changes; only the provider endpoint differs.'
    };
  }

  const api = {
    parseAddress,
    explainAddress,
    planSearchHandoff,
    truncateForEcho,
    DEFAULT_PORTS,
    MAX_INPUT_CHARS,
    MAX_ECHO_CHARS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkUrlInsights = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
