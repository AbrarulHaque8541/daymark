/*
 * Daymark export UI wiring for the web prototype.
 *
 * Adds an open-format export (Markdown / CSV / iCalendar) alongside the
 * existing JSON backup button. The format picker (#export-format) defaults
 * to "json", in which case this module stays out of the way and app.js
 * handles the click exactly as before.
 *
 * Remembers the last chosen format across sessions (localStorage).
 * Provides visible status feedback via #export-status.
 *
 * The click handler is registered on the document in the CAPTURE phase so it
 * can intercept open-format exports before app.js's JSON handler.
 */
((root) => {
  'use strict';

  const STORAGE_KEY = 'daymark.tasks.v1';
  const FORMAT_STORAGE_KEY = 'daymark.export.format.v1';
  const VALID_FORMATS = ['json', 'markdown', 'csv', 'ics'];

  function attachExportUi(env) {
    if (!env || !env.document) throw new Error('attachExportUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const storage = env.localStorage || (win && win.localStorage) || null;
    const exportApi = env.exportApi || root.DaymarkExport || null;
    const logic = env.logic || root.DaymarkLogic || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();

    function status(message) {
      let el = typeof doc.getElementById === 'function' ? doc.getElementById('export-status') : null;
      if (!el && typeof doc.createElement === 'function') {
        el = doc.createElement('span');
        el.id = 'export-status';
        el.className = 'import-status';
        if (typeof el.setAttribute === 'function') el.setAttribute('role', 'status');
        const parent = doc.body || doc.documentElement;
        if (parent && typeof parent.appendChild === 'function') parent.appendChild(el);
      }
      if (el) {
        el.textContent = message || '';
        el.classList.toggle('is-empty', !message);
      }
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

    function persistFormat(format) {
      if (!storage || typeof storage.setItem !== 'function') return;
      if (VALID_FORMATS.indexOf(format) === -1) return;
      try { storage.setItem(FORMAT_STORAGE_KEY, format); } catch (e) { /* ignore */ }
    }

    function restoreFormat() {
      if (!storage || typeof storage.getItem !== 'function') return;
      let saved = null;
      try { saved = storage.getItem(FORMAT_STORAGE_KEY); } catch (e) { return; }
      if (typeof saved !== 'string' || VALID_FORMATS.indexOf(saved) === -1) return;
      const select = typeof doc.getElementById === 'function' ? doc.getElementById('export-format') : null;
      if (select) select.value = saved;
    }

    function exportButtonOf(target) {
      if (!target) return null;
      if (typeof target.closest === 'function') return target.closest('#export-tasks');
      return target.id === 'export-tasks' ? target : null;
    }

    function onFormatChange() {
      persistFormat(currentFormat());
    }

    function onClick(event) {
      if (!exportButtonOf(event && event.target)) return;
      const format = currentFormat();
      persistFormat(format);
      if (!exportApi || !exportApi.isFormat(format)) return; // JSON backup stays with app.js
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      const button = exportButtonOf(event.target);
      if (button && button.classList) button.classList.add('is-busy');
      try {
        if (!logic || typeof logic.validateStoredTasks !== 'function') {
          throw new Error('task logic is unavailable');
        }
        const raw = storage && typeof storage.getItem === 'function' ? storage.getItem(STORAGE_KEY) : null;
        const parsed = raw ? JSON.parse(raw) : [];
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
      } finally {
        if (button && button.classList) button.classList.remove('is-busy');
      }
    }

    restoreFormat();
    const select = typeof doc.getElementById === 'function' ? doc.getElementById('export-format') : null;
    if (select && typeof select.addEventListener === 'function') {
      select.addEventListener('change', onFormatChange);
    }
    if (typeof doc.addEventListener === 'function') {
      doc.addEventListener('click', onClick, true);
    }
    return {
      onClick,
      detach() {
        if (typeof doc.removeEventListener === 'function') doc.removeEventListener('click', onClick, true);
        if (select && typeof select.removeEventListener === 'function') {
          select.removeEventListener('change', onFormatChange);
        }
      }
    };
  }

  const api = { attachExportUi, STORAGE_KEY, FORMAT_STORAGE_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkExportUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachExportUi({ document, window, localStorage: window.localStorage });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
