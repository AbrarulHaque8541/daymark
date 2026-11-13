'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../url-insights-logic.js');

test('a plain https address parses with its default port', () => {
  const result = engine.parseAddress('https://example.com');
  assert.equal(result.kind, 'web');
  assert.equal(result.scheme, 'https');
  assert.equal(result.host, 'example.com');
  assert.equal(result.hostKind, 'hostname');
  assert.equal(result.port, null);
  assert.equal(result.hasPath, false);
  const plan = engine.explainAddress('https://example.com');
  assert.equal(plan.verdict, 'explained');
  assert.equal(plan.title, 'Reads as a web address');
  assert.ok(plan.lines.some((line) => line.indexOf('the https default (443) applies') !== -1));
});

test('explicit and default ports are distinguished', () => {
  const explicit = engine.parseAddress('https://example.com:8443/path');
  assert.equal(explicit.port, 8443);
  assert.equal(explicit.portIsDefault, false);
  assert.equal(explicit.hasPath, true);
  const plan = engine.explainAddress('https://example.com:8443/path');
  assert.ok(plan.lines.some((line) => line.indexOf('Port · 8443 (explicit)') !== -1));
  const defaulted = engine.parseAddress('http://example.com:80');
  assert.equal(defaulted.port, 80);
  assert.equal(defaulted.portIsDefault, true);
  const plan2 = engine.explainAddress('http://example.com:80');
  assert.ok(plan2.lines.some((line) => line.indexOf('the http default; it can be omitted') !== -1));
});

test('an out-of-range port fails closed', () => {
  const result = engine.parseAddress('https://example.com:70000');
  assert.equal(result.kind, 'malformed');
  assert.ok(result.reason.indexOf('1 and 65535') !== -1);
  const plan = engine.explainAddress('https://example.com:70000');
  assert.equal(plan.verdict, 'refused');
});

test('a bare domain defaults to https and says so', () => {
  const result = engine.parseAddress('example.com');
  assert.equal(result.kind, 'web');
  assert.equal(result.bareDomain, true);
  assert.equal(result.scheme, 'https');
  assert.ok(result.notes[0].indexOf('defaults a bare domain to HTTPS') !== -1);
  const plan = engine.explainAddress('example.com');
  assert.ok(plan.lines.some((line) => line.indexOf('(defaulted; nothing was typed)') !== -1));
});

test('an IPv4 literal is recognised as its own host kind', () => {
  const result = engine.parseAddress('http://192.168.1.10/status');
  assert.equal(result.kind, 'web');
  assert.equal(result.hostKind, 'ipv4');
  assert.equal(result.host, '192.168.1.10');
  assert.ok(result.notes.some((note) => note.indexOf('IPv4 literal') !== -1));
});

test('a shortened numeric host fails closed', () => {
  const result = engine.parseAddress('https://1.2.3/');
  assert.equal(result.kind, 'malformed');
  assert.ok(result.reason.indexOf('four-part IPv4') !== -1);
});

test('bracketed IPv6 with a port parses; broken IPv6 fails closed', () => {
  const good = engine.parseAddress('https://[2001:db8::1]:443/');
  assert.equal(good.kind, 'web');
  assert.equal(good.hostKind, 'ipv6');
  assert.equal(good.host, '2001:db8::1');
  assert.equal(good.port, 443);
  assert.ok(good.notes.some((note) => note.indexOf('IPv6 literal') !== -1));
  const bad = engine.parseAddress('https://[12345::1]/');
  assert.equal(bad.kind, 'malformed');
  const unbracketed = engine.parseAddress('https://2001:db8::1/');
  assert.equal(unbracketed.kind, 'malformed');
});

test('a non-ASCII IDN host warns about look-alike spellings', () => {
  const result = engine.parseAddress('https://münchen.de/');
  assert.equal(result.kind, 'web');
  assert.equal(result.hostKind, 'idn');
  assert.ok(result.notes.some((note) => note.indexOf('look-alike') !== -1));
  assert.ok(result.notes.some((note) => note.indexOf('punycode') !== -1));
});

test('embedded credentials are refused and never echoed', () => {
  const result = engine.parseAddress('https://user:secret@example.com/');
  assert.equal(result.kind, 'web');
  assert.equal(result.credentialsRefused, true);
  const plan = engine.explainAddress('https://user:secret@example.com/');
  assert.ok(plan.lines.some((line) => line.indexOf('refused before navigation') !== -1));
  assert.ok(!JSON.stringify(plan).includes('user:secret'));
});

test('text with spaces reads as a search and keeps the query', () => {
  const result = engine.parseAddress('kerala train schedule');
  assert.equal(result.kind, 'search');
  assert.equal(result.query, 'kerala train schedule');
  const plan = engine.explainAddress('kerala train schedule');
  assert.equal(plan.verdict, 'search');
  assert.equal(plan.title, 'Reads as a search');
  assert.ok(plan.lines.some((line) => line.indexOf('Query kept · kerala train schedule') !== -1));
  assert.ok(plan.lines.some((line) => line.indexOf('nothing is trimmed away') !== -1));
});

test('planSearchHandoff preserves the query across providers', () => {
  const handoff = engine.planSearchHandoff('  kerala train schedule  ');
  assert.equal(handoff.ok, true);
  assert.equal(handoff.query, 'kerala train schedule');
  assert.equal(handoff.preserved, true);
  assert.ok(handoff.note.indexOf('word for word') !== -1);
  const notSearch = engine.planSearchHandoff('https://example.com');
  assert.equal(notSearch.ok, false);
});

test('non-web schemes are refused with a pointer to the app-links card', () => {
  const result = engine.parseAddress('ftp://files.example.com/pub/');
  assert.equal(result.kind, 'malformed');
  assert.ok(result.reason.indexOf('not a web page address') !== -1);
  assert.ok(result.reason.indexOf('App links card') !== -1);
  const plan = engine.explainAddress('ftp://files.example.com/pub/');
  assert.equal(plan.verdict, 'refused');
  assert.equal(plan.title, 'Not a readable address');
});

test('control characters and oversized input fail closed', () => {
  const control = engine.parseAddress('https://example.com/x' + String.fromCharCode(7));
  assert.equal(control.kind, 'malformed');
  const long = 'a'.repeat(engine.MAX_INPUT_CHARS + 1);
  const oversized = engine.parseAddress(long);
  assert.equal(oversized.kind, 'malformed');
  assert.ok(oversized.reason.indexOf('2048') !== -1);
});

test('empty input plans nothing', () => {
  assert.equal(engine.parseAddress('').kind, 'none');
  assert.equal(engine.parseAddress('   ').kind, 'none');
  const plan = engine.explainAddress('');
  assert.equal(plan.title, 'Nothing to explain yet');
});

test('a web address with a space in the path fails closed', () => {
  const result = engine.parseAddress('https://example.com/a b');
  assert.equal(result.kind, 'malformed');
  assert.ok(result.reason.indexOf('cannot contain spaces') !== -1);
});

test('the card never claims anything was fetched or opened', () => {
  const plan = engine.explainAddress('https://example.com');
  assert.ok(plan.network.indexOf('None here.') === 0);
  assert.ok(plan.network.indexOf('nothing is fetched') !== -1);
});
