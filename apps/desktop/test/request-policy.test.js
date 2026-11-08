'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedRequest, isTrackerRequest } = require('../lib/request-policy');

const appUiEntry = 'file:///opt/daymark/renderer/index.html';
const appFiles = new Set([
  appUiEntry,
  'file:///opt/daymark/renderer/app.js',
  'file:///opt/daymark/renderer/style.css',
]);

function request(url, resourceType = 'mainFrame') {
  return { url, resourceType };
}

test('HTTPS pages and secure WebSockets remain available', () => {
  assert.equal(isAllowedRequest(request('https://example.com/')), true);
  assert.equal(isAllowedRequest(request('wss://example.com/socket', 'webSocket')), true);
});

test('remote HTTP and WebSockets are blocked while localhost remains available', () => {
  assert.equal(isAllowedRequest(request('http://example.com/')), false);
  assert.equal(isAllowedRequest(request('http://example.com/script.js', 'script')), false);
  assert.equal(isAllowedRequest(request('ws://example.com/socket', 'webSocket')), false);
  assert.equal(isAllowedRequest(request('http://localhost:3000/')), true);
  assert.equal(isAllowedRequest(request('http://127.0.0.1:8080/app.js', 'script')), true);
  assert.equal(isAllowedRequest(request('ws://[::1]:9222/socket', 'webSocket')), true);
  assert.equal(isAllowedRequest(request('http://192.168.1.20/')), false);
});

test('file access is limited to the exact packaged renderer entry and child assets', () => {
  assert.equal(isAllowedRequest(request(appUiEntry), appFiles, appUiEntry), true);
  assert.equal(isAllowedRequest(request('file:///opt/daymark/renderer/app.js', 'script'), appFiles, appUiEntry), true);
  assert.equal(isAllowedRequest(request('file:///opt/daymark/renderer/style.css', 'stylesheet'), appFiles, appUiEntry), true);
  assert.equal(isAllowedRequest(request('file:///opt/daymark/renderer/app.js'), appFiles, appUiEntry), false);
  assert.equal(isAllowedRequest(request('file:///opt/daymark/renderer/style.css'), appFiles, appUiEntry), false);
  assert.equal(isAllowedRequest(request('file:///etc/passwd'), appFiles, appUiEntry), false);
  assert.equal(isAllowedRequest(request('file:///opt/daymark/renderer/../main.js'), appFiles, appUiEntry), false);
  assert.equal(isAllowedRequest(request(appUiEntry + '?x=1'), appFiles, appUiEntry), false);
});

test('data and blob URLs are limited to subresources, and about blank is limited to child frames', () => {
  assert.equal(isAllowedRequest(request('data:image/png;base64,AA==', 'image')), true);
  assert.equal(isAllowedRequest(request('blob:https://example.com/id', 'media')), true);
  assert.equal(isAllowedRequest(request('data:text/html,hello')), false);
  assert.equal(isAllowedRequest(request('blob:https://example.com/id')), false);
  assert.equal(isAllowedRequest(request('about:blank', 'subFrame')), true);
  assert.equal(isAllowedRequest(request('about:blank')), false);
  assert.equal(isAllowedRequest(request('about:srcdoc', 'subFrame')), true);
});

test('unknown, malformed, and privileged schemes fail closed', () => {
  for (const url of ['not a url', 'javascript:alert(1)', 'chrome://settings', 'devtools://devtools', 'ftp://example.com/file']) {
    assert.equal(isAllowedRequest(request(url), appFiles, appUiEntry), false, url);
  }
  assert.equal(isAllowedRequest(null, appFiles, appUiEntry), false);
  assert.equal(isAllowedRequest({ resourceType: 'script' }, appFiles, appUiEntry), false);
  assert.equal(isAllowedRequest(request('data:image/png;base64,AA==', undefined)), false);
});

test('tracker requests are blocked only for subresources', () => {
  assert.equal(isTrackerRequest(request('https://ads.doubleclick.net/a.js', 'script')), true);
  assert.equal(isTrackerRequest(request('https://ads.doubleclick.net/')), false);
  assert.equal(isTrackerRequest(request('https://example.com/')), false);
});
