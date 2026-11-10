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

test('safe destination is set before renderer notification and reservation is released on done', () => {
  const item = makeItem('../../report.txt');
  const reservedPaths = new Set();
  const started = [];
  const result = handleWillDownload({
    event: { preventDefault() { assert.fail('safe download must not be cancelled'); } },
    item,
    downloadDirectory: () => downloads,
    exists: () => false,
    reservedPaths,
    onStarted(filename) { started.push(filename); },
  });

  assert.equal(result.ok, true);
  assert.equal(path.dirname(result.path), downloads);
  assert.equal(item.savePath, result.path);
  assert.deepEqual(started, [result.filename]);
  assert.equal(path.basename(result.path), result.filename);
  assert.ok(reservedPaths.has(reservationKey(result.path)));

  item.emit('done');
  assert.equal(reservedPaths.size, 0);
});

test('allocation failure prevents the Electron default destination', () => {
  const item = makeItem('report.txt');
  const reservedPaths = new Set();
  let prevented = false;
  const result = handleWillDownload({
    event: { preventDefault() { prevented = true; } },
    item,
    downloadDirectory: downloads,
    exists: () => true,
    reservedPaths,
  });

  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(prevented, true);
  assert.equal(item.cancelled, undefined, 'preventDefault is the primary cancellation path');
  assert.equal(item.savePath, undefined);
  assert.equal(reservedPaths.size, 0);
});

test('setSavePath failure releases its reservation and falls back to item.cancel when preventDefault throws', () => {
  const item = makeItem('report.txt', { setSavePathThrows: true });
  const reservedPaths = new Set();
  const result = handleWillDownload({
    event: { preventDefault() { throw new Error('event already invalidated'); } },
    item,
    downloadDirectory: downloads,
    exists: () => false,
    reservedPaths,
  });

  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(item.cancelled, true);
  assert.equal(reservedPaths.size, 0);
});

test('renderer notification failure does not cancel a download with a safe path', () => {
  const item = makeItem('report.txt');
  let prevented = false;
  const reservedPaths = new Set();
  const result = handleWillDownload({
    event: { preventDefault() { prevented = true; } },
    item,
    downloadDirectory: downloads,
    exists: () => false,
    reservedPaths,
    onStarted() { throw new Error('renderer closed'); },
  });

  assert.equal(result.ok, true);
  assert.equal(prevented, false);
  assert.equal(item.cancelled, undefined);
  assert.ok(reservedPaths.has(reservationKey(result.path)));
  item.emit('done');
  assert.equal(reservedPaths.size, 0);
});

test('directory lookup failure uses item cancellation when no event cancellation API exists', () => {
  const item = makeItem('report.txt');
  const reservedPaths = new Set();
  const result = handleWillDownload({
    event: {},
    item,
    downloadDirectory() { throw new Error('Downloads directory unavailable'); },
    exists: () => false,
    reservedPaths,
  });

  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(item.cancelled, true);
  assert.equal(reservedPaths.size, 0);
});
