'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const os = require('node:os');
const path = require('node:path');
const { handleWillDownload } = require('../lib/download-handler');
const { reservationKey } = require('../lib/download-policy');

const downloads = path.resolve(path.join(os.tmpdir(), 'daymark-download-handler'));

function makeItem(filename, options = {}) {
  const item = new EventEmitter();
  item.getFilename = () => filename;
  item.setSavePath = (savePath) => {
    if (options.setSavePathThrows) throw new Error('setSavePath failed');
    item.savePath = savePath;
  };
  item.cancel = () => {
    if (options.cancelThrows) throw new Error('cancel failed');
    item.cancelled = true;
  };
  return item;
}

function makeStaging(options = {}) {
  let sequence = 0;
  const calls = { created: [], published: [], cleaned: [], failed: [], cleanupErrors: [] };
  return {
    calls,
    createStagingPath(finalPath) {
      if (options.createThrows) throw new Error('staging allocation failed');
      const staged = path.join(downloads, '.daymark-download-test-' + (++sequence), path.basename(finalPath));
      calls.created.push(staged);
      return staged;
    },
    publishFile(staged, finalPath) {
      calls.published.push({ staged, finalPath });
      if (options.publishThrows) throw new Error('atomic publication failed');
    },
    cleanupStaging(staged) {
      calls.cleaned.push(staged);
      if (options.cleanupThrows) throw new Error('staging cleanup failed');
    },
    onFailed(filename) { calls.failed.push(filename); },
    onCleanupError() { calls.cleanupErrors.push(true); },
  };
}

function flushDone() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('safe destination is staged privately and published only after completion', async () => {
  const item = makeItem('../../report.txt');
  const reservedPaths = new Set();
  const staging = makeStaging();
  const started = [];
  const result = handleWillDownload({
    event: { preventDefault() { assert.fail('safe download must not be cancelled'); } },
    item,
    downloadDirectory: () => downloads,
    exists: () => false,
    reservedPaths,
    ...staging,
    onStarted(filename) { started.push(filename); },
  });

  assert.equal(result.ok, true);
  assert.equal(path.dirname(result.path), downloads);
  assert.equal(item.savePath, result.stagingPath);
  assert.notEqual(item.savePath, result.path);
  assert.deepEqual(started, [result.filename]);
  assert.equal(path.basename(result.path), result.filename);
  assert.ok(reservedPaths.has(reservationKey(result.path)));

  item.emit('done', null, 'completed');
  await flushDone();
  assert.deepEqual(staging.calls.published, [{ staged: result.stagingPath, finalPath: result.path }]);
  assert.deepEqual(staging.calls.cleaned, [result.stagingPath]);
  assert.equal(reservedPaths.size, 0);
});

test('allocation failure prevents the Electron default destination', () => {
  const item = makeItem('report.txt');
  const reservedPaths = new Set();
  const staging = makeStaging();
  let prevented = false;
  const result = handleWillDownload({
    event: { preventDefault() { prevented = true; } },
    item,
    downloadDirectory: downloads,
    exists: () => true,
    reservedPaths,
    ...staging,
  });

  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(prevented, true);
  assert.equal(item.cancelled, undefined);
  assert.equal(item.savePath, undefined);
  assert.equal(staging.calls.created.length, 0);
  assert.equal(reservedPaths.size, 0);
});

test('setSavePath failure cleans staging, releases reservation and falls back to item.cancel', () => {
  const item = makeItem('report.txt', { setSavePathThrows: true });
  const reservedPaths = new Set();
  const staging = makeStaging();
  const result = handleWillDownload({
    event: { preventDefault() { throw new Error('event already invalidated'); } },
    item,
    downloadDirectory: downloads,
    exists: () => false,
    reservedPaths,
    ...staging,
  });

  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(item.cancelled, true);
  assert.equal(staging.calls.created.length, 1);
  assert.deepEqual(staging.calls.cleaned, staging.calls.created);
  assert.equal(reservedPaths.size, 0);
});

test('renderer notification failure does not cancel a staged download', async () => {
  const item = makeItem('report.txt');
  let prevented = false;
  const reservedPaths = new Set();
  const staging = makeStaging();
  const result = handleWillDownload({
    event: { preventDefault() { prevented = true; } },
    item,
    downloadDirectory: downloads,
    exists: () => false,
    reservedPaths,
    ...staging,
    onStarted() { throw new Error('renderer closed'); },
  });

  assert.equal(result.ok, true);
  assert.equal(prevented, false);
  assert.equal(item.cancelled, undefined);
  item.emit('done', null, 'completed');
  await flushDone();
  assert.equal(staging.calls.published.length, 1);
  assert.equal(staging.calls.cleaned.length, 1);
  assert.equal(reservedPaths.size, 0);
});

test('directory lookup failure cancels before creating staging', () => {
  const item = makeItem('report.txt');
  const reservedPaths = new Set();
  const staging = makeStaging();
  const result = handleWillDownload({
    event: {},
    item,
    downloadDirectory() { throw new Error('Downloads directory unavailable'); },
    exists: () => false,
    reservedPaths,
    ...staging,
  });

  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(item.cancelled, true);
  assert.equal(staging.calls.created.length, 0);
  assert.equal(reservedPaths.size, 0);
});

test('cancelled or interrupted downloads are never published', async () => {
  const item = makeItem('report.txt');
  const reservedPaths = new Set();
  const staging = makeStaging();
  const result = handleWillDownload({
    event: {},
    item,
    downloadDirectory: downloads,
    exists: () => false,
    reservedPaths,
    ...staging,
  });
  assert.equal(result.ok, true);
  item.emit('done', null, 'cancelled');
  await flushDone();
  assert.equal(staging.calls.published.length, 0);
  assert.deepEqual(staging.calls.cleaned, [result.stagingPath]);
  assert.equal(reservedPaths.size, 0);
});

test('publication failure is fail-closed, reported and cleaned without retaining reservation', async () => {
  const item = makeItem('report.txt');
  const reservedPaths = new Set();
  const staging = makeStaging({ publishThrows: true });
  const result = handleWillDownload({
    event: {},
    item,
    downloadDirectory: downloads,
    exists: () => false,
    reservedPaths,
    ...staging,
  });
  assert.equal(result.ok, true);
  item.emit('done', null, 'completed');
  await flushDone();
  assert.deepEqual(staging.calls.failed, [result.filename]);
  assert.deepEqual(staging.calls.cleaned, [result.stagingPath]);
  assert.equal(reservedPaths.size, 0);
});

test('staging allocation failure cancels and releases the final-name reservation', () => {
  const item = makeItem('report.txt');
  const reservedPaths = new Set();
  const staging = makeStaging({ createThrows: true });
  let prevented = false;
  const result = handleWillDownload({
    event: { preventDefault() { prevented = true; } },
    item,
    downloadDirectory: downloads,
    exists: () => false,
    reservedPaths,
    ...staging,
  });
  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(prevented, true);
  assert.equal(reservedPaths.size, 0);
});
