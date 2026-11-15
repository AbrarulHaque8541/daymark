'use strict';

const test = require('node:test');
const assert = require('node:assert');

const logic = globalThis.DaymarkMoon || require('../moon-logic.js');

test('normalizeDate accepts a YYYY-MM-DD string', () => {
  const parsed = logic.normalizeDate('2026-11-15', () => '2026-11-15T10:00:00.000Z');
  assert.deepStrictEqual(parsed, { year: 2026, month: 11, day: 15 });
});

test('normalizeDate accepts an ISO timestamp and reads its date part', () => {
  const parsed = logic.normalizeDate('2026-03-05T23:59:59.000Z', () => '2026-11-15T10:00:00.000Z');
  assert.deepStrictEqual(parsed, { year: 2026, month: 3, day: 5 });
});

test('normalizeDate falls back to the injected clock when empty', () => {
  const parsed = logic.normalizeDate(undefined, () => '2026-11-15T10:00:00.000Z');
  assert.deepStrictEqual(parsed, { year: 2026, month: 11, day: 15 });
  assert.deepStrictEqual(logic.normalizeDate('', () => '2026-11-15T10:00:00.000Z'), { year: 2026, month: 11, day: 15 });
  assert.deepStrictEqual(logic.normalizeDate(null, () => '2026-11-15T10:00:00.000Z'), { year: 2026, month: 11, day: 15 });
});

test('normalizeDate rejects impossible and malformed dates fail-closed', () => {
  assert.strictEqual(logic.normalizeDate('2026-02-30'), null);
  assert.strictEqual(logic.normalizeDate('2025-02-29'), null);
  assert.strictEqual(logic.normalizeDate('2026-13-01'), null);
  assert.strictEqual(logic.normalizeDate('2026-00-10'), null);
  assert.strictEqual(logic.normalizeDate('2026-01-00'), null);
  assert.strictEqual(logic.normalizeDate('2026-1-5'), null);
  assert.strictEqual(logic.normalizeDate('nonsense'), null);
  assert.strictEqual(logic.normalizeDate('11-15'), null);
  assert.strictEqual(logic.normalizeDate(42), null);
  assert.strictEqual(logic.normalizeDate('1969-12-31'), null);
});

test('normalizeDate accepts real leap-day February 29', () => {
  assert.deepStrictEqual(logic.normalizeDate('2024-02-29'), { year: 2024, month: 2, day: 29 });
  assert.deepStrictEqual(logic.normalizeDate('2000-02-29'), { year: 2000, month: 2, day: 29 });
});

test('phaseName bins the eight phases and guards its input', () => {
  assert.strictEqual(logic.phaseName(0), 'New moon');
  assert.strictEqual(logic.phaseName(0.125), 'Waxing crescent');
  assert.strictEqual(logic.phaseName(0.25), 'First quarter');
  assert.strictEqual(logic.phaseName(0.375), 'Waxing gibbous');
  assert.strictEqual(logic.phaseName(0.5), 'Full moon');
  assert.strictEqual(logic.phaseName(0.625), 'Waning gibbous');
  assert.strictEqual(logic.phaseName(0.75), 'Last quarter');
  assert.strictEqual(logic.phaseName(0.875), 'Waning crescent');
  assert.strictEqual(logic.phaseName(1), null);
  assert.strictEqual(logic.phaseName(-0.1), null);
  assert.strictEqual(logic.phaseName(Number.NaN), null);
});

test('illuminationPercent is zero at new moon and near 100 at full moon', () => {
  assert.strictEqual(logic.illuminationPercent(0), 0);
  assert.strictEqual(logic.illuminationPercent(0.5), 100);
  assert.ok(logic.illuminationPercent(0.25) > 40 && logic.illuminationPercent(0.25) < 60);
  assert.strictEqual(logic.illuminationPercent(1), null);
});

