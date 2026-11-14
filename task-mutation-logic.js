((root) => {
  'use strict';

  const TASK_STORAGE_KEY = 'daymark.tasks.v1';
  const GENERATION_KEY = 'daymark.tasks.generation.v1';
  const TASK_LOCK_NAME = 'daymark.tasks.mutation.v1';
  const WEBHOOK_DELIVERY_LOCK_NAME = 'daymark.webhook.delivery.v1';
  const WEBHOOK_QUEUE_LOCK_NAME = 'daymark.webhook.queue.v1';
  const FOCUS_LOCK_NAME = 'daymark.focus.mutation.v1';
  const CLEAR_ALL_LOCK_ORDER = Object.freeze([
    TASK_LOCK_NAME,
    WEBHOOK_DELIVERY_LOCK_NAME,
    WEBHOOK_QUEUE_LOCK_NAME,
    FOCUS_LOCK_NAME
  ]);
  const TASK_AND_FOCUS_LOCK_ORDER = Object.freeze([TASK_LOCK_NAME, FOCUS_LOCK_NAME]);

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function stableValue(value) {
    if (Array.isArray(value)) return '[' + value.map(stableValue).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableValue(value[key])).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  function sameValue(left, right) {
    return stableValue(left) === stableValue(right);
  }

  function validCounter(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function readGeneration(storage) {
    if (!storage || typeof storage.getItem !== 'function') {
      return { ok: false, reason: 'storage-unavailable' };
    }
    try {
      const raw = storage.getItem(GENERATION_KEY);
      if (raw === null || raw === undefined) {
        return {
          ok: true,
          value: { version: 1, generation: 0, clearEpoch: 0, taskEpoch: 0, clearPending: false, taskClearPending: false }
        };
      }
      if (typeof raw !== 'string') return { ok: false, reason: 'generation-unreadable' };
      const parsed = JSON.parse(raw);
      const taskEpoch = parsed && parsed.taskEpoch === undefined ? 0 : parsed && parsed.taskEpoch;
      const clearPending = parsed && parsed.clearPending === undefined ? false : parsed && parsed.clearPending;
      const taskClearPending = parsed && parsed.taskClearPending === undefined ? false : parsed && parsed.taskClearPending;
      if (!parsed || parsed.version !== 1 || !validCounter(parsed.generation)
          || !validCounter(parsed.clearEpoch) || !validCounter(taskEpoch)
          || typeof clearPending !== 'boolean' || typeof taskClearPending !== 'boolean') {
        return { ok: false, reason: 'generation-unreadable' };
      }
      return {
        ok: true,
        value: {
          version: 1,
          generation: parsed.generation,
          clearEpoch: parsed.clearEpoch,
          taskEpoch,
          clearPending,
          taskClearPending
        }
      };
    } catch (error) {
      return { ok: false, reason: 'generation-unreadable' };
    }
  }

  function writeGeneration(storage, value) {
    if (!storage || typeof storage.setItem !== 'function') return false;
    try {
      storage.setItem(GENERATION_KEY, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function validateTaskList(tasks, validateTasks) {
    if (!Array.isArray(tasks)) return { ok: false, reason: 'tasks-unreadable' };
    if (typeof validateTasks !== 'function') return { ok: true, tasks: copy(tasks), rejectedCount: 0 };
    try {
      const validated = validateTasks(tasks);
      if (!validated || !Array.isArray(validated.tasks)) return { ok: false, reason: 'tasks-unreadable' };
      const rejectedCount = Number.isInteger(validated.rejectedCount) ? validated.rejectedCount : 0;
      const ids = new Set();
      for (const task of validated.tasks) {
        if (!task || typeof task.id !== 'string' || !task.id || ids.has(task.id)) {
          return { ok: false, reason: 'tasks-ambiguous' };
        }
        ids.add(task.id);
      }
      return { ok: true, tasks: copy(validated.tasks), rejectedCount };
    } catch (error) {
      return { ok: false, reason: 'tasks-unreadable' };
    }
  }

  function readStoredTasks(storage, validateTasks) {
    if (!storage || typeof storage.getItem !== 'function') return { ok: false, reason: 'storage-unavailable' };
    let raw;
    try {
      raw = storage.getItem(TASK_STORAGE_KEY);
    } catch (error) {
      return { ok: false, reason: 'tasks-unreadable' };
    }
    if (raw === null || raw === undefined) return { ok: true, tasks: [], raw: null, rejectedCount: 0 };
    if (typeof raw !== 'string') return { ok: false, reason: 'tasks-unreadable', raw };
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { ok: false, reason: 'tasks-unreadable', raw };
    }
    if (!Array.isArray(parsed)) return { ok: false, reason: 'tasks-unreadable', raw };
    const validated = validateTaskList(parsed, validateTasks);
    if (!validated.ok) return Object.assign({}, validated, { raw });
    return { ok: true, tasks: validated.tasks, raw, rejectedCount: validated.rejectedCount };
  }

  function recordMap(tasks) {
    const map = new Map();
    for (const task of tasks) {
      if (!task || typeof task.id !== 'string' || !task.id || map.has(task.id)) return null;
      map.set(task.id, task);
    }
    return map;
  }

  // Three-way merge: preserve independent remote edits, apply independent local
  // edits, and reject edits that race with another edit/delete of the same ID.
  function mergeTaskSnapshots(baseTasks, desiredTasks, currentTasks) {
    if (!Array.isArray(baseTasks) || !Array.isArray(desiredTasks) || !Array.isArray(currentTasks)) {
      return { ok: false, reason: 'tasks-ambiguous' };
    }
    const base = recordMap(baseTasks);
    const desired = recordMap(desiredTasks);
    const current = recordMap(currentTasks);
    if (!base || !desired || !current) return { ok: false, reason: 'tasks-ambiguous' };

    const merged = [];
    const emitted = new Set();
    const conflictIds = [];
    const choose = (id, baseValue, desiredValue, currentValue) => {
      const localChanged = !sameValue(baseValue, desiredValue);
      const remoteChanged = !sameValue(baseValue, currentValue);
      if (localChanged && remoteChanged && !sameValue(desiredValue, currentValue)) {
        conflictIds.push(id);
        return;
      }
      const chosen = localChanged ? desiredValue : currentValue;
      if (chosen !== undefined) {
        merged.push(copy(chosen));
        emitted.add(id);
      }
    };

    for (const task of baseTasks) choose(task.id, base.get(task.id), desired.get(task.id), current.get(task.id));
    for (const task of currentTasks) {
      if (base.has(task.id) || emitted.has(task.id)) continue;
      if (desired.has(task.id)) {
        if (!sameValue(desired.get(task.id), task)) conflictIds.push(task.id);
        else {
          merged.push(copy(task));
          emitted.add(task.id);
        }
      } else {
        merged.push(copy(task));
        emitted.add(task.id);
      }
    }
    for (const task of desiredTasks) {
      if (base.has(task.id) || emitted.has(task.id)) continue;
      if (current.has(task.id)) {
        if (!sameValue(current.get(task.id), task)) conflictIds.push(task.id);
        else {
          merged.push(copy(current.get(task.id)));
          emitted.add(task.id);
        }
      } else {
        merged.push(copy(task));
        emitted.add(task.id);
      }
    }
    if (conflictIds.length) return { ok: false, reason: 'conflict', conflictIds: Array.from(new Set(conflictIds)) };
    return { ok: true, tasks: merged };
  }

  async function withLocksInOrder(lockManager, names, operation) {
    if (!lockManager || typeof lockManager.request !== 'function') {
      return { ok: false, reason: 'lock-unavailable', lockName: names && names[0] };
    }
    if (!Array.isArray(names) || names.length === 0 || typeof operation !== 'function') {
      return { ok: false, reason: 'invalid-lock-request' };
    }
    async function acquire(index) {
      if (index >= names.length) {
        try {
          return { ok: true, value: await operation() };
        } catch (error) {
          return { ok: false, reason: 'operation-failed', error };
        }
      }
      const name = names[index];
      try {
        const nested = await lockManager.request(name, { mode: 'exclusive' }, () => acquire(index + 1));
        return nested && nested.ok === false
          ? nested
          : (nested && nested.ok === true ? nested : { ok: true, value: nested });
      } catch (error) {
        return { ok: false, reason: 'lock-failed', lockName: name, error };
      }
    }
    return acquire(0);
  }

  function withExclusiveLock(lockManager, lockName, operation) {
    return withLocksInOrder(lockManager, [lockName], operation);
  }

  // A pending marker is recovered only while the task lock is held. A task
  // clear that removed the primary key advances taskEpoch; a failed removal
  // leaves it unchanged so unrelated task saves can rebase and proceed.
  function resolvePendingMutations(storage) {
    const read = readGeneration(storage);
    if (!read.ok) return read;
    const current = read.value;
    if (!current.clearPending && !current.taskClearPending) return { ok: true, value: current };
    let taskEpoch = current.taskEpoch;
    if (current.taskClearPending) {
      if (!storage || typeof storage.getItem !== 'function') return { ok: false, reason: 'storage-unavailable' };
      let primary;
      try { primary = storage.getItem(TASK_STORAGE_KEY); }
      catch (error) { return { ok: false, reason: 'tasks-unreadable' }; }
      if (primary === null || primary === undefined) taskEpoch += 1;
      if (!validCounter(taskEpoch)) return { ok: false, reason: 'generation-overflow' };
    }
    const next = Object.assign({}, current, {
      generation: current.generation + 1,
      taskEpoch,
      clearPending: false,
      taskClearPending: false
    });
    if (!validCounter(next.generation) || !writeGeneration(storage, next)) {
      return { ok: false, reason: 'generation-write-failed' };
    }
    return { ok: true, value: next };
  }

  function captureClearEpoch(storage) {
    const generation = readGeneration(storage);
    if (!generation.ok) return generation;
    if (generation.value.clearPending) return { ok: false, reason: 'clear-in-progress' };
    return { ok: true, value: generation.value.clearEpoch };
  }

  async function withClearEpochLock(lockManager, lockNames, storage, expectedClearEpoch, operation) {
    if (!validCounter(expectedClearEpoch)) return { ok: false, reason: 'generation-unreadable' };
    if (!Array.isArray(lockNames) || !lockNames.includes(TASK_LOCK_NAME)) {
      return { ok: false, reason: 'task-lock-required' };
    }
    const locked = await withLocksInOrder(lockManager, lockNames, async () => {
      const repaired = resolvePendingMutations(storage);
      if (!repaired.ok) return repaired;
      const generation = repaired.value;
      if (generation.clearPending) return { ok: false, reason: 'clear-in-progress' };
      if (generation.clearEpoch !== expectedClearEpoch) {
        return { ok: false, reason: 'cleared', clearEpoch: generation.clearEpoch };
      }
      if (typeof operation !== 'function') return { ok: false, reason: 'invalid-operation' };
      try { return { ok: true, value: await operation() }; }
      catch (error) { return { ok: false, reason: 'operation-failed', error }; }
    });
    if (!locked.ok) return locked;
    return locked.value;
  }

  // Start a request while holding the task lock, but return its promise without
  // awaiting it. A send queued behind Clear All is rejected before dispatch.
  async function dispatchIfClearEpochUnchanged(lockManager, storage, expectedClearEpoch, dispatch) {
    if (!validCounter(expectedClearEpoch)) return { ok: false, reason: 'generation-unreadable' };
    const locked = await withExclusiveLock(lockManager, TASK_LOCK_NAME, () => {
      const repaired = resolvePendingMutations(storage);
      if (!repaired.ok) return repaired;
      const generation = repaired.value;
      if (generation.clearPending) return { ok: false, reason: 'clear-in-progress' };
      if (generation.clearEpoch !== expectedClearEpoch) {
        return { ok: false, reason: 'cleared', clearEpoch: generation.clearEpoch };
      }
      if (typeof dispatch !== 'function') return { ok: false, reason: 'invalid-operation' };
      try { return { ok: true, value: dispatch() }; }
      catch (error) { return { ok: false, reason: 'dispatch-failed', error }; }
    });
    if (!locked.ok) return locked;
    return locked.value;
  }

  async function commitTaskSnapshot(options) {
    const opts = options || {};
    const storage = opts.storage;
    const lockManager = opts.lockManager;
    const validateTasks = opts.validateTasks;
    if (!Array.isArray(opts.baseTasks) || !Array.isArray(opts.desiredTasks)) {
      return { ok: false, reason: 'invalid-snapshot' };
    }
    const baseCheck = validateTaskList(opts.baseTasks, validateTasks);
    const desiredCheck = validateTaskList(opts.desiredTasks, validateTasks);
    if (!baseCheck.ok || !desiredCheck.ok || baseCheck.rejectedCount || desiredCheck.rejectedCount) {
      return { ok: false, reason: 'tasks-ambiguous' };
    }

    const locked = await withExclusiveLock(lockManager, TASK_LOCK_NAME, async () => {
      const repaired = resolvePendingMutations(storage);
      if (!repaired.ok) return { ok: false, reason: repaired.reason };
      const generation = { ok: true, value: repaired.value };
      const currentRead = readStoredTasks(storage, validateTasks);
      const expectedTaskEpoch = opts.expectedTaskEpoch === undefined
        ? opts.expectedClearEpoch : opts.expectedTaskEpoch;
      if (generation.value.taskClearPending) return { ok: false, reason: 'task-clear-in-progress' };
      if (validCounter(expectedTaskEpoch) && expectedTaskEpoch !== generation.value.taskEpoch) {
        return {
          ok: false,
          reason: 'cleared',
          currentTasks: currentRead.ok ? copy(currentRead.tasks) : null,
          generation: generation.value.generation,
          clearEpoch: generation.value.clearEpoch,
          taskEpoch: generation.value.taskEpoch
        };
      }
      let currentTasks;
      if (!currentRead.ok || currentRead.rejectedCount > 0) {
        if (typeof opts.backupRaw !== 'function' || typeof currentRead.raw !== 'string') {
          return { ok: false, reason: currentRead.reason || 'tasks-ambiguous' };
        }
        let backedUp = false;
        try { backedUp = await opts.backupRaw(currentRead.raw); } catch (error) { backedUp = false; }
        if (!backedUp) return { ok: false, reason: 'backup-failed' };
        currentTasks = currentRead.ok ? currentRead.tasks : [];
      } else {
        currentTasks = currentRead.tasks;
      }

      if (typeof opts.beforeCommit === 'function') {
        let ready = false;
        try { ready = await opts.beforeCommit({ currentRaw: currentRead.raw, currentTasks: copy(currentTasks) }); }
        catch (error) { ready = false; }
        if (ready !== true) {
          return {
            ok: false,
            reason: 'pre-commit-failed',
            currentTasks: copy(currentTasks),
            generation: generation.value.generation,
            clearEpoch: generation.value.clearEpoch,
            taskEpoch: generation.value.taskEpoch
          };
        }
      }

      const merge = mergeTaskSnapshots(baseCheck.tasks, desiredCheck.tasks, currentTasks);
      if (!merge.ok) {
        return {
          ok: false,
          reason: merge.reason,
          conflictIds: merge.conflictIds || [],
          currentTasks: copy(currentTasks),
          generation: generation.value.generation,
          clearEpoch: generation.value.clearEpoch,
          taskEpoch: generation.value.taskEpoch,
          generationMismatch: validCounter(opts.expectedGeneration)
            && opts.expectedGeneration !== generation.value.generation
        };
      }
      if (!storage || typeof storage.setItem !== 'function') return { ok: false, reason: 'storage-unavailable' };

      const nextGeneration = Object.assign({}, generation.value, {
        generation: generation.value.generation + 1
      });
      if (!validCounter(nextGeneration.generation) || !writeGeneration(storage, nextGeneration)) {
        return {
          ok: false,
          reason: 'generation-write-failed',
          currentTasks: copy(currentTasks),
          generation: generation.value.generation,
          clearEpoch: generation.value.clearEpoch,
          taskEpoch: generation.value.taskEpoch
        };
      }
      try {
        storage.setItem(TASK_STORAGE_KEY, JSON.stringify(merge.tasks));
      } catch (error) {
        return {
          ok: false,
          reason: 'task-write-failed',
          currentTasks: copy(currentTasks),
          generation: nextGeneration.generation,
          clearEpoch: nextGeneration.clearEpoch,
          taskEpoch: nextGeneration.taskEpoch
        };
      }

      let afterCommitResult;
      if (typeof opts.afterCommit === 'function') {
        try { afterCommitResult = await opts.afterCommit(copy(merge.tasks)); }
        catch (error) { afterCommitResult = { ok: false, reason: 'after-commit-failed' }; }
      }
      return {
        ok: true,
        tasks: copy(merge.tasks),
        generation: nextGeneration.generation,
        clearEpoch: nextGeneration.clearEpoch,
        taskEpoch: nextGeneration.taskEpoch,
        generationMismatch: validCounter(opts.expectedGeneration)
          && opts.expectedGeneration !== generation.value.generation,
        afterCommitResult
      };
    });

    if (!locked.ok) return { ok: false, reason: locked.reason, lockName: locked.lockName };
    return locked.value;
  }

  function beginClearAll(storage, taskKeyWillBeCleared) {
    const repaired = resolvePendingMutations(storage);
    if (!repaired.ok) return repaired;
    const current = repaired.value;
    if (current.clearPending || current.taskClearPending) return { ok: false, reason: 'clear-in-progress' };
    const next = Object.assign({}, current, {
      generation: current.generation + 1,
      clearEpoch: current.clearEpoch + 1,
      clearPending: true,
      taskClearPending: taskKeyWillBeCleared === true
    });
    if (!validCounter(next.generation) || !validCounter(next.clearEpoch) || !writeGeneration(storage, next)) {
      return { ok: false, reason: 'generation-write-failed' };
    }
    return { ok: true, value: next };
  }

  function finishClearAll(storage, primaryTaskKeyRemoved) {
    const read = readGeneration(storage);
    if (!read.ok) return read;
    const current = read.value;
    if (!current.clearPending) return { ok: false, reason: 'clear-not-pending' };
    let taskEpoch = current.taskEpoch;
    if (current.taskClearPending && primaryTaskKeyRemoved === true) taskEpoch += 1;
    const next = Object.assign({}, current, {
      generation: current.generation + 1,
      taskEpoch,
      clearPending: false,
      taskClearPending: false
    });
    if (!validCounter(next.generation) || !validCounter(taskEpoch) || !writeGeneration(storage, next)) {
      return { ok: false, reason: 'generation-write-failed' };
    }
    return { ok: true, value: next };
  }

  function beginTaskClear(storage) {
    const repaired = resolvePendingMutations(storage);
    if (!repaired.ok) return repaired;
    const current = repaired.value;
    if (current.clearPending || current.taskClearPending) return { ok: false, reason: 'clear-in-progress' };
    const next = Object.assign({}, current, {
      generation: current.generation + 1,
      taskClearPending: true
    });
    if (!validCounter(next.generation) || !writeGeneration(storage, next)) {
      return { ok: false, reason: 'generation-write-failed' };
    }
    return { ok: true, value: next };
  }

  function finishTaskClear(storage, primaryTaskKeyRemoved) {
    const read = readGeneration(storage);
    if (!read.ok) return read;
    const current = read.value;
    if (!current.taskClearPending) return { ok: false, reason: 'task-clear-not-pending' };
    const taskEpoch = current.taskEpoch + (primaryTaskKeyRemoved === true ? 1 : 0);
    const next = Object.assign({}, current, {
      generation: current.generation + 1,
      taskEpoch,
      taskClearPending: false
    });
    if (!validCounter(next.generation) || !validCounter(taskEpoch) || !writeGeneration(storage, next)) {
      return { ok: false, reason: 'generation-write-failed' };
    }
    return { ok: true, value: next };
  }

  // Compatibility helper for callers that need an already-completed global
  // epoch change. Clear All itself uses beginClearAll/finishClearAll.
  function advanceClearEpoch(storage) {
    const repaired = resolvePendingMutations(storage);
    if (!repaired.ok) return repaired;
    const current = repaired.value;
    const next = Object.assign({}, current, {
      generation: current.generation + 1,
      clearEpoch: current.clearEpoch + 1,
      clearPending: false
    });
    if (!validCounter(next.generation) || !validCounter(next.clearEpoch) || !writeGeneration(storage, next)) {
      return { ok: false, reason: 'generation-write-failed' };
    }
    return { ok: true, value: next };
  }

  const api = {
    TASK_STORAGE_KEY,
    GENERATION_KEY,
    TASK_LOCK_NAME,
    WEBHOOK_DELIVERY_LOCK_NAME,
    WEBHOOK_QUEUE_LOCK_NAME,
    FOCUS_LOCK_NAME,
    CLEAR_ALL_LOCK_ORDER,
    TASK_AND_FOCUS_LOCK_ORDER,
    readGeneration,
    writeGeneration,
    readStoredTasks,
    mergeTaskSnapshots,
    withLocksInOrder,
    withExclusiveLock,
    resolvePendingMutations,
    captureClearEpoch,
    withClearEpochLock,
    dispatchIfClearEpochUnchanged,
    commitTaskSnapshot,
    beginClearAll,
    finishClearAll,
    beginTaskClear,
    finishTaskClear,
    advanceClearEpoch
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkTaskMutation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
