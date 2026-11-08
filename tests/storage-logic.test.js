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
      if (failures.has(key)) throw new Error('Quota or access failure');
      delete data[key];
    },
    failOn(key) { failures.add(key); },
    snapshot: data
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
    'daymark.holidays.v1',
    'daymark.currency.v1',
    'daymark.zones.v1',
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
  const scan = storage.scanStorage(store);
  assert.equal(scan.presentCount, 3);
  assert.equal(scan.categories.length, storage.CATEGORIES.length);
  const byId = Object.fromEntries(scan.categories.map((entry) => [entry.id, entry]));
  assert.equal(byId.tasks.present, true);
  assert.ok(byId.tasks.bytes > 0);
  assert.equal(byId['task-backup'].present, false);
  assert.equal(byId['task-backup'].bytes, 0);
  assert.equal(byId['webhook-queue'].present, true);
  assert.equal(byId['webhook-queue'].bytes, 2);
  assert.equal(scan.totalBytes, scan.categories.reduce((sum, entry) => sum + entry.bytes, 0));
  assert.equal(byId.focus.description.length > 0, true, 'each category explains what it holds');
});

test('clearCategory removes exactly its own keys and reports failures honestly', () => {
  const store = fakeStorage({
    'daymark.tasks.v1': '[]',
    'daymark.tasks.v1.backup': '[]',
    'daymark.focus.v1': '{}'
  });
  const result = storage.clearCategory(store, 'tasks');
  assert.deepEqual(result.removed, ['daymark.tasks.v1']);
  assert.deepEqual(result.failed, []);
  assert.equal(store.snapshot['daymark.tasks.v1'], undefined, 'the task data is gone');
  assert.equal(store.snapshot['daymark.tasks.v1.backup'], '[]', 'the backup key belongs to another category');
  assert.equal(store.snapshot['daymark.focus.v1'], '{}', 'Focus data must not be touched');

  store.failOn('daymark.tasks.v1');
  store.snapshot['daymark.tasks.v1'] = '[]';
  const failed = storage.clearCategory(store, 'tasks');
  assert.deepEqual(failed.removed, []);
  assert.deepEqual(failed.failed, ['daymark.tasks.v1'], 'a failed removal is never reported as cleared');
  assert.equal(store.snapshot['daymark.tasks.v1'], '[]');
});

test('clearCategory on an empty category removes nothing and stays honest', () => {
  const store = fakeStorage({});
  const result = storage.clearCategory(store, 'currency');
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.failed, []);
});

test('clearAll sweeps every managed key once and aggregates the outcome', () => {
  const store = fakeStorage({
    'daymark.tasks.v1': '[]',
    'daymark.focus.v1': '{}',
    'daymark.feed.v1': '{}',
    'unrelated.other.key': 'keep me'
  });
  const result = storage.clearAll(store);
  assert.deepEqual(result.removedKeys.sort(), ['daymark.focus.v1', 'daymark.tasks.v1', 'daymark.feed.v1'].sort());
  assert.deepEqual(result.failedKeys, []);
  assert.equal(result.results.length, storage.CATEGORIES.length);
  assert.equal(store.snapshot['unrelated.other.key'], 'keep me', 'keys outside the prototype are never touched');
  const rescan = storage.scanStorage(store);
  assert.equal(rescan.presentCount, 0);
  assert.equal(rescan.totalBytes, 0);
});

test('unavailable or malformed storage fails closed with an honest error', () => {
  assert.throws(() => storage.scanStorage(null), /Browser storage is unavailable/);
  assert.throws(() => storage.clearCategory({ getItem: () => null }, 'tasks'), /Browser storage is unavailable/);
  assert.throws(() => storage.clearAll(undefined), /Browser storage is unavailable/);
});

test('formatBytes renders human sizes without inventing precision', () => {
  assert.equal(storage.formatBytes(0), '0 B');
  assert.equal(storage.formatBytes(511), '511 B');
  assert.equal(storage.formatBytes(1024), '1.0 KB');
  assert.equal(storage.formatBytes(15 * 1024), '15.0 KB');
  assert.equal(storage.formatBytes(-3), '0 B');
  assert.equal(storage.formatBytes(Number.NaN), '0 B');
});

test('the module exposes its constants and stays inert under Node', () => {
  assert.equal(typeof storage.CATEGORIES, 'object');
  assert.equal(typeof globalThis.DaymarkStorage, 'object');
  assert.equal(storage.categoryById('weather').label, 'Weather cache');
  assert.equal(storage.categoryById('nope'), null);
});
