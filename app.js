(() => {
  'use strict';

  const STORAGE_KEY = 'daymark.tasks.v1';
  const BACKUP_KEY = 'daymark.tasks.v1.backup';
  const PRIORITIES = ['low', 'medium', 'high'];
  const logic = window.DaymarkLogic;
  const repeat = window.DaymarkRepeat || null;
  const state = { tasks: [], filter: 'all', sort: 'smart', query: '', toastTimer: null, toastAction: null, currentDay: null, dayTimer: null, reminderTimer: null, previousOpenCount: null, editSubtasks: [] };
  const $ = (selector) => document.querySelector(selector);
  const taskList = $('#task-list');
  const suggestionList = $('#suggestion-list');

  function setStorageStatus(message, unavailable = false) {
    const status = $('#storage-status');
    if (!status) return;
    const label = status.querySelector('span');
    if (label) label.textContent = message;
    status.classList.toggle('is-warning', unavailable);
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
        // Some records failed validation and are about to be dropped. Keep the
        // original payload in a recovery backup so nothing is silently lost,
        // mirroring the protection used for a completely unreadable payload.
        setStorageStatus(backUpRawPayload(saved)
          ? 'Some saved tasks were ignored; the originals were kept in a backup'
          : 'Some saved tasks were ignored', true);
      } else {
        setStorageStatus('Saved on this device');
        // The main store is healthy again, so a recovery backup left over from an
        // earlier unreadable payload is now stale and should not linger as if it
        // were current data.
        clearRecoveryBackup();
      }
      return validated.tasks;
    } catch (error) {
      console.warn('Could not load saved Daymark tasks:', error);
      setStorageStatus('Saved data could not be read', true);
      // Preserve the unreadable payload instead of silently discarding it, so a
      // future fix or manual recovery can still reach the original data.
      const backupSaved = backUpRawPayload(saved);
      showToast(backupSaved
        ? 'Saved tasks could not be read. The original data was kept in a browser backup.'
        : 'Saved tasks could not be read. Browser storage could not create a recovery backup; the original entry was left unchanged.');
      return [];
    }
  }

  function backUpRawPayload(raw) {
    try {
      localStorage.setItem(BACKUP_KEY, raw);
      return true;
    } catch (backupError) {
      console.warn('Could not keep a backup of raw Daymark tasks:', backupError);
      return false;
    }
  }

  function persistTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
      setStorageStatus('Saved on this device');
      // A successful full save makes any earlier recovery backup stale.
      clearRecoveryBackup();
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
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'
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
  }

  function dismissToast() {
    clearTimeout(state.toastTimer);
    state.toastTimer = null;
    state.toastAction = null;
    $('#toast-stack').classList.remove('is-visible');
    $('#toast-action').hidden = true;
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
    state.toastTimer = setTimeout(dismissToast, action ? 7000 : 2600);
  }

  function runToastAction() {
    const action = state.toastAction;
    if (!action) return;
    dismissToast();
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
    window.addEventListener('focus', refreshIfLocalDayChanged);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshIfLocalDayChanged();
    });
    scheduleNextDayRefresh();
    if (typeof setInterval === 'function') {
      state.reminderTimer = setInterval(checkReminders, 30000);
      checkReminders();
    }
  }

  setUp();
})();
