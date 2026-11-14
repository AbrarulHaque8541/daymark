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
    const mutation = env.taskMutationApi || root.DaymarkTaskMutation || null;
    let lockManager = env.lockManager || null;
    try { lockManager = lockManager || (win && win.navigator && win.navigator.locks) || null; }
    catch (error) { lockManager = null; }
    const importApi = env.importApi || root.DaymarkImport || null;
    const logic = env.logic || root.DaymarkLogic || null;
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
        if (!mutation || typeof mutation.readGeneration !== 'function'
            || typeof mutation.commitTaskSnapshot !== 'function' || !lockManager) {
          throw new Error('cross-tab task storage coordination is unavailable');
        }
        const startingGeneration = mutation.readGeneration(storage);
        if (!startingGeneration.ok) throw new Error('task storage generation is unreadable');
        if (typeof file.size === 'number' && file.size > MAX_IMPORT_FILE_BYTES) {
          throw new Error('the file is larger than the 8 MB import limit');
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
        if (!logic || typeof logic.validateStoredTasks !== 'function') {
          throw new Error('task logic is unavailable');
        }
        const raw = storage && typeof storage.getItem === 'function' ? storage.getItem(STORAGE_KEY) : null;
        let stored = [];
        if (raw) {
          stored = JSON.parse(raw);
          if (!Array.isArray(stored)) throw new Error('saved tasks are unreadable; nothing was changed');
        }
        const validated = logic.validateStoredTasks(stored);
        const merge = importApi.mergeTasks(validated.tasks, parsed.tasks, logic);
        if (merge.added.length > 0) {
          const result = await mutation.commitTaskSnapshot({
            storage,
            lockManager,
            baseTasks: validated.tasks,
            desiredTasks: merge.merged,
            expectedGeneration: startingGeneration.value.generation,
            expectedClearEpoch: startingGeneration.value.clearEpoch,
            validateTasks: logic.validateStoredTasks
          });
          if (!result.ok) {
            if (result.reason === 'cleared') throw new Error('local data was cleared while this file was being read; nothing was imported');
            if (result.reason === 'conflict') throw new Error('a task changed in another tab; nothing was imported');
            throw new Error('tasks could not be saved safely; nothing was imported');
          }
          notifySaved();
        }
        const parts = [];
        if (merge.added.length > 0) parts.push('Imported ' + plural(merge.added.length, 'task') + ' from ' + fileLabel + '.');
        else parts.push('No new tasks were imported from ' + fileLabel + '.');
        if (merge.duplicates > 0) parts.push(plural(merge.duplicates, 'duplicate') + ' skipped.');
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
    const boot = () => attachImportUi({ document, window, localStorage: window.localStorage });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