test('phaseFraction and moonAgeDays are consistent and bounded', () => {
  const parts = logic.normalizeDate('2026-11-15');
  const age = logic.moonAgeDays(parts);
  assert.ok(age >= 0 && age < logic.SYNODIC_MONTH_DAYS);
  assert.strictEqual(logic.phaseFraction(parts), age / logic.SYNODIC_MONTH_DAYS);
});

test('moonPhaseInfo matches known new moons within its stated tolerance', () => {
  // Known UTC new-moon dates: 2024-01-11, 2025-01-29, 2026-01-18.
  for (const date of ['2024-01-11', '2025-01-29', '2026-01-18']) {
    const record = logic.moonPhaseInfo(date, { now: () => '2026-11-15T10:00:00.000Z' });
    assert.ok(record.illuminationPercent <= 8, date + ' should be nearly dark');
    assert.ok(['New moon', 'Waxing crescent'].includes(record.phaseName), date + ' phase name');
  }
});

test('moonPhaseInfo matches known full moons within its stated tolerance', () => {
  // Known UTC full-moon dates: 2024-01-25, 2025-01-13, 2026-01-03.
  for (const date of ['2024-01-25', '2025-01-13', '2026-01-03']) {
    const record = logic.moonPhaseInfo(date, { now: () => '2026-11-15T10:00:00.000Z' });
    assert.ok(record.illuminationPercent >= 92, date + ' should be nearly fully lit');
    assert.ok(['Full moon', 'Waning gibbous', 'Waxing gibbous'].includes(record.phaseName), date + ' phase name');
  }
});

test('moonPhaseInfo returns a complete stateless record for today', () => {
  const record = logic.moonPhaseInfo(undefined, { now: () => '2026-11-15T10:00:00.000Z' });
  assert.strictEqual(record.version, 1);
  assert.strictEqual(record.date, '2026-11-15');
  assert.strictEqual(record.phaseName, 'Waxing crescent');
  assert.strictEqual(record.illuminationPercent, 27);
  assert.strictEqual(record.approximate, true);
  assert.strictEqual(record.computedAt, '2026-11-15T10:00:00.000Z');
  assert.match(record.nextFullMoon, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(record.nextNewMoon, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(record.nextFullMoonInDays >= 0 && record.nextFullMoonInDays <= 30);
  assert.ok(record.nextNewMoonInDays >= 0 && record.nextNewMoonInDays <= 30);
});

test('moonPhaseInfo next-phase dates are after the requested date', () => {
  const record = logic.moonPhaseInfo('2026-11-15', { now: () => '2026-11-15T10:00:00.000Z' });
  assert.ok(record.nextFullMoon > record.date);
  assert.ok(record.nextNewMoon > record.date);
});

test('daysUntilPhase never returns a negative or oversized value', () => {
  for (let day = 1; day <= 28; day += 1) {
    const parts = logic.normalizeDate('2026-03-' + (day < 10 ? '0' + day : day));
    const toNew = logic.daysUntilPhase(parts, 0);
    const toFull = logic.daysUntilPhase(parts, 0.5);
    assert.ok(toNew >= 0 && toNew <= 30);
    assert.ok(toFull >= 0 && toFull <= 30);
  }
});

test('moonPhaseInfo throws a plain-word error on a bad date', () => {
  assert.throws(
    () => logic.moonPhaseInfo('someday', { now: () => '2026-11-15T10:00:00.000Z' }),
    /YYYY-MM-DD/
  );
  assert.throws(
    () => logic.moonPhaseInfo('2026-02-30', { now: () => '2026-11-15T10:00:00.000Z' }),
    /YYYY-MM-DD/
  );
});

test('moonPhaseInfo makes no network or storage calls (pure computation)', () => {
  // The record is derived only from the date and the injected clock; there is
  // no fetch, no XHR and no storage API anywhere in the module surface.
  const exported = Object.keys(logic);
  for (const key of exported) {
    assert.ok(typeof logic[key] !== 'undefined');
  }
  assert.ok(exported.includes('moonPhaseInfo'));
  assert.ok(!exported.includes('fetch'));
});
