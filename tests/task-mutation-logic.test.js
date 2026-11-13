'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const taskMutation = require('../task-mutation-logic.js');

const TASK_KEY = taskMutation.TASK_STORAGE_KEY;
const GENERATION_KEY = taskMutation.GENERATION_KEY;

function task(id, title, completed = false) {
  return { id, title, completed, updatedAt: '2026-11-13T12:00:00.000Z' };
}

function makeStorage(seed) {
  const data = new Map(Object.entries(seed || {}));
  const failures = { reads: new Set(), writes: new Set(), removes: new Set() };
  return {
    data,
    failures,
    getItem(key) {
      if (failures.reads.has(key)) throw new Error('SecurityError');
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      if (failures.writes.has(key)) throw new Error('QuotaExceededError');
      data.set(key, String(value));
    },
    removeItem(key) {
      if (failures.removes.has(key)) throw new Error('SecurityError');
      data.delete(key);
    }
  };
}

function makeLocks(options) {
  const opts = options || {};
  const tails = new Map();
  const calls = [];
  const locks = {
    calls,
    request(name, lockOptions, callback) {
      calls.push(name);
      if (opts.fail && opts.fail.has(name)) return Promise.reject(new Error('lock denied'));
      const previous = tails.get(name) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const tail = previous.then(() => gate);
      tails.set(name, tail);
      return previous.then(() => callback({ name, mode: lockOptions && lockOptions.mode || 'exclusive' }))
        .finally(() => {
          release();
          if (tails.get(name) === tail) tails.delete(name);
        });
    }
  };
  return locks;
}

function snapshot(storage, tasks, generation = 0, clearEpoch = 0) {
  storage.setItem(TASK_KEY, JSON.stringify(tasks));
  storage.setItem(GENERATION_KEY, JSON.stringify({ version: 1, generation, clearEpoch }));
}

function commit(storage, locks, baseTasks, desiredTasks, options) {
  const read = taskMutation.readGeneration(storage);
  const meta = read.ok ? read.value : { generation: 0, clearEpoch: 0 };
  return taskMutation.commitTaskSnapshot({
    storage,
    lockManager: locks,
    baseTasks,
    desiredTasks,
    expectedGeneration: options && options.expectedGeneration !== undefined ? options.expectedGeneration : meta.generation,
    expectedClearEpoch: options && options.expectedClearEpoch !== undefined ? options.expectedClearEpoch : meta.clearEpoch
  });
}

const parseTasks = (tasks) => ({ tasks, rejectedCount: 0 });

