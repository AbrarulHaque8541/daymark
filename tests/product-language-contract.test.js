'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const webhookUi = fs.readFileSync(path.join(root, 'webhook-ui.js'), 'utf8');
const focusTimerDocs = fs.readFileSync(path.join(root, 'docs', 'WEB_FOCUS_TIMER.md'), 'utf8');
const productWideFirstLanguage = /\b(?:local|offline|private)[\s-]+first\b/i;

test('maintained webhook copy describes direct HTTPS delivery and bounded retry', () => {
  assert.match(webhookUi, /HTTPS webhook delivery card/);
  assert.match(webhookUi, /tasks send a minimal JSON event directly to it/);
  assert.match(webhookUi, /bounded[\s\S]*explicit Retry/);
  assert.doesNotMatch(webhookUi, productWideFirstLanguage);
});

test('maintained web Focus docs describe a page-local implementation, not a product-wide policy', () => {
  assert.match(focusTimerDocs, /page-local Pomodoro-style focus timer/);
  assert.match(focusTimerDocs, /Timer sessions run in the page/);
  assert.doesNotMatch(focusTimerDocs, productWideFirstLanguage);
});
