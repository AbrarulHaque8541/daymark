'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lock = require('../storage-lock.js');

function memoryStorage(seed = {}) {
  const data = Object.assign({}, seed);
  return {
    data,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    }
  };
}

test('withStorageLock runs work and releases the token', () => {
  const storage = memoryStorage();
  let ran = false;
  const result = lock.withStorageLock(
    { localStorage: storage },
    'daymark.test.lock',
    () => {
      ran = true;
      assert.ok(storage.getItem('daymark.test.lock'));
      return 42;
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.value, 42);
  assert.equal(ran, true);
  assert.equal(storage.getItem('daymark.test.lock'), null);
});

test('withStorageLock fails closed when another owner holds a fresh lock', () => {
  const storage = memoryStorage({
    'daymark.test.lock': `${Date.now()}|other-owner`
  });
  const result = lock.withStorageLock(
    { localStorage: storage },
    'daymark.test.lock',
    () => 'should-not-run'
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'lock-busy');
});

test('withStorageLock treats stale tokens as reclaimable', () => {
  const storage = memoryStorage({
    'daymark.test.lock': `${Date.now() - 60_000}|old-owner`
  });
  const result = lock.withStorageLock(
    { localStorage: storage },
    'daymark.test.lock',
    () => 'reclaimed'
  );
  assert.equal(result.ok, true);
  assert.equal(result.value, 'reclaimed');
  assert.equal(storage.getItem('daymark.test.lock'), null);
});

test('two sequential mutations both apply under the lock', () => {
  const storage = memoryStorage({ 'items': JSON.stringify(['seed']) });
  const key = 'daymark.items.lock';
  const mutate = (item) => lock.withStorageLock({ localStorage: storage }, key, () => {
    const current = JSON.parse(storage.getItem('items') || '[]');
    current.push(item);
    storage.setItem('items', JSON.stringify(current));
    return current.slice();
  });
  const a = mutate('from-A');
  const b = mutate('from-B');
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.deepEqual(JSON.parse(storage.getItem('items')), ['seed', 'from-A', 'from-B']);
});
