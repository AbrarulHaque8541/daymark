const test = require('node:test');
const assert = require('node:assert/strict');
const repeat = require('../repeat-logic.js');

test('isRepeat accepts the three rules and absence', () => {
  assert.equal(repeat.isRepeat(null), true);
  assert.equal(repeat.isRepeat(undefined), true);
  assert.equal(repeat.isRepeat('daily'), true);
  assert.equal(repeat.isRepeat('weekly'), true);
  assert.equal(repeat.isRepeat('monthly'), true);
  assert.equal(repeat.isRepeat('yearly'), false);
  assert.equal(repeat.isRepeat(''), false);
  assert.equal(repeat.isRepeat(7), false);
});

test('daily repeat advances one day when the task is due today', () => {
  assert.equal(repeat.nextDueDate('2026-10-30', 'daily', '2026-10-30'), '2026-10-31');
});

test('daily repeat skips missed days forward to today', () => {
  assert.equal(repeat.nextDueDate('2026-10-20', 'daily', '2026-10-30'), '2026-10-30');
});

test('daily repeat never lands in the past even after a long gap', () => {
  assert.equal(repeat.nextDueDate('2026-09-01', 'daily', '2026-10-30'), '2026-10-30');
});

test('weekly repeat keeps the weekday and stays ahead of today', () => {
  assert.equal(repeat.nextDueDate('2026-10-30', 'weekly', '2026-10-30'), '2026-11-06');
  assert.equal(repeat.nextDueDate('2026-10-09', 'weekly', '2026-10-30'), '2026-11-06');
});

test('monthly repeat lands on the same day of the next month', () => {
  assert.equal(repeat.nextDueDate('2026-10-30', 'monthly', '2026-10-30'), '2026-11-30');
  assert.equal(repeat.nextDueDate('2026-01-15', 'monthly', '2026-02-14'), '2026-02-15');
  assert.equal(repeat.nextDueDate('2026-01-15', 'monthly', '2026-02-20'), '2026-03-15');
});

test('monthly repeat clamps month-end days', () => {
  assert.equal(repeat.nextDueDate('2026-01-31', 'monthly', '2026-02-01'), '2026-02-28');
  assert.equal(repeat.nextDueDate('2026-01-31', 'monthly', '2026-04-01'), '2026-04-30');
});

test('completing early keeps the rhythm anchored to the due date', () => {
  // Due next Friday, completed today: the next occurrence is next Friday,
  // not one week from today.
  assert.equal(repeat.nextDueDate('2026-11-06', 'daily', '2026-10-30'), '2026-11-07');
  assert.equal(repeat.nextDueDate('2026-11-13', 'weekly', '2026-10-30'), '2026-11-20');
});

test('invalid input returns null instead of a made-up date', () => {
  assert.equal(repeat.nextDueDate('2026-02-30', 'daily', '2026-10-30'), null);
  assert.equal(repeat.nextDueDate('not-a-date', 'daily', '2026-10-30'), null);
  assert.equal(repeat.nextDueDate(null, 'daily', '2026-10-30'), null);
  assert.equal(repeat.nextDueDate('2026-10-30', 'yearly', '2026-10-30'), null);
  assert.equal(repeat.nextDueDate('2026-10-30', null, '2026-10-30'), null);
  assert.equal(repeat.nextDueDate('2026-10-30', 'daily', 'not-a-date'), '2026-10-31');
});
