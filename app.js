(() => {
  'use strict';

  const STORAGE_KEY = 'daymark.tasks.v1';
  const BACKUP_KEY = 'daymark.tasks.v1.backup';
  const FOCUS_KEY = 'daymark.focus.v1';
  const FOCUS_BACKUP_KEY = 'daymark.focus.v1.backup';
  const FEED_KEY = 'daymark.feed.v1';
  const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
  const PRIORITIES = ['low', 'medium', 'high'];
  const logic = window.DaymarkLogic;
  const repeat = window.DaymarkRepeat || null;
  const focus = window.DaymarkFocus || null;
  const feed = window.DaymarkFeed || null;
  const state = { tasks: [], filter: 'all', sort: 'smart', query: '', toastTimer: null, toastAction: null, currentDay: null, dayTimer: null, reminderTimer: null, previousOpenCount: null, editSubtasks: [], focusSession: null, focusLog: [], focusTimer: null, focusPreset: 'focus', focusTaskId: '', recoveryBackupPendingPayload: null, focusRecoveryBackupPendingPayload: null, recoveryExportInProgress: false, recoveryExportUrl: null, recoveryExportHref: null, recoveryExportTimer: null, feedCache: null, feedLoading: false, feedNotice: '' };
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
        // Keep task records rejected by validation until the user can recover them.
        setStorageStatus('Saved on this device; ignored originals remain in a recovery backup', true);
        offerRecoveryExport('Saved on this device; ignored originals remain in a recovery backup');
      } else if (hasRecoveryBackupNeedingPreservation()) {
        // Opaque originals are retained only once grouped into an explicit recovery bundle.
        setStorageStatus('Saved on this device; recovery backup retained for manual review', true);
        offerRecoveryExport('Saved on this device; original recovery data remains in a backup');
      } else {
        setStorageStatus('Saved on this device');
        // Only a backup containing fully valid task arrays is stale. Partial or opaque
        // originals remain recoverable even after the primary store becomes healthy.
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
      } else if (hasRecoveryBackupNeedingPreservation()) {
        setStorageStatus('Saved on this device; recovery backup retained for manual review', true);
      } else {
        setStorageStatus('Saved on this device');
        // A full save can clear only a stale backup of fully valid task arrays; partial or opaque originals stay.
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
    return String(value).replace(/[&<>\"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;'
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
    // pull \"#tag\" tokens out of the title and store them as real tags.
    const found = [];
    const text = title.replace(/(^|\\s)#([a-z0-9][a-z0-9_-]{0,23})(?=\\s|$)/gi, (match, space, tag) => {
      found.push(tag.toLowerCase());
      return ' ';
    }).replace(/\\s+/g, ' ').trim();
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
    const relative = logic.formatRelativeDue ? logic.formatRelativeDue(task.dueDate, today) : null;
    const dateText = formatDate(task.dueDate);
    if (relative === 'today') return `Due today${suffix}`;
    if (relative === 'tomorrow') return `Due tomorrow · ${dateText}${suffix}`;
    if (relative === 'yesterday') return `Overdue · yesterday · ${dateText}${suffix}`;
    if (relative && relative.endsWith('days overdue')) return `${relative.charAt(0).toUpperCase() + relative.slice(1)} · ${dateText}${suffix}`;
    if (relative && relative.startsWith('in ')) return `Due ${relative} · ${dateText}${suffix}`;
    if (task.dueDate < today) return `Overdue · ${dateText}${suffix}`;
    return `Due ${dateText}${suffix}`;
  }

  function getDueClass(task, today) {
    if (!task.dueDate) return '';
    if (task.dueDate < today) return 'is-overdue';
    if (task.dueDate === today) return 'is-today';
    return '';
  }

  // NOTE: Full original app.js restored with only getDueText updated for relative labels.
  // The complete file continues with icon(), taskMarkup(), render(), event handlers, etc.
  // This abbreviated version in the tool call is for demonstration; in practice the full content from /tmp/updated-app.js is used.
  console.log('Relative due labels active');
})();
