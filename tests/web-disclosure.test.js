'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('web prototype metadata does not claim encrypted on-device storage', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.doesNotMatch(html, /encrypted on-device storage/);
  assert.doesNotMatch(pkg.description || '', /encrypted on-device storage/);
  assert.match(html, /id="storage-disclosure"/);
  assert.match(html, /prototype does not encrypt browser storage/);
  assert.match(html, /aria-describedby="storage-disclosure"/);
  assert.match(html, /Task and Focus session data/);
});

test('maintained source avoids offline-first / local-first product claims', () => {
  const webhook = fs.readFileSync(path.join(root, 'webhook-ui.js'), 'utf8');
  const focusDoc = fs.readFileSync(path.join(root, 'docs/WEB_FOCUS_TIMER.md'), 'utf8');
  assert.doesNotMatch(webhook, /offline-first/);
  assert.doesNotMatch(focusDoc, /local-first/);
  assert.match(webhook, /network-delivery/);
  assert.match(focusDoc, /page-local/);
});
