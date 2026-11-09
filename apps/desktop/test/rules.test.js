'use strict';

const test = require('node:test');
const assert = require('node:assert');
const rules = require('../lib/rules');

test('https URLs are allowed', () => {
  assert.equal(rules.isAllowedUrl('https://example.com'), true);
  assert.equal(rules.isHttps('https://example.com'), true);
});

test('plain http is blocked by HTTPS-only policy', () => {
  assert.equal(rules.isAllowedUrl('http://example.com'), false);
  assert.equal(rules.isHttps('http://example.com'), false);
});

test('plain http is allowed for localhost only', () => {
  assert.equal(rules.isAllowedUrl('http://localhost:3000/'), true);
  assert.equal(rules.isAllowedUrl('http://127.0.0.1:8080/'), true);
  assert.equal(rules.isAllowedUrl('http://192.168.1.5/'), false);
});

test('garbage input is not allowed', () => {
  assert.equal(rules.isAllowedUrl('not a url at all'), false);
  assert.equal(rules.isAllowedUrl(''), false);
});

test('typed addresses are upgraded to https', () => {
  assert.equal(rules.httpsUpgradeUrl('example.com'), 'https://example.com/');
  assert.equal(rules.httpsUpgradeUrl('example.com/page'), 'https://example.com/page');
});

test('explicit http is upgraded to https for remote hosts', () => {
  assert.equal(
    rules.httpsUpgradeUrl('http://neverssl.com'),
    'https://neverssl.com/',
  );
});

test('explicit http is kept for localhost', () => {
  assert.equal(
    rules.httpsUpgradeUrl('http://localhost:3000/dev'),
    'http://localhost:3000/dev',
  );
});

test('garbage input throws for a clear UI error', () => {
  assert.throws(() => rules.httpsUpgradeUrl('https://[')); // unbalanced IPv6 bracket
  assert.throws(() => rules.httpsUpgradeUrl('http://:::not-a-host'));
  assert.equal(rules.httpsUpgradeUrl('   '), null);
});

test('known tracker domains are blocked, normal sites are not', () => {
  assert.equal(rules.isTrackerUrl('https://ad.doubleclick.net/x'), true);
  assert.equal(rules.isTrackerUrl('https://googleads.g.doubleclick.net/x'), true);
  assert.equal(rules.isTrackerUrl('https://www.googlesyndication.com/a'), true);
  assert.equal(rules.isTrackerUrl('https://example.com'), false);
  assert.equal(rules.isTrackerUrl('https://notdoubleclick.net.evil.com'), false);
});

test('tracker suffix does not match lookalike sibling domains', () => {
  // evildoubleclick.net must not be caught by a naive contains() check
  assert.equal(rules.isTrackerUrl('https://evildoubleclick.net'), false);
});

test('IPv6 loopback is preserved as a local HTTP exception', () => {
  assert.equal(rules.isAllowedUrl('http://[::1]:3000/'), true);
  assert.equal(rules.isAllowedInsecure('[::1]'), true);
  assert.equal(rules.isAllowedUrl('http://[::2]:3000/'), false);
  assert.equal(rules.httpsUpgradeUrl('http://[::1]:3000/dev'), 'http://[::1]:3000/dev');
});


test('credential-bearing URLs are rejected before navigation admission', () => {
  const urls = [
    'https://alice:secret@example.com/path',
    'https://alice@example.com/path',
    'https://:secret@example.com/path',
    'https://alice%3Asecret@example.com/path',
    'https://trusted.example@attacker.example/path',
    'http://alice:secret@localhost:3000/dev',
  ];
  for (const url of urls) assert.equal(rules.isAllowedUrl(url), false, url);
});

test('top-level navigation admits only HTTPS and the localhost HTTP exception', () => {
  for (const url of [
    'ftp://localhost/file',
    'ws://localhost/socket',
    'wss://localhost/socket',
    'file://localhost/etc/passwd',
  ]) assert.equal(rules.isAllowedUrl(url), false, url);
  assert.equal(rules.isAllowedUrl('http://localhost:3000/dev'), true);
  assert.equal(rules.isAllowedUrl('https://example.com/path'), true);
});

test('address entry rejects credentials and unsupported schemes', () => {
  for (const url of [
    'https://alice:secret@example.com/path',
    'https://alice@example.com/path',
    'https://:secret@example.com/path',
    'https://alice%3Asecret@example.com/path',
    'http://alice:secret@localhost:3000/dev',
    'ftp://localhost/file',
    'ws://localhost/socket',
    'file:///etc/passwd',
  ]) assert.throws(() => rules.httpsUpgradeUrl(url), /invalid-address/, url);
});
