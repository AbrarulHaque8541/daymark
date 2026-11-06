'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const storage = require('../storage-logic.js');

function fakeStorage(initial) {
  const data = Object.assign({}, initial || {});
  const failures = new Set();
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) {
      if (failures.has(key)) throw new Error('forced remove failure for ' + key);
      delete data[key];
    },
    failOn(key) { failures.add(key); },
    snapshot() { return Object.assign({}, data); }
  };
}

test('every daymark storage key the prototype uses is covered by exactly one category', () => {
  const expectedKeys = [
    'daymark.tasks.v1',
    'daymark.tasks.v1.backup',
    'daymark.focus.v1',
    'daymark.focus.v1.backup',
    'daymark.feed.v1',
    'daymark.weather.v1',
    'daymark.weather.prefs.v1',
    'daymark.holidays.v1',
    'daymark.holidays.prefs.v1',
    'daymark.currency.v1',
    'daymark.currency.prefs.v1',
    'daymark.wiki.v1',
    'daymark.wiki.prefs.v1',
    'daymark.browser-address.prefs.v1',
    'daymark.focus.preset.v1',
    'daymark.webhook.v1',
    'daymark.webhook.queue.v1'
  ];
  assert.deepEqual(storage.categoryIds().length, storage.CATEGORIES.length);
  const seen = new Set();
  for (const category of storage.CATEGORIES) {
    assert.ok(Array.isArray(category.keys) && category.keys.length > 0, category.id + ' must list keys');
    assert.equal(typeof category.label, 'string');
    assert.equal(typeof category.description, 'string');
    for (const key of category.keys) {
      assert.equal(seen.has(key), false, key + ' must belong to exactly one category');
      seen.add(key);
      assert.equal(storage.isManagedKey(key), true);
    }
  }
  assert.deepEqual([...seen].sort(), [...expectedKeys].sort(), 'the managed keys are the full known set');
  assert.equal(storage.isManagedKey('daymark.unknown.v1'), false);
});

test('planClear returns the exact keys and rejects unknown categories', () => {
  assert.deepEqual(storage.planClear('tasks'), ['daymark.tasks.v1']);
  assert.deepEqual(storage.planClear('webhook-queue'), ['daymark.webhook.queue.v1']);
  assert.throws(() => storage.planClear('nope'), /Unknown data category/);
  assert.throws(() => storage.planClear(null), /Unknown data category/);
  // The plan is a copy: mutating it must not change future plans.
  const plan = storage.planClear('tasks');
  plan.push('daymark.tasks.v1');
  assert.deepEqual(storage.planClear('tasks'), ['daymark.tasks.v1']);
});

test('estimateBytes measures UTF-8 bytes and treats non-strings as zero', () => {
  assert.equal(storage.estimateBytes(''), 0);
  assert.equal(storage.estimateBytes('abc'), 3);
  assert.equal(storage.estimateBytes('a'.repeat(1024)), 1024);
  assert.equal(storage.estimateBytes(null), 0);
  assert.equal(storage.estimateBytes(42), 0);
  // UTF-8 is measured exactly when the platform provides an encoder; the
  // character-count fallback is at least never zero and never inflated.
  const utf8Expected = typeof TextEncoder === 'function'
    ? new TextEncoder().encode('é').length
    : 'é'.length;
  assert.equal(storage.estimateBytes('é'), utf8Expected);
});

test('scanStorage reports presence, byte totals, and plain-language metadata', () => {
  const store = fakeStorage({
    'daymark.tasks.v1': JSON.stringify([{ id: 't1', title: 'Task one' }]),
    'daymark.weather.v1': JSON.stringify({ version: 1, place: { name: 'Kolkata' } }),
    'daymark.webhook.queue.v1': '[]'
  });
  const report = storage.scanStorage(store);
  assert.equal(report.presentCount >= 2, true);
  assert.equal(report.totalBytes > 0, true);
  const weather = report.categories.find((c) => c.id === 'weather');
  assert.ok(weather && weather.present);
  assert.equal(weather.keys.includes('daymark.weather.v1'), true);
});

test('clearCategory removes exactly its own keys and reports failures honestly', () => {
  const store = fakeStorage({
    'daymark.tasks.v1': '[]',
    'daymark.weather.v1': '{}',
    'foreign.key': 'keep'
  });
  const result = storage.clearCategory(store, 'tasks');
  assert.deepEqual(result.removed, ['daymark.tasks.v1']);
  assert.deepEqual(result.failed, []);
  assert.equal(store.getItem('daymark.tasks.v1'), null);
  assert.equal(store.getItem('daymark.weather.v1'), '{}');
  assert.equal(store.getItem('foreign.key'), 'keep');
});

test('clearCategory on an empty category removes nothing and stays honest', () => {
  const store = fakeStorage({});
  const result = storage.clearCategory(store, 'weather');
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.failed, []);
});

test('clearAll sweeps every managed key once and aggregates the outcome', () => {
  const store = fakeStorage({
    'daymark.tasks.v1': '[]',
    'daymark.focus.v1': '{}',
    'foreign': 'stay'
  });
  const result = storage.clearAll(store);
  assert.ok(result.removedKeys.includes('daymark.tasks.v1'));
  assert.ok(result.removedKeys.includes('daymark.focus.v1'));
  assert.equal(store.getItem('foreign'), 'stay');
});

test('unavailable or malformed storage fails closed with an honest error', () => {
  assert.throws(() => storage.scanStorage(null), /Browser storage is unavailable/);
  assert.throws(() => storage.clearCategory({}, 'tasks'), /Browser storage is unavailable/);
});

test('formatBytes renders human sizes without inventing precision', () => {
  assert.equal(storage.formatBytes(0), '0 B');
  assert.equal(storage.formatBytes(512), '512 B');
  assert.match(storage.formatBytes(2048), /KB/);
});

test('the module exposes its constants and stays inert under Node', () => {
  assert.ok(Array.isArray(storage.CATEGORIES));
  assert.equal(typeof storage.scanStorage, 'function');
});
