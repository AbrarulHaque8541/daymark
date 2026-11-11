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
  assert.ok(workflow.includes("node-version: '24.22.2'"),
    'the desktop CI host runtime must satisfy Electron 45 and its dependency engine requirements');
  assert.equal(manifest.engines.node, '>=22.12.0',
    'the package engine range must match Electron 45 and its downloader dependencies');
  assert.equal(manifest.devDependencies.electron, '^45.3.0',
    'the desktop manifest must stay on the approved supported Electron 45 line');
  assert.equal(manifest.scripts.test.includes('test/electron-runtime.test.js'), true,
    'the desktop suite must launch the installed Electron binary');

  assert.ok(workflow.includes('os: [ubuntu-latest, windows-latest, macos-latest]'));

  assert.equal(lock.lockfileVersion, 3, 'the desktop lockfile must use npm lockfile v3');
  assert.equal(lock.packages?.['']?.devDependencies?.electron, manifest.devDependencies.electron,
    'the lockfile root must match the declared Electron dependency range');
  const electron = lock.packages?.['node_modules/electron'];
  assert.ok(electron && typeof electron.version === 'string'
      && electron.version.split('.').length === 3
      && electron.version.split('.').every(part => Number.isInteger(Number(part))),
    'the lockfile must resolve Electron to an exact semantic version');
  assert.equal(electron.version, '45.3.0',
    'the committed lockfile must resolve the supported Electron patch exactly');
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
  const rendererHtmlPath = path.join(__dirname, '..', 'renderer', 'index.html');
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
  assert.equal(typeof exposedApi.onDownloadProgress, 'function');
  assert.equal(typeof exposedApi.onDownloadFailed, 'function');
  assert.equal(typeof exposedApi.onDownloadCompleted, 'function');
  assert.equal(typeof exposedApi.onDownloadCancelled, 'function');
  const progress = [];
  const unsubscribeProgress = exposedApi.onDownloadProgress((filename, percent) => progress.push({ filename, percent }));
  const progressListener = listeners.get('download-progress');
  assert.equal(typeof progressListener, 'function');
  progressListener({}, { filename: 'report-safe.txt', percent: 55 });
  progressListener({}, { filename: 'report-safe.txt', percent: 101 });
  progressListener({}, { filename: '', percent: 50 });
  assert.deepEqual(progress, [{ filename: 'report-safe.txt', percent: 55 }]);
  unsubscribeProgress();
  assert.equal(listeners.has('download-progress'), false,
    'the renderer can release its progress IPC listener');

  const received = [];
  const unsubscribe = exposedApi.onDownloadFailed((filename) => received.push(filename));
  const listener = listeners.get('download-failed');
  assert.equal(typeof listener, 'function');
  listener({}, 'report-safe.txt');
  assert.deepEqual(received, ['report-safe.txt']);
  unsubscribe();
  assert.equal(listeners.has('download-failed'), false,
    'the renderer can release its IPC listener');

  const completed = [];
  const unsubscribeCompleted = exposedApi.onDownloadCompleted((filename) => completed.push(filename));
  const completedListener = listeners.get('download-completed');
  assert.equal(typeof completedListener, 'function');
  completedListener({}, 'report-safe.txt');
  assert.deepEqual(completed, ['report-safe.txt']);
  unsubscribeCompleted();
  assert.equal(listeners.has('download-completed'), false,
    'the renderer can release its completion IPC listener');

  const cancelled = [];
  const unsubscribeCancelled = exposedApi.onDownloadCancelled((filename) => cancelled.push(filename));
  const cancelledListener = listeners.get('download-cancelled');
  assert.equal(typeof cancelledListener, 'function');
  cancelledListener({}, 'report-safe.txt');
  assert.deepEqual(cancelled, ['report-safe.txt']);
  unsubscribeCancelled();
  assert.equal(listeners.has('download-cancelled'), false,
    'the renderer can release its cancellation IPC listener');

  const main = fs.readFileSync(mainPath, 'utf8');
  const renderer = fs.readFileSync(rendererPath, 'utf8');
  const rendererHtml = fs.readFileSync(rendererHtmlPath, 'utf8');
  const progressHandlerStart = main.indexOf('onProgress: (filename, percent) => {');
  const failureHandlerStart = main.indexOf('onFailed: (filename) => {');
  assert.ok(progressHandlerStart >= 0 && failureHandlerStart > progressHandlerStart);
  const progressHandler = main.slice(progressHandlerStart, failureHandlerStart);
  assert.ok(progressHandler.includes("webContents.send('download-progress', { filename, percent })"));
  assert.ok(!/url/i.test(progressHandler),
    'progress IPC must expose only the sanitized filename and bounded percentage');
  const cleanupHandlerStart = main.indexOf('onCleanupError:', failureHandlerStart);
  assert.ok(failureHandlerStart >= 0 && cleanupHandlerStart > failureHandlerStart);
  const failureHandler = main.slice(failureHandlerStart, cleanupHandlerStart);
  assert.ok(failureHandler.includes("webContents.send('download-failed', filename)"),
    'main forwards only the sanitized basename on the dedicated failure channel');
  assert.ok(!/url/i.test(failureHandler),
    'failure IPC must not include a remote URL');
  const completedHandlerStart = main.indexOf('onCompleted: (filename) => {');
  const cancelledHandlerStart = main.indexOf('onCancelled: (filename) => {');
  assert.ok(completedHandlerStart >= 0 && cancelledHandlerStart > completedHandlerStart);
  const completedHandler = main.slice(completedHandlerStart, cancelledHandlerStart);
  const cancelledHandler = main.slice(cancelledHandlerStart, main.indexOf('onCleanupError:', cancelledHandlerStart));
  assert.ok(completedHandler.includes("webContents.send('download-completed', filename)"));
  assert.ok(cancelledHandler.includes("webContents.send('download-cancelled', filename)"));
  assert.ok(!/url/i.test(completedHandler) && !/url/i.test(cancelledHandler),
    'completion and cancellation IPC must expose only the sanitized filename');
  assert.ok(renderer.includes('window.daymark.onDownloadProgress((name, percent) => {')
      && renderer.includes("toast('Downloading: ' + safeName + progress);"),
    'renderer shows URL-free progress in the existing status toast');
  assert.ok(rendererHtml.includes('id="toast" role="status" aria-live="polite" aria-atomic="true"'),
    'download lifecycle updates are announced through an accessible polite status region');
  assert.ok(renderer.includes('window.daymark.onDownloadFailed((name) => {')
      && renderer.includes("toast('Could not safely save ' + safeName + '; no file was published.')"),
    'renderer gives the user a visible, URL-free failure status');
  assert.ok(renderer.includes('window.daymark.onDownloadCompleted((name) => {')
      && renderer.includes("toast('Saved to Downloads: ' + safeName);"),
    'renderer confirms only a successfully published file');
  assert.ok(renderer.includes('window.daymark.onDownloadCancelled((name) => {')
      && renderer.includes("toast('Download cancelled: ' + safeName);"),
    'renderer distinguishes user cancellation from a failed/interrupted download');
});


test('Electron 45 sandbox and worker integration remains explicitly hardened', () => {
  const mainPath = path.join(repositoryRoot, 'apps', 'desktop', 'main.js');
  const popupPolicyPath = path.join(repositoryRoot, 'apps', 'desktop', 'lib', 'webview-popup-policy.js');
  const preloadPath = path.join(repositoryRoot, 'apps', 'desktop', 'preload.js');
  const main = fs.readFileSync(mainPath, 'utf8');
  const popupPolicy = fs.readFileSync(popupPolicyPath, 'utf8');
  const preload = fs.readFileSync(preloadPath, 'utf8');

  assert.ok(main.includes('nodeIntegrationInWorker: false'),
    'the trusted host renderer must not grant Node integration to workers');
  assert.ok(popupPolicy.includes('webPreferences.nodeIntegrationInWorker = false'),
    'guest webviews must not inherit Node worker integration');
  for (const forbidden of ["require('events')", "require('timers')", "require('url')", 'Buffer', 'setImmediate', 'clearImmediate']) {
    assert.ok(!preload.includes(forbidden), 'sandboxed preload must not use Electron 45 removed dependency: ' + forbidden);
  }
});
