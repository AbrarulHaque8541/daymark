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
  item.receivedBytes = 0;
  item.totalBytes = 0;
  item.getReceivedBytes = () => item.receivedBytes;
  item.getTotalBytes = () => item.totalBytes;
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
  const calls = { created: [], published: [], cleaned: [], failed: [], failureDetails: [], completed: [], cancelled: [], progress: [], cleanupErrors: [], order: [] };
  return {
    calls,
    createStagingPath(finalPath) {
      if (options.createThrows) throw new Error('staging allocation failed');
      const staged = path.join(downloads, '.daymark-download-test-' + (++sequence), path.basename(finalPath));
      calls.created.push(staged);
      return staged;
    },
    publishFile(staged, finalPath) {
      if (options.beforePublish) options.beforePublish();
      calls.order.push('publish');
      calls.published.push({ staged, finalPath });
      if (options.publishThrows) throw new Error('atomic publication failed');
    },
    cleanupStaging(staged) {
      calls.order.push('cleanup');
      calls.cleaned.push(staged);
      if (options.cleanupThrows) throw new Error('staging cleanup failed');
    },
    onProgress(filename, percent) { calls.progress.push({ filename, percent }); },
    onFailed(filename, details) {
      calls.order.push('failed');
      calls.failed.push(filename);
      calls.failureDetails.push(details ?? null);
    },
    onCompleted(filename) { calls.order.push('completed'); calls.completed.push(filename); },
    onCancelled(filename) { calls.order.push('cancelled'); calls.cancelled.push(filename); },
    onCleanupError() { calls.order.push('cleanup-error'); calls.cleanupErrors.push(true); },
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
  assert.deepEqual(staging.calls.completed, [result.filename]);
  assert.deepEqual(staging.calls.cancelled, []);
  assert.deepEqual(staging.calls.failed, []);
  assert.deepEqual(staging.calls.order, ['publish', 'cleanup', 'completed']);
  assert.equal(reservedPaths.size, 0);
});

test('download progress is URL-free, bounded and announced at accessible ten-point intervals', async () => {
  const item = makeItem('../../report.txt');
  const reservedPaths = new Set();
  const staging = makeStaging({
    beforePublish() {
      assert.equal(item.listenerCount('updated'), 0,
        'the progress listener is removed as soon as the terminal done event arrives');
    },
  });
  const result = handleWillDownload({
    event: {},
    item,
    downloadDirectory: downloads,
    exists: () => false,
    reservedPaths,
    ...staging,
  });
  assert.equal(result.ok, true);
  assert.equal(result.filename.includes('/'), false);
  assert.equal(result.filename.includes('\\'), false);
  item.totalBytes = 200;
  item.receivedBytes = 50;
  item.emit('updated');
  item.receivedBytes = 51;
  item.emit('updated');
  item.receivedBytes = 68;
  item.emit('updated');
  item.receivedBytes = 70;
  item.emit('updated');
  item.receivedBytes = 200;
  item.emit('updated');
  item.receivedBytes = 300;
  item.emit('updated');
  item.totalBytes = 0;
  item.emit('updated');
  assert.deepEqual(staging.calls.progress, [
    { filename: result.filename, percent: 25 },
    { filename: result.filename, percent: 35 },
    { filename: result.filename, percent: 100 },
  ]);
  item.emit('done', null, 'completed');
  await flushDone();
  assert.equal(item.listenerCount('updated'), 0);
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
  assert.deepEqual(staging.calls.failed, ['report.txt']);
  assert.deepEqual(staging.calls.failureDetails, [{ preflight: true, cancellationConfirmed: true }]);
  assert.deepEqual(staging.calls.cancelled, []);
  assert.deepEqual(staging.calls.order, ['cleanup', 'failed']);
  assert.equal(reservedPaths.size, 0);
});

