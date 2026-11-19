'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const logic = require('../js/release-compat-logic.js');

test('engine exposes the documented API surface', () => {
  assert.deepEqual(Object.keys(logic).sort(), ['CATALOG', 'TOPIC_IDS', 'explainTopic', 'isKnownTopic', 'listTopics', 'planUpgradePath']);
});

test('catalog covers exactly the six release topics', () => {
  assert.equal(logic.TOPIC_IDS.length, 6);
  assert.deepEqual(logic.TOPIC_IDS, ['package-identity', 'signer-continuity', 'data-migration', 'updater-security', 'device-gates', 'rollback-recovery']);
  assert.deepEqual(Object.keys(logic.CATALOG), logic.TOPIC_IDS);
});

test('isKnownTopic accepts known ids only', () => {
  for (const id of logic.TOPIC_IDS) assert.equal(logic.isKnownTopic(id), true, id);
  assert.equal(logic.isKnownTopic('nope'), false);
  assert.equal(logic.isKnownTopic(42), false);
  assert.equal(logic.isKnownTopic(null), false);
  assert.equal(logic.isKnownTopic(undefined), false);
});

test('explainTopic describes package identity plainly', () => {
  const r = logic.explainTopic('package-identity');
  assert.equal(r.available, true);
  assert.equal(r.requiresAction, false);
  assert.equal(r.id, 'package-identity');
  assert.equal(r.title, 'com.abrar.daymark is the app for life, not per version');
  assert.ok(typeof r.recovery === 'string' && r.recovery.length > 0);
  assert.ok(typeof r.summary === 'string' && r.summary.length > 0);
});

test('explainTopic marks action-required topics honestly', () => {
  for (const id of ['signer-continuity', 'data-migration', 'device-gates', 'rollback-recovery']) {
    assert.equal(logic.explainTopic(id).requiresAction, true, id);
  }
  for (const id of ['package-identity', 'updater-security']) {
    assert.equal(logic.explainTopic(id).requiresAction, false, id);
  }
});

test('explainTopic fails closed for unknown ids', () => {
  const r = logic.explainTopic('nope');
  assert.equal(r.available, false);
  assert.equal(r.label, 'Unknown release topic');
  assert.equal(r.title, 'This topic is not known');
  assert.deepEqual(r.breaksIfIgnored, []);
});

test('explainTopic fails closed for malformed ids', () => {
  for (const bad of [42, null, undefined, {}, [], '  ']) {
    assert.equal(logic.explainTopic(bad).available, false, String(bad));
  }
});

test('explainTopic returns defensive copies of arrays', () => {
  const a = logic.explainTopic('rollback-recovery');
  a.keepsWorking.push('mutated');
  const b = logic.explainTopic('rollback-recovery');
  assert.equal(b.keepsWorking.length, 2);
});

test('listTopics mirrors the catalog in order', () => {
  const topics = logic.listTopics();
  assert.equal(topics.length, 6);
  assert.deepEqual(topics.map((t) => t.id), logic.TOPIC_IDS);
  for (const t of topics) {
    assert.ok(typeof t.label === 'string' && t.label.length > 0);
    assert.equal(typeof t.available, 'boolean');
    assert.equal(typeof t.requiresAction, 'boolean');
  }
});

test('planUpgradePath plans a mixed path and warns for action topics', () => {
  const p = logic.planUpgradePath(['package-identity', 'signer-continuity']);
  assert.equal(p.ok, true);
  assert.deepEqual(p.ids, ['package-identity', 'signer-continuity']);
  assert.equal(p.steps.length, 2);
  assert.equal(p.warnings.length, 1);
  assert.ok(p.warnings[0].indexOf('Same signer, same key') !== -1);
});

test('planUpgradePath dedupes repeated topics', () => {
  const p = logic.planUpgradePath(['data-migration', 'data-migration']);
  assert.equal(p.ok, true);
  assert.deepEqual(p.ids, ['data-migration']);
  assert.equal(p.steps.length, 1);
  assert.equal(p.warnings.length, 1);
});

test('planUpgradePath refuses unknown topics instead of skipping them', () => {
  const p = logic.planUpgradePath(['package-identity', 'nope']);
  assert.equal(p.ok, false);
  assert.ok(p.error.indexOf('Unknown release topic') !== -1);
  assert.deepEqual(p.steps, []);
  assert.deepEqual(p.ids, []);
});

test('planUpgradePath rejects non-array input', () => {
  for (const bad of ['package-identity', null, undefined, { 0: 'package-identity' }]) {
    assert.equal(logic.planUpgradePath(bad).ok, false, String(bad));
  }
});

test('planUpgradePath rejects an empty list', () => {
  const p = logic.planUpgradePath([]);
  assert.equal(p.ok, false);
  assert.ok(p.error.indexOf('needs at least one known topic') !== -1);
});

test('every action-required warning embeds its recovery text', () => {
  for (const id of logic.TOPIC_IDS) {
    const entry = logic.explainTopic(id);
    if (!entry.requiresAction) continue;
    const p = logic.planUpgradePath([id]);
    assert.equal(p.ok, true, id);
    assert.equal(p.warnings.length, 1, id);
    assert.ok(p.warnings[0].indexOf(entry.label) !== -1, id);
    assert.ok(p.warnings[0].indexOf(entry.recovery) !== -1, id);
  }
});

test('planUpgradePath covers the full six-topic path honestly', () => {
  const p = logic.planUpgradePath(logic.TOPIC_IDS);
  assert.equal(p.ok, true);
  assert.equal(p.steps.length, 6);
  assert.equal(p.warnings.length, 4);
  assert.ok(p.note.indexOf('does not change any setting') !== -1);
});

test('every known topic explains scope and network honestly', () => {
  for (const id of logic.TOPIC_IDS) {
    const r = logic.explainTopic(id);
    assert.ok(typeof r.network === 'string' && r.network.length > 0, id);
    assert.ok(typeof r.scope === 'string' && r.scope.length > 0, id);
  }
  assert.ok(logic.explainTopic('updater-security').network.indexOf('HTTPS') !== -1);
  assert.ok(logic.explainTopic('data-migration').network.indexOf('None') === 0);
});

test('global engine registration stays available for the browser card', () => {
  assert.equal(typeof globalThis.DaymarkReleaseCompat.explainTopic, 'function');
});

test('module export and global registration are the same engine', () => {
  assert.equal(logic, globalThis.DaymarkReleaseCompat);
});
