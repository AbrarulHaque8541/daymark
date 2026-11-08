'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

test('press feedback CSS stays complete, deduplicated, and reduced-motion aware', () => {
  assert.ok(css.length > 10000, 'the complete application stylesheet must be present');
  assert.doesNotMatch(css, /PLACEHOLDER_FULL_CONTENT_FROM_FILE/);
  assert.equal((css.match(/\.card:active/g) || []).length, 2,
    'one card press rule plus one reduced-motion override');
  assert.equal((css.match(/\.task-row:active/g) || []).length, 2,
    'one task-row press rule plus one reduced-motion override');
  assert.match(css, /\.card:active\s*\{\s*transform:\s*scale\(\.998\);\s*\}/);
  assert.match(css, /\.task-row:active\s*\{\s*transform:\s*translateY\(0\) scale\(\.995\);\s*\}/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.card:active,\s*\.task-row:active\s*\{\s*transform:\s*none;/);
  assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length,
    'stylesheet braces must remain balanced');
});
