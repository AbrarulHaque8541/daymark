'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const logicSrc = fs.readFileSync(path.join(repoRoot, 'mindful-breaks-logic.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(repoRoot, 'mindful-breaks-ui.js'), 'utf8');

function logicLoaded() {
  const box = {};
  const module = { exports: {} };
  const fn = new Function('root', 'module', 'exports', logicSrc);
  fn(box, module, module.exports);
  return module.exports || box.DaymarkMindfulBreaks;
}

const logic = logicLoaded();

test('module surface exposes the expected api', () => {
  assert.strictEqual(typeof logic.evaluateBreak, 'function');
  assert.strictEqual(typeof logic.normalizeIntervalMinutes, 'function');
  assert.strictEqual(typeof logic.suggestionForCycle, 'function');
  assert.strictEqual(typeof logic.describePlan, 'function');
  assert.strictEqual(logic.FLAG_ID, 'mindful-breaks');
  assert.strictEqual(logic.MIN_INTERVAL_MINUTES, 10);
  assert.strictEqual(logic.MAX_INTERVAL_MINUTES, 120);
  assert.strictEqual(logic.DEFAULT_INTERVAL_MINUTES, 30);
  assert.strictEqual(logic.MINUTE_MS, 60000);
  assert.ok(Array.isArray(logic.BREAK_SUGGESTIONS) && logic.BREAK_SUGGESTIONS.length >= 4);
});

test('normalizeIntervalMessages accepts in-range integer minutes', () => {
  assert.deepStrictEqual(logic.normalizeIntervalMinutes(10), { ok: true, reason: null, minutes: 10 });
  assert.deepStrictEqual(logic.normalizeIntervalMinutes(30), { ok: true, reason: null, minutes: 30 });
  assert.deepStrictEqual(logic.normalizeIntervalMinutes(120), { ok: true, reason: null, minutes: 120 });
});

test('normalizeIntervalMessages rejects unreadable values with interval-unreadable', () => {
  const bad = [null, '30', 30.5, NaN, Infinity, -Infinity, true];
  for (const value of bad) {
    const result = logic.normalizeIntervalMinutes(value);
    assert.strictEqual(result.ok, false, String(value));
    assert.strictEqual(result.reason, 'interval-unreadable', String(value));
    assert.strictEqual(result.minutes, null);
  }
});

test('normalizeIntervalMessages rejects out-of-range values with interval-out-of-range', () => {
  for (const value of [9, 0, -30, 121, 1000]) {
    const result = logic.normalizeIntervalMinutes(value);
    assert.strictEqual(result.ok, false, String(value));
    assert.strictEqual(result.reason, 'interval-out-of-range', String(value));
    assert.strictEqual(result.minutes, null);
  }
});

test('suggestionForCycle returns a suggestion for non-negative seeds', () => {
  const result = logic.suggestionForCycle(0);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.reason, null);
  assert.ok(logic.BREAK_SUGGESTIONS.indexOf(result.suggestion) >= 0);
  const wrapped = logic.suggestionForCycle(logic.BREAK_SUGGESTIONS.length + 2);
  assert.strictEqual(wrapped.ok, true);
  assert.strictEqual(wrapped.suggestion, logic.BREAK_SUGGESTIONS[2]);

});

test('suggestionForCycle rejects unreadable seeds with seed-unreadable', () => {
  for (const value of [null, 'x', -1, NaN, Infinity, 1.5]) {
    const result = logic.suggestionForCycle(value);
    assert.strictEqual(result.ok, false, String(value));
    assert.strictEqual(result.reason, 'seed-unreadable', String(value));
    assert.strictEqual(result.suggestion, null);
  }
});

test('evaluateBreak reports waiting with honest remaining minutes', () => {
  const base = 1000000;
  const result = logic.evaluateBreak({
    startedAtMs: base,
    nowMs: base + 5 * logic.MINUTE_MS,
    intervalMinutes: 30
  });
  assert.deepStrictEqual(result, {
    ok: true, reason: null, state: 'waiting', suggestion: null,
    minutesElapsed: 5, minutesRemaining: 25
  });
});

test('evaluateBreak flips to break-due exactly at the boundary (+ minimal elapsed)', () => {
  const base = 2000000;
  const due = logic.evaluateBreak({
    startedAtMs: base,
    nowMs: base + 30 * logic.MINUTE_MS,
    intervalMinutes: 30
  });
  assert.strictEqual(due.ok, true);
  assert.strictEqual(due.state, 'break-due');
  assert.strictEqual(due.minutesRemaining, 0);
  assert.ok(logic.BREAK_SUGGESTIONS.indexOf(due.suggestion) >= 0);
  const justBefore = logic.evaluateBreak({
    startedAtMs: base,
    nowMs: base + 30 * logic.MINUTE_MS - 1,
    intervalMinutes: 30
  });
  assert.strictEqual(justBefore.state, 'waiting');
  assert.strictEqual(justBefore.minutesRemaining, 1);
});

