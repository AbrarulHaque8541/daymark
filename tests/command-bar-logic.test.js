'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const bar = require('../command-bar-logic.js');

test('constants: 200-char query cap, 8 results cap', () => {
  assert.equal(bar.QUERY_MAX, 200);
  assert.equal(bar.MAX_RESULTS, 8);
});

test('six bang engines with stable tokens and names', () => {
  assert.deepEqual(bar.BANG_ENGINES.map((engine) => engine.token), ['g', 'd', 'br', 'b', 'sp', 'y']);
  assert.deepEqual(bar.BANG_ENGINES.map((engine) => engine.name),
    ['Google', 'DuckDuckGo', 'Brave Search', 'Bing', 'Startpage', 'Yahoo']);
});

test('exactly 23 card targets, all unique', () => {
  assert.equal(bar.CARD_TARGETS.length, 23);
  assert.equal(new Set(bar.CARD_TARGETS).size, 23);
});

test('buildCommands: 23 go-to jumps plus 2 toggles, ids unique', () => {
  const commands = bar.buildCommands();
  assert.equal(commands.length, 25);
  assert.equal(commands.filter((c) => c.kind === 'goto').length, 23);
  assert.equal(commands.filter((c) => c.kind === 'toggle').length, 2);
  assert.equal(new Set(commands.map((c) => c.id)).size, 25);
  assert.deepEqual(commands.filter((c) => c.kind === 'toggle').map((c) => c.flagId).sort(), ['command-bar', 'search-bangs']);
});

test('empty queries in every shape parse as empty', () => {
  assert.equal(bar.parseQuery('').kind, 'empty');
  assert.equal(bar.parseQuery('   ').kind, 'empty');
  assert.equal(bar.parseQuery(null).kind, 'empty');
  assert.equal(bar.parseQuery(undefined).kind, 'empty');
});

test('over-long queries are refused, not run', () => {
  const long = 'a'.repeat(201);
  assert.equal(bar.parseQuery(long).kind, 'too-long');
  assert.equal(bar.parseQuery('a'.repeat(200)).kind, 'search');
});

test('!d routes to DuckDuckGo with + between terms', () => {
  const parsed = bar.parseQuery('!d daymark repo');
  assert.equal(parsed.kind, 'search');
  assert.equal(parsed.engine.name, 'DuckDuckGo');
  assert.equal(parsed.engine.url + parsed.query.split(' ').join('+'), 'https://duckduckgo.com/?q=daymark+repo');
});

test('a bang without query text is reported as bang-empty', () => {
  assert.equal(bar.parseQuery('!d').kind, 'bang-empty');
  assert.equal(bar.parseQuery('!d   ').kind, 'bang-empty');
  assert.equal(bar.parseQuery('!').kind, 'bang-empty');
});

test('unknown bangs are named, not guessed', () => {
  const parsed = bar.parseQuery('!x daymark');
  assert.equal(parsed.kind, 'unknown-bang');
  assert.equal(parsed.token, 'x');
});

test('absolute urls pass through untouched', () => {
  assert.deepEqual(bar.parseQuery('https://example.com/a?b=c'), { kind: 'url', url: 'https://example.com/a?b=c' });
  assert.deepEqual(bar.parseQuery('http://example.com'), { kind: 'url', url: 'http://example.com' });
});

test('bare domains are promoted to https', () => {
  assert.deepEqual(bar.parseQuery('example.com'), { kind: 'url', url: 'https://example.com' });
  assert.deepEqual(bar.parseQuery('example.com/path?q=1'), { kind: 'url', url: 'https://example.com/path?q=1' });
});

test('normalizeOpenUrl refuses non-web and broken candidates', () => {
  assert.equal(bar.normalizeOpenUrl('javascript:alert(1)'), null);
  assert.equal(bar.normalizeOpenUrl('https://bad url.test'), null);
  assert.equal(bar.normalizeOpenUrl(''), null);
  assert.equal(bar.normalizeOpenUrl(null), null);
  assert.equal(bar.normalizeOpenUrl('https://example.com'), 'https://example.com');
});

test('open-style queries launch the bare domain over https', () => {
  const parsed = bar.parseQuery('open example.com');
  assert.deepEqual(parsed, { kind: 'url', url: 'https://example.com' });
});

test('open with a broken link reports bad-url', () => {
  assert.equal(bar.parseQuery('open ~$//x').kind, 'bad-url');
  assert.equal(bar.parseQuery('open javascript:alert(1)').kind, 'bad-url');
});

test('plain multi-word text is treated as engineless search', () => {
  const parsed = bar.parseQuery('daymark blue brushed build');
  assert.equal(parsed.kind, 'search');
  assert.equal(parsed.engine, null);
  assert.equal(parsed.query, 'daymark blue brushed build');
});

test('goto and toggle prefixes parse as commands', () => {
  const gotoParsed = bar.parseQuery('goto weather');
  assert.equal(gotoParsed.kind, 'command');
  assert.equal(gotoParsed.action, 'goto');
  assert.equal(gotoParsed.text, 'weather');
  const toggleParsed = bar.parseQuery('toggle search bangs');
  assert.equal(toggleParsed.kind, 'command');
  assert.equal(toggleParsed.action, 'toggle');
});

test('filterCommands intersects every token and caps results', () => {
  const commands = bar.buildCommands();
  const weatherOnly = bar.filterCommands(commands, 'weather');
  assert.equal(weatherOnly.length, 1);
  assert.equal(weatherOnly[0].id, 'goto:weather');
  const many = [];
  for (let i = 0; i < 12; i += 1) {
    many.push({ id: 'goto:extra' + i, kind: 'goto', target: 'extra' + i, label: 'Go to extra ' + i });
  }
  assert.equal(bar.filterCommands(many, 'extra').length, bar.MAX_RESULTS);
  assert.equal(bar.filterCommands(commands, 'zzznope').length, 0);
});

test('filterCommands folds diacritics so cafe matches a cafe label', () => {
  const cafe = { id: 'goto:cafe-notes', kind: 'goto', target: 'cafe-notes', label: 'Go to Cafe notes' };
  const cane = { id: 'goto:cane-sugar', kind: 'goto', target: 'cane-sugar', label: 'Go to Cane sugar' };
  assert.deepEqual(bar.filterCommands([cane, cafe], 'cafe').map((c) => c.id), ['goto:cafe-notes']);
});

test('resolveForRun returns empty, ok, exact and ambiguous verdicts', () => {
  const commands = bar.buildCommands();
  assert.equal(bar.resolveForRun(commands, 'zzznope').status, 'empty');
  assert.equal(bar.resolveForRun(commands, 'goto weather').status, 'ok');
  assert.equal(bar.resolveForRun(commands, 'goto weather').command.id, 'goto:weather');
  assert.equal(bar.resolveForRun(commands, 'go to weather').status, 'ok');
  assert.equal(bar.resolveForRun(commands, '').status, 'empty');
});
