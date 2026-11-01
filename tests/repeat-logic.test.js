const test = require('node:test');
const assert = require('node:assert/strict');
const repeat = require('../repeat-logic.js');

test('isRepeat accepts the five rules and absence', () => {
  assert.equal(repeat.isRepeat(null), true);
  assert.equal(repeat.isRepeat(undefined), true);
  assert.equal(repeat.isRepeat('daily'), true);
  assert.equal(repeat.isRepeat('weekly'), true);
  assert.equal(repeat.isRepeat('monthly'), true);
  assert.equal(repeat.isRepeat('weekdays'), true);
  assert.equal(repeat.isRepeat('yearly'), true);
  assert.equal(repeat.isRepeat(''), false);
  assert.equal(repeat.isRepeat(7), false);
});

test('daily repeat advances one day when the task is due today', () => {
  assert.equal(repeat.nextDueDate('2026-10-30', 'daily', '2026-10-30'), '2026-10-31');
});

test('daily repeat skips missed occurrences to the first future date', () => {
  assert.equal(repeat.nextDueDate('2026-10-20', 'daily', '2026-10-30'), '2026-10-31');
});

test('daily repeat jumps directly past very old occurrences', () => {
  assert.equal(repeat.nextDueDate('2000-01-01', 'daily', '2026-10-30'), '2026-10-31');
  assert.equal(repeat.nextDueDate('0001-01-01', 'daily', '2026-10-30'), '2026-10-31');
});

test('weekly repeat keeps the weekday and can land on today', () => {
  // Due Friday 2026-10-30, completed today: the next Friday is 2026-11-06.
  assert.equal(repeat.nextDueDate('2026-10-30', 'weekly', '2026-10-30'), '2026-11-06');
  // Missed occurrences on or before today are skipped; completion never
  // schedules a same-day recurrence.
  assert.equal(repeat.nextDueDate('2026-10-09', 'weekly', '2026-10-30'), '2026-11-06');
});

test('monthly repeat lands on the same day of the next month', () => {
  assert.equal(repeat.nextDueDate('2026-10-30', 'monthly', '2026-10-30'), '2026-11-30');
  assert.equal(repeat.nextDueDate('2026-01-15', 'monthly', '2026-02-14'), '2026-02-15');
  assert.equal(repeat.nextDueDate('2026-01-15', 'monthly', '2026-02-20'), '2026-03-15');
});

test('monthly repeat clamps month-end days without losing its original anchor', () => {
  assert.equal(repeat.nextDueDate('2026-01-31', 'monthly', '2026-02-01', 31), '2026-02-28');
  assert.equal(repeat.nextDueDate('2026-01-31', 'monthly', '2026-04-01', 31), '2026-04-30');
  assert.equal(repeat.nextDueDate('2026-02-28', 'monthly', '2026-02-28', 31), '2026-03-31');
  assert.equal(repeat.nextDueDate('2026-02-28', 'monthly', '2026-03-31', 31), '2026-04-30');
});

test('weekday repeat skips weekends', () => {
  // Friday 2026-10-30 completed today: the next weekday is Monday 2026-11-02.
  assert.equal(repeat.nextDueDate('2026-10-30', 'weekdays', '2026-10-30'), '2026-11-02');
  // Thursday 2026-10-29 -> Friday 2026-10-30.
  assert.equal(repeat.nextDueDate('2026-10-29', 'weekdays', '2026-10-29'), '2026-10-30');
  // Saturday 2026-10-31 and Sunday 2026-11-01 both land on Monday 2026-11-02.
  assert.equal(repeat.nextDueDate('2026-10-31', 'weekdays', '2026-10-31'), '2026-11-02');
  assert.equal(repeat.nextDueDate('2026-11-01', 'weekdays', '2026-11-01'), '2026-11-02');
  // Missed weekdays are skipped forward to the next occurrence.
  assert.equal(repeat.nextDueDate('2026-10-26', 'weekdays', '2026-10-30'), '2026-11-02');
  // Even a multi-decade gap resolves to the next weekday, not a capped past date.
  assert.equal(repeat.nextDueDate('2000-01-03', 'weekdays', '2026-10-30'), '2026-11-02');
});

test('yearly repeat keeps month and day and clamps the leap day', () => {
  assert.equal(repeat.nextDueDate('2026-10-05', 'yearly', '2026-10-05'), '2027-10-05');
  assert.equal(repeat.nextDueDate('2024-02-29', 'yearly', '2024-02-29'), '2025-02-28');
  assert.equal(repeat.nextDueDate('2024-02-29', 'yearly', '2026-10-31', 29), '2027-02-28');
  assert.equal(repeat.nextDueDate('2025-02-28', 'yearly', '2025-02-28', 29), '2026-02-28');
  assert.equal(repeat.nextDueDate('2027-02-28', 'yearly', '2027-02-28', 29), '2028-02-29');
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
  assert.equal(repeat.nextDueDate('2026-10-30', 'hourly', '2026-10-30'), null);
  assert.equal(repeat.nextDueDate('2026-10-30', null, '2026-10-30'), null);
  assert.equal(repeat.nextDueDate('2026-10-30', 'daily', 'not-a-date'), '2026-10-31');
  assert.equal(repeat.nextDueDate('2026-10-30', 'monthly', '2026-10-30', 32), null);
});

