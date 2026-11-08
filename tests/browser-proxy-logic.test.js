'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../browser-proxy-logic.js');

test('a bare host:port parses as an HTTP proxy with that port', () => {
  const parsed = engine.parseProxyAddress('proxy.example.org:8080');
  assert.equal(parsed.scheme, 'http');
  assert.equal(parsed.host, 'proxy.example.org');
  assert.equal(parsed.port, 8080);
  assert.equal(parsed.explicitPort, true);
  assert.equal(parsed.credentialsStripped, false);
});

test('schemes are honoured and normalized, and IPv6 must be bracketed', () => {
  assert.equal(engine.parseProxyAddress('SOCKS5://Gate.example.net:9050').scheme, 'socks5');
  assert.equal(engine.parseProxyAddress('https://proxy.example.org:8443').scheme, 'https');
  assert.equal(engine.parseProxyAddress('socks5h://proxy.example.org').scheme, 'socks5h');
  const v6 = engine.parseProxyAddress('socks5://[2001:db8::1]:1080');
  assert.equal(v6.host, '[2001:db8::1]');
  assert.equal(v6.port, 1080);
  // An unbracketed IPv6 literal with a port is ambiguous and fails closed.
  assert.equal(engine.parseProxyAddress('socks5://2001:db8::1:1080'), null);
});

test('credentials in the address are stripped and disclosed, never echoed', () => {
  const parsed = engine.parseProxyAddress('http://alice:secret@proxy.example.org:3128');
  assert.equal(parsed.credentialsStripped, true);
  assert.equal(parsed.host, 'proxy.example.org');
  assert.equal(parsed.port, 3128);
  const plan = engine.planProfile('http://alice:secret@proxy.example.org:3128');
  assert.equal(plan.ok, true);
  assert.equal(plan.credentialsStripped, true);
  const echoed = plan.lines.join('\n') + plan.summary;
  assert.ok(!echoed.includes('alice'));
  assert.ok(!echoed.includes('secret'));
  assert.ok(plan.notices.some((n) => /removed/.test(n)));
});

test('missing port uses the documented default for the scheme and says so', () => {
  const plan = engine.planProfile('socks5://proxy.example.org');
  assert.equal(plan.ok, true);
  assert.equal(plan.port, 1080);
  assert.match(plan.lines[0], /proxy\.example\.org:1080/);
  assert.ok(plan.notices.some((n) => /No port was given/.test(n)));
  const httpPlan = engine.planProfile('proxy.example.org');
  assert.equal(httpPlan.port, 8080);
});

test('a plan is honest about privacy: visible hosts, no anonymity, no Tor claims', () => {
  const plan = engine.planProfile('proxy.example.org:8080');
  assert.equal(plan.ok, true);
  const text = plan.lines.join('\n');
  assert.match(text, /which hosts you visit/);
  assert.match(text, /Not Tor/);
  assert.match(text, /No anonymity is promised/);
  assert.match(text, /never silently falls back/);
  assert.match(text, /off until you turn it on/);
  assert.doesNotMatch(text, /Tor integration/);
});

test('the plan states the real WebView limitation instead of promising a toggle', () => {
  const plan = engine.planProfile('proxy.example.org:8080');
  const text = plan.lines.join('\n');
  assert.match(text, /no public per-app proxy API/);
  assert.match(text, /local VPN service/);
  assert.match(text, /owner decision/);
});

test('malformed addresses fail closed to not-checkable, never to a guess', () => {
  for (const bad of ['', '   ', 'not a proxy', 'ftp://proxy.example.org:21',
    'proxy.example.org:notaport', 'proxy.example.org:99999',
    'http://pro xy.example.org:80', 'http://,example.org:80',
    'http://']) {
    assert.equal(engine.parseProxyAddress(bad), null, 'input must fail closed: ' + JSON.stringify(bad));
    const plan = engine.planProfile(bad);
    assert.equal(plan.ok, false);
    assert.match(plan.summary, /could not be checked/);
  }
});

test('control characters and bidi overrides are rejected outright', () => {
  assert.equal(engine.parseProxyAddress('proxy.example.org\u0000:8080'), null);
  assert.equal(engine.parseProxyAddress('proxy.example\u202e.org:8080'), null);
});

test('reserved ports and loopback hosts produce honest cautions', () => {
  const reserved = engine.planProfile('proxy.example.org:80');
  assert.ok(reserved.notices.some((n) => /reserved/.test(n)));
  const loopback = engine.planProfile('127.0.0.1:8118');
  assert.ok(loopback.notices.some((n) => /loopback/.test(n)));
  assert.equal(loopback.ok, true);
  const v6Loop = engine.planProfile('[::1]:8118');
  assert.ok(v6Loop.notices.some((n) => /loopback/.test(n)));
});

