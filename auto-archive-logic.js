((root) => {
  'use strict';

  // Opt-in auto-archive planner for the web prototype. Pure functions only:
  // no DOM, no network, no timers, no storage writes. A completed task is a
  // candidate when it has been finished (its updatedAt last changed) at least
  // the chosen number of days ago, has a readable age, and does not repeat.
  // Repeating tasks regenerate, so they are never archived. Tasks with an
  // unreadable or future updatedAt are refused, never guessed.

  const FLAG_ID = 'auto-archive';
  const TASKS_STORAGE_KEY = 'daymark.tasks.v1';
  const DAY_MS = 86400000;
  const THRESHOLD_DAYS = [7, 30, 90];
  const DEFAULT_THRESHOLD_DAYS = 30;
  const MAX_CANDIDATES = 50;
  const MAX_LABEL_CHARS = 80;

  function normalizeThresholdDays(value) {
    if (typeof value !== 'number' || !isFinite(value) || Math.floor(value) !== value) {
      return { ok: false, reason: 'threshold-unreadable', days: null };
    }
    if (THRESHOLD_DAYS.indexOf(value) === -1) {
      return { ok: false, reason: 'threshold-out-of-range', days: null };
    }
    return { ok: true, reason: '', days: value };
  }

  function flagIsOn(read) {
    return Boolean(read && read.ok === true && read.flags && read.flags[FLAG_ID] === true);
  }

  function instantMs(value) {
    if (typeof value !== 'string' || value.length < 10 || value.indexOf('T') === -1) return null;
    const ms = Date.parse(value);
    if (!isFinite(ms)) return null;
    return ms;
  }

  function isRepeating(task) {
    return task.repeat !== undefined && task.repeat !== null && task.repeat !== '';
  }

  function shortLabel(title) {
    if (typeof title !== 'string') return '';
    const clean = title.trim();
    if (clean.length === 0) return '';
    if (clean.length <= MAX_LABEL_CHARS) return clean;
    return clean.slice(0, MAX_LABEL_CHARS - 1) + '\u2026';
  }

  function emptyPick(reason) {
    return {
      ok: false,
      reason: reason,
      thresholdDays: null,
      items: [],
      skipped: {},
      totalCount: 0,
      truncated: false
    };
  }

  // Returns the archive candidates: completed, non-repeating, finished at
  // least thresholdDays ago, oldest first. Fail-closed on unreadable inputs.
  function pickArchiveCandidates(tasks, nowMs, thresholdDays) {
    if (!Array.isArray(tasks)) return emptyPick('tasks-unreadable');
    if (typeof nowMs !== 'number' || !isFinite(nowMs) || nowMs < 0) return emptyPick('clock-unreadable');
    const norm = normalizeThresholdDays(thresholdDays);
    if (!norm.ok) return emptyPick(norm.reason);
    const thresholdMs = norm.days * DAY_MS;
    const skipped = { 'not-completed': 0, 'repeating': 0, 'recent-or-unreadable': 0, 'unreadable-record': 0 };
    const seen = new Set();
    const found = [];
    for (const task of tasks) {
      if (!task || typeof task !== 'object' || typeof task.id !== 'string' || task.id === '' || seen.has(task.id)) {
        skipped['unreadable-record'] += 1;
        continue;
      }
      seen.add(task.id);
      if (task.completed !== true) { skipped['not-completed'] += 1; continue; }
      if (isRepeating(task)) { skipped['repeating'] += 1; continue; }
      const updatedMs = instantMs(task.updatedAt);
      const ageMs = updatedMs === null ? -1 : nowMs - updatedMs;
      if (ageMs < thresholdMs) { skipped['recent-or-unreadable'] += 1; continue; }
      found.push({
        id: task.id,
        title: shortLabel(task.title),
        completedOn: typeof task.updatedAt === 'string' ? task.updatedAt : '',
        ageMs: ageMs,
        ageDays: Math.floor(ageMs / DAY_MS)
      });
    }
    const totalCount = found.length;
    const truncated = totalCount > MAX_CANDIDATES;
    const items = found
      .sort((left, right) => right.ageMs - left.ageMs)
      .slice(0, MAX_CANDIDATES)
      .map((item) => ({
        id: item.id,
        title: item.title,
        completedOn: item.completedOn,
        ageDays: item.ageDays
      }));
    return {
      ok: true,
      reason: '',
      thresholdDays: norm.days,
      items: items,
      skipped: skipped,
      totalCount: totalCount,
      truncated: truncated
    };
  }

  // Builds the desired snapshot that removes exactly the given candidate ids.
  // The ids must match a fresh candidate pick exactly, so a stale preview can
  // never archive a task the user has not just been shown.
  function buildArchiveSnapshot(tasks, candidateIds, nowMs, thresholdDays) {
    if (!Array.isArray(tasks)) return { ok: false, reason: 'tasks-unreadable', desiredTasks: null, removedCount: 0 };
    if (typeof nowMs !== 'number' || !isFinite(nowMs) || nowMs < 0) {
      return { ok: false, reason: 'clock-unreadable', desiredTasks: null, removedCount: 0 };
    }
    if (!Array.isArray(candidateIds) || candidateIds.length === 0
        || candidateIds.some((id) => typeof id !== 'string' || id === '')) {
      return { ok: false, reason: 'candidates-unreadable', desiredTasks: null, removedCount: 0 };
    }
    const unique = new Set(candidateIds);
    if (unique.size !== candidateIds.length) {
      return { ok: false, reason: 'candidates-unreadable', desiredTasks: null, removedCount: 0 };
    }
    const pick = pickArchiveCandidates(tasks, nowMs, thresholdDays);
    if (!pick.ok) return { ok: false, reason: pick.reason, desiredTasks: null, removedCount: 0 };
    const freshIds = pick.items.map((item) => item.id);
    if (freshIds.length !== candidateIds.length) {
      return { ok: false, reason: 'candidates-stale', desiredTasks: null, removedCount: 0 };
    }
    for (const id of candidateIds) {
      if (freshIds.indexOf(id) === -1) {
        return { ok: false, reason: 'candidates-stale', desiredTasks: null, removedCount: 0 };
      }
    }
    const removed = new Set(candidateIds);
    const desiredTasks = [];
    for (const task of tasks) {
      if (task && typeof task === 'object' && removed.has(task.id)) continue;
      desiredTasks.push(task);
    }
    return { ok: true, reason: '', desiredTasks: desiredTasks, removedCount: removed.size };
  }

  function describeReadError(reason) {
    if (reason === 'storage-unavailable') {
      return 'Local storage is unavailable, so the task list could not be read. Nothing was read or changed.';
    }
    if (reason === 'tasks-unreadable') {
      return 'The saved task list could not be read as valid tasks. Nothing was read or changed.';
    }
    if (reason === 'clock-unreadable') {
      return 'The page clock is unreadable, so task ages cannot be trusted. Nothing was read or changed.';
    }
    if (reason === 'threshold-unreadable' || reason === 'threshold-out-of-range') {
      return 'The age limit is not one of the offered choices (7, 30 or 90 days). Pick a choice and try again.';
    }
    return 'The request could not be understood. Nothing was read or changed.';
  }

  function describeRunError(reason) {
    if (reason === 'flag-off') {
      return 'Auto-archive is switched off in Feature settings. Nothing was saved.';
    }
    if (reason === 'no-candidates') {
      return 'There is nothing to archive right now, so nothing was saved.';
    }
    if (reason === 'candidates-unreadable') {
      return 'The archive list was unreadable, so nothing was saved. Preview again, then run once more.';
    }
    if (reason === 'candidates-stale') {
      return 'The task list changed since the preview, so nothing was saved. Preview again, then run once more.';
    }
    if (reason === 'cleared' || reason === 'clear-in-progress' || reason === 'task-clear-in-progress') {
      return 'A clear-all or task clear is running or just finished. Nothing was saved. Exit, then try again.';
    }
    if (reason === 'conflict' || reason === 'tasks-ambiguous') {
      return 'Another tab changed a task mid-archive, so nothing was saved. Exit, then try again.';
    }
    if (reason === 'generation-unreadable' || reason === 'generation-write-failed'
        || reason === 'task-write-failed' || reason === 'backup-failed' || reason === 'tasks-unreadable') {
      return 'The saved state could not be updated safely, so nothing was saved. Exit, then try again.';
    }
    if (reason === 'lock-unavailable' || reason === 'lock-failed') {
      return 'Cross-tab coordination is unavailable in this browser, so nothing was saved. Try a browser that supports Web Locks.';
    }
    if (reason === 'storage-unavailable') {
      return 'Local storage is unavailable, so nothing was saved.';
    }
    if (reason === 'clock-unreadable') {
      return 'The page clock is unreadable, so nothing was saved.';
    }
    if (reason === 'threshold-unreadable' || reason === 'threshold-out-of-range') {
      return 'The age limit is not one of the offered choices, so nothing was saved.';
    }
    return 'The archive could not finish and nothing was saved. Exit, then try again.';
  }

  function describePlan(thresholdDays) {
    const norm = normalizeThresholdDays(thresholdDays);
    if (!norm.ok) return { ok: false, reason: norm.reason, lines: [] };
    return {
      ok: true,
      reason: '',
      lines: [
        'Opt-in only: the switch lives in Feature settings and is off by default.',
        'Nothing runs by itself: tasks are removed only after you tap Archive now.',
        'Only completed tasks that finished at least ' + norm.days + ' day(s) ago are listed.',
        'Repeating tasks and tasks with an unknown or future finish age are never archived.',
        'Everything stays on this device: no network call, no account, nothing sent anywhere.'
      ]
    };
  }

  const api = {
    FLAG_ID: FLAG_ID,
    TASKS_STORAGE_KEY: TASKS_STORAGE_KEY,
    DAY_MS: DAY_MS,
    THRESHOLD_DAYS: THRESHOLD_DAYS,
    DEFAULT_THRESHOLD_DAYS: DEFAULT_THRESHOLD_DAYS,
    MAX_CANDIDATES: MAX_CANDIDATES,
    MAX_LABEL_CHARS: MAX_LABEL_CHARS,
    normalizeThresholdDays: normalizeThresholdDays,
    flagIsOn: flagIsOn,
    instantMs: instantMs,
    pickArchiveCandidates: pickArchiveCandidates,
    buildArchiveSnapshot: buildArchiveSnapshot,
    describeReadError: describeReadError,
    describeRunError: describeRunError,
    describePlan: describePlan
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkAutoArchive = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