test('a stale task save after Clear All aborts without recreating the task key', async () => {
  const original = task('stale-task', 'Old task');
  const storage = makeStorage();
  const locks = makeLocks();
  snapshot(storage, [original]);
  const staleEpoch = taskMutation.readGeneration(storage).value.clearEpoch;

  const cleared = await taskMutation.withLocksInOrder(locks, taskMutation.CLEAR_ALL_LOCK_ORDER, () => {
    const advanced = taskMutation.advanceClearEpoch(storage);
    assert.equal(advanced.ok, true);
    storage.removeItem(TASK_KEY);
    return advanced.value;
  });
  assert.equal(cleared.ok, true);

  const result = await taskMutation.commitTaskSnapshot({
    storage,
    lockManager: locks,
    validateTasks: parseTasks,
    baseTasks: [original],
    desiredTasks: [original, task('new-local', 'New task')],
    expectedGeneration: 0,
    expectedClearEpoch: staleEpoch
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cleared');
  assert.equal(storage.getItem(TASK_KEY), null, 'the cleared key stays absent');
});

test('delete-vs-edit fails closed instead of resurrecting a concurrently deleted task', async () => {
  const base = [task('same', 'Original')];
  const storage = makeStorage();
  const locks = makeLocks();
  snapshot(storage, base);

  const deleted = await commit(storage, locks, base, []);
  assert.equal(deleted.ok, true);
  const edited = await taskMutation.commitTaskSnapshot({
    storage,
    lockManager: locks,
    validateTasks: parseTasks,
    baseTasks: base,
    desiredTasks: [task('same', 'Edited in stale tab')],
    expectedGeneration: 0,
    expectedClearEpoch: 0
  });
  assert.equal(edited.ok, false);
  assert.equal(edited.reason, 'conflict');
  assert.deepEqual(JSON.parse(storage.getItem(TASK_KEY)), []);
});

test('concurrent disjoint task edits are rebased and both survive', async () => {
  const base = [task('a', 'A'), task('b', 'B')];
  const storage = makeStorage();
  const locks = makeLocks();
  snapshot(storage, base);

  const a = task('a', 'A edited');
  const b = task('b', 'B edited');
  const results = await Promise.all([
    commit(storage, locks, base, [a, base[1]]),
    commit(storage, locks, base, [base[0], b])
  ]);
  assert.ok(results.every((result) => result.ok));
  assert.ok(results.some((result) => result.generationMismatch), 'the later writer detects and rebases a generation mismatch');
  assert.deepEqual(JSON.parse(storage.getItem(TASK_KEY)), [a, b]);
});

test('task completion awaits webhook queue append while the task lock is held', async () => {
  const base = [task('complete', 'Finish report')];
  const completed = [task('complete', 'Finish report', true)];
  const storage = makeStorage();
  const locks = makeLocks();
  snapshot(storage, base);
  let callbackRan = false;

  const result = await taskMutation.commitTaskSnapshot({
    storage,
    lockManager: locks,
    validateTasks: parseTasks,
    baseTasks: base,
    desiredTasks: completed,
    expectedGeneration: 0,
    expectedClearEpoch: 0,
    afterCommit: async (canonicalTasks) => {
      assert.equal(locks.calls.at(-1), taskMutation.TASK_LOCK_NAME);
      assert.equal(JSON.parse(storage.getItem(TASK_KEY))[0].completed, true, 'the task commit precedes its webhook append');
      const queued = await taskMutation.withExclusiveLock(locks, taskMutation.WEBHOOK_QUEUE_LOCK_NAME, () => {
        const events = JSON.parse(storage.getItem('daymark.webhook.queue.v1') || '[]');
        events.push({ taskId: canonicalTasks[0].id });
        storage.setItem('daymark.webhook.queue.v1', JSON.stringify(events));
        callbackRan = true;
        return events;
      });
      assert.equal(queued.ok, true);
      return { queued: true };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(callbackRan, true);
  assert.deepEqual(locks.calls, [taskMutation.TASK_LOCK_NAME, taskMutation.WEBHOOK_QUEUE_LOCK_NAME]);
  assert.deepEqual(JSON.parse(storage.getItem('daymark.webhook.queue.v1')), [{ taskId: 'complete' }]);
});

test('unreadable storage and unavailable task locks never report a successful commit', async () => {
  const original = task('a', 'A');
  const storage = makeStorage();
  const deniedLocks = makeLocks({ fail: new Set([taskMutation.TASK_LOCK_NAME]) });
  snapshot(storage, [original]);
  const desired = [task('a', 'Changed')];

  const lockFailure = await commit(storage, deniedLocks, [original], desired);
  assert.equal(lockFailure.ok, false);
  assert.match(lockFailure.reason, /lock/);
  assert.deepEqual(JSON.parse(storage.getItem(TASK_KEY)), [original]);

  storage.failures.reads.add(GENERATION_KEY);
  const unreadable = await commit(storage, makeLocks(), [original], desired);
  assert.equal(unreadable.ok, false);
  assert.equal(unreadable.reason, 'generation-unreadable');
  assert.deepEqual(JSON.parse(storage.getItem(TASK_KEY)), [original]);
});

test('Clear All acquires the shared locks in task, delivery, queue, Focus order', async () => {
  const locks = makeLocks();
  const result = await taskMutation.withLocksInOrder(locks, taskMutation.CLEAR_ALL_LOCK_ORDER, () => 'cleared');
  assert.deepEqual(locks.calls, [
    taskMutation.TASK_LOCK_NAME,
    taskMutation.WEBHOOK_DELIVERY_LOCK_NAME,
    taskMutation.WEBHOOK_QUEUE_LOCK_NAME,
    taskMutation.FOCUS_LOCK_NAME
  ]);
  assert.deepEqual(result, { ok: true, value: 'cleared' });
});