test('preflight cleanup failure is reported while the unsafe download is failed', () => {
  const item = makeItem('report.txt', { setSavePathThrows: true });
  const reservedPaths = new Set();
  const staging = makeStaging({ cleanupThrows: true });
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
  assert.deepEqual(staging.calls.cleanupErrors, [true]);
  assert.deepEqual(staging.calls.failed, ['report.txt']);
  assert.deepEqual(staging.calls.failureDetails, [{ preflight: true, cancellationConfirmed: true }]);
  assert.deepEqual(staging.calls.cancelled, []);
  assert.deepEqual(staging.calls.order, ['cleanup', 'cleanup-error', 'failed']);
  assert.equal(reservedPaths.size, 0);
});

test('preflight failure reports a sanitized filename even when cancellation cannot be confirmed', () => {
  const item = makeItem('../secret.txt', { setSavePathThrows: true, cancelThrows: true });
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
  assert.equal(result.cancelled, false);
  assert.equal(result.filename, '_secret.txt');
  assert.deepEqual(staging.calls.failed, ['_secret.txt']);
  assert.deepEqual(staging.calls.failureDetails, [{ preflight: true, cancellationConfirmed: false }]);
  assert.deepEqual(staging.calls.cancelled, []);
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
    onProgress() { throw new Error('renderer closed'); },
    onCompleted(filename) {
      staging.calls.completed.push(filename);
      throw new Error('renderer closed');
    },
  });

  assert.equal(result.ok, true);
  assert.equal(prevented, false);
  assert.equal(item.cancelled, undefined);
  item.totalBytes = 100;
  item.receivedBytes = 50;
  item.emit('updated');
  item.emit('done', null, 'completed');
  await flushDone();
  assert.equal(staging.calls.published.length, 1);
  assert.equal(staging.calls.cleaned.length, 1);
  assert.deepEqual(staging.calls.completed, [result.filename]);
  assert.deepEqual(staging.calls.failed, []);
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
  assert.deepEqual(staging.calls.failed, ['report.txt']);
  assert.deepEqual(staging.calls.cancelled, []);
  assert.deepEqual(staging.calls.order, ['failed']);
  assert.equal(reservedPaths.size, 0);
});

test('cancelled and interrupted downloads are never published and report their final state', async () => {
  for (const state of ['cancelled', 'interrupted']) {
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
    item.emit('done', null, state);
    await flushDone();
    assert.equal(staging.calls.published.length, 0);
    assert.deepEqual(staging.calls.cleaned, [result.stagingPath]);
    assert.deepEqual(staging.calls.completed, []);
    if (state === 'cancelled') {
      assert.deepEqual(staging.calls.cancelled, [result.filename]);
      assert.deepEqual(staging.calls.failed, []);
      assert.deepEqual(staging.calls.order, ['cleanup', 'cancelled']);
    } else {
      assert.deepEqual(staging.calls.cancelled, []);
      assert.deepEqual(staging.calls.failed, [result.filename]);
      assert.deepEqual(staging.calls.order, ['cleanup', 'failed']);
    }
    assert.equal(reservedPaths.size, 0);
  }
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
  assert.deepEqual(staging.calls.completed, []);
  assert.deepEqual(staging.calls.cancelled, []);
  assert.deepEqual(staging.calls.cleaned, [result.stagingPath]);
  assert.deepEqual(staging.calls.order, ['publish', 'cleanup', 'failed']);
  assert.equal(reservedPaths.size, 0);
});

test('cleanup failure does not hide an already-published download completion', async () => {
  const item = makeItem('report.txt');
  const reservedPaths = new Set();
  const staging = makeStaging({ cleanupThrows: true });
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
  assert.deepEqual(staging.calls.published, [{ staged: result.stagingPath, finalPath: result.path }]);
  assert.deepEqual(staging.calls.completed, [result.filename]);
  assert.deepEqual(staging.calls.failed, []);
  assert.deepEqual(staging.calls.cleanupErrors, [true]);
  assert.deepEqual(staging.calls.order, ['publish', 'cleanup', 'cleanup-error', 'completed']);
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
  assert.deepEqual(staging.calls.failed, ['report.txt']);
  assert.deepEqual(staging.calls.cancelled, []);
  assert.deepEqual(staging.calls.order, ['failed']);
  assert.equal(reservedPaths.size, 0);
});
