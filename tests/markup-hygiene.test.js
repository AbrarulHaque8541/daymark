'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const markup = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('index.html keeps every line free of trailing whitespace', () => {
  const offenders = markup.split('\n').filter((line) => /[ \t]+$/.test(line));
  assert.deepEqual(offenders, [], 'no line should carry trailing whitespace');
});

test('index.html keeps the repeat select as one unbroken tag', () => {
  assert.match(markup, /<select id="edit-repeat" name="repeat"[^>]*>/);
});

test('index.html aligns the export format select with its task-tools siblings', () => {
  assert.match(markup, /\n            <select id="export-format"/);
});

test('index.html keeps the de-cluttered chrome lean (owner decision 2026-11-05)', () => {
  assert.doesNotMatch(markup, /class="rail-label"/, 'the upside-down rail label must stay removed');
  assert.doesNotMatch(markup, /demo-label/, 'redundant card topline labels must stay removed');
  assert.doesNotMatch(markup, /A little more/, 'the decorative hero heading must stay replaced');
  assert.doesNotMatch(markup, /This prototype stores tasks/, 'the duplicated storage note must stay removed');
  assert.match(markup, /id="page-title">Your day, <em>at a glance\.<\/em><\/h1>/, 'the hero heading stays clear and functional');
});
