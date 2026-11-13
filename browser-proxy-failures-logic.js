/*
 * Daymark browser proxy failure playbook for the web prototype.
 *
 * Pure, dependency-free logic behind the "If the proxy fails" card. It
 * defines, in plain words, what happens when an explicit, per-session proxy
 * profile fails: an unreachable proxy, a proxy that demands a login, which
 * hosts bypass the proxy, where site names are resolved (DNS), a proxy that
 * re-signs TLS certificates, and what turning the profile off or ending the
 * session does. It also decides, offline, whether a given host would bypass
 * a simple bypass list.
 *
 * Fail-closed policy: an unknown scenario explains nothing rather than
 * guessing; a host that cannot be validated never gets a bypass decision;
 * bypass entries that cannot be understood are skipped and counted, never
 * guessed. No network access happens here; nothing is routed anywhere.
 */
((root) => {
  'use strict';

  const SCENARIO_ORDER = [
    'proxy-unreachable',
    'auth-required',
    'bypass-rules',
    'dns-leak',
    'tls-interception',
    'session-reset'
  ];

  const SCENARIOS = {
    'proxy-unreachable': {
      id: 'proxy-unreachable',
      title: 'The proxy does not answer',
      behavior: [
        'The page fails to load with a connection error. The session stays on the failed profile and never silently falls back to a direct connection.',
        'Requests that were already on their way are dropped. Nothing is re-routed on its own.'
      ],
      recovery: [
        'Check the host and port with the proxy operator.',
        'Turn the profile off to browse directly again. The failure is shown, not hidden.'
      ],
      limits: [
        'Daymark does not auto-retry or auto-failover today: a dead proxy means failed pages until you act.'
      ]
    },
    'auth-required': {
      id: 'auth-required',
      title: 'The proxy asks for a login',
      behavior: [
        'Android WebView does not show a proxy login prompt, so a proxy that requires a username and password simply fails with an authentication error.',
        'There is no separate credential field, and credentials typed into a proxy address are stripped and never repeated back.'
      ],
      recovery: [
        'Use a proxy that accepts unauthenticated connections from this device, or have the operator allowlist this network.',
        'Never paste a password into an address box. It cannot be used here and would only risk exposure.'
      ],
      limits: [
        'Proxy authentication is not implemented. This is a documented WebView platform limit, not a Daymark setting.'
      ]
    },
    'bypass-rules': {
      id: 'bypass-rules',
      title: 'Which sites skip the proxy',
      behavior: [
        'A bypass list names hosts that connect directly instead of through the proxy. Loopback addresses such as localhost always bypass.',
        'An entry matches its host exactly. A leading dot (for example .example.com) also matches that domain and its subdomains.'
      ],
      recovery: [
        'If a trusted internal site fails through the proxy, add it to the bypass list for this session.',
        'Entries that cannot be understood are skipped and counted, never guessed.'
      ],
      limits: [
        'Matching here is exact-or-subdomain only. Wildcards, CIDR ranges and PAC scripts are not supported; such entries are skipped.'
      ]
    },
    'dns-leak': {
      id: 'dns-leak',
      title: 'Where site names are resolved',
      behavior: [
        'With plain SOCKS5, site names are resolved on this device first, so the local DNS operator sees every host you visit even though the traffic goes to the proxy.',
        'With socks5h, or an HTTP or HTTPS proxy, names are sent to the proxy to resolve (remote DNS).'
      ],
      recovery: [
        'Choose socks5h instead of socks5 when the local network operator must not learn the hostnames.',
        'Checking for a real DNS leak needs a live session; it is not automated here.'
      ],
      limits: [
        'Daymark does not measure or verify DNS behavior. This card states the documented platform semantics only.'
      ]
    },
    'tls-interception': {
      id: 'tls-interception',
      title: 'The proxy re-signs certificates',
      behavior: [
        'A proxy that intercepts TLS presents its own certificate. WebView shows a certificate error, and Daymark never bypasses certificate failures.',
        'Bypassing the error would hand every protected page to the proxy operator, so the page simply fails.'
      ],
      recovery: [
        'Install the operator root certificate in the system store only if you trust that operator, or ask them for a pass-through for those hosts.'
      ],
      limits: [
        'There is no setting, flag or fallback that ignores TLS errors. That is deliberate.'
      ]
    },
    'session-reset': {
      id: 'session-reset',
      title: 'Turning the profile off or ending the session',
      behavior: [
        'The profile is per-session. Turning it off, or the session ending, stops all proxy routing immediately. Nothing is restored on its own later.',
        'Requests still in flight through the proxy fail when the profile is removed. They are not re-routed.'
      ],
      recovery: [
        'After a reset, browsing continues directly. New pages load without the proxy until you enable a profile again.',
        'The last planned address may be remembered locally for convenience. Clearing this site browser data removes it.'
      ],
      limits: [
        'No background service keeps a proxy alive across sessions. Nothing runs when the app is closed.'
      ]
    }
  };

  function listScenarios() {
    return SCENARIO_ORDER.map((id) => ({ id: id, title: SCENARIOS[id].title }));
  }

  function explainScenario(id) {
    if (typeof id !== 'string') return null;
    if (!Object.prototype.hasOwnProperty.call(SCENARIOS, id)) return null;
    const scenario = SCENARIOS[id];
    return {
      id: scenario.id,
      title: scenario.title,
      behavior: scenario.behavior.slice(),
      recovery: scenario.recovery.slice(),
      limits: scenario.limits.slice()
    };
  }

  function hasForbiddenCodePoints(text) {
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code < 32 || code === 127) return true;
      if (code >= 0x202a && code <= 0x202e) return true;
      if (code >= 0x2066 && code <= 0x2069) return true;
    }
    return false;
  }

  function isValidBypassHost(host) {
    if (typeof host !== 'string' || host.length < 1 || host.length > 253) return false;
    if (hasForbiddenCodePoints(host)) return false;
    if (host.startsWith('[')) {
      if (!host.endsWith(']')) return false;
      const inner = host.slice(1, -1);
      if (inner.length < 2 || inner.indexOf(':') === -1) return false;
      return /^[0-9a-f:]+$/i.test(inner);
    }
    if (host.indexOf(':') !== -1) return false;
    if (!/^[a-z0-9.-]+$/.test(host)) return false;
    if (host.startsWith('-') || host.startsWith('.') || host.endsWith('-')) return false;
    const labels = host.split('.');
    return !labels.some((label) => label.length > 63
      || label.startsWith('-') || label.endsWith('-'));
  }

  function isLoopbackHost(host) {
    return host === 'localhost'
      || host.endsWith('.localhost')
      || /^127([.][0-9]{1,3}){3}$/.test(host)
      || host === '[::1]';
  }

  function isBypassed(hostText, rules) {
    const host = typeof hostText === 'string' ? hostText.trim().toLowerCase() : '';
    if (!isValidBypassHost(host)) {
      return { ok: false, reason: 'The host could not be checked, so no bypass decision is made.' };
    }
    if (isLoopbackHost(host)) {
      return { ok: true, bypassed: true, matchedRule: 'loopback (always direct)', skippedRules: 0 };
    }
    if (!Array.isArray(rules)) {
      return { ok: false, reason: 'The bypass list could not be read, so no bypass decision is made.' };
    }
    let skippedRules = 0;
    let matchedRule = null;
    for (let i = 0; i < rules.length; i += 1) {
      const raw = typeof rules[i] === 'string' ? rules[i].trim().toLowerCase() : '';
      if (!raw) { skippedRules += 1; continue; }
      let exact = null;
      let domain = null;
      if (raw.startsWith('.')) {
        const bare = raw.slice(1);
        if (isValidBypassHost(bare)) domain = bare;
        else { skippedRules += 1; continue; }
      } else if (isValidBypassHost(raw)) {
        exact = raw;
      } else {
        skippedRules += 1;
        continue;
      }
      if (matchedRule) continue;
      if (exact !== null && host === exact) matchedRule = raw;
      if (domain !== null && (host === domain || host.endsWith('.' + domain))) matchedRule = raw;
    }
    return { ok: true, bypassed: matchedRule !== null, matchedRule: matchedRule, skippedRules: skippedRules };
  }

  const api = {
    listScenarios,
    explainScenario,
    isBypassed,
    SCENARIO_IDS: SCENARIO_ORDER.slice()
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkBrowserProxyFailures = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
