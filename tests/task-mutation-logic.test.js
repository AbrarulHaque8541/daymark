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
  return {
    get raw() { return raw; },
    getItem(key) {
      assert.equal(key, 'daymark.tasks.v1');
      return raw;
    },
    setItem(key, value) {
      assert.equal(key, 'daymark.tasks.v1');
      raw = String(value);
    }
  };
}

function readCurrent(raw) {
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

function commit(lockManager, storage, baseTasks, desiredTasks) {
  return mutation.commitTaskSnapshot({
    lockManager,
    storage,
    key: 'daymark.tasks.v1',
    baseTasks,
    desiredTasks,
    readCurrent
  });
}

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

test('task equality is independent of object property insertion order', () => {
  const left = [{ id: 'a', title: 'A', completed: false }];
  const right = [{ completed: false, title: 'A', id: 'a' }];
  assert.equal(mutation.areTaskListsEqual(left, right), true);
});
