'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('web prototype does not claim encrypted on-device storage in metadata', () => {
  assert.doesNotMatch(html, /encrypted on-device storage/i);
  assert.match(html, /localStorage/i);
  assert.match(html, /not encrypted by the prototype/i);
});

test('storage card discloses unencrypted browser localStorage for tasks and Focus', () => {
  assert.match(html, /id="storage-disclosure"/);
  assert.match(html, /Task and Focus session data in the web prototype are stored in this browser's localStorage/i);
  assert.match(html, /does not encrypt browser storage/i);
  assert.match(html, /Android app has separate encrypted on-device storage/i);
});
