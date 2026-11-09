/*
 * Daymark local-data controls UI wiring for the web prototype.
 *
 * A small offline-first card that lists every category this prototype stores in
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
    let storage = null;
    let storageAccessFailed = Boolean(env.storageAccessFailed);
    try {
      if (!storageAccessFailed) {
        storage = env.localStorage !== undefined
          ? env.localStorage
          : ((win && win.localStorage) || null);
      }
    } catch (error) {
      storageAccessFailed = true;
    }
    const storageApi = env.storageApi || root.DaymarkStorage || null;
    const taskMutation = env.taskMutation || root.DaymarkTaskMutation || null;
    const lockManager = env.lockManager || (win && win.navigator && win.navigator.locks) || null;
    const confirmImpl = typeof env.confirm === 'function' ? env.confirm
      : (win && typeof win.confirm === 'function' ? (message) => win.confirm(message) : null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const listEl = element('storage-list');
    const statusEl = element('storage-status-line');
    const refreshEl = element('storage-check');
    const clearStatusEl = element('storage-clear');
    const clearAllEl = element('storage-clear-all');

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function storageAvailable() {
      if (storageAccessFailed
        || !storage || typeof storage.getItem !== 'function' || typeof storage.removeItem !== 'function') {
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
      if (storageAccessFailed) {
        while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
        if (clearAllEl) clearAllEl.disabled = true;
        status('Browser storage could not be accessed. Local data status is unknown; nothing was changed.');
        return;
      }
      let scan = null;
      try {
        scan = storageApi.scanStorage(storage);
      } catch (error) {
        // A failed rescan must not leave old sizes or destructive controls visible.
        while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
        if (clearAllEl) clearAllEl.disabled = true;
        if (typeof listEl.setAttribute === 'function') listEl.setAttribute('aria-busy', 'false');
        status('Could not read local data. Local data status is unknown; nothing was changed.');
        return;
      }
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
      const make = typeof doc.createElement === 'function'
        ? (tag) => doc.createElement(tag) : () => null;
      for (const category of scan.categories) {
        const row = make('div');
        if (!row) break;
        if (typeof row.setAttribute === 'function') row.setAttribute('class', 'feed-item');
        const unreadableCount = Array.isArray(category.unreadableKeys)
          ? category.unreadableKeys.length : 0;
        const title = make('span');
        if (title) {
          if (typeof title.setAttribute === 'function') title.setAttribute('class', 'feed-item-title');
          let state = ' — not present';
          if (unreadableCount > 0) {
            state = category.present
              ? ' — partially readable (about ' + storageApi.formatBytes(category.bytes) + ')'
              : ' — status unknown (could not read)';
          } else if (category.present) {
            state = ' — about ' + storageApi.formatBytes(category.bytes);
          }
          title.textContent = category.label + state;
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
          // Allow an explicit retry for unknown data; clearCategory itself still
          // fails closed when it cannot read the key before attempting removal.
          button.disabled = !category.present && unreadableCount === 0;
          if (typeof button.addEventListener === 'function') {
            button.addEventListener('click', () => { onClearCategory(category.id); });
          }
          row.appendChild(button);
        }
        listEl.appendChild(row);
      }
      const unreadableCount = Number.isInteger(scan.unreadableCount) ? scan.unreadableCount : 0;
      if (unreadableCount > 0) {
        const known = scan.presentCount === 0
          ? 'No readable local data was found'
          : scan.presentCount + ' of ' + scan.categories.length + ' categories hold readable data (about '
            + storageApi.formatBytes(scan.totalBytes) + ' total)';
        status(known + '; ' + unreadableCount
          + ' categories could not be checked. Reported sizes exclude unreadable entries.');
      } else if (scan.presentCount === 0) {
        status('No local data is stored yet. Add a task or use a card to see it here.');
      } else {
        status(scan.presentCount + ' of ' + scan.categories.length
          + ' categories hold data on this device (about '
          + storageApi.formatBytes(scan.totalBytes) + ' total).');
      }
      if (clearAllEl) clearAllEl.disabled = scan.presentCount === 0 || unreadableCount > 0;
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
        doc.querySelectorAll('#storage-list .tool-button').forEach(btn => {
          if (btn) {
            btn.disabled = busy;
            if (typeof btn.classList !== 'undefined') {
              btn.classList.toggle('is-busy', busy);
            }
          }
        });
      }
    }

    function notifyTaskStorageChange(key) {
      if (!win || typeof win.dispatchEvent !== 'function') return;
      try {
        let event = null;
        if (typeof win.StorageEvent === 'function') {
          event = new win.StorageEvent('storage', { key });
        } else if (typeof win.Event === 'function') {
          event = new win.Event('storage');
          Object.defineProperty(event, 'key', { value: key });
        }
        if (event) win.dispatchEvent(event);
      } catch (error) {
        // The destructive action is already complete; a later page reload
        // still observes the canonical storage state if notification fails.
      }
    }

    function finishCategoryClear(result, category) {
      if (result.removed.length > 0 && (category.id === 'tasks' || category.id === 'task-backup')) {
        notifyTaskStorageChange(category.id === 'tasks' ? 'daymark.tasks.v1' : null);
      }
      if (result.failed.length > 0) {
        const message = result.removed.length === 0
          ? 'Could not clear ' + category.label + ': ' + result.failed.length
            + ' item(s) could not be checked or removed. Nothing was cleared.'
          : 'Cleared ' + category.label + ' (' + result.removed.length
            + ' item(s) removed), but ' + result.failed.length
            + ' item(s) could not be removed by the browser.';
        render();
        status(message);
      } else if (result.removed.length === 0) {
        render();
        status('No stored data was found for ' + category.label + '. Nothing was changed.');
      } else {
        const message = 'Cleared ' + category.label + ' (' + result.removed.length
          + ' item(s) removed). Nothing else was touched.';
        render();
        status(message);
      }
    }

    function onClearCategory(categoryId) {
      if (!storageApi || !storageAvailable()) {
        status('Browser storage is unavailable. Nothing was cleared.');
        return false;
      }
      const category = storageApi.categoryById(categoryId);
      if (!category) {
        status('Unknown data category. Nothing was cleared.');
        return false;
      }
      const outcome = confirmOrReport('Clear ' + category.label + '? '
        + category.description + ' This cannot be undone.');
      if (outcome === 'failed') {
        reportFailedConfirmation();
        return false;
      }
      if (outcome === 'declined') {
        status('Cancelled. Nothing was cleared.');
        return false;
      }
      setBusy(true);

      const clear = () => storageApi.clearCategory(storage, categoryId);
      if (categoryId === 'tasks' || categoryId === 'task-backup') {
        if (!taskMutation || typeof taskMutation.withTaskMutationLock !== 'function') {
          setBusy(false);
          status('Cannot safely clear task data: cross-tab coordination is unavailable. Nothing was cleared.');
          return Promise.resolve(false);
        }
        return taskMutation.withTaskMutationLock(lockManager, clear).then((locked) => {
          setBusy(false);
          if (!locked.ok) {
            status('Could not safely clear ' + category.label + ': '
              + (locked.reason === 'coordination-unavailable'
                ? 'cross-tab coordination is unavailable. Nothing was cleared.'
                : 'the shared task lock failed. Nothing was cleared.'));
            return false;
          }
          finishCategoryClear(locked.value, category);
          return true;
        });
      }

      let result = null;
      try {
        result = clear();
      } catch (error) {
        setBusy(false);
        status('Could not clear ' + category.label + ': '
          + (error && error.message ? error.message : 'storage is unavailable.'));
        return false;
      }
      setBusy(false);
      finishCategoryClear(result, category);
      return true;
    }

    async function onClearAll() {
      if (!storageApi || !storageAvailable()) {
        status('Browser storage is unavailable. Nothing was cleared.');
        return;
      }
      let scan = null;
      try {
        scan = storageApi.scanStorage(storage);
      } catch (error) {
        status('Could not verify local data. Nothing was cleared.');
        return;
      }
      if (!scan || scan.complete !== true) {
        status('Cannot clear all local data while some categories are unreadable. Nothing was cleared.');
        return;
      }
      const outcome = confirmOrReport('Clear ALL local Daymark data in this browser? '
        + 'Tasks, Focus history, the Focus Timer preset, cached data, saved Wikipedia/weather/holiday/currency and browser-search preferences, the remembered browser download journey, the saved browser proxy profile, the legacy webhook coordination lock, and queued events will be removed. The secret-bearing legacy endpoint is excluded and handled without reading. '
        + 'This cannot be undone.');
      if (outcome === 'failed') {
        reportFailedConfirmation();
        return;
      }
      if (outcome === 'declined') {
        status('Cancelled. Nothing was cleared.');
        return;
      }
      if (!taskMutation || typeof taskMutation.withTaskMutationLock !== 'function') {
        status('Cannot safely clear all data: cross-tab task coordination is unavailable. Nothing was cleared.');
        return false;
      }
      setBusy(true);
      const locked = await taskMutation.withTaskMutationLock(lockManager, () => storageApi.clearAll(storage));
      setBusy(false);
      if (!locked.ok) {
        status('Could not safely clear all data: '
          + (locked.reason === 'coordination-unavailable'
            ? 'cross-tab task coordination is unavailable. Nothing was cleared.'
            : 'the shared task lock failed. Nothing was cleared.'));
        return false;
      }
      const result = locked.value;
      if (result.removedKeys.length > 0) notifyTaskStorageChange(null);
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
    if (clearStatusEl && typeof clearStatusEl.addEventListener === 'function') {
      clearStatusEl.addEventListener('click', () => { status(''); });
    }
    if (clearAllEl && typeof clearAllEl.addEventListener === 'function') {
      clearAllEl.addEventListener('click', () => onClearAll());
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
    const boot = () => {
      let localStorage = null;
      let storageAccessFailed = false;
      try {
        localStorage = window.localStorage;
      } catch (error) {
        storageAccessFailed = true;
      }
      attachStorageUi({ document, window, localStorage, storageAccessFailed });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
