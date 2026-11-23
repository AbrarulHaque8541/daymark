'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('app.js declares FILTER_KEY and persistence helpers', () => {
  assert.match(APP_SOURCE, /const FILTER_KEY = 'daymark\.filter\.v1';/);
  assert.match(APP_SOURCE, /function loadTaskFilter\(\)/);
  assert.match(APP_SOURCE, /function persistTaskFilter\(filter\)/);
  assert.match(APP_SOURCE, /function setTaskFilter\(filter\)/);
  assert.match(APP_SOURCE, /ALLOWED_FILTERS = new Set\(\['all', 'today', 'upcoming', 'overdue', 'completed'\]\)/);
});

test('setUp loads the persisted filter', () => {
  assert.match(APP_SOURCE, /state\.filter = loadTaskFilter\(\);/);
});

test('filter button clicks use setTaskFilter', () => {
  assert.match(APP_SOURCE, /setTaskFilter\(button\.dataset\.filter\);/);
});

test('other filter resets use setTaskFilter', () => {
  const matches = APP_SOURCE.match(/setTaskFilter\('all'\)/g);
  assert.ok(matches && matches.length >= 2, 'at least the add-task and toast paths should call setTaskFilter');
});

test('loadTaskFilter validates against allowed set and falls back to all', () => {
  assert.match(APP_SOURCE, /ALLOWED_FILTERS\.has\(saved\)/);
  assert.match(APP_SOURCE, /return 'all';/);
});
