/*
 * Shared origin-wide task mutation transaction for the Daymark web app.
 *
 * localStorage has no compare-and-swap operation. Every cooperating task
 * writer must therefore use the same Web Lock, reread the canonical list
 * inside that lock, and apply a three-way mutation merge before writing.
 * There is intentionally no localStorage-token fallback: it cannot provide
 * mutual exclusion and would reintroduce silent lost updates.
 */
((root) => {
  'use strict';

  const TASK_MUTATION_LOCK = 'daymark.tasks.mutation.v1';
  const TASK_GENERATION_KEY = 'daymark.tasks.mutation.generation.v1';
  const WEBHOOK_DELIVERY_LOCK = 'daymark.webhook.delivery.v1';
  const WEBHOOK_QUEUE_LOCK = 'daymark.webhook.queue.v1';
  const FOCUS_MUTATION_LOCK = 'daymark.focus.mutation.v1';
  // Global clear/completion order: task mutation -> webhook delivery -> webhook
  // queue -> Focus. Task completion appends while holding the task lock; Focus
  // writers never acquire an earlier lock while holding the Focus lock.
  const CLEAR_ALL_LOCK_ORDER = Object.freeze([
    TASK_MUTATION_LOCK, WEBHOOK_DELIVERY_LOCK, WEBHOOK_QUEUE_LOCK, FOCUS_MUTATION_LOCK
  ]);

  function readTaskGeneration(storage) {
    if (!storage || typeof storage.getItem !== 'function') {
      return { ok: false, reason: 'storage-unavailable' };
    }
    try {
      const raw = storage.getItem(TASK_GENERATION_KEY);
      if (raw === null) return { ok: true, value: 0 };
      const match = typeof raw === 'string'
        ? /^(0|[1-9][0-9]*)(?::(tasks|task-backup|all))?$/.exec(raw) : null;
      if (!match) return { ok: false, reason: 'generation-invalid' };
      const value = Number(match[1]);
      if (!Number.isSafeInteger(value)) return { ok: false, reason: 'generation-invalid' };
      const result = { ok: true, value };
      if (match[2]) result.reason = match[2];
      return result;
    } catch (error) {
      return { ok: false, reason: 'generation-unreadable' };
    }
  }

  // Call only while TASK_MUTATION_LOCK is held. This key is deliberately not
  // part of user-data categories, so Clear All cannot reset the fence to zero.
  function incrementTaskGeneration(storage, reason) {
    if (!storage || typeof storage.setItem !== 'function') {
      return { ok: false, reason: 'storage-unavailable' };
    }
    if (reason !== undefined && reason !== null
        && !['tasks', 'task-backup', 'all'].includes(reason)) {
      return { ok: false, reason: 'generation-reason-invalid' };
    }
    const current = readTaskGeneration(storage);
    if (!current.ok) return current;
    if (current.value >= Number.MAX_SAFE_INTEGER) {
      return { ok: false, reason: 'generation-exhausted' };
    }
    const value = current.value + 1;
    try {
      storage.setItem(TASK_GENERATION_KEY, String(value) + (reason ? ':' + reason : ''));
      return { ok: true, value };
    } catch (error) {
      return { ok: false, reason: 'generation-write-failed' };
    }
  }

  function cloneTaskList(tasks) {
    if (!Array.isArray(tasks)) return [];
    return JSON.parse(JSON.stringify(tasks));
  }

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      const result = {};
      Object.keys(value).sort().forEach((key) => {
        result[key] = canonical(value[key]);
      });
      return result;
    }
    return value;
  }

  function stableStringify(value) {
    return JSON.stringify(canonical(value));
  }

  function areTaskListsEqual(left, right) {
    try {
      return stableStringify(left) === stableStringify(right);
    } catch (error) {
      return false;
    }
  }

  function indexTasks(tasks) {
    if (!Array.isArray(tasks)) return null;
    const indexed = new Map();
    for (const task of tasks) {
      if (!task || typeof task !== 'object' || Array.isArray(task)
          || typeof task.id !== 'string' || task.id.length === 0
          || indexed.has(task.id)) return null;
      indexed.set(task.id, task);
    }
    return indexed;
  }

  /*
   * Apply the local tab's intent (base -> desired) to the latest locked
   * snapshot. Unrelated changes survive. Same-record edit/delete races are
   * reported as conflicts instead of silently choosing the last writer.
   */
  function mergeTaskSnapshots(baseTasks, desiredTasks, currentTasks) {
    const base = indexTasks(baseTasks);
    const desired = indexTasks(desiredTasks);
    const current = indexTasks(currentTasks);
    if (!base || !desired || !current) {
      return { ok: false, reason: 'invalid-task-list', conflicts: [], addedIds: [], tasks: [] };
    }

    const merged = cloneTaskList(currentTasks);
    const ids = new Set([...base.keys(), ...desired.keys()]);
    const conflicts = [];
    const addedIds = [];
    const changedIds = [];

    for (const id of ids) {
      const before = base.get(id);
      const after = desired.get(id);
      const latest = current.get(id);
      if (areTaskListsEqual([before], [after])) continue;

      if (before === undefined) {
        if (latest === undefined) {
          merged.push(JSON.parse(JSON.stringify(after)));
          addedIds.push(id);
          changedIds.push(id);
        } else if (!areTaskListsEqual([latest], [after])) {
          conflicts.push(id);
        }
        continue;
      }

      if (after === undefined) {
        if (latest === undefined) continue;
        if (areTaskListsEqual([latest], [before])) {
          const index = merged.findIndex((task) => task.id === id);
          if (index >= 0) {
            merged.splice(index, 1);
            changedIds.push(id);
          }
        } else {
          conflicts.push(id);
        }
        continue;
      }

      if (latest === undefined) {
        conflicts.push(id);
      } else if (areTaskListsEqual([latest], [before])) {
        const index = merged.findIndex((task) => task.id === id);
        if (index < 0) conflicts.push(id);
        else {
          merged[index] = JSON.parse(JSON.stringify(after));
          changedIds.push(id);
        }
      } else if (!areTaskListsEqual([latest], [after])) {
        conflicts.push(id);
      }
    }

    if (conflicts.length) {
      return {
        ok: false,
        reason: 'conflict',
        conflicts: Array.from(new Set(conflicts)).sort(),
        addedIds: [],
        changedIds: [],
        tasks: []
      };
    }
    return { ok: true, reason: null, conflicts: [], addedIds, changedIds, tasks: merged };
  }

  async function withTaskMutationLock(lockManager, callback, lockName) {
    if (!lockManager || typeof lockManager.request !== 'function') {
      return { ok: false, reason: 'coordination-unavailable' };
    }
    if (typeof callback !== 'function') {
      return { ok: false, reason: 'mutation-callback-unavailable' };
    }
    const name = typeof lockName === 'string' && lockName ? lockName : TASK_MUTATION_LOCK;
    try {
      return await lockManager.request(name, { mode: 'exclusive' }, async () => {
        try {
          return { ok: true, value: await callback() };
        } catch (error) {
          return { ok: false, reason: 'mutation-failed' };
        }
      });
    } catch (error) {
      return { ok: false, reason: 'lock-failed' };
    }
  }

  async function withLocksInOrder(lockManager, lockNames, callback) {
    if (!lockManager || typeof lockManager.request !== 'function') {
      return { ok: false, reason: 'coordination-unavailable' };
    }
    if (typeof callback !== 'function' || !Array.isArray(lockNames)
        || lockNames.length === 0
        || lockNames.some((name) => typeof name !== 'string' || name.length === 0)
        || new Set(lockNames).size !== lockNames.length) {
      return { ok: false, reason: 'invalid-lock-order' };
    }
    const acquire = (index) => {
      if (index === lockNames.length) {
        return Promise.resolve().then(callback).then(
          (value) => ({ ok: true, value }),
          () => ({ ok: false, reason: 'mutation-failed' })
        );
      }
      return lockManager.request(lockNames[index], { mode: 'exclusive' }, () => acquire(index + 1));
    };
    try {
      return await acquire(0);
    } catch (error) {
      return { ok: false, reason: 'lock-failed' };
    }
  }

  async function commitTaskSnapshot(options) {
    const opts = options && typeof options === 'object' ? options : {};
    const locks = opts.lockManager;
    const storage = opts.storage;
    const key = typeof opts.key === 'string' ? opts.key : '';
    const lockName = typeof opts.lockName === 'string' && opts.lockName
      ? opts.lockName : TASK_MUTATION_LOCK;

    if (!locks || typeof locks.request !== 'function') {
      return { ok: false, reason: 'coordination-unavailable', conflicts: [] };
    }
    if (!storage || typeof storage.getItem !== 'function'
        || typeof storage.setItem !== 'function' || !key) {
      return { ok: false, reason: 'storage-unavailable', conflicts: [] };
    }
    if (!Number.isSafeInteger(opts.expectedGeneration) || opts.expectedGeneration < 0) {
      return { ok: false, reason: 'invalid-generation', conflicts: [] };
    }

    try {
      return await locks.request(lockName, { mode: 'exclusive' }, async () => {
        const generation = readTaskGeneration(storage);
        if (!generation.ok) return { ok: false, reason: generation.reason, conflicts: [] };
        if (generation.value !== opts.expectedGeneration) {
          return { ok: false, reason: 'stale-generation', conflicts: [] };
        }
        if (typeof opts.beforeWrite === 'function') {
          let prepared;
          try {
            prepared = opts.beforeWrite();
          } catch (error) {
            return { ok: false, reason: 'prepare-failed', conflicts: [] };
          }
          if (prepared === false || (prepared && prepared.ok === false)) {
            return {
              ok: false,
              reason: prepared && prepared.reason ? prepared.reason : 'prepare-failed',
              conflicts: []
            };
          }
        }

        let raw;
        try {
          raw = storage.getItem(key);
        } catch (error) {
          return { ok: false, reason: 'storage-read-failed', conflicts: [] };
        }

        let current;
        try {
          if (typeof opts.readCurrent !== 'function') {
            return { ok: false, reason: 'current-reader-unavailable', conflicts: [] };
          }
          current = opts.readCurrent(raw);
        } catch (error) {
          return { ok: false, reason: 'current-read-invalid', conflicts: [] };
        }
        if (!current || current.ok !== true || !Array.isArray(current.tasks)) {
          return {
            ok: false,
            reason: current && current.reason ? current.reason : 'current-read-invalid',
            conflicts: []
          };
        }

        const merged = mergeTaskSnapshots(opts.baseTasks, opts.desiredTasks, current.tasks);
        if (!merged.ok) return merged;

        let payload;
        try {
          payload = typeof opts.serialize === 'function'
            ? opts.serialize(merged.tasks)
            : JSON.stringify(merged.tasks);
          if (typeof payload !== 'string') {
            return { ok: false, reason: 'serialization-failed', conflicts: [] };
          }
          storage.setItem(key, payload);
        } catch (error) {
          return { ok: false, reason: 'storage-write-failed', conflicts: [] };
        }

        let warning = null;
        if (typeof opts.afterWrite === 'function') {
          try {
            opts.afterWrite(payload, merged.tasks);
          } catch (error) {
            warning = 'post-write-maintenance-failed';
          }
        }
        if (typeof opts.afterCommit === 'function') {
          try {
            // Await while the task lock is still held. A later clear cannot
            // overtake a completion whose durable task write already committed.
            await opts.afterCommit({
              tasks: cloneTaskList(merged.tasks),
              previousTasks: cloneTaskList(current.tasks),
              changedIds: merged.changedIds.slice(),
              payload
            });
          } catch (error) {
            warning = warning || 'post-commit-action-failed';
          }
        }
        return {
          ok: true,
          reason: null,
          conflicts: [],
          addedIds: merged.addedIds.slice(),
          changedIds: merged.changedIds.slice(),
          previousTasks: cloneTaskList(current.tasks),
          tasks: cloneTaskList(merged.tasks),
          payload,
          warning
        };
      });
    } catch (error) {
      return { ok: false, reason: 'lock-failed', conflicts: [] };
    }
  }

  const api = {
    TASK_MUTATION_LOCK,
    TASK_GENERATION_KEY,
    readTaskGeneration,
    incrementTaskGeneration,
    WEBHOOK_DELIVERY_LOCK,
    WEBHOOK_QUEUE_LOCK,
    FOCUS_MUTATION_LOCK,
    CLEAR_ALL_LOCK_ORDER,
    cloneTaskList,
    areTaskListsEqual,
    mergeTaskSnapshots,
    withTaskMutationLock,
    withLocksInOrder,
    commitTaskSnapshot
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkTaskMutation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
