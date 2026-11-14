(() => {
  'use strict';

  const STORAGE_KEY = 'daymark.tasks.v1';
  const BACKUP_KEY = 'daymark.tasks.v1.backup';
  const FOCUS_KEY = 'daymark.focus.v1';
  const FOCUS_BACKUP_KEY = 'daymark.focus.v1.backup';
  const FOCUS_PRESET_KEY = 'daymark.focus.preset.v1';
  const TASK_VIEW_KEY = 'daymark.task-view.v1';
  const FEED_KEY = 'daymark.feed.v1';
  const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
  const PRIORITIES = ['low', 'medium', 'high'];
  const logic = window.DaymarkLogic;
  const repeat = window.DaymarkRepeat || null;
  const focus = window.DaymarkFocus || null;
  const feed = window.DaymarkFeed || null;
  const state = { tasks: [], filter: 'all', sort: 'smart', query: '', toastTimer: null, toastAction: null, currentDay: null, dayTimer: null, reminderTimer: null, previousOpenCount: null, editSubtasks: [], focusSession: null, focusLog: [], focusTimer: null, focusPreset: 'focus', focusTaskId: '', focusStateClearEpoch: null, recoveryBackupPendingPayload: null, recoveryBackupClearPending: false, focusRecoveryBackupPendingPayload: null, focusRecoveryCompletionPending: null, focusRecoveryClearEpoch: null, recoveryExportInProgress: false, recoveryExportUrl: null, recoveryExportHref: null, recoveryExportTimer: null, feedCache: null, feedLoading: false, feedNotice: '' };
  const taskMutation = window.DaymarkTaskMutation || null;
  let taskLockManager = null;
  try { taskLockManager = (window.navigator || globalThis.navigator || {}).locks || null; }
  catch (error) { taskLockManager = null; }
  let taskGeneration = 0;
  let taskEpoch = 0;
  let clearEpoch = 0;
  let taskBaseSnapshot = [];
  let taskQueuedSnapshot = [];
  let taskWriteQueue = Promise.resolve();
  let pendingTaskWrites = 0;
  let taskWritesBlocked = false;
  let taskRecoveryMaintenance = Promise.resolve();
  let focusRecoveryMaintenance = Promise.resolve();
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
      // Primary key is unreadable. Do not treat it as absent or overwrite it.
      // Independently inspect the recovery backup key.
      let backupRaw = null;
      let backupReadable = false;
      try {
        backupRaw = localStorage.getItem(BACKUP_KEY);
        backupReadable = true;
      } catch (backupError) {
        console.warn('Could not read Daymark recovery backup:', backupError);
      }
      if (backupReadable && typeof backupRaw === 'string' && backupRaw.length > 0) {
        setStorageStatus('Primary task data unreadable; recovery backup available', true);
        showToast('Saved tasks could not be read, but a recovery backup is available for export.');
        offerRecoveryExport('Primary task data is unreadable. A recovery backup is available for export.');
      } else if (!backupReadable) {
        setStorageStatus('Primary and recovery data unreadable; recovery status unknown', true);
        showToast('Browser storage is unavailable. Recovery status is unknown.');
      } else {
        setStorageStatus('Primary task data unreadable; no recovery backup found', true);
        showToast('Saved tasks could not be read. No recovery backup was found.');
      }
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
        state.recoveryBackupPendingPayload = saved;
        setStorageStatus('Some saved tasks were ignored; originals are being preserved in a recovery backup', true);
        offerRecoveryExport('Some saved tasks were ignored; originals are being preserved in a browser backup.');
      } else if (hasPartialRecoveryBackup()) {
        // Keep task records rejected by validation until the user can recover them.
        setStorageStatus('Saved on this device; ignored originals remain in a recovery backup', true);
        offerRecoveryExport('Saved on this device; ignored originals remain in a recovery backup');
      } else if (hasRecoveryBackupNeedingPreservation()) {
        // Opaque originals are retained only once grouped into an explicit recovery bundle.
        setStorageStatus('Saved on this device; recovery backup retained for manual review', true);
        offerRecoveryExport('Saved on this device; original recovery data remains in a backup');
      } else {
        const backupRaw = readRecoveryBackupRaw();
        if (isRedundantRecoveryBackup(saved, backupRaw)) {
          setStorageStatus('Saved on this device');
          // The backup is byte-identical to a fully valid primary: nothing can be recovered
          // from it that the primary does not already hold.
          state.recoveryBackupClearPending = true;
        } else if (backupRaw !== null) {
          // A healthy primary does not prove a *different* backup is redundant.
          setStorageStatus('Saved on this device; recovery backup retained', true);
          offerRecoveryExport('A recovery backup is retained until it can be proven redundant.');
        } else {
          setStorageStatus('Saved on this device');
        }
      }
      return validated.tasks;
    } catch (error) {
      console.warn('Could not load saved Daymark tasks:', error);
      setStorageStatus('Saved data could not be read', true);
      // Preserve the unreadable payload instead of silently discarding it, so a
      // future fix or manual recovery can still reach the original data.
      state.recoveryBackupPendingPayload = saved;
      setStorageStatus('Saved data could not be read; original data is being preserved in a recovery backup', true);
      showToast('Saved tasks could not be read. The original data is being preserved in a browser backup.');
      offerRecoveryExport('Saved tasks could not be read. The original data is being preserved in a browser backup.');
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

  function hasRecoveryBackupNeedingPreservation() {
    let raw;
    try {
      raw = localStorage.getItem(BACKUP_KEY);
    } catch (error) {
      return true;
    }
    if (typeof raw !== 'string' || raw.length === 0) return false;
    if (recoveryBackupPayloads(raw).some(isPartialRecoveryPayload)) return true;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      // Raw malformed backup is stale once the primary store is healthy.
      // Opaque sources are retained only after being grouped in a recovery bundle.
      return false;
    }
    if (!parsed || parsed.format !== 'daymark-recovery-bundle-v1' || !Array.isArray(parsed.payloads)) return false;
    return parsed.payloads.some((payload) => typeof payload !== 'string'
      || (!isPartialRecoveryPayload(payload) && !isHealthyTaskPayload(payload)));
  }

  /** Reads the recovery backup without letting a storage failure look like "absent". */
  function readRecoveryBackupRaw() {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      return typeof raw === 'string' ? raw : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * A recovery backup may be dropped only when it is provably redundant: byte-identical to
   * the primary payload and fully valid as a task array on both sides.
   *
   * Owner policy (2026-11-14): a healthy primary is not proof that a backup is redundant.
   * A backup with different rows, extra history, partial records or opaque bytes may be the
   * only surviving copy, so it is retained until the user removes it.
   */
  function isRedundantRecoveryBackup(primaryRaw, backupRaw) {
    if (typeof primaryRaw !== 'string' || typeof backupRaw !== 'string') return false;
    if (primaryRaw.length === 0 || backupRaw.length === 0) return false;
    if (primaryRaw !== backupRaw) return false;
    return isHealthyTaskPayload(primaryRaw) && isHealthyTaskPayload(backupRaw);
  }

  function clearRecoveryBackup() {
    try {
      localStorage.removeItem(BACKUP_KEY);
    } catch (error) {
      console.warn('Could not clear the Daymark recovery backup:', error);
    }
  }

  function copyTaskList(tasks) {
    try { return JSON.parse(JSON.stringify(Array.isArray(tasks) ? tasks : [])); }
    catch (error) { return []; }
  }

  function readTaskGeneration() {
    if (!taskMutation || typeof taskMutation.readGeneration !== 'function') return { ok: false, reason: 'coordinator-unavailable' };
    try { return taskMutation.readGeneration(localStorage); }
    catch (error) { return { ok: false, reason: 'storage-unavailable' }; }
  }

  function initializeTaskMutationState() {
    const generation = readTaskGeneration();
    if (!generation.ok) {
      setStorageStatus('Task changes are blocked because browser storage coordination is unavailable', true);
      return false;
    }
    taskGeneration = generation.value.generation;
    taskEpoch = generation.value.taskEpoch;
    clearEpoch = generation.value.clearEpoch;
    state.focusStateClearEpoch = clearEpoch;
    taskBaseSnapshot = copyTaskList(state.tasks);
    taskQueuedSnapshot = copyTaskList(state.tasks);
    return true;
  }

  function scheduleTaskRecoveryMaintenance() {
    if (!taskMutation || !taskLockManager || !state.recoveryBackupPendingPayload && !state.recoveryBackupClearPending) {
      return Promise.resolve({ ok: true, skipped: true });
    }
    const expectedGeneration = taskGeneration;
    const expectedTaskEpoch = taskEpoch;
    const expectedClearEpoch = clearEpoch;
    const preservingOriginal = state.recoveryBackupPendingPayload !== null;
    taskRecoveryMaintenance = taskMutation.withClearEpochLock(
      taskLockManager,
      [taskMutation.TASK_LOCK_NAME],
      localStorage,
      expectedClearEpoch,
      () => {
      const current = readTaskGeneration();
      if (!current.ok || current.value.generation !== expectedGeneration
          || current.value.taskEpoch !== expectedTaskEpoch || current.value.clearEpoch !== expectedClearEpoch) {
        return { ok: false, reason: 'generation-changed' };
      }
      let raw;
      try { raw = localStorage.getItem(STORAGE_KEY); }
      catch (error) { return { ok: false, reason: 'tasks-unreadable' }; }
      if (state.recoveryBackupPendingPayload !== null) {
        if (raw === state.recoveryBackupPendingPayload) {
          if (!backUpRawPayload(raw)) return { ok: false, reason: 'backup-failed' };
          state.recoveryBackupPendingPayload = null;
        }
      } else if (state.recoveryBackupClearPending
          && isRedundantRecoveryBackup(raw, readRecoveryBackupRaw())
          && !hasPartialRecoveryBackup() && !hasRecoveryBackupNeedingPreservation()) {
        clearRecoveryBackup();
      }
      state.recoveryBackupClearPending = false;
      return { ok: true };
    }
    ).then((result) => {
      if (!result.ok || !result.value || !result.value.ok) {
        if (state.recoveryBackupPendingPayload !== null) {
          setStorageStatus('Recovery backup could not be created; the original task data remains unchanged.', true);
          showToast('Recovery backup could not be created; the original task data remains unchanged.');
        }
        return { ok: false, reason: result.reason || (result.value && result.value.reason) || 'maintenance-failed' };
      }
      if (state.recoveryBackupPendingPayload === null && !state.recoveryBackupClearPending) {
        if (hasPartialRecoveryBackup()) setStorageStatus('Some saved tasks were ignored; the originals were kept in a recovery backup', true);
        else if (hasRecoveryBackupNeedingPreservation()) setStorageStatus('Saved on this device; recovery backup retained for manual review', true);
        if (preservingOriginal) offerRecoveryExport('The original task data was kept in a browser recovery backup.');
      }
      return { ok: true };
    });
    return taskRecoveryMaintenance;
  }

  function persistTasks(options) {
    const opts = options || {};
    const baseTasks = copyTaskList(taskQueuedSnapshot);
    const desiredTasks = copyTaskList(state.tasks);
    const baseGeneration = taskGeneration + pendingTaskWrites;
    const generationAtStart = readTaskGeneration();
    const taskEpochAtStart = generationAtStart.ok ? generationAtStart.value.taskEpoch : taskEpoch;
    const clearEpochAtStart = generationAtStart.ok ? generationAtStart.value.clearEpoch : clearEpoch;
    taskQueuedSnapshot = copyTaskList(desiredTasks);
    pendingTaskWrites += 1;
    let preserveRecoveryDraft = false;

    const queued = taskWriteQueue.then(async () => {
      if (taskWritesBlocked) return { ok: false, reason: 'previous-write-failed', currentTasks: copyTaskList(taskBaseSnapshot) };
      if (!taskMutation || typeof taskMutation.commitTaskSnapshot !== 'function' || !taskLockManager) {
        setStorageStatus('Task changes were not saved because the cross-tab storage lock is unavailable', true);
        return { ok: false, reason: 'lock-unavailable', currentTasks: copyTaskList(taskBaseSnapshot) };
      }
      const result = await taskMutation.commitTaskSnapshot({
        storage: localStorage,
        lockManager: taskLockManager,
        baseTasks,
        desiredTasks,
        expectedGeneration: baseGeneration,
        expectedTaskEpoch: taskEpochAtStart,
        validateTasks: logic.validateStoredTasks,
        backupRaw: (raw) => {
          const generation = readTaskGeneration();
          if (!generation.ok || generation.value.clearPending
              || generation.value.clearEpoch !== clearEpochAtStart
              || generation.value.taskEpoch !== taskEpochAtStart) return false;
          try {
            const existing = localStorage.getItem(BACKUP_KEY);
            if (recoveryBackupPayloads(existing).includes(raw)) return true;
          } catch (error) {
            // Retry through the normal backup path, which reports storage failures.
          }
          return backUpRawPayload(raw);
        },
        beforeCommit: ({ currentRaw }) => {
          const generation = readTaskGeneration();
          if (!generation.ok || generation.value.clearPending
              || generation.value.taskEpoch !== taskEpochAtStart) return false;
          if (state.recoveryBackupPendingPayload !== null) {
            if (generation.value.clearEpoch !== clearEpochAtStart) return false;
            if (state.recoveryBackupPendingPayload === currentRaw) {
              // The coordinator has already backed up an invalid current payload.
              state.recoveryBackupPendingPayload = null;
            } else {
              if (!backUpRawPayload(state.recoveryBackupPendingPayload)) return false;
              state.recoveryBackupPendingPayload = null;
            }
          }
          return true;
        },
        afterCommit: async (canonicalTasks) => {
          let recoveryStatus = '';
          if (hasPartialRecoveryBackup()) {
            recoveryStatus = 'Saved on this device; ignored originals remain in a recovery backup';
          } else if (hasRecoveryBackupNeedingPreservation()) {
            recoveryStatus = 'Saved on this device; recovery backup retained for manual review';
          } else {
            clearRecoveryBackup();
          }
          state.recoveryBackupClearPending = false;
          const afterCommitResult = typeof opts.afterCommit === 'function'
            ? await opts.afterCommit(copyTaskList(canonicalTasks))
            : null;
          return { recoveryStatus, afterCommitResult };
        }
      });
      if (result.ok) {
        taskBaseSnapshot = copyTaskList(result.tasks);
        taskGeneration = result.generation;
        taskEpoch = result.taskEpoch;
        clearEpoch = result.clearEpoch;
        const recoveryStatus = result.afterCommitResult && result.afterCommitResult.recoveryStatus;
        setStorageStatus(recoveryStatus || (result.generationMismatch
          ? 'Changes from another tab were reconciled and saved on this device'
          : 'Saved on this device'), Boolean(recoveryStatus));
        result.appAfterCommitResult = result.afterCommitResult && result.afterCommitResult.afterCommitResult;
      } else {
        taskWritesBlocked = true;
        preserveRecoveryDraft = state.recoveryBackupPendingPayload !== null
          && (result.reason === 'backup-failed' || result.reason === 'pre-commit-failed');
        if (Array.isArray(result.currentTasks)) taskBaseSnapshot = copyTaskList(result.currentTasks);
        if (Number.isSafeInteger(result.generation)) taskGeneration = result.generation;
        if (Number.isSafeInteger(result.taskEpoch)) taskEpoch = result.taskEpoch;
        if (Number.isSafeInteger(result.clearEpoch)) clearEpoch = result.clearEpoch;
        if (result.reason === 'cleared') {
          setStorageStatus('Local data was cleared in another tab; this task change was not saved', true);
        } else if (result.reason === 'conflict') {
          setStorageStatus('This task changed in another tab; reload the list and retry', true);
        } else {
          setStorageStatus('Task changes could not be saved safely; reload the list and retry', true);
        }
      }
      return result;
    });
    taskWriteQueue = queued.catch(() => ({ ok: false, reason: 'write-failed' }));
    return queued.finally(() => {
      pendingTaskWrites = Math.max(0, pendingTaskWrites - 1);
      if (pendingTaskWrites === 0) {
        const committed = taskBaseSnapshot;
        if (preserveRecoveryDraft) {
          state.tasks = copyTaskList(desiredTasks);
          taskQueuedSnapshot = copyTaskList(baseTasks);
        } else {
          state.tasks = copyTaskList(committed);
          taskQueuedSnapshot = copyTaskList(committed);
        }
        taskWritesBlocked = false;
        render();
        renderFocus();
      }
    });
  }

  function showSaveResult(saved, successMessage) {
    const ok = typeof saved === 'boolean' ? saved : Boolean(saved && saved.ok);
    if (ok) showToast(successMessage);
    else if (saved && saved.reason === 'cleared') showToast('Local data was cleared in another tab. This task change was not saved.');
    else if (saved && saved.reason === 'conflict') showToast('This task changed in another tab. Reload the list and retry.');
    else showToast('Could not save to this browser. Changes may be lost when you leave.');
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
    const resetViewBtn = $('#reset-view');
    if (resetViewBtn) {
      const isDefault = state.filter === 'all' && state.sort === 'smart' && !state.query;
      resetViewBtn.hidden = isDefault;
      resetViewBtn.disabled = isDefault;
      resetViewBtn.setAttribute('aria-disabled', String(isDefault));
    }

    // Searching re-renders the entire list; a polite live region would re-announce all
    // of it on every keystroke, which makes search unusable with a screen reader.
    // While a query is active the list itself goes quiet and the concise result count
    // in the dedicated status element becomes the only search announcement.
    taskList.setAttribute('aria-live', hasQuery ? 'off' : 'polite');
    const searchResultStatus = $('#search-result-status');
    if (searchResultStatus) {
      searchResultStatus.textContent = hasQuery
        ? `${filteredTasks.length} matching ${filteredTasks.length === 1 ? 'task' : 'tasks'}`
        : '';
    }

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
    renderFeed();
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
        releasePreparedRecoveryExport();
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
    persistTaskViewPrefs();
    render();
    $('#task-search').focus();
  }

  async function addTask(event) {
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
    const save = persistTasks();
    form.reset();
    $('#new-priority').value = 'medium';
    $('#new-due-time').disabled = true;
    $('#new-reminder').disabled = true;
    $('#new-reminder').value = '';
    $('#new-repeat').disabled = true;
    $('#new-repeat').value = '';
    syncDueInputs($('#new-due-date'), $('#new-due-time'), $('#new-reminder'), $('#new-repeat'), $('#new-date-only-reminder-hint'));
    state.filter = 'all';
    state.query = '';
    $('#task-search').value = '';
    persistTaskViewPrefs();
    render();
    titleInput.focus();
    const saved = await save;
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
    syncDueInputs($('#edit-due-date'), $('#edit-due-time'), reminderSelect, repeatSelect, $('#edit-date-only-reminder-hint'));
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

  async function saveEdit(event) {
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
    const originalDueDate = task.dueDate;
    const originalRepeatRule = taskRepeat(task);
    const originalRepeatDay = task.repeatDayOfMonth;
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
    if (task.dueDate && repeatRule) {
      task.repeat = repeatRule;
      if (repeatRule === 'monthly' || repeatRule === 'yearly') {
        const sameSeries = originalDueDate === task.dueDate && originalRepeatRule === repeatRule;
        task.repeatDayOfMonth = sameSeries && Number.isInteger(originalRepeatDay)
          ? originalRepeatDay
          : Number(task.dueDate.slice(8));
      } else {
        delete task.repeatDayOfMonth;
      }
    } else {
      delete task.repeat;
      delete task.repeatDayOfMonth;
    }
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
    const save = persistTasks();
    render();
    closeEditor();
    const saved = await save;
    showSaveResult(saved, 'Task updated.');
  }

  function scheduleNextOccurrence(task) {
    const rule = taskRepeat(task);
    if (!repeat || !rule || !logic.isDateOnly(task.dueDate)) return null;
    const usesDayAnchor = rule === 'monthly' || rule === 'yearly';
    const repeatDayOfMonth = usesDayAnchor
      ? (Number.isInteger(task.repeatDayOfMonth) ? task.repeatDayOfMonth : Number(task.dueDate.slice(8)))
      : undefined;
    const nextDue = repeat.nextDueDate(task.dueDate, rule, logic.localDateString(), repeatDayOfMonth);
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
    if (usesDayAnchor) next.repeatDayOfMonth = repeatDayOfMonth;
    state.tasks.push(next);
    return `Task completed — next one is scheduled for ${formatDate(nextDue)}.`;
  }

  function setQuickDueDate(offsetDays) {
    const target = new Date();
    target.setDate(target.getDate() + offsetDays);
    $('#new-due-date').value = logic.localDateString(target);
    syncDueInputs($('#new-due-date'), $('#new-due-time'), $('#new-reminder'), $('#new-repeat'), $('#new-date-only-reminder-hint'));
  }

  async function notifyWebhookTaskCompleted(task, options) {
    const webhookUi = window.DaymarkWebhookUi;
    if (!webhookUi || typeof webhookUi.notifyTaskCompleted !== 'function') return;
    try {
      return await webhookUi.notifyTaskCompleted(task, options);
    } catch (error) {
      console.warn('Could not queue the Daymark task-completed webhook:', error);
      return { queued: false, reason: 'error' };
    }
  }

  async function handleTaskAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const row = button.closest('[data-task-id]');
    const task = state.tasks.find((item) => item.id === row?.dataset.taskId);
    if (!task) return;
    if (button.dataset.action === 'toggle') {
      task.completed = !task.completed;
      task.updatedAt = new Date().toISOString();
      const repeatNote = task.completed ? scheduleNextOccurrence(task) : null;
      const saved = await persistTasks({
        afterCommit: (canonicalTasks) => {
          if (!task.completed) return null;
          const canonicalTask = canonicalTasks.find((item) => item.id === task.id);
          return canonicalTask ? notifyWebhookTaskCompleted(canonicalTask, { deferDelivery: true }) : null;
        }
      });
      render();
      if (saved.ok && task.completed && saved.appAfterCommitResult && !saved.appAfterCommitResult.queued) {
        showToast('Task completed, but its webhook event could not be added to the queue. Check webhook status and retry.');
      } else {
        showSaveResult(saved, repeatNote || (task.completed ? 'Task completed.' : 'Task reopened.'));
      }
    } else if (button.dataset.action === 'edit') {
      openEditor(task);
    } else if (button.dataset.action === 'duplicate') {
      const now = new Date().toISOString();
      const copy = Object.assign({}, task, { id: makeId(), completed: false, createdAt: now, updatedAt: now });
      delete copy.reminderShownFire;
      if (Array.isArray(copy.subtasks)) copy.subtasks = copy.subtasks.map((subtask) => ({ id: makeId(), title: subtask.title, done: false }));
      state.tasks.push(copy);
      const saved = await persistTasks();
      render();
      showSaveResult(saved, 'Task duplicated as a new open task.');
    } else if (button.dataset.action === 'focus') {
      startFocus(task.id);
      const card = $('#focus-card');
      if (card && typeof card.scrollIntoView === 'function') {
        card.scrollIntoView({ behavior: window.DaymarkMotionPolicy.focusScrollBehavior(), block: 'center' });
      }
    } else if (button.dataset.action === 'tag') {
      state.query = button.dataset.tag;
      $('#task-search').value = button.dataset.tag;
      render();
      $('#task-search').focus();
    } else if (button.dataset.action === 'delete') {
      const deletedIndex = state.tasks.findIndex((item) => item.id === task.id);
      const [deletedTask] = state.tasks.splice(deletedIndex, 1);
      const saved = await persistTasks();
      render();
      if (!saved.ok) {
        showSaveResult(saved, 'Task deleted.');
        return;
      }
      showToast('Task deleted.', {
        label: 'Undo',
        run: async () => {
          if (state.tasks.some((item) => item.id === deletedTask.id)) {
            showToast('That task is already back on your list.');
            return;
          }
          state.tasks.splice(Math.min(deletedIndex, state.tasks.length), 0, deletedTask);
          const restored = await persistTasks();
          render();
          showSaveResult(restored, 'Task restored.');
        }
      });
    }
  }

  async function clearCompleted() {
    const removed = state.tasks.filter((task) => task.completed);
    if (!removed.length) return;
    state.tasks = state.tasks.filter((task) => !task.completed);
    const saved = await persistTasks();
    render();
    if (!saved.ok) {
      showSaveResult(saved, 'Completed tasks cleared.');
      return;
    }
    showToast(`Cleared ${removed.length} completed task${removed.length === 1 ? '' : 's'}.`, {
      label: 'Undo',
      run: async () => {
        state.tasks = state.tasks.concat(removed);
        const restored = await persistTasks();
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

  function readTaskRecoveryPayloads(raw) {
    const result = { arrays: [], malformedCount: 0 };
    if (typeof raw !== 'string' || raw.length === 0) return result;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      result.malformedCount = 1;
      return result;
    }
    if (Array.isArray(parsed)) {
      result.arrays.push(parsed);
      return result;
    }
    if (parsed && parsed.format === 'daymark-recovery-bundle-v1' && Array.isArray(parsed.payloads)) {
      parsed.payloads.forEach((payload) => {
        if (typeof payload !== 'string') {
          result.malformedCount += 1;
          return;
        }
        try {
          const records = JSON.parse(payload);
          if (Array.isArray(records)) result.arrays.push(records);
          else result.malformedCount += 1;
        } catch (error) {
          result.malformedCount += 1;
        }
      });
      return result;
    }
    result.malformedCount = 1;
    return result;
  }

  function readFocusRecoveryStates(raw) {
    const result = { states: [], malformedCount: 0 };
    if (typeof raw !== 'string' || raw.length === 0) return result;
    if (!focus) {
      result.malformedCount = 1;
      return result;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      result.malformedCount = 1;
      return result;
    }
    if (parsed && parsed.format === 'daymark-focus-recovery-bundle-v1' && Array.isArray(parsed.payloads)) {
      parsed.payloads.forEach((payload) => {
        if (typeof payload !== 'string') {
          result.malformedCount += 1;
          return;
        }
        try {
          const recovered = JSON.parse(payload);
          if (recovered && typeof recovered === 'object' && !Array.isArray(recovered)) result.states.push(recovered);
          else result.malformedCount += 1;
        } catch (error) {
          result.malformedCount += 1;
        }
      });
      return result;
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      result.states.push(parsed);
      return result;
    }
    result.malformedCount = 1;
    return result;
  }

  async function applyImportedRecovery(recovery, rawText) {
    const focusEpochAtImport = taskMutation && taskMutation.captureClearEpoch(localStorage);
    let taskRaw = null;
    let focusRaw = null;
    if (recovery.format === 'daymark-combined-recovery-v1') {
      taskRaw = typeof recovery.taskBackup === 'string' ? recovery.taskBackup : null;
      focusRaw = typeof recovery.focusBackup === 'string' ? recovery.focusBackup : null;
    } else if (recovery.format === 'daymark-recovery-bundle-v1') {
      taskRaw = rawText;
    } else if (recovery.format === 'daymark-focus-recovery-bundle-v1'
        || Object.prototype.hasOwnProperty.call(recovery, 'session')
        || Object.prototype.hasOwnProperty.call(recovery, 'log')) {
      focusRaw = rawText;
    }

    const taskPayloads = readTaskRecoveryPayloads(taskRaw);
    const existingTaskIds = new Set(state.tasks.map((task) => task.id));
    const incomingTasks = [];
    let duplicateTasks = 0;
    let invalidTasks = 0;
    taskPayloads.arrays.forEach((records) => {
      const validated = logic.validateStoredTasks(records);
      invalidTasks += validated.rejectedCount;
      validated.tasks.forEach((task) => {
        if (existingTaskIds.has(task.id)) {
          duplicateTasks += 1;
          return;
        }
        existingTaskIds.add(task.id);
        incomingTasks.push(task);
      });
    });

    const focusPayloads = readFocusRecoveryStates(focusRaw);
    const existingFocusIds = new Set(state.focusLog.map((entry) => entry.id));
    const incomingFocusLog = [];
    let duplicateFocusEntries = 0;
    let invalidFocusRecords = 0;
    let skippedFocusSessions = 0;
    let incomingSession = null;
    focusPayloads.states.forEach((recovered) => {
      const validatedLog = focus.validateFocusLog(recovered.log);
      invalidFocusRecords += validatedLog.rejectedCount;
      validatedLog.entries.forEach((entry) => {
        if (existingFocusIds.has(entry.id)) {
          duplicateFocusEntries += 1;
          return;
        }
        existingFocusIds.add(entry.id);
        incomingFocusLog.push(entry);
      });
      const rawSession = recovered.session;
      if (rawSession === null || rawSession === undefined) return;
      if (!focus.isValidSession(rawSession)) {
        invalidFocusRecords += 1;
        return;
      }
      if (rawSession.state === 'done') {
        const completedEntry = focus.makeLogEntry(rawSession);
        if (completedEntry && !existingFocusIds.has(completedEntry.id)) {
          existingFocusIds.add(completedEntry.id);
          incomingFocusLog.push(completedEntry);
        } else if (completedEntry) {
          duplicateFocusEntries += 1;
        }
        return;
      }
      if (state.focusSession || incomingSession || existingFocusIds.has(rawSession.id)) {
        skippedFocusSessions += 1;
        return;
      }
      incomingSession = focus.restoreSession(rawSession, Date.now());
      if (!incomingSession) skippedFocusSessions += 1;
    });

    const malformedRecovery = taskPayloads.malformedCount + focusPayloads.malformedCount;
    if (!incomingTasks.length && !incomingFocusLog.length && !incomingSession) {
      showToast(malformedRecovery
        ? 'No valid recovery data could be restored. Existing data was kept.'
        : 'All recovery records already exist or no new data was found. Nothing was changed.');
      return;
    }

    const preview = [
      `Recovery preview: ${incomingTasks.length} new task${incomingTasks.length === 1 ? '' : 's'} will be added.`,
      duplicateTasks ? `${duplicateTasks} duplicate task ID${duplicateTasks === 1 ? '' : 's'} will be skipped; existing tasks stay unchanged.` : '',
      invalidTasks ? `${invalidTasks} invalid task record${invalidTasks === 1 ? '' : 's'} will be skipped.` : '',
      `Focus: ${incomingFocusLog.length} new log entr${incomingFocusLog.length === 1 ? 'y' : 'ies'} will be added.`,
      incomingSession ? 'One Focus session will be restored.' : '',
      skippedFocusSessions ? `${skippedFocusSessions} Focus session${skippedFocusSessions === 1 ? '' : 's'} will be skipped to preserve your current session or because it has expired.` : '',
      duplicateFocusEntries ? `${duplicateFocusEntries} duplicate Focus log entr${duplicateFocusEntries === 1 ? 'y' : 'ies'} will be skipped.` : '',
      invalidFocusRecords ? `${invalidFocusRecords} invalid Focus record${invalidFocusRecords === 1 ? '' : 's'} will be skipped.` : '',
      malformedRecovery ? `${malformedRecovery} unreadable recovery payload${malformedRecovery === 1 ? '' : 's'} will be ignored.` : '',
      'Existing tasks, Focus history, and a current Focus session will not be replaced. Continue?'
    ].filter(Boolean).join('\n');

    if (typeof window.confirm !== 'function') {
      showToast('Recovery confirmation is unavailable. Nothing was changed.');
      return;
    }
    let confirmed = false;
    try {
      confirmed = window.confirm(preview);
    } catch (error) {
      showToast('Recovery confirmation could not be displayed. Nothing was changed.');
      return;
    }
    if (!confirmed) {
      showToast('Recovery import cancelled. Nothing was changed.');
      return;
    }

    let tasksSaved = null;
    if (incomingTasks.length) {
      const previousTasks = state.tasks;
      state.tasks = previousTasks.concat(incomingTasks);
      tasksSaved = await persistTasks();
    }
    let focusSaved = null;
    if (incomingFocusLog.length || incomingSession) {
      const previousSession = state.focusSession;
      const previousLog = state.focusLog;
      if (incomingSession) state.focusSession = incomingSession;
      state.focusLog = previousLog.concat(incomingFocusLog);
      focusSaved = focusEpochAtImport && focusEpochAtImport.ok
        ? await persistFocusState(focusEpochAtImport.value)
        : false;
      if (!focusSaved) {
        const current = readTaskGeneration();
        if (!current.ok || !focusEpochAtImport || !focusEpochAtImport.ok
            || current.value.clearEpoch === focusEpochAtImport.value) {
          state.focusSession = previousSession;
          state.focusLog = previousLog;
        } else {
          resetFocusAfterClear();
        }
      }
    }
    render();
    renderFocus();

    const outcomes = [];
    let successCount = 0;
    let failureCount = 0;
    if (incomingTasks.length) {
      if (tasksSaved && tasksSaved.ok) {
        outcomes.push(`${incomingTasks.length} task${incomingTasks.length === 1 ? '' : 's'} restored`);
        successCount += 1;
      } else {
        outcomes.push('task restore failed; no tasks were imported');
        failureCount += 1;
      }
    }
    if (incomingFocusLog.length) {
      if (focusSaved) {
        outcomes.push(`${incomingFocusLog.length} Focus log entr${incomingFocusLog.length === 1 ? 'y' : 'ies'} restored`);
        successCount += 1;
      } else {
        outcomes.push('Focus log restore failed; current history was kept');
        failureCount += 1;
      }
    }
    if (incomingSession) {
      if (focusSaved) {
        outcomes.push('Focus session restored');
        successCount += 1;
      } else {
        outcomes.push('Focus session restore failed; current session was kept');
        failureCount += 1;
      }
    }
    const message = outcomes.join('; ');
    showToast(failureCount && successCount
      ? `Recovery import partially completed — ${message}.`
      : failureCount
        ? `Recovery import failed — ${message}.`
        : `Recovery import finished — ${message}.`);
  }
  async function applyImportedText(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      showToast('That file is not valid JSON. Nothing was changed.');
      return;
    }
    if (!Array.isArray(parsed)) {
      const isRecovery = parsed && typeof parsed === 'object' && (
        parsed.format === 'daymark-combined-recovery-v1'
        || parsed.format === 'daymark-recovery-bundle-v1'
        || parsed.format === 'daymark-focus-recovery-bundle-v1'
        || Object.prototype.hasOwnProperty.call(parsed, 'session')
        || Object.prototype.hasOwnProperty.call(parsed, 'log')
      );
      if (isRecovery) {
        await applyImportedRecovery(parsed, text);
        return;
      }
      showToast('That backup is not a task list or recovery bundle. Nothing was changed.');
      return;
    }
    const validated = logic.validateStoredTasks(parsed);
    const existingIds = new Set(state.tasks.map((task) => task.id));
    const incoming = validated.tasks.filter((task) => !existingIds.has(task.id));
    const duplicates = validated.tasks.length - incoming.length;
    if (!incoming.length) {
      showToast(duplicates
        ? 'Every task in that file already exists. Nothing was changed.'
        : 'No valid tasks were found in that file. Nothing was changed');
      return;
    }

    const preview = [
      `Import preview: ${incoming.length} new task${incoming.length === 1 ? '' : 's'} will be added.`,
      duplicates
        ? `${duplicates} duplicate task${duplicates === 1 ? '' : 's'} will be skipped; your existing versions stay unchanged.`
        : '',
      validated.rejectedCount
        ? `${validated.rejectedCount} invalid record${validated.rejectedCount === 1 ? '' : 's'} will be skipped.`
        : '',
      'Your current tasks will not be replaced. Continue?'
    ].filter(Boolean).join('\n');

    if (typeof window.confirm !== 'function') {
      showToast('Import confirmation is unavailable. Nothing was changed.');
      return;
    }
    let confirmed = false;
    try {
      confirmed = window.confirm(preview);
    } catch (error) {
      showToast('Import confirmation could not be displayed. Nothing was changed.');
      return;
    }
    if (!confirmed) {
      showToast('Import cancelled. Nothing was changed.');
      return;
    }

    const previousTasks = state.tasks;
    state.tasks = previousTasks.concat(incoming);
    const saved = await persistTasks();
    render();
    if (!saved.ok) {
      showToast('Import could not be saved. No tasks were imported.');
      return;
    }
    const parts = [`${incoming.length} restored`];
    if (duplicates) parts.push(`${duplicates} duplicate${duplicates === 1 ? '' : 's'} kept as your version`);
    if (validated.rejectedCount > 0) parts.push(`${validated.rejectedCount} skipped as invalid`);
    showToast(`Import finished — ${parts.join(', ')}.`);
  }

  async function importTasks(file) {
    if (typeof FileReader === 'undefined') {
      showToast('Import is not available in this browser.');
      return;
    }
    if (file && Number.isFinite(file.size) && file.size > MAX_IMPORT_FILE_BYTES) {
      showToast('Import file is too large (maximum 8 MiB). Nothing was changed.');
      return;
    }
    if (!file) {
      showToast('No backup file was selected. Nothing was changed.');
      return;
    }
    const reader = new FileReader();
    try {
      const text = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('read-failed'));
        reader.readAsText(file);
      });
      await applyImportedText(text);
    } catch (error) {
      showToast('That backup file could not be read or opened. Nothing was changed.');
    }
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

  function loadFocusPreset() {
    if (!focus) return null;
    let raw = null;
    try {
      raw = localStorage.getItem(FOCUS_PRESET_KEY);
    } catch (error) {
      // A storage failure just means the default preset stays in use.
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.preset === 'string' && focus.isKind(parsed.preset)) return parsed.preset;
    } catch (error) { /* a corrupt preference is treated as no preference */ }
    return null;
  }

  const VALID_FILTERS = new Set(['all', 'today', 'upcoming', 'overdue', 'completed']);

  const VALID_SORTS = new Set(['smart', 'title']);

  function loadTaskViewPrefs() {
    let raw = null;
    try {
      raw = localStorage.getItem(TASK_VIEW_KEY);
    } catch (error) {
      return { filter: 'all', sort: 'smart', query: '' };
    }
    if (!raw) return { filter: 'all', sort: 'smart', query: '' };
    try {
      const parsed = JSON.parse(raw);
      const filter = parsed && VALID_FILTERS.has(parsed.filter) ? parsed.filter : 'all';
      const sort = parsed && VALID_SORTS.has(parsed.sort) ? parsed.sort : 'smart';
      const query = parsed && typeof parsed.query === 'string' ? parsed.query.slice(0, 200) : '';
      return { filter, sort, query };
    } catch (error) {
      return { filter: 'all', sort: 'smart', query: '' };
    }
  }

  function persistTaskViewPrefs() {
    try {
      localStorage.setItem(TASK_VIEW_KEY, JSON.stringify({
        filter: state.filter,
        sort: state.sort,
        query: state.query || ''
      }));
    } catch (error) {
      // Preference persistence is best-effort; a full storage quota must not break the list.
    }
  }

  function resetTaskViewPrefs() {
    const alreadyDefault = state.filter === 'all' && state.sort === 'smart' && !state.query;
    if (alreadyDefault) return;
    showToast('View reset to defaults');
    state.filter = 'all';
    state.sort = 'smart';
    state.query = '';
    const searchEl = $('#task-search');
    if (searchEl) searchEl.value = '';
    persistTaskViewPrefs();
    const list = $('#task-list');
    if (list) list.classList.add('is-resetting');
    render();
    if (list) setTimeout(() => list.classList.remove('is-resetting'), 280);
  }


  async function persistFocusPreset(expectedClearEpoch) {
    if (!taskMutation || !taskLockManager || !taskMutation.TASK_AND_FOCUS_LOCK_ORDER) return false;
    const result = await taskMutation.withClearEpochLock(
      taskLockManager,
      taskMutation.TASK_AND_FOCUS_LOCK_ORDER,
      localStorage,
      expectedClearEpoch,
      () => {
        if (state.focusStateClearEpoch !== expectedClearEpoch) return false;
        localStorage.setItem(FOCUS_PRESET_KEY, JSON.stringify({ preset: state.focusPreset }));
        return true;
      }
    );
    return Boolean(result.ok && result.value === true);
  }

  function loadFocusState() {
    const empty = { session: null, log: [] };
    if (!focus) return empty;
    let saved = null;
    try {
      saved = localStorage.getItem(FOCUS_KEY);
    } catch (error) {
      console.warn('Could not read Daymark focus storage:', error);
      // Primary focus key is unreadable. Independently inspect its recovery backup.
      let backupRaw = null;
      let backupReadable = false;
      try {
        backupRaw = localStorage.getItem(FOCUS_BACKUP_KEY);
        backupReadable = true;
      } catch (backupError) {
        console.warn('Could not read Daymark focus recovery backup:', backupError);
      }
      if (backupReadable && typeof backupRaw === 'string' && backupRaw.length > 0) {
        setStorageStatus('Primary focus data unreadable; recovery backup available', true);
        offerRecoveryExport('Primary focus data is unreadable. A recovery backup is available for export.');
      } else if (!backupReadable) {
        setStorageStatus('Primary and focus recovery data unreadable; recovery status unknown', true);
      } else {
        setStorageStatus('Primary focus data unreadable; no recovery backup found', true);
      }
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
      const restoreResult = parsed.session
        ? focus.restoreSessionResult(parsed.session, Date.now())
        : { session: null, completedSession: null };
      const session = restoreResult.session;
      if (log.rejectedCount > 0 || invalidSession) {
        // Keep the complete source whenever validation rejects any focus record.
        // Valid sessions/log entries can still be used, but rejected originals
        // must remain recoverable through future saves and reloads.
        state.focusRecoveryBackupPendingPayload = saved;
        state.focusRecoveryClearEpoch = clearEpoch;
        setStorageStatus('Focus data needs a recovery backup; the original is being preserved until storage is safely coordinated', true);
      } else if (hasFocusRecoveryBackup()) {
        reportFocusRecovery(true);
      }

      const completedSession = restoreResult.completedSession;
      if (completedSession) {
        const entry = focus.makeLogEntry(completedSession);
        const alreadyLogged = entry && log.entries.some((item) => item.id === entry.id);
        const entries = entry && !alreadyLogged
          ? focus.appendLogEntry(log.entries, entry)
          : log.entries;

        state.focusRecoveryCompletionPending = {
          sourceRaw: saved,
          payload: { session: null, log: entries }
        };
        state.focusRecoveryClearEpoch = clearEpoch;
        return { session, log: entries };
      }
      return { session, log: log.entries };
    } catch (error) {
      console.warn('Could not load saved Daymark focus state:', error);
      // Preserve unreadable data and never let a later focus save replace its
      // only remaining copy if browser storage cannot create the backup.
      state.focusRecoveryBackupPendingPayload = saved;
      state.focusRecoveryClearEpoch = clearEpoch;
      setStorageStatus('Focus data could not be loaded; the original is being preserved for recovery', true);
      return empty;
    }
  }

  function scheduleFocusRecoveryMaintenance() {
    const backupPayload = state.focusRecoveryBackupPendingPayload;
    const completion = state.focusRecoveryCompletionPending;
    if (!taskMutation || !taskLockManager || (!backupPayload && !completion)) {
      return Promise.resolve({ ok: true, skipped: true });
    }
    const expectedClearEpoch = state.focusRecoveryClearEpoch;
    if (!Number.isSafeInteger(expectedClearEpoch)) return Promise.resolve({ ok: false, reason: 'generation-unreadable' });
    focusRecoveryMaintenance = taskMutation.withClearEpochLock(
      taskLockManager,
      taskMutation.TASK_AND_FOCUS_LOCK_ORDER,
      localStorage,
      expectedClearEpoch,
      () => {
        let backupSaved = false;
        const rawToPreserve = backupPayload || (completion && completion.sourceRaw);
        if (backupPayload) {
          if (state.focusRecoveryClearEpoch !== expectedClearEpoch) return { ok: false, reason: 'cleared' };
          if (!backUpRawFocusPayload(backupPayload)) return { ok: false, reason: 'backup-failed' };
          backupSaved = true;
        }
        if (completion) {
          try {
            localStorage.setItem(FOCUS_KEY, JSON.stringify(completion.payload));
          } catch (error) {
            if (!backupSaved && rawToPreserve) backupSaved = backUpRawFocusPayload(rawToPreserve);
            return { ok: false, reason: 'focus-write-failed', backupSaved };
          }
        }
        return { ok: true, backupSaved };
      }
    ).then((result) => {
      const value = result.ok ? result.value : null;
      if (result.ok && value && value.ok) {
        if (backupPayload === state.focusRecoveryBackupPendingPayload) state.focusRecoveryBackupPendingPayload = null;
        if (completion === state.focusRecoveryCompletionPending) state.focusRecoveryCompletionPending = null;
        if (value.backupSaved || hasFocusRecoveryBackup()) reportFocusRecovery(true);
        return { ok: true };
      }
      const reason = result.reason || (value && value.reason) || 'maintenance-failed';
      if (reason === 'cleared' || reason === 'clear-in-progress') return { ok: false, reason };
      if (value && value.backupSaved) {
        if (backupPayload === state.focusRecoveryBackupPendingPayload) state.focusRecoveryBackupPendingPayload = null;
        reportFocusRecovery(true);
        if (completion && reason === 'focus-write-failed') {
          setStorageStatus('Focus session completed while Daymark was closed, but its history could not be saved; the original recovery backup is retained', true);
        }
      } else {
        reportFocusRecovery(false);
      }
      return { ok: false, reason };
    });
    return focusRecoveryMaintenance;
  }

  async function persistFocusState(expectedClearEpoch, payloadOverride) {
    if (!focus || !taskMutation || !taskLockManager) return false;
    const epoch = Number.isSafeInteger(expectedClearEpoch)
      ? expectedClearEpoch : taskMutation.captureClearEpoch(localStorage).value;
    if (!Number.isSafeInteger(epoch)) return false;
    const payload = payloadOverride || {
      session: state.focusSession ? focus.serialize(state.focusSession) : null,
      log: copyTaskList(state.focusLog)
    };
    const result = await taskMutation.withClearEpochLock(
      taskLockManager,
      taskMutation.TASK_AND_FOCUS_LOCK_ORDER,
      localStorage,
      epoch,
      () => {
        if (state.focusStateClearEpoch !== epoch) return false;
        if (state.focusRecoveryBackupPendingPayload !== null) {
          if (state.focusRecoveryClearEpoch !== epoch) return false;
          if (!backUpRawFocusPayload(state.focusRecoveryBackupPendingPayload)) return false;
          state.focusRecoveryBackupPendingPayload = null;
        }
        localStorage.setItem(FOCUS_KEY, JSON.stringify(payload));
        return true;
      }
    );
    if (result.ok && result.value === true) {
      if (hasFocusRecoveryBackup()) reportFocusRecovery(true);
      return true;
    }
    if (result.reason !== 'cleared' && result.reason !== 'clear-in-progress') {
      setStorageStatus('Focus data could not be saved; keep this page open and retry', true);
    }
    return false;
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
      const progressEl = $('#focus-progress');
      if (progressEl && typeof progressEl.setAttribute === 'function') {
        progressEl.setAttribute('aria-valuenow', '0');
        progressEl.setAttribute('aria-valuetext', '0% complete');
      }
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
      const progressEl = $('#focus-progress');
      if (progressEl && typeof progressEl.setAttribute === 'function') {
        const pct = Math.round(focus.progressRatio(session, now) * 100);
        const remaining = focus.formatClock(focus.remainingMs(session, now));
        progressEl.setAttribute('aria-valuenow', String(pct));
        progressEl.setAttribute('aria-valuetext', `${pct}% complete, ${remaining} remaining`);
      }
      if (startBtn) startBtn.hidden = true;
      if (pauseBtn) {
        pauseBtn.hidden = false;
        pauseBtn.textContent = session.state === 'paused' ? 'Resume' : 'Pause';
      }
      if (stopBtn) stopBtn.hidden = false;
    }
    const todayEl = $('#focus-today');
    if (todayEl) todayEl.textContent = String(focus.focusMinutesOn(state.focusLog, logic.localDateString()));
    const card = $('#focus-card');
    if (card) {
      const isRunning = Boolean(session && session.state === 'running');
      card.classList.toggle('is-running', isRunning);
    }
    // Small improvement: keep browser tab title in sync with running timer
    // so the user can see remaining time without switching back.
    // Also set an accessible label on the clock so assistive tech can announce
    // remaining time on demand without flooding live regions every second.
    // Guarded so host/node tests without a full document do not throw.
    if (typeof document !== 'undefined' && document.title != null) {
      if (session && session.state === 'running') {
        const remaining = focus.formatClock(focus.remainingMs(session, now));
        document.title = `${remaining} · Daymark Focus`;
      } else if (document.title.includes('· Daymark Focus') && !document.title.startsWith('Complete')) {
        document.title = 'Daymark — personal tasks';
      }
    }
    if (timeEl && typeof timeEl.setAttribute === 'function') {
      if (session) {
        const remaining = focus.formatClock(focus.remainingMs(session, now));
        const stateWord = session.state === 'paused' ? 'Paused' : (session.kind === 'focus' ? 'Focusing' : 'On break');
        timeEl.setAttribute('aria-label', `${stateWord}, ${remaining} remaining`);
      } else {
        timeEl.removeAttribute('aria-label');
      }
    }
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
      void endFocusSession(true);
      return;
    }
    renderFocus();
  }

  async function startFocus(taskId) {
    if (!focus) return;
    const epoch = taskMutation && taskMutation.captureClearEpoch(localStorage);
    if (!epoch || !epoch.ok || state.focusStateClearEpoch !== epoch.value) {
      showToast('Focus data is being cleared or storage coordination is unavailable. Try again shortly.');
      return;
    }
    if (state.focusSession) {
      showToast('Finish or stop the current focus session first.');
      return;
    }
    const kind = focus.isKind(state.focusPreset) ? state.focusPreset : 'focus';
    const minutes = focus.presetMinutes(kind);
    const linkedTaskId = taskId || state.focusTaskId || null;
    state.focusSession = focus.createSession({ taskId: linkedTaskId, kind, durationMinutes: minutes }, Date.now());
    state.focusTaskId = linkedTaskId || '';
    renderFocus();
    ensureFocusTimer();
    const saved = await persistFocusState(epoch.value);
    const task = linkedTaskId ? state.tasks.find((item) => item.id === linkedTaskId) : null;
    showToast(saved
      ? (task
        ? `Focus started for “${task.title}” — ${focus.formatClock(minutes * 60 * 1000)} on the clock.`
        : `Focus started — ${focus.formatClock(minutes * 60 * 1000)} on the clock.`)
      : 'Focus started in this tab, but could not be saved. Keep this page open.');
  }

  async function toggleFocusPause() {
    if (!focus || !state.focusSession) return;
    const epoch = taskMutation && taskMutation.captureClearEpoch(localStorage);
    if (!epoch || !epoch.ok || state.focusStateClearEpoch !== epoch.value) {
      showToast('Focus data is being cleared or storage coordination is unavailable. Try again shortly.');
      return;
    }
    const now = Date.now();
    if (state.focusSession.state === 'running') focus.pause(state.focusSession, now);
    else focus.resume(state.focusSession, now);
    renderFocus();
    const saved = await persistFocusState(epoch.value);
    if (!saved) showToast('Focus state changed in this tab but could not be saved. Keep this page open.');
  }

  async function endFocusSession(completed) {
    if (!focus || !state.focusSession) return;
    const epoch = taskMutation && taskMutation.captureClearEpoch(localStorage);
    if (!epoch || !epoch.ok || state.focusStateClearEpoch !== epoch.value) return;
    const now = Date.now();
    focus.finish(state.focusSession, now, completed);
    const entry = focus.makeLogEntry(state.focusSession);
    if (entry) state.focusLog = focus.appendLogEntry(state.focusLog, entry);
    const task = state.focusSession.taskId ? state.tasks.find((item) => item.id === state.focusSession.taskId) : null;
    state.focusSession = null;
    stopFocusTimer();
    renderFocus();
    render();
    const saved = await persistFocusState(epoch.value);
    // Brief completion title so the tab shows success even if the user is in another window.
    // Cleared after a short delay so it does not linger. Guarded for tests.
    if (completed && typeof document !== 'undefined' && document.title != null) {
      document.title = 'Complete · Daymark Focus';
      if (typeof setTimeout === 'function') {
        setTimeout(() => {
          if (document.title === 'Complete · Daymark Focus') {
            document.title = 'Daymark — personal tasks';
          }
        }, 4000);
      }
    }
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

  async function checkReminders() {
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
          persistTaskViewPrefs();
          render();
        }
      });
    }
    if (changed) {
      const saved = await persistTasks();
      render();
      if (!saved.ok) showToast('A reminder change could not be saved. Reload the task list before retrying.');
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
    } else if ((event.key === 'r' || event.key === 'R') && !$('#edit-dialog').open) {
      event.preventDefault();
      resetTaskViewPrefs();
    } else if ((event.key === 's' || event.key === 'S') && !$('#edit-dialog').open) {
      event.preventDefault();
      $('#sort-toggle').click();
    } else if (/^[1-5]$/.test(event.key) && !$('#edit-dialog').open && !isTextField(event.target)) {
      event.preventDefault();
      const filters = ['all', 'today', 'upcoming', 'overdue', 'completed'];
      const idx = parseInt(event.key, 10) - 1;
      const btn = document.querySelector(`.filter-button[data-filter="${filters[idx]}"]`);
      if (btn) btn.click();
    }
  }

  function syncDueInputs(dateInput, timeInput, reminderSelect, repeatSelect, reminderHint) {
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
    if (reminderHint) reminderHint.hidden = !(hasDate && !logic.isTimeOnly(timeInput.value));
  }


  function formatFeedTime(value) {
    const time = Date.parse(value);
    if (Number.isNaN(time)) return '';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(time));
  }

  function feedHost(url) {
    try {
      return new URL(url).host;
    } catch (error) {
      return url;
    }
  }

  function loadFeedCache() {
    if (!feed) return null;
    try {
      const raw = localStorage.getItem(FEED_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return feed.validateFeedCache(parsed) ? parsed : null;
    } catch (error) {
      console.warn('Could not load the saved Daymark feed cache:', error);
      return null;
    }
  }

  async function persistFeedCache(expectedClearEpoch, cache) {
    if (!feed || !cache || !taskMutation || !taskLockManager) return { ok: false, reason: 'lock-unavailable' };
    return taskMutation.withClearEpochLock(
      taskLockManager,
      [taskMutation.TASK_LOCK_NAME],
      localStorage,
      expectedClearEpoch,
      () => {
        localStorage.setItem(FEED_KEY, JSON.stringify(cache));
        return true;
      }
    );
  }

  function renderFeed() {
    if (!feed) return;
    const status = $('#feed-status');
    const list = $('#feed-list');
    if (!status || !list) return;
    const input = $('#feed-url');
    const button = $('#feed-refresh');
    if (input && state.feedCache && !input.value) input.value = state.feedCache.url;
    if (button) {
      button.disabled = state.feedLoading;
      button.textContent = state.feedLoading ? 'Loading…' : 'Refresh';
      if (button.classList && typeof button.classList.toggle === 'function') {
        button.classList.toggle('is-busy', state.feedLoading);
      }
      if (typeof button.setAttribute === 'function') {
        if (state.feedLoading) button.setAttribute('aria-busy', 'true');
        else button.removeAttribute('aria-busy');
      }
    }
    status.textContent = state.feedNotice || (state.feedCache
      ? `Saved on this device · ${formatFeedTime(state.feedCache.fetchedAt)}`
      : 'No feed loaded yet. Paste an RSS or Atom URL and tap Refresh.');
    const cache = state.feedCache;
    list.innerHTML = cache && cache.feed ? cache.feed.items.map((item) => {
      const when = item.publishedAt ? formatFeedTime(item.publishedAt) : '';
      const heading = item.link
        ? `<a class="feed-item-link" href="${escapeHTML(item.link)}" target="_blank" rel="noopener noreferrer">${escapeHTML(item.title)}</a>`
        : `<span class="feed-item-title">${escapeHTML(item.title)}</span>`;
      return `<div class="feed-item">${heading}${when ? `<span class="feed-item-date">${escapeHTML(when)}</span>` : ''}${item.summary ? `<p class="feed-item-summary">${escapeHTML(item.summary)}</p>` : ''}</div>`;
    }).join('') : '<div class="feed-empty">Items from the feed will appear here after a successful refresh.</div>';
  }

  async function refreshFeed(rawUrl) {
    if (!feed || state.feedLoading) return;
    const target = feed.resolveFeedTarget(rawUrl, state.feedCache ? state.feedCache.url : null);
    if (!target || !feed.isValidFeedUrl(target)) {
      state.feedNotice = 'Enter a valid http(s) feed URL first.';
      renderFeed();
      return;
    }
    const epochAtStart = taskMutation && taskMutation.captureClearEpoch(localStorage);
    state.feedLoading = true;
    state.feedNotice = 'Fetching feed…';
    renderFeed();
    try {
      if (typeof fetch !== 'function') throw new Error('fetch unavailable');
      const parsed = await feed.fetchFeed(target, fetch);
      const fetchedCache = { version: 1, url: target, fetchedAt: new Date().toISOString(), feed: parsed };
      const persisted = epochAtStart && epochAtStart.ok
        ? await persistFeedCache(epochAtStart.value, fetchedCache)
        : { ok: false, reason: (epochAtStart && epochAtStart.reason) || 'lock-unavailable' };
      const currentGeneration = readTaskGeneration();
      const clearedDuringFetch = !epochAtStart || !epochAtStart.ok
        || !currentGeneration.ok || currentGeneration.value.clearEpoch !== epochAtStart.value
        || (persisted && persisted.reason === 'cleared');
      if (clearedDuringFetch) {
        state.feedCache = null;
        state.feedNotice = 'The feed finished loading after local data was cleared; it was not saved or restored.';
        showToast(state.feedNotice);
        return;
      }
      state.feedCache = fetchedCache;
      const savedOffline = Boolean(persisted && persisted.ok && persisted.value === true);
      state.feedNotice = savedOffline
        ? `Updated ${formatFeedTime(state.feedCache.fetchedAt)} from ${feedHost(target)}. Saved for offline reading.`
        : `Updated ${formatFeedTime(state.feedCache.fetchedAt)} from ${feedHost(target)}, but browser storage could not save an offline copy.`;
      showToast(`Briefing updated — ${parsed.items.length} item${parsed.items.length === 1 ? '' : 's'} loaded.`);
    } catch (error) {
      state.feedNotice = state.feedCache && state.feedCache.url === target
        ? 'Could not reach the feed — showing items saved on this device.'
        : 'Could not load that feed. Check the URL or your connection.';
      showToast(state.feedNotice);
    } finally {
      state.feedLoading = false;
      renderFeed();
    }
  }

  function handleFeedSubmit(event) {
    event.preventDefault();
    if (!feed) return;
    return refreshFeed($('#feed-url').value);
  }

  async function clearFeed() {
    if (state.feedLoading) return;
    const epoch = taskMutation && taskMutation.captureClearEpoch(localStorage);
    if (!epoch || !epoch.ok || !taskLockManager) {
      state.feedNotice = 'The feed cache could not be cleared safely while local data is changing.';
      renderFeed();
      return;
    }
    const cleared = await taskMutation.withClearEpochLock(
      taskLockManager,
      [taskMutation.TASK_LOCK_NAME],
      localStorage,
      epoch.value,
      () => { localStorage.removeItem(FEED_KEY); return true; }
    );
    if (!cleared.ok || cleared.value !== true) {
      state.feedNotice = 'The feed cache could not be cleared safely; saved data was left unchanged.';
      renderFeed();
      return;
    }
    const input = $('#feed-url');
    if (input) input.value = '';
    state.feedCache = null;
    state.feedNotice = '';
    renderFeed();
  }

  function resetFocusAfterClear() {
    stopFocusTimer();
    state.focusSession = null;
    state.focusLog = [];
    state.focusPreset = 'focus';
    state.focusTaskId = '';
    state.focusStateClearEpoch = clearEpoch;
    state.focusRecoveryBackupPendingPayload = null;
    state.focusRecoveryCompletionPending = null;
    state.focusRecoveryClearEpoch = null;
    renderFocus();
  }

  function setUp() {
    state.tasks = loadTasks();
    initializeTaskMutationState();
    taskRecoveryMaintenance = scheduleTaskRecoveryMaintenance();
    const focusState = loadFocusState();
    state.focusSession = focusState.session;
    state.focusLog = focusState.log;
    focusRecoveryMaintenance = scheduleFocusRecoveryMaintenance();
    const savedView = loadTaskViewPrefs();
    state.filter = savedView.filter;
    state.sort = savedView.sort;
    state.query = savedView.query;
    const searchEl = $('#task-search');
    if (searchEl) searchEl.value = state.query;
    const savedPreset = loadFocusPreset();
    if (savedPreset) state.focusPreset = savedPreset;
    state.feedCache = loadFeedCache();
    render();
    $('#add-form').addEventListener('submit', addTask);
    $('#new-title').addEventListener('input', () => {
      $('#add-error').hidden = true;
      $('#new-title').removeAttribute('aria-invalid');
    });
    $('#new-due-date').addEventListener('input', (event) => syncDueInputs(event.currentTarget, $('#new-due-time'), $('#new-reminder'), $('#new-repeat'), $('#new-date-only-reminder-hint')));
    const syncNewDueTime = (event) => syncDueInputs($('#new-due-date'), event.currentTarget, $('#new-reminder'), $('#new-repeat'), $('#new-date-only-reminder-hint'));
    $('#new-due-time').addEventListener('input', syncNewDueTime);
    $('#new-due-time').addEventListener('change', syncNewDueTime);
    $('#task-search').addEventListener('input', (event) => {
      state.query = event.currentTarget.value;
      persistTaskViewPrefs();
      render();
    });
    $('#clear-search').addEventListener('click', clearSearch);
    $('#chip-today').addEventListener('click', () => setQuickDueDate(0));
    $('#chip-tomorrow').addEventListener('click', () => setQuickDueDate(1));
    $('#sort-toggle').addEventListener('click', () => {
      state.sort = state.sort === 'smart' ? 'title' : 'smart';
      persistTaskViewPrefs();
      showToast(state.sort === 'title' ? 'Sorted A–Z' : 'Sorted smart');
      const list = $('#task-list');
      if (list) list.classList.add('is-sorting');
      render();
      if (list) setTimeout(() => list.classList.remove('is-sorting'), 280);
    });
    const resetViewBtn = $('#reset-view');
    if (resetViewBtn) {
      resetViewBtn.addEventListener('click', resetTaskViewPrefs);
    }
    $('#empty-clear-search').addEventListener('click', clearSearch);
    $('#clear-completed').addEventListener('click', clearCompleted);
    $('#export-tasks').addEventListener('click', exportTasks);
    $('#import-tasks').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', async (event) => {
      const file = event.currentTarget.files && event.currentTarget.files[0];
      event.currentTarget.value = '';
      if (file) await importTasks(file);
    });
    document.querySelectorAll('.filter-button').forEach((button) => button.addEventListener('click', () => {
      const next = button.dataset.filter;
      if (next === state.filter) return;
      state.filter = next;
      persistTaskViewPrefs();
      const labels = { all: 'All', today: 'Today', upcoming: 'Upcoming', overdue: 'Overdue', completed: 'Completed' };
      showToast('Showing ' + (labels[next] || next));
      const list = $('#task-list');
      if (list) list.classList.add('is-filtering');
      render();
      if (list) setTimeout(() => list.classList.remove('is-filtering'), 280);
    }));
    taskList.addEventListener('click', handleTaskAction);
    $('#edit-form').addEventListener('submit', saveEdit);
    $('#edit-title').addEventListener('input', () => {
      $('#edit-error').hidden = true;
      $('#edit-title').removeAttribute('aria-invalid');
    });
    $('#edit-due-date').addEventListener('input', (event) => syncDueInputs(event.currentTarget, $('#edit-due-time'), $('#edit-reminder'), $('#edit-repeat'), $('#edit-date-only-reminder-hint')));
    const syncEditDueTime = (event) => syncDueInputs($('#edit-due-date'), event.currentTarget, $('#edit-reminder'), $('#edit-repeat'), $('#edit-date-only-reminder-hint'));
    $('#edit-due-time').addEventListener('input', syncEditDueTime);
    $('#edit-due-time').addEventListener('change', syncEditDueTime);
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
      const generationKey = taskMutation && taskMutation.GENERATION_KEY;
      if (event.key === STORAGE_KEY || event.key === generationKey || event.key === null) {
        const generation = readTaskGeneration();
        if (generation.ok) {
          const tasksCleared = generation.value.taskEpoch !== taskEpoch;
          const cleared = generation.value.clearEpoch !== clearEpoch;
          taskGeneration = generation.value.generation;
          taskEpoch = generation.value.taskEpoch;
          clearEpoch = generation.value.clearEpoch;
          if (tasksCleared || cleared) {
            state.recoveryBackupPendingPayload = null;
            state.recoveryBackupClearPending = false;
          }
          if (cleared) {
            resetFocusAfterClear();
            state.feedCache = null;
            state.feedNotice = '';
            const feedInput = $('#feed-url');
            if (feedInput) feedInput.value = '';
          }
        }
        if (pendingTaskWrites === 0) {
          state.tasks = loadTasks();
          taskBaseSnapshot = copyTaskList(state.tasks);
          taskQueuedSnapshot = copyTaskList(state.tasks);
          taskWritesBlocked = false;
          taskRecoveryMaintenance = scheduleTaskRecoveryMaintenance();
        }
        render();
        renderFeed();
      }
    });
    $('#feed-form').addEventListener('submit', handleFeedSubmit);
    const feedClear = $('#feed-clear');
    if (feedClear) feedClear.addEventListener('click', clearFeed);
    const busyFocusButtons = new WeakSet();
    function withBriefBusy(button, handler) {
      if (!button || typeof handler !== 'function') return;
      button.addEventListener('click', (event) => {
        // pointer-events only blocks pointer input; keyboard-generated click
        // events still arrive. Guard every activation at the handler boundary.
        if (button.disabled || button.hidden || busyFocusButtons.has(button)) {
          if (event && typeof event.preventDefault === 'function') event.preventDefault();
          return;
        }
        busyFocusButtons.add(button);
        const previousAriaBusy = typeof button.getAttribute === 'function'
          ? button.getAttribute('aria-busy') : null;
        if (typeof button.setAttribute === 'function') button.setAttribute('aria-busy', 'true');
        button.classList.add('is-busy');
        const releaseBusy = () => {
          busyFocusButtons.delete(button);
          button.classList.remove('is-busy');
          if (typeof button.removeAttribute === 'function') {
            if (previousAriaBusy === null) button.removeAttribute('aria-busy');
            else if (typeof button.setAttribute === 'function') button.setAttribute('aria-busy', previousAriaBusy);
          }
        };
        let result;
        try { result = handler(event); }
        catch (error) { releaseBusy(); throw error; }
        const releaseAfterHandler = () => {
          if (typeof setTimeout === 'function') setTimeout(releaseBusy, 160);
          else releaseBusy();
        };
        if (result && typeof result.then === 'function') result.then(releaseAfterHandler, releaseAfterHandler);
        else releaseAfterHandler();
        return result;
      });
    }
    withBriefBusy($('#focus-start'), () => startFocus(null));
    withBriefBusy($('#focus-pause'), toggleFocusPause);
    withBriefBusy($('#focus-stop'), () => endFocusSession(false));
    $('#focus-task').addEventListener('change', (event) => {
      state.focusTaskId = event.currentTarget.value;
    });
    document.querySelectorAll('.focus-preset').forEach((button) => button.addEventListener('click', async () => {
      if (state.focusSession) return;
      const epoch = taskMutation && taskMutation.captureClearEpoch(localStorage);
      if (!epoch || !epoch.ok || state.focusStateClearEpoch !== epoch.value) {
        showToast('Focus data is being cleared or storage coordination is unavailable. Try again shortly.');
        return;
      }
      state.focusPreset = button.dataset.focusPreset;
      renderFocus();
      const saved = await persistFocusPreset(epoch.value);
      if (!saved) showToast('The Focus preset changed in this tab but could not be saved.');
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