test('IPv4 literals are range-checked', () => {
  assert.equal(engine.parseProxyAddress('10.0.0.1:8080').host, '10.0.0.1');
  assert.equal(engine.parseProxyAddress('10.0.0.256:8080'), null);
  assert.equal(engine.parseProxyAddress('999.0.0.1:8080'), null);
});

test('host validation rejects legacy IPv4 aliases and malformed DNS authorities', () => {
  const invalid = [
    '010.0.0.1:8080',
    '001.002.003.004:8080',
    '0.00.0.0:8080',
    '127.1:8080',
    '0x7f000001:8080',
    '2130706433:8080',
    'foo..bar:8080',
    '-foo.example:8080',
    'foo-.example:8080',
    'foo_bar.example:8080',
    'proxy.example.org?x:8080',
    'proxy.example.org#x:8080',
    'proxy.example.org\\evil:8080',
    'proxy.example.org:'
  ];
  for (const input of invalid) {
    assert.equal(engine.parseProxyAddress(input), null, 'non-canonical host must fail closed: ' + input);
  }
  assert.equal(engine.parseProxyAddress('10.0.0.1:8080').host, '10.0.0.1');
  assert.equal(engine.parseProxyAddress('münich.example:8080'), null, 'non-ASCII hostnames remain fail-closed until explicit IDN support is added');
  assert.equal(engine.parseProxyAddress('example.123:8080'), null);
  assert.equal(engine.parseProxyAddress('proxy.example.org.:8080').host, 'proxy.example.org.');
});

test('IPv6 is parsed as an address and normalized before it is planned', () => {
  assert.equal(engine.parseProxyAddress('[0:0:0:0:0:0:0:1]:8080').host, '[::1]');
  for (const input of ['[:::]:8080', '[1:2:3]:8080', '[2001:db8::1]tail:8080']) {
    assert.equal(engine.parseProxyAddress(input), null, 'invalid IPv6 authority must fail closed: ' + input);
  }
});

test('userinfo requires a scheme and is never accepted as a bare authority', () => {
  assert.equal(engine.parseProxyAddress('alice@proxy.example.org:8080'), null);
  assert.equal(engine.parseProxyAddress('http://@proxy.example.org:8080'), null);
  assert.equal(engine.parseProxyAddress('http://alice@bob@proxy.example.org:8080'), null);
});

test('all IPv4 loopback addresses and localhost subdomains produce a caution', () => {
  for (const input of ['127.0.0.1:8080', '127.42.1.2:8080', '[0:0:0:0:0:0:0:1]:8080',
    'api.localhost:8080', 'localhost.:8080']) {
    const plan = engine.planProfile(input);
    assert.equal(plan.ok, true, input);
    assert.ok(plan.notices.some((notice) => /loopback/.test(notice)), input);
  }
});

test('socks5 plans disclose local DNS and the socks5h alternative', () => {
  const plan = engine.planProfile('socks5://proxy.example.org:1080');
  assert.match(plan.lines.join('\n'), /resolved on this device first/);
  assert.ok(plan.notices.some((n) => /socks5h/.test(n)));
  const remote = engine.planProfile('socks5h://proxy.example.org:1080');
  assert.match(remote.lines.join('\n'), /sent to the proxy to resolve/);
});

test('https proxy plans disclose the TLS-to-proxy meaning', () => {
  const plan = engine.planProfile('https://proxy.example.org:8443');
  assert.ok(plan.notices.some((n) => /connection to the proxy is encrypted/.test(n)));
});

test('webviewProxyFacts returns the research findings and stays stable', () => {
  const facts = engine.webviewProxyFacts();
  assert.equal(facts.length, 5);
  assert.match(facts[0], /no public per-app proxy API/);
  assert.match(facts[2], /does not prompt for proxy authentication/);
  assert.match(facts[4], /not Tor/);
});

test('non-string and oversize inputs fail closed without throwing', () => {
  assert.equal(engine.parseProxyAddress(null), null);
  assert.equal(engine.parseProxyAddress(42), null);
  assert.equal(engine.parseProxyAddress({ host: 'x' }), null);
  assert.equal(engine.parseProxyAddress('proxy.example.org:8080'.padEnd(600, 'a')), null);
  assert.equal(engine.planProfile(undefined).ok, false);
});

test('IPv4-mapped IPv6 loopback addresses produce a caution', () => {
  for (const input of [
    '[::ffff:127.0.0.1]:8080',
    '[::ffff:7f00:1]:8080',
    '[0:0:0:0:0:ffff:7f00:1]:8080',
    '[::ffff:7fff:ffff]:8080'
  ]) {
    const plan = engine.planProfile(input);
    assert.equal(plan.ok, true, input);
    assert.ok(plan.notices.some((notice) => /loopback/.test(notice)), input);
  }
  const publicMapped = engine.planProfile('[::ffff:c000:201]:8080');
  assert.equal(publicMapped.ok, true);
  assert.equal(publicMapped.notices.some((notice) => /loopback/.test(notice)), false);
});
