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
    const taskMutation = env.taskMutationApi || root.DaymarkTaskMutation || null;
    const webhookUi = env.webhookUi || root.DaymarkWebhookUi || null;
    const telegramUi = env.telegramUi || root.DaymarkTelegramUi || null;
    let lockManager = env.lockManager || null;
    if (!lockManager) {
      try { lockManager = (env.navigator || (win && win.navigator) || {}).locks || null; }
      catch (error) { lockManager = null; }
    }
    const confirmImpl = typeof env.confirm === 'function' ? env.confirm
      : (win && typeof win.confirm === 'function' ? (message) => win.confirm(message) : null);

    function notifyTaskGenerationChanged() {
      if (!taskMutation || !storage || !win || typeof win.dispatchEvent !== 'function'
          || typeof win.StorageEvent !== 'function') return false;
      const generation = taskMutation.readGeneration(storage);
      if (!generation.ok) return false;
      try {
        win.dispatchEvent(new win.StorageEvent('storage', {
          key: taskMutation.GENERATION_KEY,
          newValue: JSON.stringify(generation.value),
          storageArea: storage
        }));
        return true;
      } catch (error) {
        return false;
      }
    }

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
        if (clearAllEl) clearAllEl.disabled = true;
        status('Browser storage could not be accessed. Local data status is unknown; nothing was changed.');
        return;
      }
      let scan = null;
      try {
        scan = storageApi.scanStorage(storage);
      } catch (error) {
        while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
        if (clearAllEl) clearAllEl.disabled = true;
        status('Could not read local data: '
          + (error && error.message ? error.message : 'storage is unavailable.')
          + ' Local data status is unknown; nothing was changed.');
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
          let categoryState = ' — not present';
          if (unreadableCount > 0) {
            categoryState = category.present
              ? ' — partially readable (about ' + storageApi.formatBytes(category.bytes) + ')'
              : ' — status unknown (could not read)';
          } else if (category.present) {
            categoryState = ' — about ' + storageApi.formatBytes(category.bytes);
          }
          title.textContent = category.label + categoryState;
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
        const noun = unreadableCount === 1 ? 'category could not be checked' : 'categories could not be checked';
        status(known + '; ' + unreadableCount + ' ' + noun
          + '. Reported sizes exclude unreadable entries.');
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
      if (clearStatusEl) {
        clearStatusEl.disabled = busy;
        if (typeof clearStatusEl.classList !== 'undefined') {
          clearStatusEl.classList.toggle('is-busy', busy);
        }
      }
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

    async function onClearCategory(categoryId) {
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
        if (categoryId === 'tasks' || categoryId === 'task-backup') {
          if (!taskMutation || !lockManager) {
            setBusy(false);
            status('Could not safely coordinate task clearing across tabs. Nothing was cleared.');
            return;
          }
          const locked = await taskMutation.withExclusiveLock(lockManager, taskMutation.TASK_LOCK_NAME, () => {
            const before = taskMutation.readGeneration(storage);
            const repaired = taskMutation.resolvePendingMutations(storage);
            if (!repaired.ok) return { ok: false, reason: repaired.reason };
            let primaryPresent = false;
            if (categoryId === 'tasks') {
              try { primaryPresent = storage.getItem(taskMutation.TASK_STORAGE_KEY) !== null; }
              catch (error) {
                return { ok: true, result: storageApi.clearCategory(storage, categoryId), generationChanged: false };
              }
            }
            let begun = false;
            if (primaryPresent) {
              const start = taskMutation.beginTaskClear(storage);
              if (!start.ok) return { ok: false, reason: start.reason };
              begun = true;
            }
            const cleared = storageApi.clearCategory(storage, categoryId);
            const primaryRemoved = Array.isArray(cleared.removed)
              && cleared.removed.includes(taskMutation.TASK_STORAGE_KEY);
            const finished = begun ? taskMutation.finishTaskClear(storage, primaryRemoved) : { ok: true };
            const after = taskMutation.readGeneration(storage);
            return {
              ok: true,
              result: cleared,
              generationChanged: Boolean(before.ok && after.ok
                && before.value.generation !== after.value.generation),
              coordinationFailed: !finished.ok,
              taskEpoch: after.ok ? after.value.taskEpoch : null
            };
          });
          if (!locked.ok || !locked.value || !locked.value.ok) {
            setBusy(false);
            status('Could not safely coordinate task clearing across tabs. Nothing was cleared.');
            return;
          }
          result = locked.value.result;
          if (locked.value.generationChanged) notifyTaskGenerationChanged();
          if (locked.value.coordinationFailed) {
            result.coordinationFailed = true;
          }
        } else if (categoryId === 'webhook-queue' && webhookUi
            && typeof webhookUi.clearQueue === 'function') {
          const cleared = await webhookUi.clearQueue();
          if (!cleared || cleared.cleared !== true) {
            setBusy(false);
            status('Could not safely clear the webhook queue. Existing events were preserved.');
            return;
          }
          result = { removed: category.keys.slice(), failed: [], unreadable: [] };
        } else {
          result = storageApi.clearCategory(storage, categoryId);
        }
      } catch (error) {
        setBusy(false);
        status('Could not clear ' + category.label + ': '
          + (error && error.message ? error.message : 'storage is unavailable.'));
        return;
      }
      setBusy(false);
      if (result.failed.length > 0) {
        const unreadable = Array.isArray(result.unreadable) && result.unreadable.length > 0;
        let message = result.removed.length === 0
          ? unreadable
            ? 'Could not clear ' + category.label + ': ' + result.unreadable.length
              + ' item(s) could not be read. Nothing was cleared.'
            : 'Could not clear ' + category.label + ': ' + result.failed.length
              + ' item(s) could not be removed by the browser. Nothing was cleared.'
          : 'Cleared ' + category.label + ', but ' + result.failed.length
            + ' item(s) could not be removed by the browser.';
        if (result.coordinationFailed) message += ' Task-clear coordination could not be finalized; task writes remain blocked until storage recovers.';
        render();
        status(message);
      } else if (result.coordinationFailed) {
        render();
        status('Cleared ' + category.label + ' (' + result.removed.length
          + ' item(s) removed), but task-clear coordination could not be finalized. Task writes remain blocked until storage recovers.');
      } else {
        const message = 'Cleared ' + category.label + ' (' + result.removed.length
          + ' item(s) removed). Nothing else was touched.';
        render();
        status(message);
      }
    }

    async function onClearAll() {
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
      if (!taskMutation || !lockManager || !webhookUi
          || typeof webhookUi.prepareForClearAll !== 'function') {
        status('Could not safely coordinate Clear All across tasks and webhooks. Nothing was cleared.');
        return;
      }
      setBusy(true);
      let transaction = null;
      try {
        const locked = await taskMutation.withLocksInOrder(
          lockManager,
          taskMutation.CLEAR_ALL_LOCK_ORDER,
          () => {
            const plan = storageApi.planClearAll(storage);
            if (!plan.ok) return { ok: false, reason: 'preflight-failed', result: plan };
            const taskKeyWillBeCleared = plan.existingKeys.includes(taskMutation.TASK_STORAGE_KEY);
            const epoch = taskMutation.beginClearAll(storage, taskKeyWillBeCleared);
            if (!epoch.ok) return { ok: false, reason: 'generation-failed' };
            // Clear session-only endpoint/fingerprint and all in-memory queue state
            // while delivery and queue locks are held, before any key is removed.
            const webhookReset = webhookUi.prepareForClearAll();
            if (telegramUi && typeof telegramUi.resetForClearAll === 'function') {
              telegramUi.resetForClearAll();
            }
            const result = storageApi.clearPlanned(storage, plan);
            const primaryTaskKeyRemoved = result.removedKeys.includes(taskMutation.TASK_STORAGE_KEY);
            const finalized = taskMutation.finishClearAll(storage, primaryTaskKeyRemoved);
            return {
              ok: true,
              result,
              webhookCleanupFailed: !webhookReset || webhookReset.legacyConfigCleared !== true,
              coordinationFailed: !finalized.ok,
              clearEpoch: epoch.value.clearEpoch,
              taskEpoch: finalized.ok ? finalized.value.taskEpoch : epoch.value.taskEpoch
            };
          }
        );
        if (!locked.ok) {
          transaction = { ok: false, reason: locked.reason };
        } else {
          transaction = locked.value;
        }
      } catch (error) {
        setBusy(false);
        status('Could not clear all data: '
          + (error && error.message ? error.message : 'storage is unavailable.'));
        return;
      }
      if (transaction && transaction.ok === true) notifyTaskGenerationChanged();
      setBusy(false);
      if (!transaction || transaction.ok !== true) {
        const result = transaction && transaction.result;
        if (transaction && transaction.reason === 'preflight-failed' && result) {
          const unreadable = Array.isArray(result.unreadableKeys) ? result.unreadableKeys.length : 0;
          status(unreadable
            ? 'Could not clear all data: ' + unreadable + ' item(s) could not be read. Nothing was cleared.'
            : 'Could not clear all data: storage status is unknown. Nothing was cleared.');
        } else {
          status('Could not safely coordinate Clear All across tabs. Nothing was cleared.');
        }
        return;
      }
      const result = transaction.result;
      const coordinationWarning = transaction.coordinationFailed
        ? ' Clear coordination metadata could not be finalized; some writes remain blocked until storage recovers.'
        : '';
      if (result.failedKeys.length > 0) {
        const unreadableKeys = Array.isArray(result.unreadableKeys) ? result.unreadableKeys : [];
        const message = (result.removedKeys.length === 0
          ? unreadableKeys.length > 0
            ? 'Could not clear all data: ' + unreadableKeys.length
              + ' item(s) could not be read. Nothing was cleared.'
            : 'Could not clear all data: ' + result.failedKeys.length
              + ' item(s) could not be removed by the browser. Nothing was cleared.'
          : 'Cleared ' + result.removedKeys.length + ' item(s), but '
            + result.failedKeys.length + ' item(s) could not be removed by the browser.') + coordinationWarning;
        render();
        status(message);
      } else if (transaction.webhookCleanupFailed) {
        render();
        status(result.removedKeys.length
          ? 'Cleared ' + result.removedKeys.length + ' item(s), but the legacy webhook endpoint could not be safely removed.' + coordinationWarning
          : 'The legacy webhook endpoint could not be safely removed; no stored items were cleared.' + coordinationWarning);
      } else if (transaction.coordinationFailed) {
        render();
        status('Cleared ' + result.removedKeys.length
          + ' stored item(s), but Clear All coordination metadata could not be finalized. Some writes remain blocked until storage recovers.');
      } else {
        const message = 'Cleared all ' + result.removedKeys.length
          + ' stored item(s). Nothing outside this browser was affected.';
        render();
        status(message);
      }
    }

    if (refreshEl && typeof refreshEl.addEventListener === 'function') {
      refreshEl.addEventListener('click', () => {
        if (storageAccessFailed || !storage) acquireStorage();
        render();
      });
    }
    if (clearStatusEl && typeof clearStatusEl.addEventListener === 'function') {
      // Read-only by design: empties the status line only. It is deliberately
      // never a fallback for the destructive clear-all handler (issue #740).
      clearStatusEl.addEventListener('click', () => {
        if (statusEl) statusEl.textContent = '';
      });
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
    const boot = () => attachStorageUi({ document, window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
