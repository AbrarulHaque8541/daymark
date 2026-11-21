'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../mindful-breaks-logic.js');

test('constants: pinned flag id, interval bounds and suggestions', () => {
  assert.equal(logic.FLAG_ID, 'mindful-breaks');
  assert.equal(logic.MIN_INTERVAL_MINUTES, 10);
  assert.equal(logic.MAX_INTERVAL_MINUTES, 120);
  assert.equal(logic.DEFAULT_INTERVAL_MINUTES, 30);
  assert.equal(logic.MINUTE_MS, 60000);
  assert.equal(logic.BREAK_SUGGESTIONS.length, 6);
  assert.equal(new Set(logic.BREAK_SUGGESTIONS).size, 6);
});

test('normalizeIntervalMinutes accepts whole minutes inside the allowed range', () => {
  for (const value of [10, 30, 120]) {
    const norm = logic.normalizeIntervalMinutes(value);
    assert.equal(norm.ok, true, 'value ' + value);
    assert.equal(norm.minutes, value);
  }
});

test('normalizeIntervalMinutes fails closed on unreadable or out-of-range values', () => {
  for (const value of ['30', null, undefined, Number.NaN, Infinity, -Infinity, 30.5, -30, true, [30], { v: 30 }]) {
    assert.equal(logic.normalizeIntervalMinutes(value).ok, false, 'value ' + String(value));
  }
  assert.equal(logic.normalizeIntervalMinutes(9).reason, 'interval-out-of-range');
  assert.equal(logic.normalizeIntervalMinutes(121).reason, 'interval-out-of-range');
  assert.equal(logic.normalizeIntervalMinutes('30').reason, 'interval-unreadable');
});

test('suggestionForCycle is deterministic, in-list, or honestly refused', () => {
  for (let seed = 0; seed < 60; seed += 1) {
    const pick = logic.suggestionForCycle(seed);
    assert.equal(pick.ok, true, 'seed ' + seed);
    assert.equal(logic.BREAK_SUGGESTIONS.indexOf(pick.suggestion) !== -1, true);
  }
  assert.equal(logic.suggestionForCycle(0).suggestion, logic.suggestionForCycle(0).suggestion);
  for (const bad of [null, -1, 1.5, Number.NaN, '1', undefined]) {
    assert.equal(logic.suggestionForCycle(bad).ok, false, 'value ' + String(bad));
  }
  assert.equal(logic.suggestionForCycle(null).reason, 'seed-unreadable');
});

test('evaluateBreak requires a readable request object', () => {
  for (const bad of [null, 'x', 42, [1], undefined]) {
    assert.equal(logic.evaluateBreak(bad).reason, 'request-unreadable');
  }
});

test('evaluateBreak fails closed on any unreadable field', () => {
  const base = { nowMs: 600000, startedAtMs: 0, intervalMinutes: 10 };
  assert.equal(logic.evaluateBreak(Object.assign({}, base, { startedAtMs: '0' })).reason, 'started-at-unreadable');
  assert.equal(logic.evaluateBreak(Object.assign({}, base, { startedAtMs: -1 })).reason, 'started-at-unreadable');
  assert.equal(logic.evaluateBreak(Object.assign({}, base, { nowMs: '0' })).reason, 'clock-unreadable');
  assert.equal(logic.evaluateBreak(Object.assign({}, base, { nowMs: -1 })).reason, 'clock-unreadable');
  assert.equal(logic.evaluateBreak(Object.assign({}, base, { startedAtMs: Infinity })).reason, 'started-at-unreadable');
  const backwards = logic.evaluateBreak({ nowMs: 1000, startedAtMs: 2000, intervalMinutes: 10 });
  assert.equal(backwards.ok, false);
  assert.equal(backwards.reason, 'clock-moved-backwards');
  assert.equal(logic.evaluateBreak(Object.assign({}, base, { intervalMinutes: 5 })).reason, 'interval-out-of-range');
});

test('evaluateBreak reports the honest waiting counts in whole minutes', () => {
  const waiting = logic.evaluateBreak({ nowMs: 5 * 60000, startedAtMs: 0, intervalMinutes: 10 });
  assert.equal(waiting.ok, true);
  assert.equal(waiting.state, 'waiting');
  assert.equal(waiting.suggestion, null);
  assert.equal(waiting.minutesElapsed, 5);
  assert.equal(waiting.minutesRemaining, 5);
  const fresh = logic.evaluateBreak({ nowMs: 0, startedAtMs: 0, intervalMinutes: 30 });
  assert.equal(fresh.minutesElapsed, 0);
  assert.equal(fresh.minutesRemaining, 30);
});

test('evaluateBreak signals break-due once the interval has fully elapsed', () => {
  const due = logic.evaluateBreak({ nowMs: 10 * 60000, startedAtMs: 0, intervalMinutes: 10 });
  assert.equal(due.ok, true);
  assert.equal(due.state, 'break-due');
  assert.equal(due.minutesElapsed, 10);
  assert.equal(due.minutesRemaining, 0);
  assert.equal(logic.BREAK_SUGGESTIONS.indexOf(due.suggestion) !== -1, true);
});

test('the break suggestion is stable inside one interval window and moves between windows', () => {
  const windowMs = 30 * logic.MINUTE_MS;
  const first = logic.evaluateBreak({ nowMs: 31 * 60000, startedAtMs: 0, intervalMinutes: 30 });
  const second = logic.evaluateBreak({ nowMs: 58 * 60000, startedAtMs: 0, intervalMinutes: 30 });
  assert.equal(first.suggestion, second.suggestion, 'one window, one suggestion');
  const nextWindow = logic.evaluateBreak({ nowMs: windowMs + 300000, startedAtMs: 0, intervalMinutes: 30 });
  assert.equal(logic.BREAK_SUGGESTIONS.indexOf(nextWindow.suggestion) !== -1, true);
});

test('describePlan explains the honest contract of the nudge', () => {
  const plan = logic.describePlan(30);
  assert.equal(plan.ok, true);
  assert.equal(plan.lines.length, 5);
  const joined = plan.lines.join(' ');
  assert.equal(joined.indexOf('Nothing is saved') !== -1, true);
  assert.equal(joined.indexOf('No background timers') !== -1, true);
  assert.equal(joined.indexOf('runs only while this page stays open') !== -1, true);
  assert.equal(joined.indexOf('30 minutes on the page') !== -1, true);
});

test('describePlan refuses an unreadable interval instead of guessing', () => {
  assert.equal(logic.describePlan(5).ok, false);
  assert.equal(logic.describePlan(5).reason, 'interval-out-of-range');
  assert.equal(logic.describePlan(null).reason, 'interval-unreadable');
  assert.deepEqual(logic.describePlan('30').lines, []);
});

test('the module exports its API and registers one root namespace', () => {
  assert.equal(typeof logic.evaluateBreak, 'function');
  assert.equal(typeof logic.describePlan, 'function');
  assert.equal(typeof logic.normalizeIntervalMinutes, 'function');
  assert.equal(typeof logic.suggestionForCycle, 'function');
  assert.equal(typeof globalThis.DaymarkMindfulBreaks, 'object');
});
