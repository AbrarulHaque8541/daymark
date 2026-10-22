'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { installWebviewPopupPolicy } = require('../lib/webview-popup-policy');

test('window.open from each attached webview is routed to a tab and denied as a popup', () => {
  const hostWebContents = new EventEmitter();
  const requestedUrls = [];
  const windowOpenHandlers = [];
  const guestWebContents = () => ({
    setWindowOpenHandler(handler) {
      windowOpenHandlers.push(handler);
    },
  });

  installWebviewPopupPolicy(hostWebContents, (url) => requestedUrls.push(url));

  hostWebContents.emit('did-attach-webview', {}, guestWebContents());
  hostWebContents.emit('did-attach-webview', {}, guestWebContents());
  assert.equal(windowOpenHandlers.length, 2);

  const firstUrl = 'https://example.com/first';
  const secondUrl = 'https://example.org/second';
  assert.deepEqual(windowOpenHandlers[0]({ url: firstUrl }), { action: 'deny' });
  assert.deepEqual(windowOpenHandlers[1]({ url: secondUrl }), { action: 'deny' });
  assert.deepEqual(requestedUrls, [firstUrl, secondUrl]);
});

test('each new browser window installs popup routing before loading its UI', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
    .replace(/\r\n?/g, '\n');
  const start = source.indexOf('function createMainWindow() {');
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(start, -1, 'createMainWindow should exist');
  assert.notEqual(end, -1, 'createMainWindow should have a closing brace');

  const createMainWindowSource = source.slice(start, end);
  const installIndex = createMainWindowSource.indexOf('installWebviewPopupPolicy(');
  const loadIndex = createMainWindowSource.indexOf('mainWindow.loadFile(');
  assert.ok(installIndex >= 0, 'popup policy should be installed for each BrowserWindow');
  assert.ok(loadIndex > installIndex, 'popup policy must be installed before loading the UI');
});
