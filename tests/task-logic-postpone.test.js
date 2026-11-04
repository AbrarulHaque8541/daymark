const { test } = require('node:test');
const assert = require('node:assert/strict');
const { postponeDueDate } = require('../task-logic.js');

test('postponeDueDate advances a valid date by one day', () => {
  assert.equal(postponeDueDate('2026-11-04'), '2026-11-05');
  assert.equal(postponeDueDate('2026-02-28'), '2026-03-01');
  assert.equal(postponeDueDate('2024-02-29'), '2024-03-01');
});

test('postponeDueDate returns null for missing or invalid dates', () => {
  assert.equal(postponeDueDate(null), null);
  assert.equal(postponeDueDate(''), null);
  assert.equal(postponeDueDate('2026-13-01'), null);
  assert.equal(postponeDueDate('not-a-date'), null);
});
