/*
 * Offline priority balance summary for the web prototype.
 * Pure function: counts incomplete tasks by priority.
 * No network, no storage, no side effects.
 */
((root) => {
  'use strict';

  function summarizePriorities(tasks) {
    const counts = { high: 0, medium: 0, low: 0, none: 0, total: 0 };
    if (!Array.isArray(tasks)) return counts;
    for (let i = 0; i < tasks.length; i += 1) {
      const task = tasks[i];
      if (!task || task.completed === true) continue;
      const raw = typeof task.priority === 'string' ? task.priority.toLowerCase() : 'none';
      if (raw === 'high' || raw === 'medium' || raw === 'low') {
        counts[raw] += 1;
      } else {
        counts.none += 1;
      }
      counts.total += 1;
    }
    return counts;
  }

  const api = { summarizePriorities };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkPriorityBalance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
