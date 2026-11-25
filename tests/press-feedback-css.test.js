'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const motionCss = fs.readFileSync(path.join(__dirname, '..', 'styles-motion-efficiency.css'), 'utf8');

test('press feedback CSS stays complete, deduplicated, cascade-correct, and reduced-motion aware', () => {
  assert.ok(css.length > 10000, 'the complete application stylesheet must be present');
  assert.doesNotMatch(css, /PLACEHOLDER_FULL_CONTENT_FROM_FILE/);
  assert.equal((css.match(/\.card:active/g) || []).length, 2,
    'one card press rule plus one reduced-motion override');
  assert.equal((css.match(/\.task-row:active/g) || []).length, 2,
    'one task-row press rule plus one reduced-motion override');
  assert.equal((css.match(/\.filter-button\.is-pressed/g) || []).length, 2,
    'one filter-button press rule plus one reduced-motion override');
  assert.equal((css.match(/\.complete-button\.is-pressed/g) || []).length, 2,
    'one complete-button press rule plus one reduced-motion override');
  assert.equal((css.match(/\.icon-button\.is-pressed/g) || []).length, 2,
    'one icon-button press rule plus one reduced-motion override');
  assert.match(css, /\.card:active\s*\{\s*transform:\s*scale\(\.998\);\s*\}/);
  assert.match(css, /\.task-row:active\s*\{\s*transform:\s*translateY\(0\) scale\(\.995\);\s*\}/);
  assert.ok(css.indexOf('.task-row:hover {') < css.indexOf('.task-row:active {'),
    'active feedback must follow hover in the cascade so the pressed row returns to neutral');
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.card:active,\s*\.task-row:active\s*\{\s*transform:\s*none;/);
  assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length,
    'stylesheet braces must remain balanced');
});

test('a busy button renders exactly one spinner, on the leading before layer', () => {
  // styles.css used to draw its own trailing spinner (.button.is-busy::after) on top
  // of the leading spinner in styles-motion-efficiency.css (.button.is-busy::before),
  // so every busy button showed two spinners at once. Keep a single indicator layer.
  assert.doesNotMatch(css, /\.is-busy::after/,
    'styles.css must not draw a second busy spinner');
  assert.doesNotMatch(css, /@keyframes button-spin/,
    'the removed trailing-spinner keyframes must not return');
  assert.match(motionCss, /\.button\.is-busy::before/,
    'the single busy spinner is drawn once on the leading ::before layer');
  assert.equal((motionCss.match(/@keyframes glance-spin/g) || []).length, 1,
    'exactly one busy-spinner keyframes definition is allowed');
});
