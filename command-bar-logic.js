((root) => {
  'use strict';
  const QUERY_MAX = 200;
  const MAX_RESULTS = 8;
  const BANG_ENGINES = [
    { token: 'g', name: 'Google', url: 'https://www.google.com/search?q=' },
    { token: 'd', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    { token: 'br', name: 'Brave Search', url: 'https://search.brave.com/search?q=' },
    { token: 'b', name: 'Bing', url: 'https://www.bing.com/search?q=' },
    { token: 'sp', name: 'Startpage', url: 'https://www.startpage.com/sp/search?query=' },
    { token: 'y', name: 'Yahoo', url: 'https://search.yahoo.com/search?p=' }
  ];
  const CARD_TARGETS = [
    'feature-flags-card', 'storage-card', 'telegram', 'webhook', 'capability-registry', 'url-insights',
    'browser-intent', 'release-compat', 'lifecycle-recovery', 'permission-lifecycle', 'browser-data',
    'browser-proxy', 'browser-download', 'tls-gate', 'browser-error', 'wiki', 'zones', 'currency',
    'holiday', 'weather', 'briefing', 'focus', 'task-list'
  ];
  const CARD_LABELS = {
    'feature-flags-card': 'Feature settings',
    'storage-card': 'Local data',
    'telegram': 'Telegram digest',
    'webhook': 'Webhook digest',
    'capability-registry': 'Capability registry',
    'url-insights': 'Link insights',
    'browser-intent': 'In-app browser',
    'release-compat': 'App compatibility',
    'lifecycle-recovery': 'Recovery options',
    'permission-lifecycle': 'Permissions',
    'browser-data': 'Browser data',
    'browser-proxy': 'Site proxy logs',
    'browser-download': 'Downloads',
    'tls-gate': 'Secure connections',
    'browser-error': 'Browser errors',
    'wiki': 'Wiki facts',
    'zones': 'Time zones',
    'currency': 'Currency',
    'holiday': 'Holidays',
    'weather': 'Weather',
    'briefing': 'Briefing',
    'focus': 'Focus view',
    'task-list': 'Task list'
  };
  function findBang(token) {
    const wanted = String(token).toLowerCase();
    for (const engine of BANG_ENGINES) {
      if (engine.token === wanted) return engine;
    }
    return null;
  }
  function normalizeOpenUrl(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed === '' || /\s/.test(trimmed)) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^[a-z0-9.-]+\.[a-z]{2,}([\/?#!].*)?$/i.test(trimmed)) return 'https://' + trimmed;
    return null;
  }
  function parseQuery(raw) {
    if (typeof raw !== 'string') return { kind: 'empty' };
    const trimmed = raw.trim();
    if (trimmed === '') return { kind: 'empty' };
    if (trimmed.length > QUERY_MAX) return { kind: 'too-long' };
    if (trimmed.charAt(0) === '!') {
      const rest = trimmed.slice(1);
      const spaceIndex = rest.indexOf(' ');
      const token = spaceIndex === -1 ? rest : rest.slice(0, spaceIndex);
      if (token === '') return { kind: 'bang-empty' };
      const engine = findBang(token);
      if (!engine) return { kind: 'unknown-bang', token: token };
      const query = spaceIndex === -1 ? '' : rest.slice(spaceIndex + 1).trim();
      if (query === '') return { kind: 'bang-empty', token: token, engine: engine };
      return { kind: 'search', engine: engine, query: query };
    }
    const commandMatch = /^(goto|toggle)[\s]+([\s\S]+)$/i.exec(trimmed);
    if (commandMatch) {
      return { kind: 'command', action: commandMatch[1].toLowerCase(), text: commandMatch[2].trim() };
    }
    const openMatch = /^open[\s]+([\s\S]+)$/i.exec(trimmed);
    const candidate = openMatch ? openMatch[1].trim() : trimmed;
    if (candidate === '') return { kind: 'empty' };
    if (/\s/.test(candidate)) {
      if (openMatch) return { kind: 'bad-url' };
      return { kind: 'search', engine: null, query: trimmed };
    }
    const url = normalizeOpenUrl(candidate);
    if (url === null) {
      if (openMatch || candidate.indexOf(':') !== -1) return { kind: 'bad-url' };
      return { kind: 'search', engine: null, query: trimmed };
    }
    return { kind: 'url', url: url };
  }
  function buildCommands() {
    const commands = [];
    for (const target of CARD_TARGETS) {
      commands.push({ id: 'goto:' + target, kind: 'goto', target: target, label: 'Go to ' + CARD_LABELS[target] });
    }
    commands.push({ id: 'toggle:command-bar', kind: 'toggle', flagId: 'command-bar', label: 'Toggle the command bar' });
    commands.push({ id: 'toggle:search-bangs', kind: 'toggle', flagId: 'search-bangs', label: 'Toggle !bang search shortcuts' });
    return commands;
  }
  function fold(value) {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  function searchableText(command) {
    return command.id + ' ' + command.label;
  }
  function filterCommands(commands, parsed) {
    const query = typeof parsed === 'string' ? parseQuery(parsed) : parsed;
    let text = '';
    if (query && query.kind === 'command') text = query.text;
    else if (query && typeof query.query === 'string') text = query.query;
    else if (query && query.kind === 'url' && query.url) text = query.url;
    else text = typeof parsed === 'string' ? parsed : '';
    const tokens = fold(text).split(/\s+/).filter((token) => token !== '');
    if (tokens.length === 0) return commands.slice(0, MAX_RESULTS);
    const matches = [];
    for (const command of commands) {
      const haystack = fold(searchableText(command));
      let all = true;
      for (const token of tokens) {
        if (haystack.indexOf(token) === -1) { all = false; break; }
      }
      if (!all) continue;
      const rank = haystack.indexOf(tokens[0]) === 0 ? 0 : 1;
      matches.push({ command: command, rank: rank });
    }
    matches.sort((a, b) => a.rank - b.rank);
    return matches.map((entry) => entry.command).slice(0, MAX_RESULTS);
  }
  function resolveForRun(commands, raw) {
    const parsed = typeof raw === 'string' ? parseQuery(raw) : raw;
    if (!parsed) return { status: 'empty', command: null, options: [] };
    const text = parsed.kind === 'command' ? parsed.text : (typeof raw === 'string' ? raw.trim() : '');
    if (text === '') return { status: 'empty', command: null, options: [] };
    const foldedText = fold(text);
    let exact = null;
    for (const command of commands) {
      if (fold(command.id) === foldedText || fold(command.label) === foldedText) { exact = command; break; }
    }
    if (exact) return { status: 'ok', command: exact, options: [exact] };
    const matches = filterCommands(commands, parsed);
    if (matches.length === 0) return { status: 'empty', command: null, options: [] };
    if (matches.length === 1) return { status: 'ok', command: matches[0], options: matches };
    return { status: 'ambiguous', command: null, options: matches };
  }
  const api = {
    QUERY_MAX: QUERY_MAX,
    MAX_RESULTS: MAX_RESULTS,
    BANG_ENGINES: BANG_ENGINES,
    CARD_TARGETS: CARD_TARGETS,
    CARD_LABELS: CARD_LABELS,
    findBang: findBang,
    normalizeOpenUrl: normalizeOpenUrl,
    parseQuery: parseQuery,
    buildCommands: buildCommands,
    filterCommands: filterCommands,
    resolveForRun: resolveForRun
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkCommandBar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
