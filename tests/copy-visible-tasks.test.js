const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('copy-visible-tasks button is present in the task toolbar', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="copy-visible-tasks"/);
  assert.match(html, /Copy titles/);
  assert.match(html, /aria-label="Copy titles of currently visible tasks/);
});

test('copyVisibleTaskTitles is wired in app.js', () => {
  const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(js, /function copyVisibleTaskTitles/);
  assert.match(js, /copy-visible-tasks/);
  assert.match(js, /navigator\.clipboard\.writeText/);
  assert.match(js, /Copied \$\{titles\.length\}/);
});
