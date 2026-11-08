'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../countdown-logic.js');

test('isValidDateString accepts real calendar dates and rejects invalid', () => {
  assert.equal(logic.isValidDateString('2026-11-08'), true);
  assert.equal(logic.isValidDateString('2024-02-29'), true);
  assert.equal(logic.isValidDateString('2025-02-29'), false);
  assert.equal(logic.isValidDateString('2026-13-01'), false);
  assert.equal(logic.isValidDateString('2026-11-32'), false);
  assert.equal(logic.isValidDateString('not-a-date'), false);
  assert.equal(logic.isValidDateString(''), false);
});

test('localDateString returns YYYY-MM-DD for a given Date', () => {
  const d = new Date(2026, 10, 8, 15, 30); // Nov 8
  assert.equal(logic.localDateString(d), '2026-11-08');
  assert.equal(logic.localDateString(new Date('invalid')), null);
});

test('daysUntil computes whole local days correctly', () => {
  const now = new Date(2026, 10, 8, 12, 0); // Nov 8
  assert.equal(logic.daysUntil('2026-11-08', now), 0);
  assert.equal(logic.daysUntil('2026-11-09', now), 1);
  assert.equal(logic.daysUntil('2026-11-07', now), -1);
  assert.equal(logic.daysUntil('2026-12-08', now), 30);
  assert.equal(logic.daysUntil('bad', now), null);
});

test('formatDays produces honest labels', () => {
  assert.equal(logic.formatDays(0), 'Today');
  assert.equal(logic.formatDays(1), 'Tomorrow');
  assert.equal(logic.formatDays(3), '3 days');
  assert.equal(logic.formatDays(-1), '1 day ago');
  assert.equal(logic.formatDays(-5), '5 days ago');
  assert.equal(logic.formatDays(null), '—');
});

test('sanitizeName trims, collapses whitespace, and caps length', () => {
  assert.equal(logic.sanitizeName('  Hello   World  '), 'Hello World');
  assert.equal(logic.sanitizeName('a'.repeat(100)).length, logic.MAX_NAME);
  assert.equal(logic.sanitizeName(''), '');
  assert.equal(logic.sanitizeName(null), '');
});

test('validateItem and sortItems', () => {
  const good = { id: 'x1', name: 'Launch', date: '2026-12-01' };
  assert.equal(logic.validateItem(good), true);
  assert.equal(logic.validateItem({ id: '', name: 'x', date: '2026-12-01' }), false);
  assert.equal(logic.validateItem({ id: 'x', name: '', date: '2026-12-01' }), false);
  const items = [
    { id: 'a', name: 'Later', date: '2026-12-01' },
    { id: 'b', name: 'Soon', date: '2026-11-10' }
  ];
  const sorted = logic.sortItems(items);
  assert.equal(sorted[0].name, 'Soon');
});

test('module exposes constants and stays inert under Node', () => {
  assert.equal(logic.MAX_ITEMS, 8);
  assert.equal(typeof globalThis.DaymarkCountdown, 'object');
});
