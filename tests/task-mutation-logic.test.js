const test = require('node:test');
const assert = require('node:assert/strict');
const mutation = require('../task-mutation-logic.js');

function makeTask(id, title) {
  return {
    id,
    title,
    dueDate: null,
    priority: 'medium',
    completed: false,
    createdAt: '2026-11-09T12:00:00.000Z',
    updatedAt: '2026-11-09T12:00:00.000Z'
  };
}

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

function makeStorage(tasks) {
  let raw = JSON.stringify(tasks);
  let generationRaw = null;
  return {
    get raw() { return raw; },
    get generationRaw() { return generationRaw; },
    getItem(key) {
      if (key === mutation.TASK_GENERATION_KEY) return generationRaw;
      assert.equal(key, 'daymark.tasks.v1');
      return raw;
    },
    setItem(key, value) {
      if (key === mutation.TASK_GENERATION_KEY) {
        generationRaw = String(value);
        return;
      }
      assert.equal(key, 'daymark.tasks.v1');
      raw = String(value);
    },
    removeItem(key) {
      assert.equal(key, 'daymark.tasks.v1');
      raw = null;
    }
  };
}

function readCurrent(raw) {
  if (raw === null) return { ok: true, tasks: [] };
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, reason: 'invalid-current' };
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? { ok: true, tasks: parsed }
      : { ok: false, reason: 'invalid-current' };
  } catch (error) {
    return { ok: false, reason: 'invalid-current' };
  }
}

function commit(lockManager, storage, baseTasks, desiredTasks, expectedGeneration) {
  const generation = mutation.readTaskGeneration(storage);
  return mutation.commitTaskSnapshot({
    lockManager,
    storage,
    key: 'daymark.tasks.v1',
    baseTasks,
    desiredTasks,
    expectedGeneration: expectedGeneration === undefined ? generation.value : expectedGeneration,
    readCurrent
  });
}

test('Clear All lock order places Focus after task and webhook locks', () => {
  assert.equal(mutation.FOCUS_MUTATION_LOCK, 'daymark.focus.mutation.v1');
  assert.deepEqual(mutation.CLEAR_ALL_LOCK_ORDER, [
    mutation.TASK_MUTATION_LOCK,
    mutation.WEBHOOK_DELIVERY_LOCK,
    mutation.WEBHOOK_QUEUE_LOCK,
    mutation.FOCUS_MUTATION_LOCK
  ]);
});

test('concurrent additions from two tabs both survive the shared origin lock', async () => {
  const base = [makeTask('existing', 'Existing')];
  const storage = makeStorage(base);
  const locks = makeLockManager();
  const tabA = commit(locks, storage, base, base.concat(makeTask('from-a', 'From A')));
  const tabB = commit(locks, storage, base, base.concat(makeTask('from-b', 'From B')));

  const results = await Promise.all([tabA, tabB]);
  assert.equal(results.every((result) => result.ok), true);
  const saved = JSON.parse(storage.raw);
  assert.deepEqual(saved.map((task) => task.id).sort(), ['existing', 'from-a', 'from-b']);
});

test('concurrent edits to different task ids are merged without losing either edit', async () => {
  const base = [makeTask('a', 'A'), makeTask('b', 'B')];
  const storage = makeStorage(base);
  const locks = makeLockManager();
  const desiredA = [makeTask('a', 'A edited'), base[1]];
  const desiredB = [base[0], makeTask('b', 'B edited')];

  const results = await Promise.all([
    commit(locks, storage, base, desiredA),
    commit(locks, storage, base, desiredB)
  ]);
  assert.equal(results.every((result) => result.ok), true);
  const saved = JSON.parse(storage.raw);
  assert.equal(saved.find((task) => task.id === 'a').title, 'A edited');
  assert.equal(saved.find((task) => task.id === 'b').title, 'B edited');
});

