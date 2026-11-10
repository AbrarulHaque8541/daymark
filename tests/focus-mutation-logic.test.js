'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const focusMutation = require('../focus-mutation-logic.js');

function makeLockManager() {
  const tails = new Map();
  return {
    request(name, options, callback) {
      assert.equal(options.mode, 'exclusive');
      const previous = tails.get(name) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      tails.set(name, previous.then(() => gate));
      return previous.then(callback).finally(release);
    }
  };
}

function makeStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function snapshot(session = null, log = []) {
  return { session, log };
}

function commit({ locks, storage, baseRaw, desiredSnapshot, expectedGeneration = 0 }) {
  return focusMutation.commitFocusSnapshot({
    lockManager: locks,
    storage,
    key: 'daymark.focus.v1',
    baseRaw,
    expectedGeneration,
    desiredSnapshot
  });
}

test('Focus generation defaults to zero and advances monotonically under the shared lock', async () => {
  const storage = makeStorage();
  const locks = makeLockManager();
  assert.deepEqual(focusMutation.readFocusGeneration(storage), { ok: true, value: 0 });
  const locked = await focusMutation.withFocusMutationLock(locks, () =>
    focusMutation.incrementFocusGeneration(storage));
  assert.deepEqual(locked, { ok: true, value: { ok: true, value: 1 } });
  assert.deepEqual(focusMutation.readFocusGeneration(storage), { ok: true, value: 1 });
});

test('concurrent additions to different Focus log entries are merged without loss', async () => {
  const base = snapshot(null, [{ id: 'base', elapsedMs: 1000 }]);
  const baseRaw = JSON.stringify(base);
  const storage = makeStorage({ 'daymark.focus.v1': baseRaw });
  const locks = makeLockManager();
  const results = await Promise.all([
    commit({ locks, storage, baseRaw, desiredSnapshot: snapshot(null, base.log.concat({ id: 'tab-a', elapsedMs: 2000 })) }),
    commit({ locks, storage, baseRaw, desiredSnapshot: snapshot(null, base.log.concat({ id: 'tab-b', elapsedMs: 3000 })) })
  ]);
  assert.equal(results.every((result) => result.ok), true);
  const saved = JSON.parse(storage.getItem('daymark.focus.v1'));
  assert.deepEqual(saved.log.map((entry) => entry.id), ['base', 'tab-a', 'tab-b']);
});

test('afterCommit runs after the Focus write while the mutation lock is still held', async () => {
  const key = 'daymark.focus.v1';
  const baseRaw = JSON.stringify(snapshot());
  const storage = makeStorage({ [key]: baseRaw });
  let lockHeld = false;
  let callbackObservedLock = false;
  const locks = {
    request(name, options, callback) {
      assert.equal(name, focusMutation.FOCUS_MUTATION_LOCK);
      assert.equal(options.mode, 'exclusive');
      return Promise.resolve().then(() => {
        lockHeld = true;
        return callback();
      }).finally(() => { lockHeld = false; });
    }
  };

  const result = await focusMutation.commitFocusSnapshot({
    lockManager: locks,
    storage,
    key,
    baseRaw,
    expectedGeneration: 0,
    desiredSnapshot: snapshot(null, [{ id: 'committed-log' }]),
    afterCommit(committed) {
      callbackObservedLock = lockHeld;
      assert.equal(storage.getItem(key), committed.payload,
        'the callback observes the durable payload before the lock is released');
      committed.adopted = true;
    }
  });

  assert.equal(result.ok, true);
  assert.equal(callbackObservedLock, true);
  assert.equal(result.adopted, true);
  assert.equal(lockHeld, false, 'the lock is released after state reconciliation completes');
});

test('concurrent edits to different active Focus sessions fail closed instead of overwriting', async () => {
  const baseRaw = JSON.stringify(snapshot());
  const storage = makeStorage({ 'daymark.focus.v1': baseRaw });
  const locks = makeLockManager();
  const results = await Promise.all([
    commit({ locks, storage, baseRaw, desiredSnapshot: snapshot({ id: 'session-a', state: 'running' }) }),
    commit({ locks, storage, baseRaw, desiredSnapshot: snapshot({ id: 'session-b', state: 'running' }) })
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => result.reason === 'session-conflict').length, 1);
  const saved = JSON.parse(storage.getItem('daymark.focus.v1'));
  assert.ok(saved.session.id === 'session-a' || saved.session.id === 'session-b');
});

