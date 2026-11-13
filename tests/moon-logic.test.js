'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const moon = require('../moon-logic.js');

test('phaseFraction is in [0, 1) for valid dates', () => {
  const samples = [
    new Date('2000-01-06T18:14:00Z'),
    new Date('2026-11-13T00:00:00Z'),
    new Date('2020-01-01T00:00:00Z'),
    new Date('2030-06-15T12:00:00Z')
  ];
  for (const d of samples) {
    const f = moon.phaseFraction(d);
    assert.ok(f >= 0 && f < 1, 'fraction in range for ' + d.toISOString());
  }
});

test('known new-moon epoch yields near-zero fraction', () => {
  const f = moon.phaseFraction(new Date('2000-01-06T18:14:00Z'));
  assert.ok(f < 0.01, 'epoch new moon should be near 0, got ' + f);
});

test('phaseName covers the standard bands', () => {
  assert.equal(moon.phaseName(0), 'New Moon');
  assert.equal(moon.phaseName(0.1), 'Waxing Crescent');
  assert.equal(moon.phaseName(0.25), 'First Quarter');
  assert.equal(moon.phaseName(0.4), 'Waxing Gibbous');
  assert.equal(moon.phaseName(0.5), 'Full Moon');
  assert.equal(moon.phaseName(0.6), 'Waning Gibbous');
  assert.equal(moon.phaseName(0.75), 'Last Quarter');
  assert.equal(moon.phaseName(0.9), 'Waning Crescent');
  assert.equal(moon.phaseName(0.99), 'New Moon');
  assert.equal(moon.phaseName(-1), 'Unknown');
  assert.equal(moon.phaseName(2), 'Unknown');
  assert.equal(moon.phaseName(NaN), 'Unknown');
});

test('illuminationPercent peaks near full and is zero-ish near new', () => {
  assert.equal(moon.illuminationPercent(0), 0);
  assert.equal(moon.illuminationPercent(0.5), 100);
  const quarter = moon.illuminationPercent(0.25);
  assert.ok(quarter >= 45 && quarter <= 55, 'first quarter ~50%, got ' + quarter);
  assert.equal(moon.illuminationPercent(null), null);
  assert.equal(moon.illuminationPercent(2), null);
});

test('moonBriefing rejects invalid dates', () => {
  let message = '';
  try { moon.moonBriefing(null); } catch (error) { message = error.message; }
  assert.equal(message, 'A valid date is required.');
  message = '';
  try { moon.moonBriefing(new Date(NaN)); } catch (error) { message = error.message; }
  assert.equal(message, 'A valid date is required.');
});

test('moonBriefing returns a complete offline record', () => {
  const briefing = moon.moonBriefing(new Date('2026-11-13T12:00:00Z'));
  assert.equal(typeof briefing.name, 'string');
  assert.ok(briefing.name.length > 0);
  assert.ok(typeof briefing.fraction === 'number' && briefing.fraction >= 0 && briefing.fraction < 1);
  assert.ok(typeof briefing.illumination === 'number');
  assert.ok(briefing.nextFull && typeof briefing.nextFull.daysAhead === 'number');
  assert.ok(briefing.nextNew && typeof briefing.nextNew.daysAhead === 'number');
  assert.ok(typeof briefing.computedAtIso === 'string');
  assert.ok(briefing.precisionNote.indexOf('Approximate') === 0);
});

test('next full and new are within one synodic month', () => {
  const briefing = moon.moonBriefing(new Date('2026-11-13T12:00:00Z'));
  assert.ok(briefing.nextFull.daysAhead > 0 && briefing.nextFull.daysAhead <= moon.SYNODIC_DAYS + 0.5);
  assert.ok(briefing.nextNew.daysAhead > 0 && briefing.nextNew.daysAhead <= moon.SYNODIC_DAYS + 0.5);
});

test('formatDaysAhead is honest and bounded', () => {
  assert.equal(moon.formatDaysAhead(0), 'today');
  assert.equal(moon.formatDaysAhead(0.8), 'about 1 day');
  assert.equal(moon.formatDaysAhead(3), 'about 3 days');
  assert.equal(moon.formatDaysAhead(3.4), 'about 3.4 days');
  assert.equal(moon.formatDaysAhead(-1), 'unknown');
  assert.equal(moon.formatDaysAhead(NaN), 'unknown');
});

test('formatBriefingLine composes a readable status', () => {
  const line = moon.formatBriefingLine({
    name: 'Waxing Crescent',
    illumination: 18,
    nextFull: { daysAhead: 10.2 },
    nextNew: { daysAhead: 25.1 }
  });
  assert.ok(line.indexOf('Waxing Crescent') === 0);
  assert.ok(line.indexOf('18%') !== -1);
  assert.ok(line.indexOf('next full') !== -1);
  assert.ok(line.indexOf('next new') !== -1);
  assert.equal(moon.formatBriefingLine(null), '');
});

test('phaseFraction is monotonic over short intervals within a cycle', () => {
  const a = moon.phaseFraction(new Date('2026-11-13T00:00:00Z'));
  const b = moon.phaseFraction(new Date('2026-11-14T00:00:00Z'));
  const delta = (b - a + 1) % 1;
  assert.ok(delta > 0.02 && delta < 0.05, 'one-day advance ~0.034, got ' + delta);
});
