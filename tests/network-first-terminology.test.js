'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('maintained source and docs avoid offline-first / local-first product claims', () => {
  const files = [
    path.join(root, 'webhook-ui.js'),
    path.join(root, 'docs/WEB_FOCUS_TIMER.md'),
  ];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /offline-first/i, `${path.relative(root, file)} must not claim offline-first`);
    assert.doesNotMatch(text, /local-first/i, `${path.relative(root, file)} must not claim local-first`);
    assert.doesNotMatch(text, /private-first/i, `${path.relative(root, file)} must not claim private-first`);
  }
});
