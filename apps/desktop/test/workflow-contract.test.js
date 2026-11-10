'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../../..');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'desktop-browser-ci.yml');

test('desktop CI pins Node 24 action runtimes and installs Electron dependencies before tests', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /uses: actions\/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7\.0\.0/);
  assert.match(workflow, /uses: actions\/setup-node@2028fbc5c25fe9cf00d9f06a71cc4710d4507903 # v6\.0\.0/);
  assert.match(workflow, /node-version: '20'/,
    'Electron unit tests continue to use the supported Node 20 application runtime');
  assert.match(workflow, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);

  const install = workflow.indexOf('npm install --no-audit --no-fund');
  const tests = workflow.indexOf('npm test');
  assert.ok(install >= 0 && tests > install,
    'desktop dependencies must be installed before the cross-platform unit suite');
});


test('download publication failures reach the renderer through a URL-free IPC contract', () => {
  const Module = require('node:module');
  const preloadPath = path.join(__dirname, '..', 'preload.js');
  const mainPath = path.join(__dirname, '..', 'main.js');
  const rendererPath = path.join(__dirname, '..', 'renderer', 'app.js');
  const originalLoad = Module._load;
  const listeners = new Map();
  let exposedName = null;
  let exposedApi = null;

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return {
        contextBridge: {
          exposeInMainWorld(name, api) {
            exposedName = name;
            exposedApi = api;
          }
        },
        ipcRenderer: {
          on(channel, listener) { listeners.set(channel, listener); },
          removeListener(channel, listener) {
            if (listeners.get(channel) === listener) listeners.delete(channel);
          }
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[preloadPath];
    require(preloadPath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[preloadPath];
  }

  assert.equal(exposedName, 'daymark');
  assert.equal(typeof exposedApi.onDownloadFailed, 'function');
  const received = [];
  const unsubscribe = exposedApi.onDownloadFailed((filename) => received.push(filename));
  const listener = listeners.get('download-failed');
  assert.equal(typeof listener, 'function');
  listener({}, 'report-safe.txt');
  assert.deepEqual(received, ['report-safe.txt']);
  unsubscribe();
  assert.equal(listeners.has('download-failed'), false,
    'the renderer can release its IPC listener');

  const main = fs.readFileSync(mainPath, 'utf8');
  const renderer = fs.readFileSync(rendererPath, 'utf8');
  const failureHandlerStart = main.indexOf('onFailed: (filename) => {');
  const cleanupHandlerStart = main.indexOf('onCleanupError:', failureHandlerStart);
  assert.ok(failureHandlerStart >= 0 && cleanupHandlerStart > failureHandlerStart);
  const failureHandler = main.slice(failureHandlerStart, cleanupHandlerStart);
  assert.ok(failureHandler.includes("webContents.send('download-failed', filename)"),
    'main forwards only the sanitized basename on the dedicated failure channel');
  assert.ok(!/url/i.test(failureHandler),
    'failure IPC must not include a remote URL');
  assert.ok(renderer.includes('window.daymark.onDownloadFailed((name) => {')
      && renderer.includes("toast('Could not safely save ' + safeName + '; no file was published.')"),
    'renderer gives the user a visible, URL-free failure status');
});
