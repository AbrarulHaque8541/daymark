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
