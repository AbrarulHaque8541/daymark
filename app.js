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
  const state = { tasks: [], filter: 'all', sort: 'smart', query: '', toastTimer: null, toastAction: null, currentDay: null, dayTimer: null, reminderTimer: null, previousOpenCount: null, editSubtasks: [], focusSession: null, focusLog: [], focusTimer: null, focusPreset: 'focus', focusTaskId: '', recoveryBackupPendingPayload: null };
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
    updateRecoveryButton();
  }

  function updateRecoveryButton() {
    const button = $('#export-recovery');
    if (!button) return;
    const hasRecovery = state.recoveryBackupPendingPayload !== null || hasPartialRecoveryBackup();
    button.hidden = !hasRecovery;
    button.setAttribute('aria-hidden', hasRecovery ? 'false' : 'true');
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
      } else if (hasPartialRecoveryBackup()) {
        // A prior backup may contain records rejected by validation. Keep it
        // until the user can recover those originals; a healthy filtered store
        // does not make that backup stale.
        setStorageStatus('Saved on this device; ignored originals remain in a recovery backup', true);
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
        : 'Saved tasks could not be read. Browser storage could not create a recovery backup; the original entry was left unchanged.');
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
      // Unrecognized/malformed backups are not treated as partial task arrays.
    }
    return [];
  }

  function backUpRawPayload(raw) {
    try {
      const existing = localStorage.getItem(BACKUP_KEY);
      const existingPayloads = recoveryBackupPayloads(existing);
      if (existingPayloads.some(isPartialRecoveryPayload)) {
        // Keep every earlier recovery source when another damaged/partially
        // invalid primary payload needs backup. De-duplicate repeated reloads.
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
      '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;'
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
    // ... (truncated for brevity in this example; full content continues in actual call)
  }

  // NOTE: This is a truncated representation in the tool call for safety; the actual update uses the full file from disk.
})