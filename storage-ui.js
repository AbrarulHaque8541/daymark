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
    const focusMutation = env.focusMutation || root.DaymarkFocusMutation || null;
    const webhookUi = env.webhookUi || root.DaymarkWebhookUi || null;
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

    function notifyFocusStorageChange(categoryId) {
      if (!win || typeof win.dispatchEvent !== 'function') return;
      try {
        if (typeof win.CustomEvent === 'function') {
          win.dispatchEvent(new win.CustomEvent('daymark:focus-storage-cleared', {
            detail: { categoryId }
          }));
        } else if (typeof win.Event === 'function') {
          const event = new win.Event('daymark:focus-storage-cleared');
          Object.defineProperty(event, 'detail', { value: { categoryId } });
          win.dispatchEvent(event);
        }
      } catch (error) {
        // The storage mutation is already complete; reload still observes it.
      }
    }

    function restoreGenerationMarker(storage, key, previousValue) {
      if (previousValue !== null && typeof previousValue !== 'string') return false;
      try {
        if (previousValue === null) storage.removeItem(key);
        else storage.setItem(key, previousValue);
      } catch (error) {
        // Verify below: a storage operation can fail after the underlying write.
      }
      try {
        return storage.getItem(key) === previousValue;
      } catch (error) {
        return false;
      }
    }

    function finishCategoryClear(result, category) {
      if (category.id === 'tasks' || category.id === 'task-backup') {
        notifyTaskStorageChange(category.id === 'tasks' ? 'daymark.tasks.v1' : null);
      } else if (category.id === 'webhook-queue' && result.removed.length > 0) {
        notifyTaskStorageChange('daymark.webhook.queue.v1');
      }
      if (category.id === 'focus' || category.id === 'focus-backup' || category.id === 'focus-preset') {
        // Every Focus clear attempt advances the shared generation while holding
        // the Focus lock. Even if the browser refuses every remove, notify the app
        // to rebase from the still-readable snapshot and adopt the new generation;
        // otherwise this tab can keep stale in-memory state that can never save.
        notifyFocusStorageChange(category.id);
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
      } else if (result.removed.length === 0 && category.id === 'webhook-queue') {
        render();
        status('No saved webhook queue key was present; this tab’s in-memory queue was also cleared.');
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
      if (categoryId === 'webhook-queue') {
        if (!taskMutation || typeof taskMutation.withLocksInOrder !== 'function'
            || !Array.isArray(taskMutation.CLEAR_ALL_LOCK_ORDER)) {
          setBusy(false);
          status('Cannot safely clear the webhook queue: shared task/webhook coordination is unavailable. Nothing was cleared.');
          return Promise.resolve(false);
        }
        return taskMutation.withLocksInOrder(lockManager, taskMutation.CLEAR_ALL_LOCK_ORDER, () => {
          const result = clear();
          if (result.failed.length === 0 && webhookUi
              && typeof webhookUi.resetQueueAfterExternalClear === 'function') {
            webhookUi.resetQueueAfterExternalClear();
          }
          return result;
        }).then((locked) => {
          setBusy(false);
          if (!locked.ok) {
            status('Could not safely clear ' + category.label + ': '
              + (locked.reason === 'coordination-unavailable'
                ? 'shared task/webhook coordination is unavailable. Nothing was cleared.'
                : 'a shared task/webhook lock failed. Nothing was cleared.'));
            return false;
          }
          finishCategoryClear(locked.value, category);
          return true;
        });
      }

      if (categoryId === 'focus' || categoryId === 'focus-backup' || categoryId === 'focus-preset') {
        if (!focusMutation || typeof focusMutation.withFocusMutationLock !== 'function'
            || typeof focusMutation.incrementFocusGeneration !== 'function') {
          setBusy(false);
          status('Cannot safely clear Focus data: Focus cross-tab coordination is unavailable. Nothing was cleared.');
          return Promise.resolve(false);
        }
        return focusMutation.withFocusMutationLock(lockManager, () => {
          const generation = focusMutation.incrementFocusGeneration(storage);
          if (!generation.ok) return { ok: false, reason: generation.reason };
          let result;
          try { result = clear(); }
          catch (error) { return { ok: false, reason: 'storage-clear-failed' }; }
          return { ok: true, result };
        }).then((locked) => {
          setBusy(false);
          if (!locked.ok || !locked.value || !locked.value.ok) {
            status('Could not safely clear ' + category.label
              + ': Focus coordination or storage failed. Nothing was cleared.');
            return false;
          }
          finishCategoryClear(locked.value.result, category);
          return true;
        });
      }

      if (categoryId === 'tasks' || categoryId === 'task-backup') {
        if (!taskMutation || typeof taskMutation.withTaskMutationLock !== 'function') {
          setBusy(false);
          status('Cannot safely clear task data: cross-tab coordination is unavailable. Nothing was cleared.');
          return Promise.resolve(false);
        }
        if (typeof taskMutation.incrementTaskGeneration !== 'function') {
          setBusy(false);
          status('Cannot safely clear task data: the retained task-generation fence is unavailable. Nothing was cleared.');
          return Promise.resolve(false);
        }
        return taskMutation.withTaskMutationLock(lockManager, () => {
          let previousGeneration;
          try {
            previousGeneration = storage.getItem(taskMutation.TASK_GENERATION_KEY);
          } catch (error) {
            return { ok: false, reason: 'task-generation-read-failed' };
          }
          const generation = taskMutation.incrementTaskGeneration(storage, category.id);
          if (!generation.ok) return { ok: false, reason: generation.reason };

          let result;
          try {
            result = clear();
          } catch (error) {
            return { ok: false, reason: 'clear-operation-failed' };
          }
          const unreadable = Array.isArray(result.unreadable) ? result.unreadable : [];
          const removed = Array.isArray(result.removed) ? result.removed : [];
          if (unreadable.length > 0 && removed.length === 0) {
            const restored = restoreGenerationMarker(
              storage, taskMutation.TASK_GENERATION_KEY, previousGeneration
            );
            return {
              ok: false,
              reason: restored ? 'clear-preflight-failed-rolled-back' : 'partial-generation-coordination'
            };
          }
          return { ok: true, result };
        }).then((locked) => {
          setBusy(false);
          const outcome = locked.ok ? locked.value : null;
          if (!outcome || outcome.ok !== true) {
            const reason = outcome && outcome.reason ? outcome.reason : locked.reason;
            if (reason === 'clear-preflight-failed-rolled-back') {
              status('Could not clear ' + category.label
                + ': storage became unreadable during the locked preflight. The task-generation marker was restored; nothing was cleared.');
            } else if (reason === 'partial-generation-coordination') {
              notifyTaskStorageChange(categoryId === 'tasks' ? 'daymark.tasks.v1' : null);
              status('Could not safely clear ' + category.label
                + ': the task-generation marker could not be restored after a storage preflight failure. No data was intentionally removed; task state was refreshed. Reload before editing if it does not update.');
            } else {
              status('Could not safely clear ' + category.label + ': '
                + (reason === 'coordination-unavailable'
                  ? 'cross-tab coordination is unavailable. Nothing was cleared.'
                  : 'the task-generation fence, shared lock or storage operation failed. Review storage before retrying.'));
            }
            return false;
          }
          finishCategoryClear(outcome.result, category);
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
      try { scan = storageApi.scanStorage(storage); }
      catch (error) {
        status('Could not verify local data. Nothing was cleared.');
        return;
      }
      if (!scan || scan.complete !== true) {
        status('Cannot clear all local data while some categories are unreadable. Nothing was cleared.');
        return;
      }
      const outcome = confirmOrReport('Clear ALL local Daymark data in this browser? '
        + 'Tasks, Focus history, the Focus Timer preset, cached data, saved Wikipedia/weather/holiday/currency and browser-search preferences, '
        + 'the remembered browser download journey, the saved browser proxy profile, the legacy webhook coordination lock, and queued events will be removed. '
        + 'Small non-personal task and Focus coordination counters remain so another open tab cannot restore data cleared here. '
        + 'The secret-bearing legacy endpoint is excluded and handled without reading. This cannot be undone.');
      if (outcome === 'failed') {
        reportFailedConfirmation();
        return;
      }
      if (outcome === 'declined') {
        status('Cancelled. Nothing was cleared.');
        return;
      }
      if (!taskMutation || typeof taskMutation.withLocksInOrder !== 'function'
          || !Array.isArray(taskMutation.CLEAR_ALL_LOCK_ORDER)
          || typeof taskMutation.incrementTaskGeneration !== 'function'
          || !focusMutation || typeof focusMutation.incrementFocusGeneration !== 'function') {
        status('Cannot safely clear all data: shared task, webhook and Focus coordination is unavailable. Nothing was cleared.');
        return false;
      }
      setBusy(true);
      const locked = await taskMutation.withLocksInOrder(
        lockManager,
        taskMutation.CLEAR_ALL_LOCK_ORDER,
        () => {
          const taskGenerationKey = taskMutation.TASK_GENERATION_KEY;
          const focusGenerationKey = focusMutation.FOCUS_GENERATION_KEY;
          let previousTaskGeneration;
          let previousFocusGeneration;
          try {
            previousTaskGeneration = storage.getItem(taskGenerationKey);
            previousFocusGeneration = storage.getItem(focusGenerationKey);
          } catch (error) {
            return { ok: false, reason: 'generation-read-failed' };
          }

          const taskGeneration = taskMutation.incrementTaskGeneration(storage, 'all');
          if (!taskGeneration.ok) return { ok: false, reason: 'task-generation-failed' };

          const focusGeneration = focusMutation.incrementFocusGeneration(storage);
          if (!focusGeneration.ok) {
            const restored = restoreGenerationMarker(storage, taskGenerationKey, previousTaskGeneration);
            return {
              ok: false,
              reason: restored
                ? 'focus-generation-failed-rolled-back'
                : 'partial-generation-coordination'
            };
          }

          let result;
          try {
            result = storageApi.clearAll(storage);
          } catch (error) {
            return { ok: false, reason: 'clear-operation-failed' };
          }
          const unreadableKeys = Array.isArray(result && result.unreadableKeys)
            ? result.unreadableKeys : [];
          const removedKeys = Array.isArray(result && result.removedKeys)
            ? result.removedKeys : [];
          if (unreadableKeys.length > 0 && removedKeys.length === 0) {
            const taskRestored = restoreGenerationMarker(storage, taskGenerationKey, previousTaskGeneration);
            const focusRestored = restoreGenerationMarker(storage, focusGenerationKey, previousFocusGeneration);
            return {
              ok: false,
              reason: taskRestored && focusRestored
                ? 'clear-preflight-failed-rolled-back'
                : 'partial-generation-coordination'
            };
          }
          if (!result || !Array.isArray(result.failedKeys) || !Array.isArray(result.removedKeys)) {
            return { ok: false, reason: 'clear-operation-failed' };
          }
          if (!result.failedKeys.includes('daymark.webhook.queue.v1') && webhookUi
              && typeof webhookUi.resetQueueAfterExternalClear === 'function') {
            webhookUi.resetQueueAfterExternalClear();
          }
          return { ok: true, result };
        }
      );
      setBusy(false);
      if (!locked.ok) {
        status('Could not safely clear all data: '
          + (locked.reason === 'coordination-unavailable'
            ? 'shared task, webhook or Focus coordination is unavailable. Nothing was cleared.'
            : 'a shared lock or storage operation failed. Nothing was cleared.'));
        return false;
      }
      const clearOutcome = locked.value;
      if (!clearOutcome || clearOutcome.ok !== true) {
        if (clearOutcome && clearOutcome.reason === 'focus-generation-failed-rolled-back') {
          status('Could not safely clear all data: Focus coordination could not advance. Task coordination was restored; nothing was cleared.');
        } else if (clearOutcome && clearOutcome.reason === 'clear-preflight-failed-rolled-back') {
          status('Could not safely clear all data: storage became unreadable during the locked preflight. Both coordination markers were restored; nothing was cleared.');
        } else if (clearOutcome && clearOutcome.reason === 'partial-generation-coordination') {
          // A generation marker may remain advanced. Rebase both current-tab
          // views and make the uncertain coordination state explicit.
          notifyTaskStorageChange(null);
          notifyFocusStorageChange('all');
          status('Could not safely clear all data: coordination markers could not be restored after the storage preflight failed. No user data was removed; task and Focus state were refreshed. Reload before editing if either view does not update.');
        } else {
          // The clear operation may have failed after partially changing data.
          // Keep the advanced fences and reconcile both views rather than risk
          // allowing stale task or Focus state to overwrite the remaining data.
          notifyTaskStorageChange(null);
          notifyFocusStorageChange('all');
          status('Could not safely clear all data: the clear operation or generation transaction failed. Data may be partially cleared; task and Focus state were refreshed. Review storage before retrying.');
        }
        return false;
      }
      const result = clearOutcome.result;
      notifyFocusStorageChange('all');
      // The task generation advanced even when the task key was already absent.
      // Refresh this tab so a same-tab Clear All cannot leave stale in-memory tasks.
      notifyTaskStorageChange(null);
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
