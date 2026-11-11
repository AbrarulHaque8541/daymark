'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../../..');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'desktop-browser-ci.yml');
const packagePath = path.join(repositoryRoot, 'apps', 'desktop', 'package.json');
const lockPath = path.join(repositoryRoot, 'apps', 'desktop', 'package-lock.json');

test('desktop CI installs the committed npm lockfile before the cross-platform test suite', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

  assert.ok(workflow.includes('uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0'));
  assert.ok(workflow.includes('uses: actions/setup-node@2028fbc5c25fe9cf00d9f06a71cc4710d4507903 # v6.0.0'));
  assert.ok(workflow.includes("node-version: '20'"),
    'Electron unit tests continue to use the supported Node 20 application runtime');
  assert.ok(workflow.includes('os: [ubuntu-latest, windows-latest, macos-latest]'));

  assert.equal(lock.lockfileVersion, 3, 'the desktop lockfile must use npm lockfile v3');
  assert.equal(lock.packages?.['']?.devDependencies?.electron, manifest.devDependencies.electron,
    'the lockfile root must match the declared Electron dependency range');
  const electron = lock.packages?.['node_modules/electron'];
  assert.ok(electron && typeof electron.version === 'string'
      && electron.version.split('.').length === 3
      && electron.version.split('.').every(part => Number.isInteger(Number(part))),
    'the lockfile must resolve Electron to an exact semantic version');
  assert.ok(electron.integrity?.startsWith('sha512-')
      && electron.resolved?.startsWith('https://registry.npmjs.org/electron/-/electron-'),
    'the Electron tarball must have a registry URL and integrity hash');
  assert.ok(lock.packages?.['node_modules/@electron/get'],
    'the Electron binary downloader dependency must be locked');
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (entry.resolved?.startsWith('https://registry.npmjs.org/')) {
      assert.ok(entry.integrity, 'registry package ' + name + ' must have an integrity hash');
    }
  }

  const install = workflow.indexOf('npm ci --no-audit --no-fund');
  const stable = workflow.indexOf('git diff --exit-code -- package-lock.json');
  const tests = workflow.indexOf('npm test');
  assert.ok(install >= 0 && stable > install && tests > stable,
    'CI must install from the lockfile, verify it is unchanged, then run tests');
  assert.ok(!workflow.includes('npm install --no-audit --no-fund'),
    'CI must not silently resolve a new dependency tree');
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
