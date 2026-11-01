(() => {
  'use strict';

  const STORAGE_KEY = 'daymark.tasks.v1';
  const BACKUP_KEY = 'daymark.tasks.v1.backup';
  const FOCUS_KEY = 'daymark.focus.v1';
  const FOCUS_BACKUP_KEY = 'daymark.focus.v1.backup';
  const PRIORITIES = ['low', 'medium', 'high'];
  const logic = window.DaymarkLogic;
  const repeat = window.DaymarkRepeat || null;
  const focus = window.DaymarkFocus || null;
  const state = { tasks: [], filter: 'all', sort: 'smart', query: '', toastTimer: null, toastAction: null, currentDay: null, dayTimer: null, reminderTimer: null, previousOpenCount: null, editSubtasks: [], focusSession: null, focusLog: [], focusTimer: null, focusPreset: 'focus', focusTaskId: '', recoveryBackupPendingPayload: null, focusRecoveryBackupPendingPayload: null, recoveryExportInProgress: false, recoveryExportUrl: null, recoveryExportHref: null, recoveryExportTimer: null };
  const $ = (selector) => document.querySelector(selector);
  const taskList = $('#task-list');
  const suggestionList = $('#suggestion-list');

  function setStorageStatus(message, unavailable = false) {
    const status = $('#storage-status');
    if (!status) return;
    const label = status.querySelector('span');
    if (label) label.textContent = message;
    status.classList.toggle('is-warning', unavailable);
    status.classList.remove('is-checking');
  }

  function loadTasks() {
    let saved = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Could not read Daymark storage:', error);
      setStorageStatus('Storage unavailable', true);
      showToast('Browser storage is unavailable. You can still use this page for now.');
      return [];
    }
    if (!saved) {
      setStorageStatus('Local storage ready');
      return [];
    }
    try {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error('Saved task data is not a list.');
      const validated = logic.validateStoredTasks(parsed);
      if (validated.rejectedCount > 0) {
        // Some records failed validation and are about to be dropped. If backup
        // storage is full/unavailable, keep the original primary payload and
        // retry backup creation before any later save can replace it.
        const backupSaved = backUpRawPayload(saved);
        if (!backupSaved) state.recoveryBackupPendingPayload = saved;
        setStorageStatus(backupSaved
          ? 'Some saved tasks were ignored; the originals were kept in a backup'
          : 'Some saved tasks were ignored; recovery backup could not be created. Free storage before saving', true);
        if (backupSaved) offerRecoveryExport('Some saved tasks were ignored; originals were kept in a browser backup.');
      } else if (hasPartialRecoveryBackup()) {
        // A prior backup may contain records rejected by validation. Keep it
        // until the user can recover those originals; a healthy filtered store
        // does not make that backup stale.
        setStorageStatus('Saved on this device; ignored originals remain in a recovery backup', true);
        offerRecoveryExport('Saved on this device; ignored originals remain in a recovery backup');
      } else {
        setStorageStatus('Saved on this device');
        // A backup of an unreadable payload is stale once the primary store is
        // healthy. Backups containing rejected task records are retained above.
        clearRecoveryBackup();
      }
      return validated.tasks;
    } catch (error) {
      console.warn('Could not load saved Daymark tasks:', error);
      setStorageStatus('Saved data could not be read', true);
      // Preserve the unreadable payload instead of silently discarding it, so a
      // future fix or manual recovery can still reach the original data.
      const backupSaved = backUpRawPayload(saved);
      if (!backupSaved) {
        state.recoveryBackupPendingPayload = saved;
        setStorageStatus('Saved data could not be read; recovery backup could not be created. Free storage before saving', true);
      }
      showToast(backupSaved
        ? 'Saved tasks could not be read. The original data was kept in a browser backup.'
        : 'Saved tasks could not be read. Browser storage could not create a recovery backup; the original entry was left unchanged');
      if (backupSaved) offerRecoveryExport('Saved tasks could not be read. The original data was kept in a browser backup.');
      return [];
    }
  }

  function isPartialRecoveryPayload(raw) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && logic.validateStoredTasks(parsed).rejectedCount > 0;
    } catch (error) {
      return false;
    }
  }

  function recoveryBackupPayloads(raw) {
    if (typeof raw !== 'string' || !raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return isPartialRecoveryPayload(raw) ? [raw] : [];
      }
      if (parsed && parsed.format === 'daymark-recovery-bundle-v1'
          && Array.isArray(parsed.payloads)) {
        return parsed.payloads.filter((payload) => typeof payload === 'string');
      }
    } catch (error) {
      // An opaque/malformed backup may itself be the only surviving copy of
      // older data. Preserve its exact bytes when a new damaged payload arrives.
    }
    return [raw];
  }

  function isHealthyTaskPayload(raw) {
    if (typeof raw !== 'string' || !raw) return false;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && logic.validateStoredTasks(parsed).rejectedCount === 0;
    } catch (error) {
      return false;
    }
  }

  function backUpRawPayload(raw) {
    try {
      const existing = localStorage.getItem(BACKUP_KEY);
      const existingPayloads = recoveryBackupPayloads(existing);
      const existingParsed = (() => {
        try { return JSON.parse(existing); } catch (error) { return null; }
      })();
      const existingIsBundle = Boolean(existingParsed
        && existingParsed.format === 'daymark-recovery-bundle-v1'
        && Array.isArray(existingParsed.payloads));
      const preserveExisting = existingPayloads.length > 0
        && (existingIsBundle || !isHealthyTaskPayload(existing));
      if (preserveExisting) {
        // A recovery bundle, partial payload, or opaque prior backup may hold
        // unique user data. Merge it with the newly rejected original rather
        // than replacing it. Healthy task-array backups remain stale.
        const payloads = Array.from(new Set([...existingPayloads, raw]));
        localStorage.setItem(BACKUP_KEY, JSON.stringify({
          format: 'daymark-recovery-bundle-v1',
          payloads
        }));
      } else {
        localStorage.setItem(BACKUP_KEY, raw);
      }
      return true;
    } catch (backupError) {
      console.warn('Could not keep a backup of raw Daymark tasks:', backupError);
      return false;
    }
  }

  function hasPartialRecoveryBackup() {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      return recoveryBackupPayloads(raw).some(isPartialRecoveryPayload);
    } catch (error) {
      return false;
    }
  }

  function persistTasks() {
    try {
      if (state.recoveryBackupPendingPayload !== null) {
        // Do not overwrite the only remaining copy of rejected/unreadable
        // source data. Retry backing it up first; if storage still refuses,
        // leave the primary entry untouched and let the user free space.
        const backupSaved = backUpRawPayload(state.recoveryBackupPendingPayload);
        if (!backupSaved) {
          setStorageStatus('Cannot save safely: recovery backup could not be created. Free browser storage and retry.', true);
          return false;
        }
        state.recoveryBackupPendingPayload = null;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
      if (hasPartialRecoveryBackup()) {
        setStorageStatus('Saved on this device; ignored originals remain in a recovery backup', true);
      } else {
        setStorageStatus('Saved on this device');
        // A full save can clear a stale backup, but not one with rejected records.
        clearRecoveryBackup();
      }
      return true;
    } catch (error) {
      console.warn('Could not save Daymark tasks:', error);
      setStorageStatus('Storage unavailable', true);
      return false;
    }
  }

  function clearRecoveryBackup() {
    try {
      localStorage.removeItem(BACKUP_KEY);
    } catch (error) {
      console.warn('Could not clear the Daymark recovery backup:', error);
    }
  }

  function showSaveResult(saved, successMessage) {
    showToast(saved ? successMessage : 'Could not save to this browser. Changes may be lost when you leave.');
  }

  function makeId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function readPriority(input) {
    // Guard against unexpected select values so every stored task stays valid
    // and reloadable by validateStoredTasks on the next visit.
    return PRIORITIES.includes(input.value) ? input.value : 'medium';
  }

  function readReminderLead(select) {
    if (!select || select.disabled || select.value === '') return null;
    const lead = Number(select.value);
    return logic.isReminderLead(lead) ? lead : null;
  }

  function taskRepeat(task) {
    const rule = task ? task.repeat : null;
    return rule && repeat && repeat.isRepeat(rule) ? rule : null;
  }

  function readRepeatRule(select) {
    if (!repeat || !select || select.disabled || select.value === '') return null;
    return repeat.isRepeat(select.value) ? select.value : null;
  }

  function parseQuickTags(title) {
    // Quick tagging from the composer, matching the Android app's #tag quick add:
    // pull "#tag" tokens out of the title and store them as real tags.
    const found = [];
    const text = title.replace(/(^|\s)#([a-z0-9][a-z0-9_-]{0,23})(?=\s|$)/gi, (match, space, tag) => {
      found.push(tag.toLowerCase());
      return ' ';
    }).replace(/\s+/g, ' ').trim();
    if (!found.length) return { title, tags: null };
    try {
      const tags = logic.normalizeTags(found);
      return tags.length ? { title: text, tags } : { title: text, tags: null };
    } catch (error) {
      // Malformed or too many tags: keep the title exactly as typed, without tags.
      return { title, tags: null };
    }
  }

  function formatDate(dateString) {
    if (!logic.isDateOnly(dateString)) return '';
    const [year, month, day] = dateString.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(year, month - 1, day));
  }

  function formatTime(value) {
    if (!logic.isTimeOnly(value)) return '';
    const [hour, minute] = value.split(':').map(Number);
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(2026, 0, 1, hour, minute));
  }

  function dueSuffix(task) {
    const timeText = formatTime(task.dueTime);
    return timeText ? ` · ${timeText}` : '';
  }

  function getDueText(task, today) {
    const suffix = dueSuffix(task);
    if (!task.dueDate) return 'No due date';
    if (task.dueDate < today) return `Overdue · ${formatDate(task.dueDate)}${suffix}`;
    if (task.dueDate === today) return `Due today${suffix}`;
    return `Due ${formatDate(task.dueDate)}${suffix}`;
  }

  function getDueClass(task, today) {
    if (!task.dueDate) return '';
    if (task.dueDate < today) return 'is-overdue';
    if (task.dueDate === today) return 'is-today';
    return '';
  }

  function icon(name) {
    const paths = {
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
      edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
      trash: '<path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/>',
      check: '<path d="m4 12 5 5L20 6"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>',
      note: '<path d="M5 4h14v16H5z"/><path d="M8.5 9h7M8.5 13h7M8.5 17h4"/>',
      steps: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="m3 6 1 1 2-2m-3 6 1 1 2-2m-3 6 1 1 2-2"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
  }

  function subtaskSummary(task) {
    if (!Array.isArray(task.subtasks) || task.subtasks.length === 0) return null;
    const done = task.subtasks.filter((subtask) => subtask.done).length;
    return { done, total: task.subtasks.length };
  }

  function taskMarkup(task, today) {
    const completionLabel = task.completed ? `Mark “${escapeHTML(task.title)}” incomplete` : `Complete “${escapeHTML(task.title)}”`;
    const tags = Array.isArray(task.tags) && task.tags.length
      ? `<span class="tag-pills">${task.tags.map((tag) => `<button class="tag-pill" type="button" data-action="tag" data-tag="${escapeHTML(tag)}" aria-label="Search tasks tagged ${escapeHTML(tag)}" title="Search #${escapeHTML(tag)}">#${escapeHTML(tag)}</button>`).join('')}</span>` : '';
    const hasNotes = typeof task.notes === 'string' && task.notes.trim().length > 0;
    const notesChip = hasNotes ? `<button class="task-chip notes-chip" type="button" data-action="edit" aria-label="Edit task notes" title="Has notes">${icon('note')}</button>` : '';
    const summary = subtaskSummary(task);
    const subtaskChip = summary
      ? `<button class="task-chip subtask-chip${summary.done === summary.total ? ' is-all-done' : ''}" type="button" data-action="edit" aria-label="Edit subtasks (${summary.done} of ${summary.total} done)" title="Subtasks: ${summary.done}/${summary.total}">${icon('steps')} ${summary.done}/${summary.total}</button>`
      : '';
    const repeatRule = taskRepeat(task);
    const repeatChip = repeatRule ? `<span class="task-chip repeat-chip" title="Repeats ${repeatRule}. Completing it schedules the next occurrence.">${icon('repeat')}</span>` : '';
    const hasReminder = !task.completed && logic.isReminderLead(task.reminderLeadMinutes) && task.reminderLeadMinutes !== null;
    const reminderChip = hasReminder
      ? `<span class="task-chip reminder-chip" title="${task.reminderLeadMinutes === 0 ? 'Reminder at due time' : `Reminder ${task.reminderLeadMinutes === 1440 ? '1 day' : task.reminderLeadMinutes === 60 ? '1 hour' : '30 min'} before`}">${icon('bell')}</span>`
      : '';
    return `<article class="task-row${task.completed ? ' is-complete' : ''}" data-task-id="${escapeHTML(task.id)}">
      <button class="complete-button" type="button" data-action="toggle" aria-label="${completionLabel}" aria-pressed="${task.completed}">${icon('check')}</button>
      <div class="task-main">
        <span class="task-title" title="${escapeHTML(task.title)}">${escapeHTML(task.title)}</span>
        <div class="task-meta"><span class="due-label ${getDueClass(task, today)}">${task.dueTime && logic.isTimeOnly(task.dueTime) ? icon('clock') : icon('calendar')} ${escapeHTML(getDueText(task, today))}</span><span class="priority-pill priority-${task.priority}">${task.priority.toUpperCase()}</span>${tags}${repeatChip}${reminderChip}${notesChip}${subtaskChip}</div>
      </div>
      <div class="task-actions">
        <button class="icon-button focus-button" type="button" data-action="focus" aria-label="Start focus timer for ${escapeHTML(task.title)}" title="Start a focus timer for this task">${icon('timer')}</button>
        <button class="icon-button" type="button" data-action="edit" aria-label="Edit ${escapeHTML(task.title)}">${icon('edit')}</button>
        <button class="icon-button duplicate-button" type="button" data-action="duplicate" aria-label="Duplicate ${escapeHTML(task.title)}" title="Duplicate as a new task">${icon('copy')}</button>
        <button class="icon-button delete-button" type="button" data-action="delete" aria-label="Delete ${escapeHTML(task.title)}">${icon('trash')}</button>
      </div>
    </article>`;
  }

  function matchesSubtaskTitle(task, normalizedQuery) {
    return Array.isArray(task.subtasks) && task.subtasks.some((subtask) => subtask && typeof subtask.title === 'string'
      && subtask.title.toLowerCase().includes(normalizedQuery));
  }

  function render() {
    const today = logic.localDateString();
    state.currentDay = today;
    const overdueTasks = state.tasks.filter((task) => !task.completed && task.dueDate !== null && task.dueDate < today);
    const source = state.filter === 'overdue' ? overdueTasks : state.tasks;
    const effectiveFilter = state.filter === 'overdue' ? 'all' : state.filter;
    let filteredTasks = logic.getFilteredTasks(source, effectiveFilter, state.query, today);
    const normalizedQuery = String(state.query || '').trim().toLowerCase();
    if (normalizedQuery) {
      // task-logic search covers title, notes and tags; extend it here so step
      // titles match too without touching the shared, tested logic module.
      const knownIds = new Set(filteredTasks.map((task) => task.id));
      const extra = source.filter((task) => !knownIds.has(task.id) && matchesSubtaskTitle(task, normalizedQuery));
      if (extra.length) filteredTasks = logic.getFilteredTasks(filteredTasks.concat(extra), effectiveFilter, '', today);
    }
    if (state.sort === 'title') {
      filteredTasks = filteredTasks.slice().sort((a, b) => a.title.localeCompare(b.title) || (a.dueDate || '').localeCompare(b.dueDate || ''));
    }
    const openTasks = state.tasks.filter((task) => !task.completed);
    const todayTasks = state.tasks.filter((task) => task.dueDate === today);
    const upcomingTasks = state.tasks.filter((task) => task.dueDate !== null && task.dueDate > today);
    const completedTasks = state.tasks.filter((task) => task.completed);
    const hasQuery = Boolean(state.query.trim());

    const openCountElement = $('#open-count');
    if (state.previousOpenCount !== null && state.previousOpenCount !== openTasks.length) {
      openCountElement.classList.remove('is-bumped');
      void openCountElement.offsetWidth; // Restart the bump animation.
      openCountElement.classList.add('is-bumped');
    }
    state.previousOpenCount = openTasks.length;
    openCountElement.textContent = String(openTasks.length);
    $('#count-all').textContent = String(state.tasks.length);
    $('#count-today').textContent = String(todayTasks.length);
    $('#count-upcoming').textContent = String(upcomingTasks.length);
    $('#count-overdue').textContent = String(overdueTasks.length);
    $('#count-completed').textContent = String(completedTasks.length);
    $('#visible-count').textContent = hasQuery
      ? `${filteredTasks.length} matching ${filteredTasks.length === 1 ? 'task' : 'tasks'}`
      : `${filteredTasks.length} ${filteredTasks.length === 1 ? 'task' : 'tasks'}`;
    $('#clear-completed').hidden = completedTasks.length === 0;
    $('#today-label').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase();
    $('#sort-toggle').textContent = state.sort === 'title' ? 'Sort: A–Z' : 'Sort: Smart';

    document.querySelectorAll('.filter-button').forEach((button) => {
      const active = button.dataset.filter === state.filter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    taskList.innerHTML = filteredTasks.map((task) => taskMarkup(task, today)).join('');
    // The first render is the reliable completion signal for the initial skeleton.
    taskList.classList.add('is-ready');
    const empty = filteredTasks.length === 0;
    $('#empty-state').hidden = !empty;
    taskList.hidden = empty;
    $('#empty-clear-search').hidden = !empty || !hasQuery;
    if (empty && hasQuery) {
      $('#empty-title').textContent = 'No matching tasks';
      $('#empty-copy').textContent = 'Try another word or clear your search to see the full list.';
    } else if (empty && state.filter === 'completed') {
      $('#empty-title').textContent = 'Nothing completed yet';
      $('#empty-copy').textContent = 'Finished tasks will be collected here for an easy review.';
    } else if (empty && state.filter === 'overdue') {
      $('#empty-title').textContent = 'Nothing overdue';
      $('#empty-copy').textContent = 'You are fully caught up on past-due tasks. Nice work.';
    } else if (empty && state.tasks.length > 0) {
      const labels = {
        all: ['All caught up', 'Nothing on your list just now. Add a task whenever something comes to mind.'],
        today: ['Nothing due today', 'A little breathing room. Switch filters or add something new.'],
        upcoming: ['Nothing coming up', 'No future-dated tasks yet. Add a due date to plan ahead.']
      };
      $('#empty-title').textContent = labels[state.filter][0];
      $('#empty-copy').textContent = labels[state.filter][1];
    } else if (empty) {
      $('#empty-title').textContent = 'A clear start';
      $('#empty-copy').textContent = 'Add your first task above. Small steps count.';
    }

    const completedAll = state.tasks.filter((task) => task.completed);
    const doneDays = new Set(completedAll.map((task) => logic.localDateString(new Date(task.updatedAt))));
    const doneToday = doneDays.has(today)
      ? completedAll.filter((task) => logic.localDateString(new Date(task.updatedAt)) === today).length : 0;
    const weekStartDate = new Date();
    weekStartDate.setDate(weekStartDate.getDate() - 6);
    const weekStartDay = logic.localDateString(weekStartDate);
    const doneWeek = completedAll.filter((task) => logic.localDateString(new Date(task.updatedAt)) >= weekStartDay).length;
    let streak = 0;
    const streakCursor = new Date();
    if (!doneDays.has(logic.localDateString(streakCursor))) streakCursor.setDate(streakCursor.getDate() - 1);
    while (doneDays.has(logic.localDateString(streakCursor))) {
      streak += 1;
      streakCursor.setDate(streakCursor.getDate() - 1);
    }
    $('#stats-strip').hidden = completedAll.length === 0;
    $('#stat-done-today').textContent = String(doneToday);
    $('#stat-done-week').textContent = String(doneWeek);
    $('#stat-streak').textContent = String(streak);
    const suggestions = logic.getSuggestions(state.tasks, today, formatDate);
    suggestionList.innerHTML = suggestions.length
      ? suggestions.map(({ task, reason }, index) => `<div class="suggestion-item"><span class="suggestion-number">${index + 1}</span><div><p class="suggestion-task-title">${escapeHTML(task.title)}</p><p class="suggestion-reason">${escapeHTML(reason)}</p></div></div>`).join('')
      : '<div class="suggestion-empty">Your open-task suggestions will show up here when you add a task.</div>';
    renderFocus();
  }

  function releasePreparedRecoveryExport() {
    if (state.recoveryExportTimer !== null) {
      clearTimeout(state.recoveryExportTimer);
      state.recoveryExportTimer = null;
    }
    const objectUrl = state.recoveryExportUrl;
    state.recoveryExportUrl = null;
    state.recoveryExportHref = null;
    if (objectUrl && globalThis.URL && typeof globalThis.URL.revokeObjectURL === 'function') {
      try { globalThis.URL.revokeObjectURL(objectUrl); } catch (error) { /* Best-effort cleanup. */ }
    }
  }

  function dismissToast() {
    clearTimeout(state.toastTimer);
    state.toastTimer = null;
    state.toastAction = null;
    $('#toast-stack').classList.remove('is-visible');
    $('#toast-action').hidden = true;
    releasePreparedRecoveryExport();
  }

  function showToast(message, action = null) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    const actionButton = $('#toast-action');
    actionButton.hidden = !action;
    actionButton.textContent = action?.label || '';
    state.toastAction = action;
    $('#toast-stack').classList.add('is-visible');
    clearTimeout(state.toastTimer);
    const expiresPreparedDownload = Boolean(action && action.label === 'Download now');
    state.toastTimer = setTimeout(() => {
      const stillCurrent = state.toastAction === action;
      dismissToast();
      if (stillCurrent && expiresPreparedDownload) {
        showToast('Recovery export expired. Tap Export recovery to prepare a new download.');
      }
    }, action ? 7000 : 2600);
  }

  function readRecoveryExportPayload() {
    let taskBackup = null;
    let focusBackup = null;
    try {
      taskBackup = localStorage.getItem(BACKUP_KEY);
      focusBackup = localStorage.getItem(FOCUS_BACKUP_KEY);
    } catch (error) {
      return null;
    }
    const hasTaskBackup = typeof taskBackup === 'string' && taskBackup.length > 0;
    const hasFocusBackup = typeof focusBackup === 'string' && focusBackup.length > 0;
    if (hasTaskBackup && hasFocusBackup) {
      return JSON.stringify({
        format: 'daymark-combined-recovery-v1',
        taskBackup,
        focusBackup
      });
    }
    return hasTaskBackup ? taskBackup : (hasFocusBackup ? focusBackup : null);
  }

  function offerRecoveryExport(message = 'Recovery data is preserved on this device. Export it for manual review.') {
    const raw = readRecoveryExportPayload();
    if (typeof raw !== 'string' || raw.length === 0) return;
    showToast(message, {
      label: 'Export recovery',
      run: exportRecoveryBackup
    });
  }

  function exportRecoveryBackup() {
    if (state.recoveryExportInProgress) return;

    const raw = readRecoveryExportPayload();
    if (typeof raw !== 'string' || raw.length === 0) {
      showToast('No recovery backup is available to export.');
      return;
    }

    state.recoveryExportInProgress = true;
    try {
      let href = null;
      let objectUrl = null;
      if (typeof Blob === 'function' && globalThis.URL
          && typeof globalThis.URL.createObjectURL === 'function') {
        objectUrl = globalThis.URL.createObjectURL(new Blob([raw], {
          type: 'text/plain;charset=utf-8'
        }));
        href = objectUrl;
      } else {
        href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(raw);
      }
      state.recoveryExportUrl = objectUrl;
      state.recoveryExportHref = href;
      if (objectUrl) state.recoveryExportTimer = setTimeout(releasePreparedRecoveryExport, 7000);
      state.recoveryExportInProgress = false;
      showToast('Recovery backup prepared. Tap Download now to save the file.', {
        label: 'Download now',
        run: downloadPreparedRecovery
      });
    } catch (error) {
      state.recoveryExportInProgress = false;
      releasePreparedRecoveryExport();
      showToast('Recovery backup export is not available in this browser.');
    }
  }

  function downloadPreparedRecovery() {
    const href = state.recoveryExportHref;
    if (typeof href !== 'string' || href.length === 0) {
      releasePreparedRecoveryExport();
      showToast('Recovery backup export expired. Tap Export recovery to prepare it again.');
      return;
    }
    try {
      const link = document.createElement('a');
      link.href = href;
      link.download = 'daymark-recovery-backup.txt';
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (state.recoveryExportUrl) {
        clearTimeout(state.recoveryExportTimer);
        state.recoveryExportTimer = setTimeout(releasePreparedRecoveryExport, 1000);
      } else {
        releasePreparedRecoveryExport();
      }
      showToast('Recovery backup exported. Keep this file private; it may contain task and Focus Timer data.');
    } catch (error) {
      releasePreparedRecoveryExport();
      showToast('Recovery backup export is not available in this browser.');
    }
  }

  function runToastAction() {
    const action = state.toastAction;
    if (!action) return;
    clearTimeout(state.toastTimer);
    state.toastTimer = null;
    state.toastAction = null;
    $('#toast-stack').classList.remove('is-visible');
    $('#toast-action').hidden = true;
    action.run();
  }

  function scheduleNextDayRefresh() {
    clearTimeout(state.dayTimer);
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 250);
    state.dayTimer = setTimeout(() => {
      if (logic.localDateString() !== state.currentDay) render();
      scheduleNextDayRefresh();
    }, Math.max(1000, nextMidnight.getTime() - now.getTime()));
  }

  function refreshIfLocalDayChanged() {
    if (logic.localDateString() === state.currentDay) return;
    render();
    scheduleNextDayRefresh();
  }

  function clearSearch() {
    state.query = '';
    $('#task-search').value = '';
    render();
    $('#task-search').focus();
  }

  function addTask(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const titleInput = $('#new-title');
    const rawTitle = titleInput.value.trim();
    const error = $('#add-error');
    if (!rawTitle) {
      error.hidden = false;
      titleInput.setAttribute('aria-invalid', 'true');
      titleInput.focus();
      return;
    }
    error.hidden = true;
    titleInput.removeAttribute('aria-invalid');
    const { title, tags } = parseQuickTags(rawTitle);
    if (!title) {
      error.hidden = false;
      titleInput.setAttribute('aria-invalid', 'true');
      titleInput.focus();
      return;
    }
    const now = new Date().toISOString();
    const dueDateValue = $('#new-due-date').value;
    const hasDate = logic.isDateOnly(dueDateValue);
    const dueTimeValue = $('#new-due-time').value;
    const reminderLead = readReminderLead($('#new-reminder'));
    const task = {
      id: makeId(),
      title,
      dueDate: hasDate ? dueDateValue : null,
      dueTime: hasDate && logic.isTimeOnly(dueTimeValue) ? dueTimeValue : null,
      priority: readPriority($('#new-priority')),
      completed: false,
      createdAt: now,
      updatedAt: now
    };
    if (tags) task.tags = tags;
    if (hasDate && reminderLead !== null) task.reminderLeadMinutes = reminderLead;
    const repeatRule = readRepeatRule($('#new-repeat'));
    if (hasDate && repeatRule) task.repeat = repeatRule;
    state.tasks.push(task);
    const saved = persistTasks();
    form.reset();
    $('#new-priority').value = 'medium';
    $('#new-due-time').disabled = true;
    $('#new-reminder').disabled = true;
    $('#new-reminder').value = '';
    $('#new-repeat').disabled = true;
    $('#new-repeat').value = '';
    state.filter = 'all';
    state.query = '';
    $('#task-search').value = '';
    render();
    titleInput.focus();
    showSaveResult(saved, tags ? 'Task added and tagged.' : 'Task added to your list.');
  }

  function openEditor(task) {
    $('#edit-id').value = task.id;
    $('#edit-title').value = task.title;
    $('#edit-due-date').value = task.dueDate || '';
    $('#edit-due-time').disabled = !task.dueDate;
    $('#edit-due-time').value = task.dueTime && logic.isTimeOnly(task.dueTime) ? task.dueTime : '';
    const reminderSelect = $('#edit-reminder');
    reminderSelect.disabled = !task.dueDate;
    reminderSelect.value = logic.isReminderLead(task.reminderLeadMinutes) && task.reminderLeadMinutes !== null
      ? String(task.reminderLeadMinutes) : '';
    const repeatSelect = $('#edit-repeat');
    repeatSelect.disabled = !task.dueDate;
    repeatSelect.value = taskRepeat(task) || '';
    $('#edit-priority').value = task.priority;
    $('#edit-tags').value = Array.isArray(task.tags) ? task.tags.join(', ') : '';
    $('#edit-notes').value = typeof task.notes === 'string' ? task.notes : '';
    $('#edit-error').hidden = true;
    $('#edit-title').removeAttribute('aria-invalid');
    state.editSubtasks = Array.isArray(task.subtasks)
      ? task.subtasks.filter((subtask) => subtask && typeof subtask.id === 'string'
        && typeof subtask.title === 'string' && subtask.title.trim().length > 0
        && typeof subtask.done === 'boolean')
        .slice(0, logic.MAX_SUBTASKS)
        .map((subtask) => ({ id: subtask.id, title: subtask.title.trim().slice(0, logic.MAX_SUBTASK_TITLE), done: subtask.done }))
      : [];
    renderSubtaskEditor();
    const dialog = $('#edit-dialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    $('#edit-title').focus();
  }

  function closeEditor() {
    const dialog = $('#edit-dialog');
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function renderSubtaskEditor() {
    const list = $('#subtask-list');
    if (!state.editSubtasks.length) {
      list.innerHTML = '<p class="subtask-empty">No steps yet. Break the task down if it helps.</p>';
      return;
    }
    list.innerHTML = state.editSubtasks.map((subtask, index) => `<div class="subtask-row${subtask.done ? ' is-done' : ''}">
      <button class="subtask-check" type="button" data-subtask-toggle="${index}" aria-pressed="${subtask.done}" aria-label="Mark “${escapeHTML(subtask.title)}” ${subtask.done ? 'incomplete' : 'complete'}">${icon('check')}</button>
      <span class="subtask-title">${escapeHTML(subtask.title)}</span>
      <button class="subtask-remove" type="button" data-subtask-remove="${index}" aria-label="Remove step “${escapeHTML(subtask.title)}”">×</button>
    </div>`).join('');
  }

  function addSubtaskFromInput() {
    const input = $('#new-subtask');
    const title = input.value.trim();
    if (!title) return;
    if (state.editSubtasks.length >= logic.MAX_SUBTASKS) {
      showToast(`A task can have at most ${logic.MAX_SUBTASKS} steps.`);
      return;
    }
    state.editSubtasks.push({ id: makeId(), title: title.slice(0, logic.MAX_SUBTASK_TITLE), done: false });
    input.value = '';
    renderSubtaskEditor();
    input.focus();
  }

  function showEditError(message) {
    const error = $('#edit-error');
    error.textContent = message;
    error.hidden = false;
  }

  function saveEdit(event) {
    event.preventDefault();
    const titleInput = $('#edit-title');
    const title = titleInput.value.trim();
    if (!title) {
      showEditError('Please enter a task title.');
      titleInput.setAttribute('aria-invalid', 'true');
      titleInput.focus();
      return;
    }
    let tags = [];
    try {
      tags = logic.normalizeTags($('#edit-tags').value.split(/[,\s]+/));
    } catch (error) {
      showEditError(error.message || 'Tags are malformed.');
      return;
    }
    titleInput.removeAttribute('aria-invalid');
    const task = state.tasks.find((item) => item.id === $('#edit-id').value);
    if (!task) return closeEditor();
    task.title = title;
    const dueDateValue = $('#edit-due-date').value;
    task.dueDate = logic.isDateOnly(dueDateValue) ? dueDateValue : null;
    const dueTimeValue = $('#edit-due-time').value;
    task.dueTime = task.dueDate && logic.isTimeOnly(dueTimeValue) ? dueTimeValue : null;
    const reminderLead = readReminderLead($('#edit-reminder'));
    if (task.dueDate && reminderLead !== null) {
      task.reminderLeadMinutes = reminderLead;
    } else {
      delete task.reminderLeadMinutes;
      delete task.reminderShownFire;
    }
    const repeatRule = readRepeatRule($('#edit-repeat'));
    if (task.dueDate && repeatRule) task.repeat = repeatRule;
    else delete task.repeat;
    task.priority = readPriority($('#edit-priority'));
    const notes = $('#edit-notes').value;
    task.notes = notes.trim() ? notes : undefined;
    task.tags = tags.length ? tags : null;
    if (state.editSubtasks.length) {
      task.subtasks = state.editSubtasks.map((subtask) => ({ id: subtask.id, title: subtask.title, done: subtask.done }));
    } else {
      delete task.subtasks;
    }
    task.updatedAt = new Date().toISOString();
    const saved = persistTasks();
    render();
    closeEditor();
    showSaveResult(saved, 'Task updated.');
  }

  function scheduleNextOccurrence(task) {
    const rule = taskRepeat(task);
    if (!repeat || !rule || !logic.isDateOnly(task.dueDate)) return null;
    const nextDue = repeat.nextDueDate(task.dueDate, rule, logic.localDateString());
    if (!nextDue) return null;
    const now = new Date().toISOString();
    const next = {
      id: makeId(),
      title: task.title,
      dueDate: nextDue,
      dueTime: logic.isTimeOnly(task.dueTime) ? task.dueTime : null,
      priority: task.priority,
      completed: false,
      createdAt: now,
      updatedAt: now
    };
    if (typeof task.notes === 'string' && task.notes.trim()) next.notes = task.notes;
    if (Array.isArray(task.tags) && task.tags.length) next.tags = task.tags.slice();
    if (Array.isArray(task.subtasks) && task.subtasks.length) {
      next.subtasks = task.subtasks.map((subtask) => ({ id: makeId(), title: subtask.title, done: false }));
    }
    if (logic.isReminderLead(task.reminderLeadMinutes) && task.reminderLeadMinutes !== null) {
      next.reminderLeadMinutes = task.reminderLeadMinutes;
    }
    next.repeat = rule;
    state.tasks.push(next);
    return `Task completed — next one is scheduled for ${formatDate(nextDue)}.`;
  }

  function setQuickDueDate(offsetDays) {
    const target = new Date();
    target.setDate(target.getDate() + offsetDays);
    $('#new-due-date').value = logic.localDateString(target);
    syncDueInputs($('#new-due-date'), $('#new-due-time'), $('#new-reminder'), $('#new-repeat'));
  }

  function handleTaskAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const row = button.closest('[data-task-id]');
    const task = state.tasks.find((item) => item.id === row?.dataset.taskId);
    if (!task) return;
    if (button.dataset.action === 'toggle') {
      task.completed = !task.completed;
      task.updatedAt = new Date().toISOString();
      const repeatNote = task.completed ? scheduleNextOccurrence(task) : null;
      const saved = persistTasks();
      render();
      showSaveResult(saved, repeatNote || (task.completed ? 'Task completed.' : 'Task reopened.'));
    } else if (button.dataset.action === 'edit') {
      openEditor(task);
    } else if (button.dataset.action === 'duplicate') {
      const now = new Date().toISOString();
      const copy = Object.assign({}, task, { id: makeId(), completed: false, createdAt: now, updatedAt: now });
      delete copy.reminderShownFire;
      if (Array.isArray(copy.subtasks)) copy.subtasks = copy.subtasks.map((subtask) => ({ id: makeId(), title: subtask.title, done: false }));
      state.tasks.push(copy);
      const saved = persistTasks();
      render();
      showSaveResult(saved, 'Task duplicated as a new open task.');
    } else if (button.dataset.action === 'focus') {
      startFocus(task.id);
      const card = $('#focus-card');
      if (card && typeof card.scrollIntoView === 'function') card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (button.dataset.action === 'tag') {
      state.query = button.dataset.tag;
      $('#task-search').value = button.dataset.tag;
      render();
      $('#task-search').focus();
    } else if (button.dataset.action === 'delete') {
      const deletedIndex = state.tasks.findIndex((item) => item.id === task.id);
      const [deletedTask] = state.tasks.splice(deletedIndex, 1);
      const saved = persistTasks();
      render();
      showToast(saved ? 'Task deleted.' : 'Task deleted for this session. Saving failed.', {
        label: 'Undo',
        run: () => {
          if (state.tasks.some((item) => item.id === deletedTask.id)) {
            showToast('That task is already back on your list.');
            return;
          }
          state.tasks.splice(Math.min(deletedIndex, state.tasks.length), 0, deletedTask);
          const restored = persistTasks();
          render();
          showSaveResult(restored, 'Task restored.');
        }
      });
    }
  }

  function clearCompleted() {
    const removed = state.tasks.filter((task) => task.completed);
    if (!removed.length) return;
    state.tasks = state.tasks.filter((task) => !task.completed);
    const saved = persistTasks();
    render();
    showToast(saved ? `Cleared ${removed.length} completed task${removed.length === 1 ? '' : 's'}.` : 'Cleared for this session. Saving failed.', {
      label: 'Undo',
      run: () => {
        state.tasks = state.tasks.concat(removed);
        const restored = persistTasks();
        render();
        showSaveResult(restored, 'Completed tasks restored.');
      }
    });
  }

  function exportTasks() {
    // Portable local backup: same spirit as the Android app's encrypted backups,
    // scoped to what a static web page can honestly do — a JSON file you keep.
    try {
      if (typeof document.createElement !== 'function') throw new Error('unsupported');
      const payload = JSON.stringify(state.tasks, null, 2);
      const link = document.createElement('a');
      link.href = `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`;
      link.download = `daymark-backup-${logic.localDateString()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast(`Backup downloaded (${state.tasks.length} task${state.tasks.length === 1 ? '' : 's'}).`);
    } catch (error) {
      showToast('Export is not available in this browser.');
    }
  }

  function applyImportedText(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      showToast('That file is not valid JSON. Nothing was changed.');
      return;
    }
    const validated = logic.validateStoredTasks(parsed);
    const existingIds = new Set(state.tasks.map((task) => task.id));
    const incoming = validated.tasks.filter((task) => !existingIds.has(task.id));
    const duplicates = validated.tasks.length - incoming.length;
    if (!incoming.length) {
      showToast(duplicates
        ? 'Every task in that file already exists. Nothing was changed.'
        : 'No valid tasks were found in that file. Nothing was changed.');
      return;
    }
    state.tasks = state.tasks.concat(incoming);
    const saved = persistTasks();
    render();
    const parts = [`${incoming.length} restored`];
    if (duplicates) parts.push(`${duplicates} duplicate${duplicates === 1 ? '' : 's'} kept as your version`);
    if (validated.rejectedCount > 0) parts.push(`${validated.rejectedCount} skipped as invalid`);
    showToast(saved ? `Import finished — ${parts.join(', ')}.` : 'Import finished, but saving to this browser failed.');
  }

  function importTasks(file) {
    if (typeof FileReader === 'undefined') {
      showToast('Import is not available in this browser.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => applyImportedText(String(reader.result || ''));
    reader.onerror = () => showToast('That backup file could not be read.');
    reader.readAsText(file);
  }

  function focusRecoveryPayloads(raw) {
    if (typeof raw !== 'string' || !raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.format === 'daymark-focus-recovery-bundle-v1'
          && Array.isArray(parsed.payloads)) {
        const payloads = parsed.payloads.filter((payload) => typeof payload === 'string' && payload.length > 0);
        return payloads.length > 0 ? payloads : [raw];
      }
    } catch (error) {
      // Legacy backups may be unreadable raw JSON; preserve them byte-for-byte.
    }
    return [raw];
  }

  function backUpRawFocusPayload(raw) {
    try {
      const existing = localStorage.getItem(FOCUS_BACKUP_KEY);
      const payloads = Array.from(new Set([...focusRecoveryPayloads(existing), raw]));
      const backup = payloads.length === 1
        ? payloads[0]
        : JSON.stringify({ format: 'daymark-focus-recovery-bundle-v1', payloads });
      localStorage.setItem(FOCUS_BACKUP_KEY, backup);
      return true;
    } catch (backupError) {
      console.warn('Could not keep a backup of raw Daymark focus state:', backupError);
      return false;
    }
  }

  function hasFocusRecoveryBackup() {
    try {
      return focusRecoveryPayloads(localStorage.getItem(FOCUS_BACKUP_KEY)).length > 0;
    } catch (error) {
      return false;
    }
  }

  function reportFocusRecovery(backupSaved) {
    setStorageStatus(backupSaved
      ? 'Focus data recovery backup retained; export it for manual review'
      : 'Focus data recovery backup could not be created. Free browser storage before saving', true);
    if (backupSaved) {
      offerRecoveryExport('Focus recovery data was preserved on this device. Export it for manual review.');
    }
  }

  function loadFocusState() {
    const empty = { session: null, log: [] };
    if (!focus) return empty;
    let saved = null;
    try {
      saved = localStorage.getItem(FOCUS_KEY);
    } catch (error) {
      console.warn('Could not read Daymark focus storage:', error);
      setStorageStatus('Focus storage unavailable', true);
      return empty;
    }
    if (!saved) {
      if (hasFocusRecoveryBackup()) reportFocusRecovery(true);
      return empty;
    }
    try {
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Saved focus data is not an object.');
      const log = focus.validateFocusLog(parsed.log);
      const invalidSession = parsed.session !== null && parsed.session !== undefined
        && !focus.isValidSession(parsed.session);
      const session = parsed.session ? focus.restoreSession(parsed.session, Date.now()) : null;
      if (log.rejectedCount > 0 || invalidSession) {
        // Keep the complete source whenever validation rejects any focus record.
        // Valid sessions/log entries can still be used, but rejected originals
        // must remain recoverable through future saves and reloads.
        const backupSaved = backUpRawFocusPayload(saved);
        if (!backupSaved) state.focusRecoveryBackupPendingPayload = saved;
        reportFocusRecovery(backupSaved);
      } else if (hasFocusRecoveryBackup()) {
        reportFocusRecovery(true);
      }
      return { session, log: log.entries };
    } catch (error) {
      console.warn('Could not load saved Daymark focus state:', error);
      // Preserve unreadable data and never let a later focus save replace its
      // only remaining copy if browser storage cannot create the backup.
      const backupSaved = backUpRawFocusPayload(saved);
      if (!backupSaved) state.focusRecoveryBackupPendingPayload = saved;
      reportFocusRecovery(backupSaved);
      return empty;
    }
  }

  function persistFocusState() {
    if (!focus) return false;
    if (state.focusRecoveryBackupPendingPayload !== null) {
      const backupSaved = backUpRawFocusPayload(state.focusRecoveryBackupPendingPayload);
      if (!backupSaved) {
        reportFocusRecovery(false);
        return false;
      }
      state.focusRecoveryBackupPendingPayload = null;
    }
    try {
      const payload = {
        session: state.focusSession ? focus.serialize(state.focusSession) : null,
        log: state.focusLog
      };
      localStorage.setItem(FOCUS_KEY, JSON.stringify(payload));
      // Recovery backups are intentionally retained. Clearing one implicitly
      // here would destroy rejected history before a user recovery/export flow
      // exists. Only an explicit recovery action may remove it in the future.
      if (hasFocusRecoveryBackup()) reportFocusRecovery(true);
      return true;
    } catch (error) {
      console.warn('Could not save Daymark focus state:', error);
      setStorageStatus('Focus data could not be saved; keep this page open and retry', true);
      return false;
    }
  }

  function renderFocus() {
    const timeEl = $('#focus-time');
    if (!timeEl) return;
    if (!focus) {
      timeEl.textContent = '—';
      return;
    }
    const now = Date.now();
    const session = state.focusSession;
    const labelEl = $('#focus-state-label');
    const fill = $('#focus-progress-fill');
    const startBtn = $('#focus-start');
    const pauseBtn = $('#focus-pause');
    const stopBtn = $('#focus-stop');
    const taskSelect = $('#focus-task');
    if (taskSelect) {
      const openTasks = state.tasks.filter((task) => !task.completed);
      taskSelect.innerHTML = ['<option value="">No task</option>']
        .concat(openTasks.map((task) => `<option value="${escapeHTML(task.id)}">${escapeHTML(task.title)}</option>`))
        .join('');
      const stillThere = state.focusTaskId && openTasks.some((task) => task.id === state.focusTaskId);
      taskSelect.value = stillThere ? state.focusTaskId : '';
      state.focusTaskId = taskSelect.value;
      taskSelect.disabled = Boolean(session);
    }
    document.querySelectorAll('.focus-preset').forEach((button) => {
      const active = button.dataset.focusPreset === state.focusPreset;
      button.classList.toggle('is-active', active);
      button.disabled = Boolean(session);
    });
    if (!session) {
      const minutes = focus.presetMinutes(state.focusPreset) || focus.PRESET_MINUTES.focus;
      timeEl.textContent = focus.formatClock(minutes * 60 * 1000);
      if (labelEl) labelEl.textContent = 'Ready';
      if (fill && fill.style) fill.style.width = '0%';
      if (startBtn) {
        startBtn.hidden = false;
        startBtn.textContent = 'Start';
      }
      if (pauseBtn) pauseBtn.hidden = true;
      if (stopBtn) stopBtn.hidden = true;
    } else {
      timeEl.textContent = focus.formatClock(focus.remainingMs(session, now));
      if (labelEl) {
        labelEl.textContent = session.state === 'paused'
          ? 'Paused'
          : (session.kind === 'focus' ? 'Focusing' : 'On break');
      }
      if (fill && fill.style) fill.style.width = `${Math.round(focus.progressRatio(session, now) * 100)}%`;
      if (startBtn) startBtn.hidden = true;
      if (pauseBtn) {
        pauseBtn.hidden = false;
        pauseBtn.textContent = session.state === 'paused' ? 'Resume' : 'Pause';
      }
      if (stopBtn) stopBtn.hidden = false;
    }
    const todayEl = $('#focus-today');
    if (todayEl) todayEl.textContent = String(focus.focusMinutesOn(state.focusLog, logic.localDateString()));
  }

  function ensureFocusTimer() {
    if (state.focusTimer != null || typeof setInterval !== 'function') return;
    state.focusTimer = setInterval(tickFocus, 1000);
  }

  function stopFocusTimer() {
    if (state.focusTimer == null) return;
    clearTimeout(state.focusTimer);
    if (typeof clearInterval === 'function') clearInterval(state.focusTimer);
    state.focusTimer = null;
  }

  function tickFocus() {
    if (!focus || !state.focusSession) return;
    const outcome = focus.tick(state.focusSession, Date.now());
    if (outcome.finished) {
      endFocusSession(true);
      return;
    }
    renderFocus();
  }

  function startFocus(taskId) {
    if (!focus) return;
    if (state.focusSession) {
      showToast('Finish or stop the current focus session first.');
      return;
    }
    const kind = focus.isKind(state.focusPreset) ? state.focusPreset : 'focus';
    const minutes = focus.presetMinutes(kind);
    const linkedTaskId = taskId || state.focusTaskId || null;
    state.focusSession = focus.createSession({ taskId: linkedTaskId, kind, durationMinutes: minutes }, Date.now());
    state.focusTaskId = linkedTaskId || '';
    const saved = persistFocusState();
    renderFocus();
    ensureFocusTimer();
    const task = linkedTaskId ? state.tasks.find((item) => item.id === linkedTaskId) : null;
    showToast(saved
      ? (task
        ? `Focus started for “${task.title}” — ${focus.formatClock(minutes * 60 * 1000)} on the clock.`
        : `Focus started — ${focus.formatClock(minutes * 60 * 1000)} on the clock.`)
      : 'Focus started in this tab, but could not be saved. Keep this page open.');
  }

  function toggleFocusPause() {
    if (!focus || !state.focusSession) return;
    const now = Date.now();
    if (state.focusSession.state === 'running') focus.pause(state.focusSession, now);
    else focus.resume(state.focusSession, now);
    const saved = persistFocusState();
    renderFocus();
    if (!saved) showToast('Focus state changed in this tab but could not be saved. Keep this page open.');
  }

  function endFocusSession(completed) {
    if (!focus || !state.focusSession) return;
    const now = Date.now();
    focus.finish(state.focusSession, now, completed);
    const entry = focus.makeLogEntry(state.focusSession);
    if (entry) state.focusLog = focus.appendLogEntry(state.focusLog, entry);
    const task = state.focusSession.taskId ? state.tasks.find((item) => item.id === state.focusSession.taskId) : null;
    state.focusSession = null;
    const saved = persistFocusState();
    stopFocusTimer();
    renderFocus();
    render();
    if (entry) {
      const minutes = Math.max(1, Math.round(entry.elapsedMs / 60000));
      showToast(saved
        ? (completed
          ? (task ? `Focus complete — ${minutes} min logged on “${task.title}”. Nice work.` : `Focus session complete — ${minutes} min logged. Nice work.`)
          : `Focus stopped — ${minutes} min logged as partial.`)
        : 'Focus session ended, but its log could not be saved. Keep this page open.');
    }
  }

  function scheduledFireTime(task) {
    if (task.completed || !logic.isDateOnly(task.dueDate)) return null;
    const lead = task.reminderLeadMinutes;
    if (!logic.isReminderLead(lead) || lead === null) return null;
    const [hour, minute] = logic.isTimeOnly(task.dueTime) ? task.dueTime.split(':').map(Number) : [9, 0];
    const [year, month, day] = task.dueDate.split('-').map(Number);
    const fire = new Date(year, month - 1, day, hour, minute);
    fire.setMinutes(fire.getMinutes() - lead);
    return fire;
  }

  function checkReminders() {
    // Reminders are honest about what a web page can do: they appear as an
    // on-page message while this tab is open, never as OS notifications.
    const now = new Date();
    const grace = 12 * 60 * 60 * 1000;
    const dueTitles = [];
    let changed = false;
    for (const task of state.tasks) {
      const fire = scheduledFireTime(task);
      if (!fire) continue;
      if (now < fire || (now - fire) > grace) continue;
      const stamp = fire.toISOString();
      if (task.reminderShownFire === stamp) continue;
      task.reminderShownFire = stamp;
      task.updatedAt = new Date().toISOString();
      dueTitles.push(task.title);
      changed = true;
    }
    // One toast per check avoids overwriting earlier reminders when several
    // tasks become due together. Show a short list and make the remainder count explicit.
    if (dueTitles.length) {
      const visibleTitles = dueTitles.slice(0, 3).map((title) => `“${title}”`).join(', ');
      const moreCount = dueTitles.length - Math.min(dueTitles.length, 3);
      const message = dueTitles.length === 1
        ? `Reminder: ${visibleTitles} is due.`
        : `Reminders due: ${visibleTitles}${moreCount ? `, and ${moreCount} more` : ''}.`;
      showToast(message, {
        label: 'View list',
        run: () => {
          state.filter = 'all';
          render();
        }
      });
    }
    if (changed) {
      persistTasks();
      render();
    }
  }

  function isTextField(target) {
    return Boolean(target && typeof target === 'object'
      && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
        || target.isContentEditable));
  }

  function handleShortcut(event) {
    if (event.defaultPrevented) return;
    const search = $('#task-search');
    if (event.key === 'Escape' && $('#edit-dialog').open) {
      closeEditor();
      return;
    }
    if (event.key === 'Escape' && event.target === search) {
      if (search.value) clearSearch();
      else search.blur();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTextField(event.target)) return;
    if (event.key === '/') {
      event.preventDefault();
      search.focus();
    } else if (event.key === 'n' && !$('#edit-dialog').open) {
      event.preventDefault();
      $('#new-title').focus();
    }
  }

  function syncDueInputs(dateInput, timeInput, reminderSelect, repeatSelect) {
    const hasDate = logic.isDateOnly(dateInput.value);
    timeInput.disabled = !hasDate;
    if (timeInput.disabled) timeInput.value = '';
    if (reminderSelect) {
      reminderSelect.disabled = !hasDate;
      if (reminderSelect.disabled) reminderSelect.value = '';
    }
    if (repeatSelect) {
      repeatSelect.disabled = !hasDate;
      if (repeatSelect.disabled) repeatSelect.value = '';
    }
  }

  function setUp() {
    state.tasks = loadTasks();
    const focusState = loadFocusState();
    state.focusSession = focusState.session;
    state.focusLog = focusState.log;
    render();
    $('#add-form').addEventListener('submit', addTask);
    $('#new-title').addEventListener('input', () => {
      $('#add-error').hidden = true;
      $('#new-title').removeAttribute('aria-invalid');
    });
    $('#new-due-date').addEventListener('input', (event) => syncDueInputs(event.currentTarget, $('#new-due-time'), $('#new-reminder'), $('#new-repeat')));
    $('#task-search').addEventListener('input', (event) => {
      state.query = event.currentTarget.value;
      render();
    });
    $('#clear-search').addEventListener('click', clearSearch);
    $('#chip-today').addEventListener('click', () => setQuickDueDate(0));
    $('#chip-tomorrow').addEventListener('click', () => setQuickDueDate(1));
    $('#sort-toggle').addEventListener('click', () => {
      state.sort = state.sort === 'smart' ? 'title' : 'smart';
      render();
    });
    $('#empty-clear-search').addEventListener('click', clearSearch);
    $('#clear-completed').addEventListener('click', clearCompleted);
    $('#export-tasks').addEventListener('click', exportTasks);
    $('#import-tasks').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', (event) => {
      const file = event.currentTarget.files && event.currentTarget.files[0];
      event.currentTarget.value = '';
      if (file) importTasks(file);
    });
    document.querySelectorAll('.filter-button').forEach((button) => button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      render();
    }));
    taskList.addEventListener('click', handleTaskAction);
    $('#edit-form').addEventListener('submit', saveEdit);
    $('#edit-title').addEventListener('input', () => {
      $('#edit-error').hidden = true;
      $('#edit-title').removeAttribute('aria-invalid');
    });
    $('#edit-due-date').addEventListener('input', (event) => syncDueInputs(event.currentTarget, $('#edit-due-time'), $('#edit-reminder'), $('#edit-repeat')));
    $('#add-subtask').addEventListener('click', addSubtaskFromInput);
    $('#new-subtask').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addSubtaskFromInput();
      }
    });
    $('#subtask-list').addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-subtask-toggle]');
      if (toggle) {
        const subtask = state.editSubtasks[Number(toggle.dataset.subtaskToggle)];
        if (subtask) {
          subtask.done = !subtask.done;
          renderSubtaskEditor();
        }
        return;
      }
      const remove = event.target.closest('[data-subtask-remove]');
      if (remove) {
        state.editSubtasks.splice(Number(remove.dataset.subtaskRemove), 1);
        renderSubtaskEditor();
      }
    });
    document.querySelector('.close-dialog').addEventListener('click', closeEditor);
    document.querySelector('.cancel-edit').addEventListener('click', closeEditor);
    $('#toast-action').addEventListener('click', runToastAction);
    $('#edit-dialog').addEventListener('click', (event) => {
      if (event.target === $('#edit-dialog')) closeEditor();
    });
    document.addEventListener('keydown', handleShortcut);
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        state.tasks = loadTasks();
        render();
      }
    });
    $('#focus-start').addEventListener('click', () => startFocus(null));
    $('#focus-pause').addEventListener('click', toggleFocusPause);
    $('#focus-stop').addEventListener('click', () => endFocusSession(false));
    $('#focus-task').addEventListener('change', (event) => {
      state.focusTaskId = event.currentTarget.value;
    });
    document.querySelectorAll('.focus-preset').forEach((button) => button.addEventListener('click', () => {
      if (state.focusSession) return;
      state.focusPreset = button.dataset.focusPreset;
      renderFocus();
    }));
    window.addEventListener('focus', () => {
      refreshIfLocalDayChanged();
      tickFocus();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        refreshIfLocalDayChanged();
        tickFocus();
      }
    });
    if (state.focusSession) ensureFocusTimer();
    scheduleNextDayRefresh();
    if (typeof setInterval === 'function') {
      state.reminderTimer = setInterval(checkReminders, 30000);
      checkReminders();
    }
  }

  setUp();
})();

