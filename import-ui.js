/*
 * Daymark open-format import UI wiring for the web prototype.
 *
 * Extends the existing #import-tasks flow: JSON backups keep flowing to the
 * built-in app.js handler untouched; a selected .csv or .md file is
 * intercepted first (capture-phase change listener on the document fires
 * before app.js's at-target listener) and parsed by import-logic.js. Parsed
 * tasks are merged into daymark.tasks.v1: existing ids win, invalid rows are
 * skipped, and every skip is reported honestly in a status line. After a
 * successful save a synthesized storage event asks app.js to reload tasks so
 * imported rows appear immediately. Fully offline: no network, no timers.
 *
 * Cycle B polish: visible #import-status (aria-live), busy/press state on
 * #import-tasks while reading/parsing, glass-friendly status chip.
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
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    let idCounter = 0;
    const makeId = () => {
      idCounter += 1;
      return 'import-' + String(Date.parse(now())) + '-' + String(idCounter);
    };

    function importButton() {
      return typeof doc.getElementById === 'function' ? doc.getElementById('import-tasks') : null;
    }

    function setBusy(isBusy) {
      const btn = importButton();
      if (!btn) return;
      if (typeof btn.classList === 'object' && btn.classList) {
        if (isBusy) {
          if (typeof btn.classList.add === 'function') btn.classList.add('is-busy');
        } else if (typeof btn.classList.remove === 'function') {
          btn.classList.remove('is-busy');
        }
      } else if (typeof btn.className === 'string') {
        if (isBusy && btn.className.indexOf('is-busy') === -1) {
          btn.className = (btn.className + ' is-busy').trim();
        } else if (!isBusy) {
          btn.className = btn.className.replace(/\bis-busy\b/g, '').replace(/\s+/g, ' ').trim();
        }
      }
      if (typeof btn.setAttribute === 'function') {
        btn.setAttribute('aria-busy', isBusy ? 'true' : 'false');
        if (isBusy) btn.setAttribute('disabled', 'disabled');
        else if (typeof btn.removeAttribute === 'function') btn.removeAttribute('disabled');
      }
      if ('disabled' in btn) btn.disabled = !!isBusy;
    }

    function status(message, kind) {
      let el = typeof doc.getElementById === 'function' ? doc.getElementById('import-status') : null;
      if (!el && typeof doc.createElement === 'function') {
        el = doc.createElement('p');
        el.id = 'import-status';
        el.className = 'import-status';
        if (typeof el.setAttribute === 'function') {
          el.setAttribute('role', 'status');
          el.setAttribute('aria-live', 'polite');
        }
        const tools = typeof doc.getElementById === 'function' ? doc.getElementById('task-tools') : null;
        const parent = (tools && tools.parentNode) || doc.body || doc.documentElement;
        if (parent && typeof parent.appendChild === 'function') {
          if (tools && typeof tools.insertAdjacentElement === 'function') {
            tools.insertAdjacentElement('afterend', el);
          } else if (tools && tools.parentNode && typeof tools.parentNode.insertBefore === 'function') {
            tools.parentNode.insertBefore(el, tools.nextSibling);
          } else {
            parent.appendChild(el);
          }
        }
      }
      if (el) {
        el.textContent = message || '';
        if (typeof el.setAttribute === 'function') {
          if (kind) el.setAttribute('data-kind', kind);
          else if (typeof el.removeAttribute === 'function') el.removeAttribute('data-kind');
        }
        if (typeof el.hidden !== 'undefined') el.hidden = !message;
        if (typeof el.classList === 'object' && el.classList && typeof el.classList.toggle === 'function') {
          el.classList.toggle('is-empty', !message);
          el.classList.toggle('is-error', kind === 'error');
          el.classList.toggle('is-success', kind === 'success');
        }
      }
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

    function notifySaved() {
      try {
        if (win && typeof win.StorageEvent === 'function' && typeof win.dispatchEvent === 'function') {
          win.dispatchEvent(new win.StorageEvent('storage', { key: STORAGE_KEY }));
        }
      } catch (error) {}
    }

    function plural(count, singular) {
      return count === 1 ? '1 ' + singular : count + ' ' + singular + 's';
    }

    async function onChange(event) {
      const target = event && event.target;
      if (!target || target.id !== 'import-file') return;
      const file = target.files && target.files[0];
      const format = importApi && file ? importApi.formatFromFileName(file.name) : null;
      if (!file || format === null) return;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      try { target.value = ''; } catch (error) {}
      const fileLabel = typeof file.name === 'string' && file.name ? file.name : 'the selected file';
      setBusy(true);
      status('Importing from ' + fileLabel + '...', 'busy');
      try {
        if (typeof file.size === 'number' && file.size > MAX_IMPORT_FILE_BYTES) {
          throw new Error('the file is larger than the 8 MB import limit');
        }
        const text = await readText(file);
        const parsed = format === 'csv'
          ? importApi.fromCsv(text, { now: now(), makeId })
          : importApi.fromMarkdown(text, { now: now(), makeId });
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
          if (!storage || typeof storage.setItem !== 'function') {
            throw new Error('browser storage is unavailable; nothing was changed');
          }
          storage.setItem(STORAGE_KEY, JSON.stringify(merge.merged));
          notifySaved();
        }
        const parts = [];
        if (merge.added.length > 0) parts.push('Imported ' + plural(merge.added.length, 'task') + ' from ' + fileLabel + '.');
        else parts.push('No new tasks were imported from ' + fileLabel + '.');
        if (merge.duplicates > 0) parts.push(plural(merge.duplicates, 'duplicate') + ' skipped.');
        if (merge.invalid > 0) parts.push(plural(merge.invalid, 'invalid task') + ' skipped.');
        if (parsed.skippedRows > 0) parts.push(plural(parsed.skippedRows, 'malformed row') + ' skipped.');
        status(parts.join(' '), merge.added.length > 0 ? 'success' : 'idle');
      } catch (error) {
        status('Import failed: ' + (error && error.message ? error.message : 'unknown error') + ' Nothing was changed.', 'error');
      } finally {
        setBusy(false);
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
