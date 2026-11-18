'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../capability-registry-logic.js');

test('capability ids are stable and in card order', () => {
  assert.deepEqual(registry.CAPABILITY_IDS, [
    'task-list',
    'focus-timer',
    'backup-export-import',
    'planner-cards',
    'online-glance-cards',
    'telegram-digest',
    'webhook-events',
    'daymark-browser',
    'cross-platform-desktop'
  ]);
});

test('the self-check passes: every entry is complete and enum-valid', () => {
  const check = registry.checkRegistryInvariants();
  assert.equal(check.ok, true, 'invariant errors: ' + JSON.stringify(check.errors));
  assert.deepEqual(check.errors, []);
});

test('every entry carries the #348 metadata contract fields', () => {
  for (const id of registry.CAPABILITY_IDS) {
    const entry = registry.describeFeature(id);
    for (const field of ['label', 'title', 'summary', 'where', 'availabilityNote', 'networkNote', 'backend']) {
      assert.ok(typeof entry[field] === 'string' && entry[field].length > 0, id + ' must have a non-empty ' + field);
    }
    assert.ok(registry.AVAILABILITY_STATES.indexOf(entry.availability) !== -1, id + ' availability enum');
    assert.ok(registry.NETWORK_CLASSES.indexOf(entry.network) !== -1, id + ' network enum');
    assert.ok(registry.ROLLOUT_STATES.indexOf(entry.rollout) !== -1, id + ' rollout enum');
    assert.ok(Array.isArray(entry.permissions), id + ' permissions must be an array');
    assert.ok(Array.isArray(entry.limitations) && entry.limitations.length > 0, id + ' must state honest limitations');
  }
});

test('an unknown feature id fails closed to the honest unknown entry', () => {
  const result = registry.describeFeature('definitely-not-a-capability');
  assert.equal(result.id, 'unknown');
  assert.match(result.summary, /no honest metadata/);
  assert.equal(result.available, false);
});

test('describeFeature returns defensive copies', () => {
  const first = registry.describeFeature('task-list');
  first.permissions.push('tampered');
  first.limitations.push('tampered');
  const second = registry.describeFeature('task-list');
  assert.ok(!second.permissions.includes('tampered'), 'permissions must be a copy');
  assert.ok(!second.limitations.includes('tampered'), 'limitations must be a copy');
});

test('isKnownFeature accepts only registry ids', () => {
  for (const id of registry.CAPABILITY_IDS) assert.equal(registry.isKnownFeature(id), true, id);
  assert.equal(registry.isKnownFeature('nope'), false);
  assert.equal(registry.isKnownFeature(42), false);
  assert.equal(registry.isKnownFeature(null), false);
});

test('listFeatures exposes honest availability and network flags', () => {
  const features = registry.listFeatures();
  assert.equal(features.length, registry.CAPABILITY_IDS.length);
  const tasks = features.find((f) => f.id === 'task-list');
  assert.equal(tasks.available, true);
  assert.equal(tasks.network, 'none');
  const browser = features.find((f) => f.id === 'daymark-browser');
  assert.equal(browser.availability, 'device-only');
  assert.equal(browser.available, false, 'device-only must never claim available');
  const desktop = features.find((f) => f.id === 'cross-platform-desktop');
  assert.equal(desktop.availability, 'planned');
  assert.equal(desktop.available, false, 'planned must never claim available');
});

test('local capabilities declare network none; online ones declare their class', () => {
  for (const id of ['task-list', 'focus-timer', 'backup-export-import', 'planner-cards']) {
    assert.equal(registry.describeFeature(id).network, 'none', id);
  }
  assert.equal(registry.describeFeature('online-glance-cards').network, 'keyless-api');
  assert.equal(registry.describeFeature('telegram-digest').network, 'user-https');
  assert.equal(registry.describeFeature('webhook-events').network, 'user-https');
});

test('online capabilities deny any maintainer-paid backend', () => {
  const entry = registry.describeFeature('online-glance-cards');
  assert.match(entry.availabilityNote, /no maintainer-paid backend/);
  assert.match(entry.networkNote, /Daymark runs no server/);
});

test('daymark-browser never claims web-prototype extension support', () => {
  const entry = registry.describeFeature('daymark-browser');
  assert.match(entry.summary, /System WebView/);
  assert.ok(entry.limitations.some((line) => /not a full Chrome or Firefox extension engine/.test(line)));
});

test('the registry self-check catches planted defects', () => {
  const saved = registry.REGISTRY['task-list'].availability;
  try {
    registry.REGISTRY['task-list'].availability = 'everywhere';
    const check = registry.checkRegistryInvariants();
    assert.equal(check.ok, false);
    assert.ok(check.errors.some((message) => /task-list has an unknown availability/.test(message)));
  } finally {
    registry.REGISTRY['task-list'].availability = saved;
  }
});

test('every registry entry has a stable id in CAPABILITY_IDS and vice versa', () => {
  const check = registry.checkRegistryInvariants();
  assert.equal(check.ok, true);
  assert.equal(Object.keys(registry.REGISTRY).length, registry.CAPABILITY_IDS.length,
    'every registry entry must have a stable id in CAPABILITY_IDS');
});