test('a writer queued before Clear Focus cannot recreate the removed key', async () => {
  const storage = makeStorage();
  const locks = makeLockManager();
  const desired = snapshot({ id: 'stale-session', state: 'running' });
  const clear = await focusMutation.withFocusMutationLock(locks, () => {
    const generation = focusMutation.incrementFocusGeneration(storage);
    storage.removeItem('daymark.focus.v1');
    return generation;
  });
  assert.equal(clear.value.ok, true);
  const result = await commit({
    locks,
    storage,
    baseRaw: null,
    desiredSnapshot: desired,
    expectedGeneration: 0
  });
  assert.deepEqual(result, { ok: false, reason: 'stale-generation', conflicts: [] });
  assert.equal(storage.getItem('daymark.focus.v1'), null);
});

test('a stale preset write is rejected after the Focus generation changes', async () => {
  const original = JSON.stringify({ preset: 'focus' });
  const storage = makeStorage({ 'daymark.focus.preset.v1': original });
  const locks = makeLockManager();
  await focusMutation.withFocusMutationLock(locks, () => focusMutation.incrementFocusGeneration(storage));
  const result = await focusMutation.commitFocusPreset({
    lockManager: locks,
    storage,
    key: 'daymark.focus.preset.v1',
    baseRaw: original,
    desiredRaw: JSON.stringify({ preset: 'long-break' }),
    expectedGeneration: 0
  });
  assert.deepEqual(result, { ok: false, reason: 'stale-generation' });
  assert.equal(storage.getItem('daymark.focus.preset.v1'), original);
});

test('invalid generation metadata prevents Focus writes and clears from proceeding', async () => {
  const storage = makeStorage({ [focusMutation.FOCUS_GENERATION_KEY]: 'not-a-counter' });
  const locks = makeLockManager();
  assert.equal(focusMutation.readFocusGeneration(storage).ok, false);
  const result = await commit({
    locks,
    storage,
    baseRaw: null,
    desiredSnapshot: snapshot({ id: 'new', state: 'running' })
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'generation-invalid');
  const increment = await focusMutation.withFocusMutationLock(locks, () =>
    focusMutation.incrementFocusGeneration(storage));
  assert.equal(increment.value.ok, false);
  assert.equal(storage.getItem('daymark.focus.v1'), null);
});

test('duplicate or malformed Focus log entries are rejected before storage writes', async () => {
  const storage = makeStorage();
  const locks = makeLockManager();
  const result = await commit({
    locks,
    storage,
    baseRaw: null,
    desiredSnapshot: snapshot(null, [{ id: 'same' }, { id: 'same' }])
  });
  assert.deepEqual(result, { ok: false, reason: 'invalid-snapshot', conflicts: [] });
  assert.equal(storage.getItem('daymark.focus.v1'), null);
});


test('domain validation rejects an invalid active session before writing', async () => {
  const storage = makeStorage();
  const locks = makeLockManager();
  const result = await focusMutation.commitFocusSnapshot({
    lockManager: locks,
    storage,
    key: 'daymark.focus.v1',
    baseRaw: null,
    expectedGeneration: 0,
    desiredSnapshot: snapshot({ id: 'invalid-session' }),
    validateSnapshot: (value) => value.session === null
  });
  assert.deepEqual(result, { ok: false, reason: 'invalid-snapshot', conflicts: [] });
  assert.equal(storage.getItem('daymark.focus.v1'), null);
});

test('Focus commits fail closed when Web Locks are unavailable', async () => {
  const storage = makeStorage();
  const result = await commit({
    locks: null,
    storage,
    baseRaw: null,
    desiredSnapshot: snapshot({ id: 'no-lock', state: 'running' })
  });
  assert.deepEqual(result, { ok: false, reason: 'coordination-unavailable' });
  assert.equal(storage.getItem('daymark.focus.v1'), null);
});
