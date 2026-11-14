'use strict';

const taskMutation = require('../task-mutation-logic.js');

function createLockManager() {
  const tails = new Map();
  return {
    request(name, options, callback) {
      const previous = tails.get(name) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const tail = previous.then(() => gate);
      tails.set(name, tail);
      return previous.then(() => callback({ name, mode: options && options.mode || 'exclusive' }))
        .finally(() => {
          release();
          if (tails.get(name) === tail) tails.delete(name);
        });
    }
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function clearKeys(storage, keys, lockManager) {
  const lock = lockManager || createLockManager();
  const result = await taskMutation.withLocksInOrder(lock, taskMutation.CLEAR_ALL_LOCK_ORDER, () => {
    const hasPrimary = Array.isArray(keys) && keys.includes(taskMutation.TASK_STORAGE_KEY);
    const begun = taskMutation.beginClearAll(storage, hasPrimary);
    if (!begun.ok) return { ok: false, reason: begun.reason };
    const removed = [];
    const failed = [];
    for (const key of keys || []) {
      try {
        storage.removeItem(key);
        removed.push(key);
      } catch (error) { failed.push(key); }
    }
    const primaryRemoved = hasPrimary && removed.includes(taskMutation.TASK_STORAGE_KEY);
    const finished = taskMutation.finishClearAll(storage, primaryRemoved);
    return { ok: finished.ok, removed, failed, generation: finished.ok ? finished.value : null };
  });
  if (!result.ok) throw new Error(result.reason || 'test Clear All failed');
  return result.value;
}

module.exports = { createLockManager, deferred, clearKeys, taskMutation };
