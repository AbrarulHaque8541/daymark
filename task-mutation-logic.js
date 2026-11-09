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
      return { ok: false, reason: 'invalid-task-list', conflicts: [], tasks: [] };
    }

    const merged = cloneTaskList(currentTasks);
    const ids = new Set([...base.keys(), ...desired.keys()]);
    const conflicts = [];

    for (const id of ids) {
      const before = base.get(id);
      const after = desired.get(id);
      const latest = current.get(id);
      if (areTaskListsEqual([before], [after])) continue;

      if (before === undefined) {
        if (latest === undefined) {
          merged.push(JSON.parse(JSON.stringify(after)));
        } else if (!areTaskListsEqual([latest], [after])) {
          conflicts.push(id);
        }
        continue;
      }

      if (after === undefined) {
        if (latest === undefined) continue;
        if (areTaskListsEqual([latest], [before])) {
          const index = merged.findIndex((task) => task.id === id);
          if (index >= 0) merged.splice(index, 1);
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
        else merged[index] = JSON.parse(JSON.stringify(after));
      } else if (!areTaskListsEqual([latest], [after])) {
        conflicts.push(id);
      }
    }

    if (conflicts.length) {
      return {
        ok: false,
        reason: 'conflict',
        conflicts: Array.from(new Set(conflicts)).sort(),
        tasks: []
      };
    }
    return { ok: true, reason: null, conflicts: [], tasks: merged };
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

    try {
      return await locks.request(lockName, { mode: 'exclusive' }, async () => {
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
        return {
          ok: true,
          reason: null,
          conflicts: [],
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
    cloneTaskList,
    areTaskListsEqual,
    mergeTaskSnapshots,
    commitTaskSnapshot
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkTaskMutation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
