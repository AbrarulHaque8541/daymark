'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'styles-motion-efficiency.css'), 'utf8');

test('suggestion press feedback and focus-within stay complete and reduced-motion aware', () => {
  assert.ok(css.length > 4000, 'motion stylesheet must be present');
  assert.match(css, /\.suggestion-item:active\s*\{\s*transform:\s*translateY\(0\) scale\(\.995\);/);
  assert.match(css, /\.suggestion-card:focus-within/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.suggestion-item:active\s*\{\s*transform:\s*none;/);
  assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length,
    'stylesheet braces must remain balanced');
});
