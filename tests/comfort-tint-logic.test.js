'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../comfort-tint-logic.js');

test('constants: pinned flag id, three modes with unique ids, default dim', () => {
  assert.equal(logic.FLAG_ID, 'comfort-tint');
  assert.equal(logic.DEFAULT_MODE_ID, 'dim');
  assert.equal(logic.MODES.length, 3);
  assert.deepEqual(logic.MODES.map((mode) => mode.id), ['dim', 'warm', 'night']);
  assert.equal(new Set(logic.MODES.map((mode) => mode.id)).size, 3);
  for (const mode of logic.MODES) {
    assert.equal(typeof mode.label, 'string');
    assert.equal(typeof mode.overlay, 'string');
    assert.match(mode.overlay, /^rgba\(/);
    assert.equal(typeof mode.note, 'string');
  }
  for (const mode of logic.MODES) {
    assert.equal(/#16705f/.test(mode.overlay), false, 'the accent color must never be the tint');
  }
});

test('normalizeMode accepts the three known modes and fails closed otherwise', () => {
  for (const mode of logic.MODES) {
    const norm = logic.normalizeMode(mode.id);
    assert.equal(norm.ok, true);
    assert.equal(norm.mode.id, mode.id);
  }
  for (const bad of [undefined, null, '', 'blend', 42, { id: 'dim' }]) {
    const norm = logic.normalizeMode(bad);
    assert.equal(norm.ok, false);
    assert.equal(norm.reason, 'mode-unreadable');
    assert.equal(norm.mode, null);
  }
});

test('resolveTintState refuses unreadable requests instead of guessing', () => {
  for (const bad of [null, undefined, 'on', [], 7]) {
    const result = logic.resolveTintState(bad);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'request-unreadable');
    assert.equal(result.active, false);
  }
});

test('resolveTintState refuses a non-boolean enabled flag instead of guessing', () => {
  for (const enabled of [undefined, null, 'true', 1]) {
    const result = logic.resolveTintState({ enabled: enabled, modeId: 'dim' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'enabled-unreadable');
    assert.equal(result.active, false);
  }
});

test('resolveTintState refuses an unknown mode even when the flag is on', () => {
  const result = logic.resolveTintState({ enabled: true, modeId: 'solarize' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'mode-unreadable');
  assert.equal(result.active, false);
  assert.deepEqual(result.lines, []);
});

test('resolveTintState reports flag-off honestly with the plan still readable', () => {
  const result = logic.resolveTintState({ enabled: false, modeId: 'warm' });
  assert.equal(result.ok, true);
  assert.equal(result.active, false);
  assert.equal(result.reason, 'flag-off');
  assert.equal(result.modeId, 'warm');
  assert.equal(result.overlay, null);
  assert.ok(result.lines.length >= 4, 'the plan stays readable while the tint is off');
});

test('resolveTintState activates with the chosen overlay and honest lines', () => {
  for (const mode of logic.MODES) {
    const result = logic.resolveTintState({ enabled: true, modeId: mode.id });
    assert.equal(result.ok, true);
    assert.equal(result.active, true);
    assert.equal(result.reason, null);
    assert.equal(result.modeId, mode.id);
    assert.equal(result.overlay, mode.overlay);
    assert.ok(result.lines.length >= 5, 'the active state explains itself');
    assert.ok(result.lines[0].indexOf(mode.label) !== -1, 'the label names the mode');
  }
});

test('explainTint never promises changes to page colors or contrast', () => {
  const result = logic.resolveTintState({ enabled: true, modeId: 'dim' });
  const joined = result.lines.join(' ');
  assert.ok(joined.indexOf('#16705f') !== -1, 'the accent color is disclosed as untouched');
  assert.ok(joined.indexOf('pointer-events: none') !== -1, 'tap-through is disclosed');
});

test('describePlan refuses an unknown mode instead of describing a guess', () => {
  assert.equal(logic.describePlan('blend').ok, false);
  assert.equal(logic.describePlan('blend').reason, 'mode-unreadable');
  assert.deepEqual(logic.describePlan('blend').lines, []);
  assert.equal(logic.describePlan(3).reason, 'mode-unreadable');
});

test('describePlan lines stay offline-first and honest', () => {
  const plan = logic.describePlan('night');
  assert.equal(plan.ok, true);
  const joined = plan.lines.join(' ');
  assert.ok(joined.indexOf('nothing is saved') !== -1 || joined.indexOf('nothing is saved beyond') !== -1);
  assert.ok(joined.indexOf('instantly') !== -1);
});

test('the accent color stays #16705f in every overlay string', () => {
  for (const mode of logic.MODES) {
    assert.equal(mode.overlay.indexOf('#16705f'), -1);
  }
});

test('the module exports its API and registers one root namespace', () => {
  assert.equal(typeof logic.normalizeMode, 'function');
  assert.equal(typeof logic.describePlan, 'function');
  assert.equal(typeof logic.resolveTintState, 'function');
  assert.equal(typeof logic.modeById, 'function');
  assert.equal(typeof logic.explainTint, 'function');
  assert.equal(typeof globalThis.DaymarkComfortTint, 'object');
});
