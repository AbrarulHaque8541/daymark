'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const markup = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = ['styles.css', 'styles-motion-efficiency.css', 'motion-accessibility.css']
  .map((name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8'))
  .join('\n');

/* Classes whose styling is intentionally inherited from shared button classes. */
const INHERITED_HOOKS = new Set([
  'weather-clear', 'feed-clear', 'wiki-search', 'wiki-clear', 'webhook-save', 'cancel-edit',
]);

test('every class used by index.html has a CSS rule', () => {
  const used = new Set();
  for (const match of markup.matchAll(/class="([^"]+)"/g)) {
    match[1].split(/\s+/).forEach((name) => {
      if (name) used.add(name);
    });
  }
  const delimiters = [' {', ',', ':', '[', '>', ' ', '.', '{', '\n'];
  const missing = [...used].filter((name) =>
    !INHERITED_HOOKS.has(name) && !delimiters.some((d) => css.includes('.' + name + d)));
  assert.deepEqual(missing, [], 'these classes have no CSS rule');
});

test('add-form single-row layout only applies from 1000px up', () => {
  assert.ok(css.includes('@media (min-width: 1000px)'), '1000px breakpoint missing');
  assert.ok(!css.includes('@media (min-width: 721px) {\n  .add-form {'),
    'the old 721px single-row rule must be gone');
});

test('add-form wraps in three columns between 721px and 999px', () => {
  assert.ok(css.includes('@media (min-width: 721px) and (max-width: 999px)'),
    'wrap breakpoint missing');
  assert.ok(css.includes('grid-template-columns: repeat(3, minmax(0, 1fr));'),
    'three-column wrap missing');
});

test('currency form keeps From, swap and To on one row', () => {
  assert.ok(css.includes('grid-template-columns: 1fr auto 1fr;'),
    'currency row template missing');
  assert.ok(css.includes('.currency-card .feed-form > .currency-swap { justify-self: center; }'),
    'swap must be centered between the two selects');
});

test('edit dialog is named by its visible heading', () => {
  const dialog = markup.match(/<dialog\b[^>]*id="edit-dialog"[^>]*>/);
  assert.ok(dialog, 'edit task dialog is present');
  assert.match(dialog[0], /aria-labelledby="edit-heading",/
    'edit form must reference its accessible heading');
  assert.match(markup, /<h2\b[^>]*id="edit-heading"[^>]*>\s*Edit task/,
    'the referenced heading must exist and name the dialog');
});
