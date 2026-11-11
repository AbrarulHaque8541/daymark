/*
 * Daymark local-data controls UI wiring for the web prototype.
 *
 * A small network-on-demand card that lists every category this prototype stores in
 * this browser, explains what each clear action removes, and clears exactly the
 * listed keys after an explicit confirmation. No network, no polling, no timers:
 * the scan runs on attach, on the Refresh button, and after each clear. Mirrors
 * the weather/currency module style: attachStorageUi(env) is fully injectable
 * for unit tests.
 */
((root) => {
  'use strict';

  function attachStorageUi(env) {
    if (!env || !env.document) throw new Error('attachStorageUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const storage = env.localStorage || (win && win.localStorage) || null;
    const storageApi = env.storageApi || root.DaymarkStorage || null;
    const confirmImpl = typeof env.confirm === 'function' ? env.confirm
      : (win && typeof win.confirm === 'function' ? (message) => win.confirm(message) : null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const listEl = element('data-list');
    const statusEl = element('data-status');
    const refreshEl = element('data-refresh');
    const clearAllEl = element('data-clear-all');

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function storageAvailable() {
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.removeItem !== 'function') {
        return false;
      }
      try {
        storage.getItem('daymark.data.probe.v1');
        return true;
      } catch (error) {
        return false;
      }
    }

    function render() {
      if (!storageApi) {
        status('Data controls are unavailable in this browser.');
        return;
      }
      if (!listEl || typeof listEl.appendChild !== 'function') return;
      let scan = null;
      try {
        scan = storageApi.scanStorage(storage);
      } catch (error) {
        status('Could not read local data: '
          + (error && error.message ? error.message : 'storage is unavailable.'));
        return;
      }
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
      const make = typeof doc.createElement === 'function'
        ? (tag) => doc.createElement(tag) : () => null;
      for (const category of scan.categories) {
        const row = make('div');
        if (!row) break;
        if (typeof row.setAttribute === 'function') row.setAttribute('class', 'feed-item');
        const title = make('span');
        if (title) {
          if (typeof title.setAttribute === 'function') title.setAttribute('class', 'feed-item-title');
          title.textContent = category.label
            + (category.present ? ' — about ' + storageApi.formatBytes(category.bytes) : ' — not present');
          row.appendChild(title);
        }
        const summary = make('p');
        if (summary) {
          if (typeof summary.setAttribute === 'function') summary.setAttribute('class', 'feed-item-summary');
          summary.textContent = category.description;
          row.appendChild(summary);
        }
        const button = make('button');
        if (button) {
          if (typeof button.setAttribute === 'function') {
            button.setAttribute('class', 'tool-button');
            button.setAttribute('type', 'button');
            button.setAttribute('data-clear-category', category.id);
            button.setAttribute('aria-label', 'Clear ' + category.label + ' from this browser');
          }
          button.textContent = 'Clear';
          button.disabled = !category.present;
          if (typeof button.addEventListener === 'function') {
            button.addEventListener('click', () => { onClearCategory(category.id); });
          }
          row.appendChild(button);
        }
        listEl.appendChild(row);
      }
      status(scan.presentCount === 0
        ? 'No local data is stored yet. Add a task or use a card to see it here.'
        : scan.presentCount + ' of ' + scan.categories.length
          + ' categories hold data on this device (about '
          + storageApi.formatBytes(scan.totalBytes) + ' total).');
      if (clearAllEl) clearAllEl.disabled = scan.presentCount === 0;
    }

    // Returns 'accepted', 'declined', or 'failed'. A failed confirmation prompt
    // must never be reported back to the user as a plain cancellation.
    function confirmOrReport(message) {
      if (!confirmImpl) return 'failed';
      try {
        return confirmImpl(message) ? 'accepted' : 'declined';
      } catch (error) {
        return 'failed';
      }
    }

    function reportFailedConfirmation() {
      status('Could not ask for confirmation. Nothing was cleared.');
    }

    function setBusy(busy) {
      if (clearAllEl) {
        clearAllEl.disabled = busy;
        if (typeof clearAllEl.classList !== 'undefined') {
          clearAllEl.classList.toggle('is-busy', busy);
        }
      }
      if (refreshEl) {
        refreshEl.disabled = busy;
        if (typeof refreshEl.classList !== 'undefined') {
          refreshEl.classList.toggle('is-busy', busy);
        }
      }
      if (listEl) listEl.setAttribute('aria-busy', busy ? 'true' : 'false');
      if (typeof doc.querySelectorAll === 'function') {
        doc.querySelectorAll('#data-list .tool-button').forEach(btn => {
          if (btn) {
            btn.disabled = busy;
            if (typeof btn.classList !== 'undefined') {
              btn.classList.toggle('is-busy', busy);
            }
          }
        });
      }
    }

    function onClearCategory(categoryId) {
      if (!storageApi || !storageAvailable()) {
        status('Browser storage is unavailable. Nothing was cleared.');
        return;
      }
      const category = storageApi.categoryById(categoryId);
      if (!category) {
        status('Unknown data category. Nothing was cleared.');
        return;
      }
      const outcome = confirmOrReport('Clear ' + category.label + '? '
        + category.description + ' This cannot be undone.');
      if (outcome === 'failed') {
        reportFailedConfirmation();
        return;
      }
      if (outcome === 'declined') {
        status('Cancelled. Nothing was cleared.');
        return;
      }
      setBusy(true);
      let result = null;
      try {
        result = storageApi.clearCategory(storage, categoryId);
      } catch (error) {
        setBusy(false);
        status('Could not clear ' + category.label + ': '
          + (error && error.message ? error.message : 'storage is unavailable.'));
        return;
      }
      setBusy(false);
      if (result.failed.length > 0) {
        const message = 'Cleared ' + category.label + ', but ' + result.failed.length
          + ' item(s) could not be removed by the browser.';
        render();
        status(message);
      } else {
        const message = 'Cleared ' + category.label + ' (' + result.removed.length
          + ' item(s) removed). Nothing else was touched.';
        render();
        status(message);
      }
    }

    function onClearAll() {
      if (!storageApi || !storageAvailable()) {
        status('Browser storage is unavailable. Nothing was cleared.');
        return;
      }
      const outcome = confirmOrReport('Clear ALL local Daymark data in this browser? '
        + 'Tasks, Focus history, caches, webhook settings, and queued events will be removed. '
        + 'This cannot be undone.');
      if (outcome === 'failed') {
        reportFailedConfirmation();
        return;
      }
      if (outcome === 'declined') {
        status('Cancelled. Nothing was cleared.');
        return;
      }
      setBusy(true);
      let result = null;
      try {
        result = storageApi.clearAll(storage);
      } catch (error) {
        setBusy(false);
        status('Could not clear all data: '
          + (error && error.message ? error.message : 'storage is unavailable.'));
        return;
      }
      setBusy(false);
      if (result.failedKeys.length > 0) {
        const message = 'Cleared ' + result.removedKeys.length + ' item(s), but '
          + result.failedKeys.length + ' item(s) could not be removed by the browser.';
        render();
        status(message);
      } else {
        const message = 'Cleared all ' + result.removedKeys.length
          + ' stored item(s). Nothing outside this browser was affected.';
        render();
        status(message);
      }
    }

    if (refreshEl && typeof refreshEl.addEventListener === 'function') {
      refreshEl.addEventListener('click', () => { render(); });
    }
    if (clearAllEl && typeof clearAllEl.addEventListener === 'function') {
      clearAllEl.addEventListener('click', () => { onClearAll(); });
    }

    render();

    return {
      render,
      onClearCategory,
      onClearAll,
      detach() {
        // No document-level listener is registered; element references are
        // dropped when the returned handle goes out of scope.
        if (clearAllEl) clearAllEl.disabled = false;
      }
    };
  }

  const api = { attachStorageUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkStorageUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachStorageUi({ document, window, localStorage: window.localStorage });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
