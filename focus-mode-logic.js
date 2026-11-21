/*
 * Daymark focus-mode logic for the web prototype.
 *
 * Pure, offline logic for the "focus-mode" opt-in feature flag (feature-flags
 * registry). It picks open tasks, describes one task in plain words, plans
 * what the focus view hides and writes nothing by itself. No network, no
 * timers, no storage access. Fail-closed: unreadable input is refused with a
 * reason, never guessed.
 */
((root) => {
  'use strict';

  const FOCUS_FLAG_ID = 'focus-mode';
  const TASKS_STORAGE_KEY = 'daymark.tasks.v1';
  const FLAGS_STORAGE_KEY = 'daymark.features.v1';
  const MAX_PICK_ITEMS = 50;
  const MAX_OPTION_CHARS = 80;
  const MAX_NOTES_CHARS = 600;
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
  const PRIORITIES = ['high', 'medium', 'low'];

  function entryPlan() {
    return [
      'Only the task you picked is shown, in one overlay on top of the page.',
      'The rest of the page is dimmed until you exit.',
      'Nothing is written to storage until you mark the task complete.',
      'No timer, no network call, no background work while you focus.'
    ];
  }

  function flagIsOn(read) {
    return Boolean(read && read.ok === true && read.flags && read.flags[FOCUS_FLAG_ID] === true);
  }

  function isDraft(task) {
    return Boolean(task && typeof task === 'object'
      && typeof task.id === 'string' && task.id !== ''
      && typeof task.title === 'string' && task.title.trim() !== '');
  }

  function truncatedLabel(task, today) {
    const clean = task.title.trim().replace(/[\r\n\t]+/g, ' ');
    const dueBit = task.dueDate === today ? ' · due today'
      : (task.dueDate ? ' · due ' + task.dueDate : '');
    const wanted = clean + dueBit;
    if (wanted.length <= MAX_OPTION_CHARS) return { label: wanted, truncated: false };
    return { label: wanted.slice(0, MAX_OPTION_CHARS - 1) + '\u2026', truncated: true };
  }

  // Pick open tasks for the chooser: open only, one entry per id, a stable
  // order (overdue, then due date, then priority, then title) and a hard cap.
  function pickOpenTasks(tasks, today) {
    if (!Array.isArray(tasks)) return { ok: false, reason: 'tasks-unreadable', items: [], truncated: false };
    if (typeof today !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(today)) {
      return { ok: false, reason: 'today-unreadable', items: [], truncated: false };
    }
    const seen = new Set();
    const picked = [];
    for (const task of tasks) {
      if (!isDraft(task)) continue;
      if (task.completed !== false) continue;
      if (seen.has(task.id)) continue;
      seen.add(task.id);
      picked.push(task);
    }
    picked.sort((a, b) => {
      const aOver = a.dueDate !== null && a.dueDate !== undefined && a.dueDate < today ? 0 : 1;
      const bOver = b.dueDate !== null && b.dueDate !== undefined && b.dueDate < today ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      const aDue = typeof a.dueDate === 'string' && a.dueDate !== '' ? a.dueDate : null;
      const bDue = typeof b.dueDate === 'string' && b.dueDate !== '' ? b.dueDate : null;
      if (aDue === null && bDue !== null) return 1;
      if (aDue !== null && bDue === null) return -1;
      if (aDue !== null && bDue !== null && aDue !== bDue) return aDue < bDue ? -1 : 1;
      const aP = PRIORITY_ORDER[a.priority] === undefined ? 3 : PRIORITY_ORDER[a.priority];
      const bP = PRIORITY_ORDER[b.priority] === undefined ? 3 : PRIORITY_ORDER[b.priority];
      if (aP !== bP) return aP - bP;
      return a.title.localeCompare(b.title);
    });
    const truncated = picked.length > MAX_PICK_ITEMS;
    const items = picked.slice(0, MAX_PICK_ITEMS).map((task) => {
      const label = truncatedLabel(task, today);
      return { id: task.id, label: label.label, priority: task.priority || 'medium', truncated: label.truncated };
    });
    return { ok: true, reason: '', items: items, truncated: truncated };
  }

  function priorityLabel(priority) {
    return PRIORITIES.includes(priority) ? priority : 'medium';
  }

  // Describe the task the user picked, in plain words. Notes are capped.
  function describeTask(task, today) {
    if (!isDraft(task)) return { ok: false, reason: 'task-unreadable', lines: [], truncated: false };
    const lines = ['Priority: ' + priorityLabel(task.priority) + '.'];
    if (task.dueDate === today) lines.push('Due today.');
    else if (typeof task.dueDate === 'string' && task.dueDate !== '') lines.push('Due ' + task.dueDate + '.');
    else lines.push('No due date.');
    if (typeof task.dueTime === 'string' && task.dueTime !== '') lines.push('Time: ' + task.dueTime + '.');
    if (Array.isArray(task.tags) && task.tags.length > 0) lines.push('Tags: ' + task.tags.join(', ') + '.');
    if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
      let open = 0;
      for (const sub of task.subtasks) {
        if (sub && sub.done === false) open += 1;
      }
      lines.push('Steps: ' + open + ' of ' + task.subtasks.length + ' still open.');
    }
    let truncated = false;
    if (typeof task.notes === 'string' && task.notes.trim() !== '') {
      const notes = task.notes.trim();
      const prefix = 'Notes: ';
      const room = MAX_NOTES_CHARS - prefix.length;
      if (notes.length <= room) lines.push(prefix + notes);
      else {
        lines.push(prefix + notes.slice(0, room - 1) + '\u2026');
        truncated = true;
      }
    }
    lines.push(task.completed === true ? 'This task is already complete.' : 'Status: still open.');
    return { ok: true, reason: '', lines: lines, truncated: truncated };
  }

  // Build the completed copy of one task for a snapshot commit. The original
  // records are never mutated; an unknown id or a duplicate id fails closed.
  function completeTaskInSnapshot(tasks, taskId, updatedAtIso) {
    if (!Array.isArray(tasks)) return { ok: false, reason: 'tasks-unreadable', tasks: null };
    if (typeof taskId !== 'string' || taskId === '') {
      return { ok: false, reason: 'unknown-task', tasks: null };
    }
    if (typeof updatedAtIso !== 'string' || updatedAtIso === '') {
      return { ok: false, reason: 'timestamp-unreadable', tasks: null };
    }
    let found = 0;
    const next = [];
    for (const task of tasks) {
      if (!task || typeof task !== 'object' || task.id !== taskId) {
        next.push(task);
        continue;
      }
      found += 1;
      const copy = {};
      for (const key of Object.keys(task)) copy[key] = task[key];
      copy.completed = true;
      copy.updatedAt = updatedAtIso;
      next.push(copy);
    }
    if (found === 0) return { ok: false, reason: 'unknown-task', tasks: null };
    if (found > 1) return { ok: false, reason: 'tasks-ambiguous', tasks: null };
    return { ok: true, reason: '', tasks: next };
  }

  // Plain-words reasons for a failed commit, for the overlay status line.
  function describeCompleteError(reason) {
    const TABLE = {
      'storage-unavailable': 'Browser storage is unavailable, so nothing was saved.',
      'generation-unreadable': 'The saved task bookkeeping could not be read, so nothing was saved.',
      'cleared': 'Tasks were cleared in another tab while this overlay was open, so nothing was saved.',
      'clear-in-progress': 'A clear operation is running in another tab, so nothing was saved.',
      'task-clear-in-progress': 'Tasks are being cleared in another tab, so nothing was saved.',
      'conflict': 'This task changed in another tab while it was open, so nothing was saved. Exit, then try again.',
      'tasks-ambiguous': 'The saved task list could not be validated, so nothing was saved.',
      'tasks-unreadable': 'The saved task list could not be read, so nothing was saved.',
      'stale-tasks': 'This task changed in another tab while it was open, so nothing was saved. Exit, then try again.',
      'generation-write-failed': 'The saved task bookkeeping refused the write, so nothing was saved.',
      'task-write-failed': 'Browser storage rejected the task write, so nothing was saved.',
      'lock-unavailable': 'Safe task writing needs this page open and active, so nothing was saved.',
      'lock-failed': 'Another tab is holding the task list, so nothing was saved right now.',
      'invalid-timestamp': 'The completion time could not be produced, so nothing was saved.'
    };
    if (typeof TABLE[reason] === 'string') return TABLE[reason];
    return 'The task could not be marked complete, so nothing was saved.';
  }

  // Plain-words reasons for a failed entry, for the card status line.
  function describeEntryError(reason) {
    const TABLE = {
      'flag-off': 'Focus view is switched off in Feature settings. Turn it on there first.',
      'no-tasks': 'No open tasks to focus on. Add or reopen a task first.',
      'tasks-unavailable': 'The saved task list could not be read, so nothing opened.',
      'tasks-unreadable': 'The saved task list could not be read, so nothing opened.',
      'storage-unavailable': 'Browser storage is unavailable, so nothing opened.',
      'unknown-task': 'That task is no longer in the saved list, so nothing opened. Refresh the chooser.'
    };
    if (typeof TABLE[reason] === 'string') return TABLE[reason];
    return 'Focus view could not open, so nothing changed.';
  }

  const api = {
    FOCUS_FLAG_ID: FOCUS_FLAG_ID,
    TASKS_STORAGE_KEY: TASKS_STORAGE_KEY,
    FLAGS_STORAGE_KEY: FLAGS_STORAGE_KEY,
    MAX_PICK_ITEMS: MAX_PICK_ITEMS,
    MAX_OPTION_CHARS: MAX_OPTION_CHARS,
    MAX_NOTES_CHARS: MAX_NOTES_CHARS,
    entryPlan: entryPlan,
    flagIsOn: flagIsOn,
    pickOpenTasks: pickOpenTasks,
    describeTask: describeTask,
    completeTaskInSnapshot: completeTaskInSnapshot,
    describeCompleteError: describeCompleteError,
    describeEntryError: describeEntryError
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkFocusMode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
