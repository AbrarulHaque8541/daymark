'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../lifecycle-recovery-logic.js');

const UNKNOWN_IDS = ['not-a-real-scenario', '', 'rotation-typo', null, undefined, 42];
const REQUIRED_FIELDS = [
  'label', 'title', 'summary', 'stillWorks', 'lostAtRisk',
  'deletesData', 'dataNote', 'recovery', 'userAction', 'network', 'verification'
];

test('scenario ids are pinned, ordered and unique', () => {
  assert.deepEqual(engine.SCENARIO_IDS, [
    'rotation',
    'process-death',
    'background-return',
    'renderer-crash',
    'low-memory',
    'restore-backup'
  ]);
  assert.equal(new Set(engine.SCENARIO_IDS).size, engine.SCENARIO_IDS.length);
});

test('catalog entries are well-formed', () => {
  for (const id of engine.SCENARIO_IDS) {
    const entry = engine.CATALOG[id];
    assert.ok(entry, 'missing catalog entry for ' + id);
    for (const field of REQUIRED_FIELDS) {
      assert.ok(field in entry, 'field ' + field + ' missing for ' + id);
    }
    for (const textField of ['label', 'title', 'summary', 'dataNote', 'recovery', 'userAction', 'network', 'verification']) {
      assert.equal(typeof entry[textField], 'string', id + ' ' + textField + ' type');
      assert.ok(entry[textField].length > 0, id + ' ' + textField + ' empty');
    }
    assert.ok(Array.isArray(entry.stillWorks) && entry.stillWorks.length > 0, id + ' stillWorks');
    assert.ok(Array.isArray(entry.lostAtRisk) && entry.lostAtRisk.length > 0, id + ' lostAtRisk');
    assert.equal(entry.deletesData, false, id + ' deletesData must be false: this card runs nothing');
  }
});

test('unknown ids fail closed to the honest unknown entry', () => {
  for (const bad of UNKNOWN_IDS) {
    const info = engine.explainLifecycle(bad);
    assert.equal(info.id, 'unknown');
    assert.equal(info.available, false);
    assert.ok(info.label.indexOf('Unknown') === 0, 'label should admit unknown: ' + info.label);
    assert.equal(info.lostAtRisk.length, 0);
    assert.ok(info.summary.indexOf('no honest description') !== -1);
  }
});

test('explanations return defensive copies of list fields', () => {
  const first = engine.explainLifecycle('rotation');
  first.stillWorks.push('mutated');
  first.lostAtRisk.push('mutated');
  const second = engine.explainLifecycle('rotation');
  assert.equal(second.stillWorks.length, engine.CATALOG.rotation.stillWorks.length);
  assert.equal(second.lostAtRisk.length, engine.CATALOG.rotation.lostAtRisk.length);
  assert.ok(second.stillWorks.indexOf('mutated') === -1);
  assert.ok(second.lostAtRisk.indexOf('mutated') === -1);
});

test('isKnownLifecycleScenario is exact', () => {
  for (const id of engine.SCENARIO_IDS) {
    assert.equal(engine.isKnownLifecycleScenario(id), true);
  }
  for (const bad of UNKNOWN_IDS) {
    assert.equal(engine.isKnownLifecycleScenario(bad), false);
  }
});

test('listLifecycleScenarios matches the catalog', () => {
  const list = engine.listLifecycleScenarios();
  assert.equal(list.length, engine.SCENARIO_IDS.length);
  for (let i = 0; i < list.length; i += 1) {
    assert.equal(list[i].id, engine.SCENARIO_IDS[i]);
    assert.equal(list[i].label, engine.CATALOG[engine.SCENARIO_IDS[i]].label);
    assert.equal(list[i].available, true);
    assert.equal(list[i].deletesData, false);
  }
});

test('rotation explains configuration rebuild honestly', () => {
  const info = engine.explainLifecycle('rotation');
  assert.equal(info.label, 'Rotation and other configuration changes');
  assert.equal(info.title, 'The page rebuilds, the data should stay');
  assert.ok(info.dataNote.indexOf('not wiped') !== -1);
  assert.ok(info.summary.indexOf('not yet saved') !== -1);
});

test('process-death separates transient state from the store', () => {
  const info = engine.explainLifecycle('process-death');
  assert.equal(info.label, 'Android stopped the app in the background');
  assert.ok(info.verification.indexOf('Required on hardware') === 0);
  assert.ok(info.dataNote.indexOf('persistent store') !== -1);
  assert.ok(info.recovery.indexOf('Export') !== -1);
});

test('background-return explains resume behavior', () => {
  const info = engine.explainLifecycle('background-return');
  assert.equal(info.label, 'Background and foreground return');
  assert.ok(info.network.indexOf('None') === 0);
  assert.ok(info.verification.indexOf('Required on hardware') === 0);
  assert.ok(info.lostAtRisk[0].indexOf('Transient state') === 0);
});

test('renderer-crash keeps the browser view separate from the store', () => {
  const info = engine.explainLifecycle('renderer-crash');
  assert.equal(info.label, 'WebView renderer crashed');
  assert.ok(info.stillWorks.length >= 2);
  assert.ok(info.dataNote.indexOf('not wiped') !== -1);
  assert.ok(info.recovery.indexOf('Reload') === 0);
});

test('low-memory explains trimming honestly', () => {
  const info = engine.explainLifecycle('low-memory');
  assert.equal(info.label, 'Low-memory trimming');
  assert.ok(info.verification.indexOf('cannot be inferred from CI') !== -1);
  assert.ok(info.dataNote.indexOf('written to disk') !== -1);
});

test('restore-backup points at Export and Import', () => {
  const info = engine.explainLifecycle('restore-backup');
  assert.equal(info.label, 'Reinstall and backup restore');
  assert.ok(info.recovery.indexOf('Export a backup') === 0);
  assert.ok(info.userAction.indexOf('import') !== -1);
  assert.ok(info.summary.indexOf('Import') !== -1);
});

test('planLifecycleChecks dedupes known ids and warns honestly', () => {
  const plan = engine.planLifecycleChecks(['rotation', 'process-death', 'rotation', 'rotation']);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ids, ['rotation', 'process-death']);
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.warnings.length, 1);
  assert.ok(plan.warnings[0].indexOf('Explaining recovery is not acceptance') === 0);
  assert.ok(plan.note.indexOf('runs nothing') !== -1);
});

test('planLifecycleChecks refuses unknown ids', () => {
  const plan = engine.planLifecycleChecks(['rotation', 'not-a-real-scenario']);
  assert.equal(plan.ok, false);
  assert.ok(plan.error.indexOf('Unknown') === 0);
  assert.equal(plan.ids.length, 0);
  assert.equal(plan.steps.length, 0);
});

test('planLifecycleChecks fails closed on non-list and empty input', () => {
  assert.equal(engine.planLifecycleChecks(null).ok, false);
  assert.equal(engine.planLifecycleChecks(undefined).ok, false);
  assert.equal(engine.planLifecycleChecks('rotation').ok, false);
  assert.equal(engine.planLifecycleChecks([]).ok, false);
});
