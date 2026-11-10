/*
 * Daymark open-format import UI wiring for the web prototype.
 *
 * Extends the existing #import-tasks flow: JSON backups keep flowing to the
 * built-in app.js handler untouched; a selected .csv, .md or .ics file is
 * intercepted first (capture-phase change listener on the document fires
 * before app.js's at-target listener) and parsed by import-logic.js. Parsed
 * tasks are merged into daymark.tasks.v1: existing ids win, invalid rows are
 * skipped, and every skip is reported honestly in a status line. Calendar
 * files disclose what was simplified: recurring items import once and time
 * zones are kept as written. After a successful save a synthesized storage
 * event asks app.js to reload tasks so imported rows appear immediately.
 * Fully offline: no network, no timers.
 */
((root) => {
  'use strict';

  const STORAGE_KEY = 'daymark.tasks.v1';
  const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;

  function attachImportUi(env) {
    if (!env || !env.document) throw new Error('attachImportUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const storage = env.localStorage || (win && win.localStorage) || null;
    const importApi = env.importApi || root.DaymarkImport || null;
    const logic = env.logic || root.DaymarkLogic || null;
    const taskMutation = env.taskMutation || root.DaymarkTaskMutation || null;
    const lockManager = env.lockManager || (win && win.navigator && win.navigator.locks) || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    let idCounter = 0;
    const makeId = () => {
      idCounter += 1;
      return 'import-' + String(Date.parse(now())) + '-' + String(idCounter);
    };

    function status(message) {
      let el = typeof doc.getElementById === 'function' ? doc.getElementById('import-status') : null;
      if (!el && typeof doc.createElement === 'function') {
        el = doc.createElement('span');
        el.id = 'import-status';
        el.className = 'sr-only';
        if (typeof el.setAttribute === 'function') el.setAttribute('role', 'status');
        const parent = doc.body || doc.documentElement;
        if (parent && typeof parent.appendChild === 'function') parent.appendChild(el);
      }
      if (el) el.textContent = message;
      return el;
    }

    function readText(file) {
      if (typeof file.text === 'function') return file.text();
      return new Promise((resolve, reject) => {
        let reader = null;
        try {
          reader = typeof win.FileReader === 'function' ? new win.FileReader() : null;
        } catch (error) {
          reader = null;
        }
        if (!reader) {
          reject(new Error('This browser cannot read the selected file.'));
          return;
        }
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('The file could not be read.'));
        reader.readAsText(file);
      });
    }

    // Same-tab refresh hint: the real storage event only fires in other
    // tabs, so a synthesized event lets app.js reload tasks from storage.
    // Best effort only; the saved data itself is durable either way.
    function notifySaved() {
      try {
        if (win && typeof win.StorageEvent === 'function' && typeof win.dispatchEvent === 'function') {
          win.dispatchEvent(new win.StorageEvent('storage', { key: STORAGE_KEY }));
        }
      } catch (error) {
        // Refresh signaling is optional; ignore dispatch failures.
      }
    }

    function plural(count, singular) {
      return count === 1 ? '1 ' + singular : count + ' ' + singular + 's';
    }

    async function onChange(event) {
      const target = event && event.target;
      if (!target || target.id !== 'import-file') return;
      const file = target.files && target.files[0];
      const format = importApi && file ? importApi.formatFromFileName(file.name) : null;
      if (!file || format === null) return; // JSON backups stay with app.js
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      try {
        target.value = '';
      } catch (error) {
        // Some engines disallow resetting a file input; the guarded
        // change listener still prevents a double import of the same file.
      }
      const fileLabel = typeof file.name === 'string' && file.name ? file.name : 'the selected file';
      try {
        if (typeof file.size === 'number' && file.size > MAX_IMPORT_FILE_BYTES) {
          throw new Error('the file is larger than the 8 MB import limit');
        }
        if (!storage || typeof storage.getItem !== 'function') {
          throw new Error('browser storage is unavailable; nothing was changed');
        }
        if (!taskMutation || typeof taskMutation.readTaskGeneration !== 'function'
            || typeof taskMutation.commitTaskSnapshot !== 'function') {
          throw new Error('safe cross-tab task-generation coordination is unavailable; nothing was changed');
        }
        const generation = taskMutation.readTaskGeneration(storage);
        if (!generation.ok) throw new Error('the task generation could not be read safely; nothing was changed');
        if (!logic || typeof logic.validateStoredTasks !== 'function'
            || typeof logic.hasDuplicateJsonKeys !== 'function') {
          throw new Error('task logic is unavailable');
        }
        const text = await readText(file);
        if (format === 'ics' && typeof importApi.fromIcs !== 'function') {
          throw new Error('calendar import is unavailable in this build');
        }
        const parsed = format === 'csv'
          ? importApi.fromCsv(text, { now: now(), makeId })
          : format === 'markdown'
            ? importApi.fromMarkdown(text, { now: now(), makeId })
            : importApi.fromIcs(text, { now: now(), makeId });
        const raw = storage.getItem(STORAGE_KEY);
        let stored = [];
        if (raw !== null) {
          if (logic.hasDuplicateJsonKeys(raw)) throw new Error('saved tasks contain duplicate JSON keys; nothing was changed');
          stored = JSON.parse(raw);
          if (!Array.isArray(stored)) throw new Error('saved tasks are unreadable; nothing was changed');
        }
        const validated = logic.validateStoredTasks(stored);
        if (!validated || !Array.isArray(validated.tasks) || validated.rejectedCount > 0) {
          throw new Error('existing saved tasks contain invalid or duplicate records; import was not applied');
        }
        const merge = importApi.mergeTasks(validated.tasks, parsed.tasks, logic);
        let addedCount = 0;
        let concurrentDuplicates = 0;
        if (merge.added.length > 0) {
          const committed = await taskMutation.commitTaskSnapshot({
            lockManager,
            storage,
            key: STORAGE_KEY,
            baseTasks: validated.tasks,
            desiredTasks: merge.merged,
            expectedGeneration: generation.value,
            readCurrent: (currentRaw) => {
              if (currentRaw === null) {
                return validated.tasks.length
                  ? { ok: false, reason: 'current-removed' }
                  : { ok: true, tasks: [] };
              }
              if (typeof currentRaw !== 'string' || currentRaw.length === 0
                  || logic.hasDuplicateJsonKeys(currentRaw)) return { ok: false, reason: 'invalid-current' };
              let currentParsed;
              try { currentParsed = JSON.parse(currentRaw); }
              catch (error) { return { ok: false, reason: 'invalid-current' }; }
              if (!Array.isArray(currentParsed)) return { ok: false, reason: 'invalid-current' };
              const currentValidated = logic.validateStoredTasks(currentParsed);
              if (!currentValidated || currentValidated.rejectedCount > 0) return { ok: false, reason: 'invalid-current' };
              return { ok: true, tasks: currentValidated.tasks };
            }
          });
          if (!committed.ok) {
            const failures = {
              'coordination-unavailable': 'safe cross-tab task coordination is unavailable',
              'invalid-generation': 'the task generation is invalid',
              'generation-invalid': 'the task generation is invalid',
              'generation-unreadable': 'the task generation could not be read',
              'stale-generation': 'Tasks were cleared while this file was being read; select the file again after the clear',
              'lock-failed': 'cross-tab task coordination failed',
              'conflict': 'an imported task conflicts with a newer task from another tab',
              'current-removed': 'the saved task list was removed while import was being prepared',
              'invalid-current': 'the saved task list changed to an unreadable value',
              'storage-read-failed': 'browser storage could not be read',
              'storage-write-failed': 'browser storage rejected the task write'
            };
            throw new Error((failures[committed.reason] || 'the task list could not be updated') + '; nothing was changed');
          }
          addedCount = Array.isArray(committed.addedIds) ? committed.addedIds.length : merge.added.length;
          concurrentDuplicates = Math.max(0, merge.added.length - addedCount);
          notifySaved();
        }
        const parts = [];
        if (addedCount > 0) parts.push('Imported ' + plural(addedCount, 'task') + ' from ' + fileLabel + '.');
        else parts.push('No new tasks were imported from ' + fileLabel + '.');
        const duplicateCount = merge.duplicates + concurrentDuplicates;
        if (duplicateCount > 0) parts.push(plural(duplicateCount, 'duplicate') + ' skipped.');
        if (merge.invalid > 0) parts.push(plural(merge.invalid, 'invalid task') + ' skipped.');
        if (parsed.skippedRows > 0) parts.push(plural(parsed.skippedRows, 'malformed row') + ' skipped.');
        if (parsed.recurring > 0) {
          parts.push(plural(parsed.recurring, 'recurring item') + ' imported once as a one-time task.');
        }
        if (parsed.timezoneDropped > 0) {
          parts.push('Times were kept as written; time zones were not applied.');
        }
        if (parsed.cancelled > 0) parts.push(plural(parsed.cancelled, 'cancelled item') + ' skipped.');
        status(parts.join(' '));
      } catch (error) {
        status('Import failed: ' + (error && error.message ? error.message : 'unknown error') + ' Nothing was changed.');
      }
    }

    if (typeof doc.addEventListener === 'function') {
      doc.addEventListener('change', onChange, true);
    }
    return {
      onChange,
      detach() {
        if (typeof doc.removeEventListener === 'function') doc.removeEventListener('change', onChange, true);
      }
    };
  }

  const api = { attachImportUi, STORAGE_KEY, MAX_IMPORT_FILE_BYTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkImportUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachImportUi({ document, window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
