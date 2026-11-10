'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const {
  MAX_FILENAME_BYTES,
  sanitizeDownloadFilename,
  reservationKey,
  createDownloadPath,
} = require('../lib/download-policy');

const downloads = path.resolve(path.join(os.tmpdir(), 'daymark-download-policy'));

test('remote path components and both separator styles become one safe filename', () => {
  for (const suggested of [
    '../../outside.txt',
    '..\\..\\outside.txt',
    '/etc/passwd',
    'C:\\Windows\\win.ini',
  ]) {
    const filename = sanitizeDownloadFilename(suggested);
    assert.equal(path.basename(filename), filename, suggested);
    assert.doesNotMatch(filename, /[/\\]/, suggested);
    assert.doesNotMatch(filename, /\.\./, suggested);
  }

  const allocated = createDownloadPath(downloads, '../../outside.txt', () => false, new Set());
  assert.equal(path.dirname(allocated), downloads);
});

test('control characters and bidi formatting cannot alter the saved filename or UI label', () => {
  const filename = sanitizeDownloadFilename('safe\r\nInjected\u202E.txt');
  assert.equal(filename, 'safeInjected.txt');
  assert.doesNotMatch(filename, /[\r\n\u202A-\u202E\u2066-\u2069]/);
});

test('Windows device names and trailing-dot aliases are neutralized', () => {
  assert.equal(sanitizeDownloadFilename('CON.txt'), '_CON.txt');
  assert.equal(sanitizeDownloadFilename('CON .txt'), '_CON .txt');
  assert.equal(sanitizeDownloadFilename('CONIN$.txt'), '_CONIN$.txt');
  assert.equal(sanitizeDownloadFilename('LPT³.csv'), '_LPT³.csv');
  assert.equal(sanitizeDownloadFilename('...'), 'download');
});

test('safe Unicode names remain readable and output is bounded by UTF-8 bytes', () => {
  assert.equal(sanitizeDownloadFilename('नमस्ते.txt'), 'नमस्ते.txt');
  const filename = sanitizeDownloadFilename('😀'.repeat(100) + '.txt');
  assert.ok(Buffer.byteLength(filename, 'utf8') <= MAX_FILENAME_BYTES);
  assert.equal(sanitizeDownloadFilename(null), 'download');
});

test('existing names receive deterministic suffixes without overwriting', () => {
  const existing = new Set([path.join(downloads, 'report.pdf')]);
  const reserved = new Set();
  const exists = (candidate) => existing.has(candidate);

  const first = createDownloadPath(downloads, 'report.pdf', exists, reserved);
  const second = createDownloadPath(downloads, 'report.pdf', exists, reserved);

  assert.equal(path.basename(first), 'report (1).pdf');
  assert.equal(path.basename(second), 'report (2).pdf');
  assert.equal(path.dirname(first), downloads);
  assert.equal(path.dirname(second), downloads);
  assert.ok(reserved.has(reservationKey(first)));
  assert.ok(reserved.has(reservationKey(second)));
});

test('reservations prevent simultaneous duplicate destinations', () => {
  const reserved = new Set();
  const exists = () => false;
  const first = createDownloadPath(downloads, 'Report.pdf', exists, reserved);
  const second = createDownloadPath(downloads, 'Report.pdf', exists, reserved);
  assert.notEqual(first, second);
  assert.equal(path.basename(second), 'Report (1).pdf');
});

test('allocation failures are fail-closed and never return a default path', () => {
  assert.throws(() => createDownloadPath(downloads, 'report.pdf', () => true, new Set()),
    /download-name-space-exhausted/);
  assert.throws(() => createDownloadPath('', 'report.pdf', () => false, new Set()),
    /download-directory-required/);
  assert.throws(() => createDownloadPath(downloads, 'report.pdf', () => false, null),
    /download-reservations-required/);
});