test('same-task concurrent edits fail closed instead of silently choosing a last writer', async () => {
  const base = [makeTask('a', 'Original')];
  const storage = makeStorage(base);
  const locks = makeLockManager();

  const results = await Promise.all([
    commit(locks, storage, base, [makeTask('a', 'Edit from A')]),
    commit(locks, storage, base, [makeTask('a', 'Edit from B')])
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => result.reason === 'conflict').length, 1);
  assert.ok(['Edit from A', 'Edit from B'].includes(JSON.parse(storage.raw)[0].title));
});

test('delete racing with an edit is a conflict and preserves the winning snapshot', async () => {
  const base = [makeTask('a', 'Original')];
  const storage = makeStorage(base);
  const locks = makeLockManager();

  const results = await Promise.all([
    commit(locks, storage, base, []),
    commit(locks, storage, base, [makeTask('a', 'Edited')])
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => result.reason === 'conflict').length, 1);
  const saved = JSON.parse(storage.raw);
  assert.ok(saved.length === 0 || saved[0].title === 'Edited');
});

test('missing Web Locks fails closed without changing canonical storage', async () => {
  const base = [makeTask('a', 'Original')];
  const storage = makeStorage(base);
  const result = await commit(null, storage, base, [makeTask('a', 'Edited')]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'coordination-unavailable');
  assert.deepEqual(JSON.parse(storage.raw), base);
});

test('a rejected Web Lock fails closed without changing canonical storage', async () => {
  const base = [makeTask('a', 'Original')];
  const storage = makeStorage(base);
  const locks = { request: () => Promise.reject(new Error('lock service failed')) };
  const result = await commit(locks, storage, base, [makeTask('a', 'Edited')]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'lock-failed');
  assert.deepEqual(JSON.parse(storage.raw), base);
});

test('invalid current storage is not overwritten when the reader rejects it', async () => {
  const base = [makeTask('a', 'Original')];
  const storage = makeStorage(base);
  storage.setItem('daymark.tasks.v1', '{broken');
  const result = await commit(makeLockManager(), storage, base, [makeTask('a', 'Edited')]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid-current');
  assert.equal(storage.raw, '{broken');
});

test('storage quota failure never reports a successful task save', async () => {
  const base = [makeTask('a', 'Original')];
  const storage = makeStorage(base);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  const result = await commit(makeLockManager(), storage, base, [makeTask('a', 'Edited')]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'storage-write-failed');
  assert.deepEqual(JSON.parse(storage.raw), base);
});

test('an already-applied identical mutation is idempotent', async () => {
  const base = [makeTask('a', 'Original')];
  const desired = [makeTask('a', 'Edited')];
  const storage = makeStorage(desired);
  const result = await commit(makeLockManager(), storage, base, desired);
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(storage.raw), desired);
});

test('a second tab importing an identical task is idempotent and reports no new addition', async () => {
  const base = [makeTask('existing', 'Existing')];
  const desired = base.concat(makeTask('same-import', 'Imported once'));
  const storage = makeStorage(base);
  const locks = makeLockManager();

  const first = await commit(locks, storage, base, desired);
  const second = await commit(locks, storage, base, desired);

  assert.equal(first.ok, true);
  assert.deepEqual(first.addedIds, ['same-import']);
  assert.equal(second.ok, true);
  assert.deepEqual(second.addedIds, []);
  assert.equal(JSON.parse(storage.raw).filter((task) => task.id === 'same-import').length, 1);
});

test('destructive data actions share the exact same origin-wide task lock', async () => {
  const locks = makeLockManager();
  const order = [];
  const first = mutation.withTaskMutationLock(locks, async () => {
    order.push('first-start');
    await Promise.resolve();
    order.push('first-end');
    return 'first';
  });
  const second = mutation.withTaskMutationLock(locks, () => {
    order.push('second');
    return 'second';
  });

  const results = await Promise.all([first, second]);
  assert.deepEqual(order, ['first-start', 'first-end', 'second']);
  assert.deepEqual(results.map((result) => result.value), ['first', 'second']);
});

