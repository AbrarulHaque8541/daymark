'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { installWebviewPopupPolicy } = require('../lib/webview-popup-policy');
const { isAllowedUrl } = require('../lib/rules');

test('window.open from each attached webview is routed to a tab and denied as a popup', () => {
  const hostWebContents = new EventEmitter();
  const requestedUrls = [];
  const windowOpenHandlers = [];
  const guestWebContents = () => ({
    setWindowOpenHandler(handler) { windowOpenHandlers.push(handler); },
  });

  installWebviewPopupPolicy(hostWebContents, (url) => requestedUrls.push(url));
  hostWebContents.emit('did-attach-webview', {}, guestWebContents());
  hostWebContents.emit('did-attach-webview', {}, guestWebContents());
  assert.equal(windowOpenHandlers.length, 2);
  assert.deepEqual(windowOpenHandlers[0]({ url: 'https://example.com/first' }), { action: 'deny' });
  assert.deepEqual(windowOpenHandlers[1]({ url: 'https://example.org/second' }), { action: 'deny' });
  assert.deepEqual(requestedUrls, ['https://example.com/first', 'https://example.org/second']);
});

test('webview attachment strips preload/session overrides and forces isolated sandboxed preferences', () => {
  const host = new EventEmitter();
  installWebviewPopupPolicy(host, () => {}, isAllowedUrl);
  const preferences = {
    preload: '/attacker/preload.js', partition: 'persist:attacker',
    nodeIntegration: true, nodeIntegrationInSubFrames: true, nodeIntegrationInWorker: true,
    contextIsolation: false, sandbox: false, webSecurity: false,
    allowRunningInsecureContent: true, plugins: true,
    experimentalFeatures: true, webviewTag: true,
  };
  const params = {
    src: 'https://example.com/', preload: '/attacker/preload.js',
    partition: 'persist:attacker', webpreferences: 'nodeIntegration=yes',
    nodeintegration: '', nodeintegrationinsubframes: '',
    disablewebsecurity: '', allowrunninginsecurecontent: '', plugins: '',
  };
  host.emit('will-attach-webview', {
    preventDefault() { assert.fail('valid HTTPS source was blocked'); },
  }, preferences, params);
  for (const [key, value] of Object.entries({
    nodeIntegration: false, nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false,
    contextIsolation: true, sandbox: true, webSecurity: true,
    allowRunningInsecureContent: false, plugins: false,
    experimentalFeatures: false, webviewTag: false,
  })) assert.equal(preferences[key], value, key);
  assert.equal(Object.hasOwn(preferences, 'preload'), false);
  assert.equal(Object.hasOwn(preferences, 'partition'), false);
  for (const key of ['preload','partition','webpreferences','nodeintegration','nodeintegrationinsubframes','disablewebsecurity','allowrunninginsecurecontent','plugins']) {
    assert.equal(Object.hasOwn(params, key), false, key);
  }
});

test('webview attachment rejects missing and non-web initial URLs', () => {
  for (const params of [{}, {src:'file:///etc/passwd'}, {src:'data:text/html,hi'}, {src:'javascript:alert(1)'}, {src:'http://example.com/'}]) {
    const host = new EventEmitter();
    installWebviewPopupPolicy(host, () => {}, isAllowedUrl);
    let prevented = false;
    host.emit('will-attach-webview', { preventDefault() { prevented = true; } }, {}, params);
    assert.equal(prevented, true, String(params.src || '(missing src)'));
  }
});

test('guest navigation and redirects reject insecure and privileged destinations', () => {
  const host = new EventEmitter();
  const guest = new EventEmitter();
  guest.setWindowOpenHandler = () => {};
  installWebviewPopupPolicy(host, () => {}, isAllowedUrl);
  host.emit('did-attach-webview', {}, guest);
  for (const [eventName, url] of [
    ['will-navigate', 'http://example.com/'],
    ['will-navigate', 'file:///etc/passwd'],
    ['will-redirect', 'data:text/html,redirect'],
  ]) {
    let prevented = false;
    guest.emit(eventName, { preventDefault() { prevented = true; } }, url);
    assert.equal(prevented, true, `${eventName} ${url}`);
  }
  let allowedPrevented = false;
  guest.emit('will-navigate', { preventDefault() { allowedPrevented = true; } }, 'https://example.com/');
  assert.equal(allowedPrevented, false);
});

test('unsafe popup URLs are denied without being forwarded to a new tab', () => {
  const host = new EventEmitter();
  const requested = [];
  const guest = { setWindowOpenHandler(handler) { this.handler = handler; }, on() {} };
  installWebviewPopupPolicy(host, (url) => requested.push(url), isAllowedUrl);
  host.emit('did-attach-webview', {}, guest);
  assert.deepEqual(guest.handler({ url: 'https://example.com/new' }), { action: 'deny' });
  assert.deepEqual(guest.handler({ url: 'file:///etc/passwd' }), { action: 'deny' });
  assert.deepEqual(guest.handler({ url: 'javascript:alert(1)' }), { action: 'deny' });
  assert.deepEqual(requested, ['https://example.com/new']);
});

test('each new browser window installs security before loading its local UI', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8').replace(/\r\n?/g, '\n');
  const start = source.indexOf('function createMainWindow() {');
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(start, -1, 'createMainWindow should exist');
  assert.notEqual(end, -1, 'createMainWindow should have a closing brace');
  const createWindow = source.slice(start, end);
  const policyIndex = createWindow.indexOf('installWebviewPopupPolicy(');
  const loadIndex = createWindow.indexOf('mainWindow.loadFile(');
  assert.ok(policyIndex >= 0);
  assert.ok(loadIndex > policyIndex);
  assert.match(createWindow, /sandbox:\s*true/);
  assert.match(createWindow, /contextIsolation:\s*true/);
  assert.match(createWindow, /nodeIntegration:\s*false/);
  assert.match(source, /isAllowedRequest\(details, appUiFiles, appUiEntry\)/);
  assert.match(source, /pathToFileURL\(/);
});


test('credential-bearing initial, navigation, redirect and popup URLs are rejected', () => {
  const host = new EventEmitter();
  const requested = [];
  const guest = new EventEmitter();
  guest.setWindowOpenHandler = function(handler) { this.handler = handler; };
  installWebviewPopupPolicy(host, (url) => requested.push(url), isAllowedUrl);

  let attachPrevented = false;
  host.emit('will-attach-webview', { preventDefault() { attachPrevented = true; } }, {}, {
    src: 'https://alice:secret@example.com/path',
  });
  assert.equal(attachPrevented, true, 'credential-bearing initial guest URL is rejected');

  host.emit('did-attach-webview', {}, guest);
  const credentialUrls = [
    'https://alice:secret@example.com/path',
    'https://alice@example.com/path',
    'https://:secret@example.com/path',
    'https://alice%3Asecret@example.com/path',
  ];
  for (const url of credentialUrls) {
    let navigationPrevented = false;
    guest.emit('will-navigate', { preventDefault() { navigationPrevented = true; } }, url);
    assert.equal(navigationPrevented, true, 'will-navigate rejects ' + url);

    let redirectPrevented = false;
    guest.emit('will-redirect', { preventDefault() { redirectPrevented = true; } }, url);
    assert.equal(redirectPrevented, true, 'will-redirect rejects ' + url);

    assert.deepEqual(guest.handler({ url }), { action: 'deny' }, 'popup rejects ' + url);
  }
  assert.deepEqual(requested, [], 'credential-bearing URLs never reach tab routing');
});
