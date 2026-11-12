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
    const injectedStorage = Object.prototype.hasOwnProperty.call(env, 'localStorage')
      && env.storageAccessFailed !== true;
    let storage = null;
    let storageAccessFailed = env.storageAccessFailed === true;

    function acquireStorage() {
      try {
        storage = injectedStorage
          ? env.localStorage : (win && win.localStorage) || null;
        storageAccessFailed = false;
        return Boolean(storage && typeof storage.getItem === 'function'
          && typeof storage.removeItem === 'function');
      } catch (error) {
        storage = null;
        storageAccessFailed = true;
        return false;
      }
    }

    // The browser boot adapter may already have observed a throwing getter.
    // Keep the initial state unknown until the user explicitly retries.
    if (!storageAccessFailed) acquireStorage();
    const storageApi = env.storageApi || root.DaymarkStorage || null;
    // Optional coordinated modules. Prefer an injected handle for tests; fall
    // back to the live page module so Clear All cannot leave memory-only
    // webhook events deliverable after a successful durable clear (issue #689).
    const webhookUi = Object.prototype.hasOwnProperty.call(env, 'webhookUi')
      ? env.webhookUi
      : (root.DaymarkWebhookUi || null);
    const confirmImpl = typeof env.confirm === 'function' ? env.confirm
      : (win && typeof win.confirm === 'function' ? (message) => win.confirm(message) : null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    // The live page uses the storage-* ids; the data-* ids remain supported for
    // the unit tests and any legacy host markup. The destructive control is
    // resolved ONLY from the dedicated clear-all ids: a visible "Clear status"
    // button must never fall back to the destructive handler (issue #740).
    const listEl = element('storage-list') || element('data-list');
    const statusEl = element('storage-status-line') || element('data-status');
    const refreshEl = element('storage-check') || element('data-refresh');
    const clearStatusEl = element('storage-clear');
    const clearAllEl = element('storage-clear-all') || element('data-clear-all');

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function storageAvailable() {
      if (storageAccessFailed) return false;
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.removeItem !== 'function') {
        return false;
      }
      try {
        storage.getItem('daymark.data.probe.v1');
        return true;
      } catch (error) {
        storageAccessFailed = true;
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
        status('Could not read local data: Browser storage is unavailable.');
        if (clearAllEl) clearAllEl.disabled = true;
        if (clearStatusEl) clearStatusEl.disabled = true;
        if (refreshEl) refreshEl.disabled = false;
        return;
      }
      if (!storageAvailable()) {
        while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
        status('Could not read local data: Browser storage is unavailable.');
        if (clearAllEl) clearAllEl.disabled = true;
        if (clearStatusEl) clearStatusEl.disabled = true;
        return;
      }
      const scan = storageApi.scanStorage(storage);
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
      let unreadableCount = 0;
      for (const row of scan.rows) {
        const li = doc.createElement('li');
        li.className = 'storage-row';
        const label = doc.createElement('div');
        label.className = 'storage-row-label';
        const title = doc.createElement('strong');
        title.textContent = row.label;
        label.appendChild(title);
        const desc = doc.createElement('span');
        desc.textContent = row.description;
        label.appendChild(desc);
        li.appendChild(label);
        const meta = doc.createElement('div');
        meta.className = 'storage-row-meta';
        if (row.unreadable) {
          unreadableCount += 1;
          meta.textContent = 'Unreadable';
          meta.classList.add('is-warning');
        } else if (row.present) {
          meta.textContent = storageApi.formatBytes(row.bytes) + ' · present';
        } else {
          meta.textContent = 'Empty';
        }
        li.appendChild(meta);
        const clearBtn = doc.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'storage-clear-category';
        clearBtn.dataset.category = row.id;
        clearBtn.textContent = 'Clear';
        clearBtn.disabled = !row.present || row.unreadable;
        clearBtn.addEventListener('click', () => { onClearCategory(row.id); });
        li.appendChild(clearBtn);
        listEl.appendChild(li);
      }
      if (clearAllEl) clearAllEl.disabled = scan.presentCount === 0 || unreadableCount > 0;
      if (clearStatusEl) clearStatusEl.disabled = false;
      if (unreadableCount > 0) {
        status('Some items could not be read. Clear is blocked until storage is readable.');
      } else if (scan.presentCount === 0) {
        status('No managed Daymark data is stored in this browser.');
      } else {
        status(scan.presentCount + ' category group(s) hold data on this device (' +
          storageApi.formatBytes(scan.totalBytes) + ').');
      }
    }

    function setBusy(busy) {
      if (refreshEl) refreshEl.disabled = busy;
      if (clearStatusEl) clearStatusEl.disabled = busy;
      if (clearAllEl) {
        clearAllEl.disabled = busy;
        if (typeof clearAllEl.classList !== 'undefined') {
          clearAllEl.classList.toggle('is-busy', busy);
        }
      }
      if (listEl) {
        const buttons = listEl.querySelectorAll('button');
        for (const button of buttons) button.disabled = busy;
      }
    }

    function confirmOrReport(message) {
      if (typeof confirmImpl !== 'function') return 'failed';
      try {
        return confirmImpl(message) ? 'accepted' : 'declined';
      } catch (error) {
        return 'failed';
      }
    }

    function reportFailedConfirmation() {
      status('Could not confirm the clear action in this browser. Nothing was cleared.');
    }

    function onClearCategory(categoryId) {
      if (!storageApi || !storageAvailable()) {
        status('Browser storage is unavailable. Nothing was cleared.');
        return;
      }
      const category = storageApi.categoryById(categoryId);
      if (!category) {
        status('Unknown data category.');
        return;
      }
      const outcome = confirmOrReport('Clear ' + category.label + '? ' + category.description +
        ' This cannot be undone.');
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
        const message = result.removed.length === 0
          ? 'Could not clear ' + category.label + ': the browser blocked removal.'
          : 'Cleared part of ' + category.label + ' (' + result.removed.length
            + ' item(s) removed). Nothing else was touched.';
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
      const outcome = confirmOrReport('Clear all managed Daymark data in this browser? '
        + 'Tasks and recovery backups, Focus sessions and history, saved card and browser preferences '
        + '(including the Telegram chat target), caches, browser download state, and queued webhook events '
        + 'will be removed. The legacy secret-bearing webhook endpoint is never inspected by this card. '
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

      // After durable keys are cleared, invalidate in-memory webhook state so a
      // later online/Retry path cannot deliver pre-clear memory-only events
      // (issue #689). Also advance the task generation fence so a stale tab
      // cannot resurrect cleared tasks (issue #683).
      let legacyCleanupFailed = false;
      if (result && result.failedKeys.length === 0) {
        try {
          if (webhookUi && typeof webhookUi.resetQueueAfterExternalClear === 'function') {
            const reset = webhookUi.resetQueueAfterExternalClear();
            if (reset && reset.legacyCleanupFailed === true) legacyCleanupFailed = true;
          }
        } catch (error) {
          // Webhook reset must not undo a successful durable clear; surface it.
          legacyCleanupFailed = true;
        }
        try {
          bumpTaskGeneration(storage);
        } catch (error) {
          // Generation fence is best-effort coordination metadata.
        }
      }

      setBusy(false);
      if (result.failedKeys.length > 0) {
        const unreadableKeys = Array.isArray(result.unreadableKeys) ? result.unreadableKeys : [];
        const message = result.removedKeys.length === 0
          ? unreadableKeys.length > 0
            ? 'Could not clear all data: ' + unreadableKeys.length
              + ' item(s) could not be read. Nothing was cleared.'
            : 'Could not clear all data: ' + result.failedKeys.length
              + ' item(s) could not be removed by the browser. Nothing was cleared.'
          : 'Cleared ' + result.removedKeys.length + ' item(s), but '
            + result.failedKeys.length + ' item(s) could not be removed by the browser.';
        render();
        status(message);
      } else if (legacyCleanupFailed) {
        const message = 'Cleared all ' + result.removedKeys.length
          + ' stored item(s), but a legacy secret-bearing webhook endpoint could not be removed. '
          + 'Clear this site\'s browser data to finish cleanup. Nothing outside this browser was affected.';
        render();
        status(message);
      } else {
        const message = 'Cleared all ' + result.removedKeys.length
          + ' stored item(s). Nothing outside this browser was affected.';
        render();
        status(message);
      }
    }

    function bumpTaskGeneration(targetStorage) {
      // Non-personal coordination marker. Excluded from CATEGORIES inventory so
      // it is never counted as user data and is not itself cleared by clearAll.
      const key = 'daymark.tasks.generation.v1';
      if (!targetStorage || typeof targetStorage.getItem !== 'function'
          || typeof targetStorage.setItem !== 'function') return;
      let next = 1;
      try {
        const raw = targetStorage.getItem(key);
        const parsed = raw == null ? 0 : Number(raw);
        if (Number.isFinite(parsed) && parsed >= 0) next = Math.floor(parsed) + 1;
      } catch (error) {
        next = 1;
      }
      targetStorage.setItem(key, String(next));
    }

    if (refreshEl && typeof refreshEl.addEventListener === 'function') {
      refreshEl.addEventListener('click', () => {
        if (storageAccessFailed || !storage) acquireStorage();
        render();
      });
    }
    if (clearStatusEl && typeof clearStatusEl.addEventListener === 'function') {
      clearStatusEl.addEventListener('click', () => {
        status('Status cleared.');
      });
    }
    if (clearAllEl && typeof clearAllEl.addEventListener === 'function') {
      clearAllEl.addEventListener('click', () => { onClearAll(); });
    }

    render();

    return {
      onClearAll,
      detach() {
        setBusy(false);
        // Leave listeners; the attached handle goes out of scope.
        if (clearAllEl) clearAllEl.disabled = false;
      }
    };
  }

  const api = { attachStorageUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkStorageUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachStorageUi({ document, window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