test('evaluateBreak rejects an unreadable request object', () => {
  const nullResult = logic.evaluateBreak(null);
  assert.strictEqual(nullResult.ok, false);
  assert.strictEqual(nullResult.reason, 'request-unreadable');
  const arrayResult = logic.evaluateBreak(['a', 'b', 'c']);
  assert.strictEqual(arrayResult.ok, false);
  assert.strictEqual(arrayResult.reason, 'request-unreadable');
});

test('evaluateBreak rejects an unreadable interval with the normalize reason', () => {
  const result = logic.evaluateBreak({
    startedAtMs: 0,
    nowMs: 60000,
    intervalMinutes: 5
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'interval-out-of-range');
});

test('evaluateBreak rejects an unreadable startedAt with started-at-unreadable', () => {
  for (const value of [undefined, 'x', -1, NaN, Infinity]) {
    const result = logic.evaluateBreak({
      startedAtMs: value,
      nowMs: 60000,
      intervalMinutes: 30
    });
    assert.strictEqual(result.ok, false, String(value));
    assert.strictEqual(result.reason, 'started-at-unreadable', String(value));
  }
});

test('evaluateBreak rejects an unreadable clock and moved-backwards clock', () => {
  const unreadable = logic.evaluateBreak({
    startedAtMs: 0,
    nowMs: 'later',
    intervalMinutes: 30
  });
  assert.strictEqual(unreadable.ok, false);
  assert.strictEqual(unreadable.reason, 'clock-unreadable');
  const backwards = logic.evaluateBreak({
    startedAtMs: 2 * logic.MINUTE_MS,
    nowMs: logic.MINUTE_MS,
    intervalMinutes: 30
  });
  assert.strictEqual(backwards.ok, false);
  assert.strictEqual(backwards.reason, 'clock-moved-backwards');
});

test('describePlan returns exactly five honest lines for a valid interval', () => {
  const result = logic.describePlan(30);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.reason, null);
  assert.strictEqual(result.lines.length, 5);
  for (const line of result.lines) {
    assert.strictEqual(typeof line, 'string');
    assert.ok(line.length > 0);
  }
  assert.ok(result.lines.join(' ').indexOf('30 minutes') >= 0);
});

test('describePlan fails closed for an invalid interval', () => {
  const result = logic.describePlan(999);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'interval-out-of-range');
  assert.deepStrictEqual(result.lines, []);
});

test('daymark module sources stay backslash-free and free of banned patterns', () => {
  for (const src of [logicSrc, uiSrc]) {
    assert.ok(src.indexOf('\\') === -1, 'backslash found in module source');
    assert.ok(src.indexOf('TODO') === -1, 'TODO found in module source');
    assert.ok(src.indexOf('FIXME') === -1, 'FIXME found in module source');
    assert.ok(src.indexOf('placeholder') === -1, 'placeholder found in module source');
    assert.ok(src.indexOf('setInterval') === -1, 'setInterval found in module source');
    assert.ok(src.indexOf('fetch(') === -1, 'fetch found in module source');
  }
});

test('modules register their globals without colliding on the root object', () => {
  const box = {};
  box.globalThis = box;
  box.module = { exports: {} };
  box.exports = {};
  const keys = Object.keys(box);
  const fn = new Function(keys.join(','), logicSrc + '\n' + uiSrc);
  fn.apply(box, keys.map((k) => (k === 'globalThis' ? box : box[k])));
  assert.strictEqual(typeof box.DaymarkMindfulBreaks, 'object');
  assert.strictEqual(typeof box.DaymarkMindfulBreaksUi, 'object');
  assert.strictEqual(typeof box.module.exports.attachMindfulBreaksUi, 'function');
});

test('commas between fresh intervals stay exact when elapsed crosses minutes', () => {
  const base = 3000000;
  const result = logic.evaluateBreak({
    startedAtMs: base,
    nowMs: base + 29 * logic.MINUTE_MS + 59999,
    intervalMinutes: 30
  });
  assert.strictEqual(result.state, 'waiting');
  assert.strictEqual(result.minutesElapsed, 29);
  assert.strictEqual(result.minutesRemaining, 1);
});