test('destructive data actions fail closed when the shared task lock is unavailable', async () => {
  let called = false;
  const result = await mutation.withTaskMutationLock(null, () => { called = true; });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'coordination-unavailable');
  assert.equal(called, false);
});

test('ordered domain locks acquire task, delivery, queue, then Focus before destructive work', async () => {
  const calls = [];
  const locks = {
    request(name, options, callback) {
      assert.equal(options.mode, 'exclusive');
      calls.push(name);
      return Promise.resolve().then(callback);
    }
  };
  const result = await mutation.withLocksInOrder(locks, mutation.CLEAR_ALL_LOCK_ORDER, () => {
    calls.push('callback');
    return 'cleared';
  });
  assert.deepEqual(calls, [mutation.TASK_MUTATION_LOCK, mutation.WEBHOOK_DELIVERY_LOCK,
    mutation.WEBHOOK_QUEUE_LOCK, mutation.FOCUS_MUTATION_LOCK, 'callback']);
  assert.deepEqual(result, { ok: true, value: 'cleared' });
});

test('ordered domain lock failure never runs a partial destructive callback', async () => {
  const calls = [];
  const locks = {
    request(name, options, callback) {
      calls.push(name);
      if (name === mutation.WEBHOOK_QUEUE_LOCK) return Promise.reject(new Error('queue lock unavailable'));
      return Promise.resolve().then(callback);
    }
  };
  let cleared = false;
  const result = await mutation.withLocksInOrder(locks, mutation.CLEAR_ALL_LOCK_ORDER, () => { cleared = true; });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'lock-failed');
  assert.equal(cleared, false);
  assert.deepEqual(calls, [mutation.TASK_MUTATION_LOCK, mutation.WEBHOOK_DELIVERY_LOCK, mutation.WEBHOOK_QUEUE_LOCK]);
});

test('afterCommit is awaited inside the task lock and receives only actual changed task ids', async () => {
  const base = [makeTask('a', 'A')];
  const storage = makeStorage(base);
  const order = [];
  const locks = {
    request(name, options, callback) {
      order.push('lock-start');
      return Promise.resolve().then(callback).finally(() => order.push('lock-end'));
    }
  };
  const result = await mutation.commitTaskSnapshot({
    lockManager: locks,
    storage,
    key: 'daymark.tasks.v1',
    baseTasks: base,
    desiredTasks: [makeTask('a', 'A completed')],
    expectedGeneration: 0,
    readCurrent,
    afterCommit: async (commitResult) => {
      order.push('after-commit');
      assert.deepEqual(commitResult.changedIds, ['a']);
      assert.deepEqual(commitResult.previousTasks, base);
      assert.equal(JSON.parse(storage.raw)[0].title, 'A completed');
      await Promise.resolve();
      order.push('after-commit-finished');
    }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(order, ['lock-start', 'after-commit', 'after-commit-finished', 'lock-end']);
  assert.deepEqual(result.changedIds, ['a']);
});

test('task equality is independent of object property insertion order', () => {
  const left = [{ id: 'a', title: 'A', completed: false }];
  const right = [{ completed: false, title: 'A', id: 'a' }];
  assert.equal(mutation.areTaskListsEqual(left, right), true);
});


test('task generation is monotonic, retained outside user data, and checked before merge', async () => {
  const storage = makeStorage([makeTask('old', 'Old')]);
  assert.deepEqual(mutation.readTaskGeneration(storage), { ok: true, value: 0 });
  const locks = makeLockManager();
  const advanced = await mutation.withTaskMutationLock(locks, () => {
    const next = mutation.incrementTaskGeneration(storage);
    storage.removeItem('daymark.tasks.v1');
    return next;
  });
  assert.equal(advanced.ok, true);
  assert.deepEqual(advanced.value, { ok: true, value: 1 });
  assert.equal(storage.raw, null, 'the primary task key is removed');
  assert.equal(storage.generationRaw, '1', 'the non-personal generation survives the clear');
  const stale = await commit(locks, storage, [], [makeTask('stale', 'Stale')], 0);
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'stale-generation');
  assert.equal(storage.raw, null, 'a stale writer cannot recreate cleared tasks');
  const fresh = await commit(locks, storage, [], [makeTask('fresh', 'Fresh')], 1);
  assert.equal(fresh.ok, true, 'a new intent using the post-clear generation can save');
  assert.deepEqual(JSON.parse(storage.raw).map((task) => task.id), ['fresh']);
});

test('a task mutation queued behind Clear All is rejected using its captured generation', async () => {
  const storage = makeStorage([]);
  const locks = makeLockManager();
  let releaseClear;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const clear = mutation.withTaskMutationLock(locks, async () => {
    const generation = mutation.incrementTaskGeneration(storage);
    assert.equal(generation.ok, true);
    storage.removeItem('daymark.tasks.v1');
    markStarted();
    await new Promise((resolve) => { releaseClear = resolve; });
    return generation;
  });
  await started;
  const queuedStaleWrite = commit(locks, storage, [], [makeTask('queued', 'Queued before clear')], 0);
  releaseClear();
  await clear;
  const stale = await queuedStaleWrite;
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'stale-generation');
  assert.equal(storage.raw, null, 'the queued stale addition remains absent');
  const fresh = await commit(locks, storage, [], [makeTask('fresh', 'Fresh after clear')], 1);
  assert.equal(fresh.ok, true);
  assert.deepEqual(JSON.parse(storage.raw).map((task) => task.id), ['fresh']);
});

