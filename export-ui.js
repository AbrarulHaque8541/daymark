/*
 * Daymark export UI wiring for the web prototype.
 *
 * Adds an open-format export (Markdown / CSV / iCalendar) alongside the
 * existing JSON backup button. The format picker (#export-format) defaults
 * to "json", in which case this module stays out of the way and app.js
 * handles the click exactly as before.
 *
 * The click handler is registered on the document in the CAPTURE phase:
 * at-target listeners fire in registration order and app.js registers its
 * Export handler first, so only an ancestor capture listener can take
 * precedence when an open format is selected.
 */
((root) => {
  'use strict';

  const STORAGE_KEY = 'daymark.tasks.v1';

  function attachExportUi(env) {
    if (!env || !env.document) throw new Error('attachExportUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    let storage = null;
    let storageAccessFailed = false;
    try {
      storage = Object.prototype.hasOwnProperty.call(env, 'localStorage')
        ? env.localStorage
        : (win && win.localStorage) || null;
    } catch (error) {
      storageAccessFailed = true;
    }
    const exportApi = env.exportApi || root.DaymarkExport || null;
    const logic = env.logic || root.DaymarkLogic || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();

    function status(message) {
      let el = typeof doc.getElementById === 'function' ? doc.getElementById('export-status') : null;
      if (!el && typeof doc.createElement === 'function') {
        el = doc.createElement('span');
        el.id = 'export-status';
        el.className = 'sr-only';
        if (typeof el.setAttribute === 'function') el.setAttribute('role', 'status');
        const parent = doc.body || doc.documentElement;
        if (parent && typeof parent.appendChild === 'function') parent.appendChild(el);
      }
      if (el) el.textContent = message;
      return el;
    }

    function download(filename, mime, text) {
      if (typeof doc.createElement !== 'function') throw new Error('unsupported');
      const link = doc.createElement('a');
      link.href = 'data:' + mime + ',' + encodeURIComponent(text);
      link.download = filename;
      doc.body.appendChild(link);
      link.click();
      link.remove();
    }

    function currentFormat() {
      const select = typeof doc.getElementById === 'function' ? doc.getElementById('export-format') : null;
      return select && typeof select.value === 'string' ? select.value : 'json';
    }

    function exportButtonOf(target) {
      if (!target) return null;
      if (typeof target.closest === 'function') return target.closest('#export-tasks');
      return target.id === 'export-tasks' ? target : null;
    }

    function onClick(event) {
      if (!exportButtonOf(event && event.target)) return;
      const format = currentFormat();
      if (!exportApi || !exportApi.isFormat(format)) return; // JSON backup stays with app.js
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      try {
        if (!logic || typeof logic.validateStoredTasks !== 'function'
          || typeof logic.hasDuplicateJsonKeys !== 'function') {
          throw new Error('task logic is unavailable');
        }
        if (storageAccessFailed || !storage || typeof storage.getItem !== 'function') {
          throw new Error('browser storage is unavailable; no data was exported');
        }
        const raw = storage.getItem(STORAGE_KEY);
        if (raw !== null && logic.hasDuplicateJsonKeys(raw)) {
          throw new Error('saved tasks contain duplicate JSON keys; no data was exported');
        }
        const parsed = raw === null ? [] : JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          throw new Error('saved tasks are unreadable; no data was exported');
        }
        const validated = logic.validateStoredTasks(parsed);
        const generatedAt = now();
        const output = exportApi.render(format, validated.tasks, { generatedAt });
        const dateStr = generatedAt.slice(0, 10);
        download(exportApi.fileName(format, dateStr), exportApi.mimeType(format), output);
        const skipped = validated.rejectedCount > 0
          ? ` (${validated.rejectedCount} malformed task${validated.rejectedCount === 1 ? '' : 's'} skipped)`
          : '';
        status(`Exported ${validated.tasks.length} task${validated.tasks.length === 1 ? '' : 's'} as ${format.toUpperCase()}${skipped}.`);
      } catch (error) {
        status('Export failed: ' + (error && error.message ? error.message : 'unknown error'));
      }
    }

    if (typeof doc.addEventListener === 'function') {
      doc.addEventListener('click', onClick, true);
    }
    return {
      onClick,
      detach() {
        if (typeof doc.removeEventListener === 'function') doc.removeEventListener('click', onClick, true);
      }
    };
  }

  const api = { attachExportUi, STORAGE_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkExportUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachExportUi({ document, window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