test('invalid or unreadable task generation fails closed without changing task data', async () => {
  const storage = makeStorage([makeTask('a', 'A')]);
  storage.setItem(mutation.TASK_GENERATION_KEY, '01');
  const invalid = await commit(makeLockManager(), storage, [makeTask('a', 'A')], [makeTask('a', 'Changed')], 1);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, 'generation-invalid');
  assert.equal(JSON.parse(storage.raw)[0].title, 'A');
  storage.setItem(mutation.TASK_GENERATION_KEY, '2');
  storage.getItem = () => { throw new Error('blocked'); };
  const unreadable = await commit(makeLockManager(), storage, [makeTask('a', 'A')], [makeTask('a', 'Changed')], 2);
  assert.equal(unreadable.ok, false);
  assert.equal(unreadable.reason, 'generation-unreadable');
  assert.equal(JSON.parse(storage.raw)[0].title, 'A');
});


test('a fresh task commit retires the retained clear reason without resetting the generation', async () => {
  const storage = makeStorage([]);
  storage.setItem(mutation.TASK_GENERATION_KEY, '1:task-backup');
  const result = await commit(makeLockManager(), storage, [], [makeTask('fresh', 'Fresh')], 1);
  assert.equal(result.ok, true);
  assert.equal(storage.generationRaw, '1', 'the monotonic value remains while the clear reason is retired');
  assert.deepEqual(JSON.parse(storage.raw).map((task) => task.id), ['fresh']);
});

test('a failed clear-reason retirement warns without rolling back a committed task snapshot', async () => {
  const storage = makeStorage([]);
  storage.setItem(mutation.TASK_GENERATION_KEY, '1:all');
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key === mutation.TASK_GENERATION_KEY && String(value) === '1') throw new Error('quota');
    originalSetItem(key, value);
  };
  const result = await commit(makeLockManager(), storage, [], [makeTask('saved', 'Saved')], 1);
  assert.equal(result.ok, true, 'metadata cleanup cannot undo an already committed task list');
  assert.equal(result.warning, 'generation-marker-clear-failed');
  assert.equal(storage.generationRaw, '1:all');
  assert.deepEqual(JSON.parse(storage.raw).map((task) => task.id), ['saved']);
});
