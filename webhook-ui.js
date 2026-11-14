/*
 * Daymark task-completion webhook UI wiring for the web prototype.
 *
 * A small HTTPS webhook delivery card: save an https:// endpoint and completed
 * tasks send a minimal JSON event directly to it.
 * Temporary offline states, request failures, and a missing fetch all degrade
 * gracefully: events are queued on this device (bounded) and delivery resumes
 * on an explicit Retry, an 'online' event, or the next completed task. Nothing
 * polls and nothing wakes the radio on a timer: zero battery drain by design.
 * Mirrors the weather/currency module style: attachWebhookUi(env) is fully
 * injectable for unit tests.
 *
 * Origin-wide Web Locks serialize queue mutations and hold one exclusive lock
 * across delivery. If that coordinator is unavailable, task events are not
 * queued or sent. Delivery remains at-least-once across crashes or ambiguous
 * network outcomes; arbitrary webhook receivers do not promise exactly once.
 */
((root) => {
  'use strict';

  const QUEUE_LOCK_NAME = 'daymark.webhook.queue.v1';
  const DELIVERY_LOCK_NAME = 'daymark.webhook.delivery.v1';
  let activeHandle = null;

  function attachWebhookUi(env) {
    if (!env || !env.document) throw new Error('attachWebhookUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const navigator = env.navigator || (win && win.navigator) || null;
    const lockManager = env.lockManager || (navigator && navigator.locks) || null;
    let storage = null;
    let storageAccessFailed = false;
    try {
      storage = Object.prototype.hasOwnProperty.call(env, 'localStorage')
        ? env.localStorage
        : (win && win.localStorage) || null;
    } catch (error) {
      storageAccessFailed = true;
    }
    const webhookApi = env.webhookApi || root.DaymarkWebhook || null;
    const taskMutation = env.taskMutationApi || root.DaymarkTaskMutation || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);
    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const urlEl = element('webhook-url');
    const formEl = element('webhook-form');
    const saveEl = element('webhook-save');
    const testEl = element('webhook-test');
    const flushEl = element('webhook-flush');
    const clearQueueEl = element('webhook-clear-queue');
    const statusEl = element('webhook-status');

    let config = null;
    let endpointFingerprintPromise = null;
    let queue = [];
    let busy = false;
    let queueReadFailed = storageAccessFailed;
    let legacyConfigCleanupFailed = false;
    let queueWriteFailed = false;
    let flushRequested = false;
    let coordinationFailed = false;
    let clearEpoch = 0;
    let memoryOnlyEvents = [];
    // If a POST succeeded but the queue-removal write failed, remember those
    // resolved IDs in this tab so Retry can persist their removal without
    // sending them a second time during the same page lifetime.
    let resolvedUnpersistedIds = new Set();

    if (taskMutation && typeof taskMutation.readGeneration === 'function') {
      const generation = taskMutation.readGeneration(storage);
      if (generation.ok) clearEpoch = generation.value.clearEpoch;
    }

    function status(message) {
      let safeMessage = String(message === null || message === undefined ? '' : message);
      const endpoints = [
        config && config.url,
        urlEl && typeof urlEl.value === 'string' ? urlEl.value.trim() : ''
      ];
      endpoints.forEach((endpoint) => {
        if (typeof endpoint === 'string' && endpoint) {
          safeMessage = safeMessage.split(endpoint).join('[hidden]');
        }
      });
      if (statusEl) statusEl.textContent = safeMessage;
    }

    function isOnline() {
      return !navigator || typeof navigator.onLine !== 'boolean' || navigator.onLine;
    }

    function currentEndpointFingerprint() {
      if (!config || !webhookApi) return Promise.reject(new Error('Webhook endpoint is not configured.'));
      if (!endpointFingerprintPromise) {
        endpointFingerprintPromise = webhookApi.fingerprintWebhookUrl(
          config.url,
          env.crypto || (win && win.crypto) || root.crypto,
          env.TextEncoder || (win && win.TextEncoder) || root.TextEncoder
        );
      }
      return endpointFingerprintPromise;
    }

    function queueCoordinatorAvailable() {
      try {
        return !!(lockManager && typeof lockManager.request === 'function');
      } catch (error) {
        return false;
      }
    }

    function coordinationWarning() {
      if (!queueCoordinatorAvailable()) {
        return ' Cross-tab queue coordination is unavailable in this browser; webhook queueing and delivery are paused.';
      }
      return coordinationFailed
        ? ' Cross-tab queue coordination failed; retry after the browser lock service is available.'
        : '';
    }

    async function withNamedLock(lockName, operation) {
      const locks = lockManager;
      if (!locks || typeof locks.request !== 'function') {
        coordinationFailed = true;
        return { ok: false, reason: 'unavailable' };
      }
      try {
        const value = await locks.request(lockName, { mode: 'exclusive' }, operation);
        coordinationFailed = false;
        return { ok: true, value };
      } catch (error) {
        coordinationFailed = true;
        return { ok: false, reason: 'failed' };
      }
    }

    function withQueueLock(operation) {
      return withNamedLock(QUEUE_LOCK_NAME, operation);
    }

    function withDeliveryLock(operation) {
      return withNamedLock(DELIVERY_LOCK_NAME, operation);
    }

    function setBusy(isBusy) {
      busy = isBusy;
      [saveEl, testEl, flushEl, clearQueueEl].forEach((button) => {
        if (!button) return;
        button.disabled = isBusy || (button === flushEl
          && ((queue.length === 0 && !queueWriteFailed) || storageAccessFailed || queueReadFailed || legacyConfigCleanupFailed || !queueCoordinatorAvailable()));
        if (button.classList && typeof button.classList.toggle === 'function') {
          button.classList.toggle('is-busy', isBusy);
        }
        if (typeof button.setAttribute === 'function') {
          if (isBusy) button.setAttribute('aria-busy', 'true');
          else button.removeAttribute('aria-busy');
        }
      });
    }

    // Older versions persisted the complete endpoint URL, including provider
    // tokens commonly carried in its path or query. Never read or restore that
    // value. Remove the legacy key without inspecting it; if removal is not
    // available, overwrite it with an explicit null marker.
    function clearLegacyConfig() {
      if (storageAccessFailed || !storage || !webhookApi) return false;
      try {
        if (typeof storage.removeItem === 'function') {
          storage.removeItem(webhookApi.CONFIG_KEY);
          return true;
        }
      } catch (error) {
        // Try the non-secret null marker below.
      }
      try {
        if (typeof storage.setItem === 'function') {
          storage.setItem(webhookApi.CONFIG_KEY, JSON.stringify(null));
          return true;
        }
      } catch (error) {
        // The legacy value cannot be safely removed in this browser.
      }
      return false;
    }

    function invalidateForClearAll(nextEpoch) {
      if (Number.isSafeInteger(nextEpoch) && nextEpoch >= clearEpoch) clearEpoch = nextEpoch;
      else clearEpoch += 1;
      config = null;
      endpointFingerprintPromise = null;
      if (urlEl && typeof urlEl.value === 'string') urlEl.value = '';
      queue = [];
      memoryOnlyEvents = [];
      resolvedUnpersistedIds.clear();
      queueReadFailed = false;
      queueWriteFailed = false;
      flushRequested = false;
      coordinationFailed = false;
      renderQueue();
      status('Webhook endpoint and queued events were cleared by local data controls.');
      return true;
    }

    function readQueue() {
      if (storageAccessFailed || !storage || !webhookApi) return { ok: false, value: [] };
      try {
        if (typeof storage.getItem !== 'function') return { ok: false, value: [] };
        const raw = storage.getItem(webhookApi.QUEUE_KEY);
        if (raw === null) return { ok: true, value: [] };
        const parsed = JSON.parse(raw);
        return webhookApi.validateQueue(parsed)
          ? { ok: true, value: parsed }
          : { ok: false, value: [] };
      } catch (error) {
        return { ok: false, value: [] };
      }
    }

    function persistQueue(nextQueue) {
      if (storageAccessFailed || !storage || !webhookApi || queueReadFailed) {
        queueWriteFailed = true;
        return false;
      }
      try {
        if (typeof storage.setItem !== 'function') throw new Error('storage write unavailable');
        storage.setItem(webhookApi.QUEUE_KEY, JSON.stringify(nextQueue));
        queueWriteFailed = false;
        return true;
      } catch (error) {
        queueWriteFailed = true;
        return false;
      }
    }

    async function assignLegacyQueueToEndpoint(endpointFingerprint) {
      const snapshot = await withQueueLock(() => {
        const state = readQueue();
        if (!state.ok) {
          queueReadFailed = true;
          return { ok: false };
        }
        queueReadFailed = false;
        queue = state.value;
        return { ok: true, queue: state.value.slice() };
      });
      if (!snapshot.ok || !snapshot.value || !snapshot.value.ok) return { ok: false };
      const unassignedCount = snapshot.value.queue.filter((event) => !event.endpointFingerprint).length;
      if (!unassignedCount) return { ok: true, assigned: 0 };

      const confirmFn = typeof env.confirm === 'function'
        ? env.confirm
        : (win && typeof win.confirm === 'function' ? win.confirm.bind(win) : null);
      if (!confirmFn) return { ok: true, assigned: 0, cancelled: true, count: unassignedCount };
      let confirmed = false;
      try {
        confirmed = confirmFn(
          'Assign ' + unassignedCount + ' older queued webhook event(s) to the HTTPS endpoint entered in this tab? '
          + 'These events will be sent to that destination. Daymark stores only a SHA-256 destination fingerprint, not the endpoint URL.'
        ) === true;
      } catch (error) {
        confirmed = false;
      }
      if (!confirmed) return { ok: true, assigned: 0, cancelled: true, count: unassignedCount };

      const updated = await withQueueLock(() => {
        const state = readQueue();
        if (!state.ok) {
          queueReadFailed = true;
          return { ok: false };
        }
        queueReadFailed = false;
        const current = state.value;
        const next = current.map((event) => event.endpointFingerprint
          ? event
          : Object.assign({}, event, { endpointFingerprint }));
        const assigned = next.filter((event, index) =>
          !current[index].endpointFingerprint && event.endpointFingerprint === endpointFingerprint).length;
        if (!assigned) {
          queue = current;
          return { ok: true, assigned: 0, queue: current.slice() };
        }
        if (!persistQueue(next)) {
          queue = current;
          queueWriteFailed = true;
          return { ok: false };
        }
        queue = next;
        queueWriteFailed = memoryOnlyEvents.length > 0;
        return { ok: true, assigned, queue: next.slice() };
      });
      if (!updated.ok || !updated.value || !updated.value.ok) return { ok: false };
      return { ok: true, assigned: updated.value.assigned, queue: updated.value.queue };
    }

    function storageWarning() {
      const problems = [];
      if (legacyConfigCleanupFailed) {
        problems.push('a legacy saved endpoint could not be removed; clear this site\'s browser data before enabling webhooks');
      }
      if (queueReadFailed) problems.push('queued webhook events could not be read');
      if (queueWriteFailed) problems.push('queued webhook events could not be saved');
      const coordination = coordinationWarning();
      if (coordination) problems.push(coordination.trim());
      return problems.length
        ? ' Storage warning: ' + problems.join('; ') + '. No unreadable stored values were overwritten.'
        : '';
    }

    function pendingQueueView() {
      const seen = new Set(queue.map((event) => event.id));
      return queue.concat(memoryOnlyEvents.filter((event) => !seen.has(event.id)));
    }

    function queueNote() {
      const count = pendingQueueView().length;
      return count ? count + ' event(s) queued on this device.' : '';
    }

    function renderQueue() {
      const pending = pendingQueueView().length > 0 || queueWriteFailed;
      const storageUnsafe = storageAccessFailed || queueReadFailed;
      const coordinationUnavailable = !queueCoordinatorAvailable();
      if (flushEl) flushEl.disabled = busy || !pending || storageUnsafe
        || legacyConfigCleanupFailed || coordinationUnavailable;
      if (clearQueueEl) clearQueueEl.disabled = busy || !pending || storageUnsafe
        || coordinationUnavailable;
    }

    function finishBusyOperation() {
      setBusy(false);
      renderQueue();
      if (flushRequested) {
        flushRequested = false;
        void attemptFlush();
      }
    }

    async function attemptFlush() {
      if (busy) return;
      if (storageAccessFailed || legacyConfigCleanupFailed) {
        status('Webhook delivery is paused because browser storage could not be safely prepared.' + storageWarning());
        renderQueue();
        return;
      }
      if (!config || !webhookApi) {
        renderQueue();
        return;
      }
      if (!queueCoordinatorAvailable()) {
        coordinationFailed = true;
        status('Webhook delivery is paused because this browser cannot safely coordinate the shared queue across tabs.' + storageWarning());
        renderQueue();
        return;
      }

      const operationEpoch = clearEpoch;
      const operationConfig = config;
      const operationIsCurrent = () => clearEpoch === operationEpoch && config === operationConfig;
      setBusy(true);
      try {
        let endpointFingerprint;
        try {
          endpointFingerprint = await currentEndpointFingerprint();
        } catch (error) {
          status('Webhook delivery is paused because this browser cannot safely isolate endpoint destinations. No event was sent.' + storageWarning());
          renderQueue();
          return;
        }
        if (!operationIsCurrent()) return;
        const legacyAssignment = await assignLegacyQueueToEndpoint(endpointFingerprint);
        if (!operationIsCurrent()) return;
        if (!legacyAssignment.ok) {
          status('Webhook delivery is paused because older queued events could not be safely assigned or preserved.' + storageWarning());
          renderQueue();
          return;
        }
        if (legacyAssignment.cancelled) {
          status(legacyAssignment.count + ' older queued event(s) have no destination binding and were preserved. Confirm assignment to this endpoint or clear the queue.' + storageWarning());
          renderQueue();
          return;
        }
        const delivery = await withDeliveryLock(async () => {
          if (!operationIsCurrent()) return { invalidated: true };
          let deliveredCount = 0;
          let droppedCount = 0;
          let lastFailure = null;

          // The delivery lock prevents two tabs from sending the same queue
          // entry. The separate, short-lived queue lock is released before
          // network I/O so another tab can durably append a completion while
          // this tab is waiting for the webhook endpoint.
          while (true) {
            if (!operationIsCurrent()) return { invalidated: true };
            const snapshot = await withQueueLock(() => {
              if (!operationIsCurrent()) return { ok: false, invalidated: true };
              coordinationFailed = false;
              const state = readQueue();
              if (!state.ok) {
                queueReadFailed = true;
                status('Webhook delivery is paused because the shared queue could not be read.' + storageWarning());
                renderQueue();
                return { ok: false };
              }
              queueReadFailed = false;
              let latest = state.value.slice();
              let changed = false;
              const recoveringQueueState = queueWriteFailed;
              const remainingMemoryOnlyEvents = [];

              if (resolvedUnpersistedIds.size) {
                const reconciled = latest.filter((event) => !resolvedUnpersistedIds.has(event.id));
                if (reconciled.length !== latest.length) {
                  latest = reconciled;
                  changed = true;
                }
              }

              if (memoryOnlyEvents.length) {
                const seen = new Set(latest.map((event) => event.id));
                memoryOnlyEvents.forEach((event) => {
                  if (resolvedUnpersistedIds.has(event.id) || seen.has(event.id)) return;
                  if (latest.length >= webhookApi.MAX_QUEUE_EVENTS) {
                    remainingMemoryOnlyEvents.push(event);
                    return;
                  }
                  latest = webhookApi.enqueueEvent(latest, event);
                  seen.add(event.id);
                  changed = true;
                });
              }

              if (changed || queueWriteFailed) {
                if (!persistQueue(latest)) {
                  queue = latest;
                  queueWriteFailed = true;
                  status('Webhook delivery is paused because the queued events could not be saved. '
                    + queueNote() + storageWarning());
                  renderQueue();
                  return { ok: false };
                }
                memoryOnlyEvents = remainingMemoryOnlyEvents;
                resolvedUnpersistedIds.clear();
                queueWriteFailed = remainingMemoryOnlyEvents.length > 0;
              } else {
                memoryOnlyEvents = remainingMemoryOnlyEvents;
                queueWriteFailed = remainingMemoryOnlyEvents.length > 0;
              }

              queue = latest;
              return { ok: true, queue: latest.slice(), recovered: recoveringQueueState || changed };
            });

            if (!operationIsCurrent()) return { invalidated: true };
            if (!snapshot.ok) {
              status('Webhook delivery is paused because the shared queue could not be safely updated. '
                + storageWarning());
              break;
            }
            if (!snapshot.value || !snapshot.value.ok) break;
            queue = snapshot.value.queue;
            if (snapshot.value.recovered && !queue.length) {
              status('Webhook queue state is now saved. No events remain queued.' + storageWarning());
            }

            if (!queue.length) {
              if (queueWriteFailed) {
                const recovered = await withQueueLock(() => {
                  const state = readQueue();
                  if (!state.ok) {
                    queueReadFailed = true;
                    return false;
                  }
                  queueReadFailed = false;
                  if (!persistQueue([])) return false;
                  queue = [];
                  queueWriteFailed = false;
                  resolvedUnpersistedIds.clear();
                  return true;
                });
                if (recovered.ok && recovered.value) {
                  status('Webhook queue state is now saved. No events remain queued.' + storageWarning());
                }
              }
              break;
            }

            if (!config) break;
            if (!fetchImpl) {
              status('Webhook delivery is unavailable: fetch is missing in this browser. '
                + queueNote() + storageWarning());
              break;
            }
            if (!isOnline()) {
              status('Offline - ' + queueNote() + ' They send on the next connection or Retry.' + storageWarning());
              break;
            }

            const event = queue.find((item) => item.endpointFingerprint === endpointFingerprint);
            if (!event) {
              const otherEndpointCount = queue.filter((item) =>
                item.endpointFingerprint && item.endpointFingerprint !== endpointFingerprint).length;
              if (otherEndpointCount) {
                status(otherEndpointCount + ' queued event(s) belong to a different endpoint. Re-enter that endpoint in this tab to deliver them.' + storageWarning());
              }
              break;
            }
            if (!operationIsCurrent()) return { invalidated: true };
            const result = await webhookApi.flushQueue([event], config.url, fetchImpl, {
              endpointFingerprint,
              crypto: env.crypto || (win && win.crypto) || root.crypto,
              TextEncoder: env.TextEncoder || (win && win.TextEncoder) || root.TextEncoder
            });
            if (!operationIsCurrent()) return { invalidated: true };
            deliveredCount += result.deliveredCount;
            droppedCount += result.droppedCount;
            if (result.failure) lastFailure = result.failure;

            // Re-read under the queue lock after the network request. This
            // removes/updates only the event just processed and preserves
            // completions appended by any other tab during the POST.
            const updated = await withQueueLock(() => {
              if (!operationIsCurrent()) return { ok: false, invalidated: true };
              coordinationFailed = false;
              const state = readQueue();
              if (!state.ok) {
                queueReadFailed = true;
                if (!result.failure) resolvedUnpersistedIds.add(event.id);
                status('Webhook delivery finished but the shared queue could not be read for reconciliation. '
                  + storageWarning());
                return { ok: false };
              }
              queueReadFailed = false;
              const latest = state.value.slice();
              const index = latest.findIndex((item) => item.id === event.id);
              if (index < 0) {
                queue = latest;
                queueWriteFailed = memoryOnlyEvents.length > 0;
                return { ok: true, missing: true };
              }

              if (result.failure && result.queue.length) {
                // A retryable failure keeps the updated attempt count. When
                // flushQueue returns no event after the final failed attempt,
                // it has deliberately exhausted the retry budget and must be
                // removed durably just like a successful delivery.
                latest[index] = result.queue[0];
              } else {
                latest.splice(index, 1);
              }

              if (!persistQueue(latest)) {
                queue = latest;
                queueWriteFailed = true;
                if (!result.failure) resolvedUnpersistedIds.add(event.id);
                status('Webhook delivery finished but its queue update could not be saved. '
                  + 'The event may be retried after reload.' + storageWarning());
                renderQueue();
                return { ok: false };
              }
              queue = latest;
              queueWriteFailed = memoryOnlyEvents.length > 0;
              return { ok: true };
            });

            if (!operationIsCurrent()) return { invalidated: true };
            if (!updated.ok) {
              status('Webhook delivery is paused because its queue update could not be saved safely. '
                + storageWarning());
              break;
            }
            if (!updated.value || !updated.value.ok) break;
            if (result.failure) {
              const droppedNotice = result.droppedCount
                ? result.droppedCount + (result.droppedCount === 1
                  ? ' event was dropped after too many attempts. '
                  : ' events were dropped after too many attempts. ')
                : '';
              const remainingNotice = queue.length
                ? 'Could not deliver webhook events that remain queued. Check the endpoint and retry. '
                  + queueNote()
                : (result.droppedCount ? 'No events remain queued.' : 'Could not deliver webhook events. Check the endpoint and retry.');
              status(droppedNotice + remainingNotice + storageWarning());
              break;
            }
            // A successful or max-attempt-dropped event is now durably removed.
            // Loop to re-read, so events appended during the request are included.
          }

          if ((deliveredCount || droppedCount) && !queueWriteFailed && !lastFailure) {
            const parts = [];
            if (deliveredCount) parts.push('Delivered ' + deliveredCount + ' event(s).');
            if (droppedCount) parts.push(droppedCount + ' event(s) were dropped after too many attempts.');
            status(parts.join(' ') + (queue.length ? ' ' + queueNote() : '') + storageWarning());
          }
          return { deliveredCount, droppedCount, failure: lastFailure };
        });

        if (!operationIsCurrent() || (delivery.ok && delivery.value && delivery.value.invalidated)) return;
        if (!delivery.ok) {
          status('Webhook delivery is paused because this browser could not obtain the cross-tab delivery lock. '
            + storageWarning());
          renderQueue();
        }
      } finally {
        if (operationEpoch === clearEpoch) finishBusyOperation();
        else {
          setBusy(false);
          renderQueue();
        }
      }
    }

    async function onClearQueue() {
      if (busy) return { cleared: false, reason: 'busy' };
      if (storageAccessFailed) {
        status('Could not clear the webhook queue because browser storage is unavailable. Existing events were preserved.' + storageWarning());
        return { cleared: false, reason: 'storage-unavailable' };
      }
      if (!queueCoordinatorAvailable()) {
        coordinationFailed = true;
        status('Could not clear the webhook queue because this browser cannot safely coordinate other tabs. Existing events were preserved.' + storageWarning());
        renderQueue();
        return { cleared: false, reason: 'coordination-unavailable' };
      }

      // Serialize manual clearing with delivery first, then queue mutation.
      // Task completions use the same queue lock, so a stale snapshot cannot
      // overwrite a concurrent append while the clear is being committed.
      setBusy(true);
      try {
        const delivery = await withDeliveryLock(async () => {
          const locked = await withQueueLock(() => {
            const state = readQueue();
            if (!state.ok) {
              queueReadFailed = true;
              return { cleared: false, reason: 'read-failed' };
            }
            queueReadFailed = false;
            if (!persistQueue([])) {
              queueWriteFailed = true;
              return { cleared: false, reason: 'write-failed' };
            }
            queue = [];
            memoryOnlyEvents = [];
            resolvedUnpersistedIds.clear();
            queueWriteFailed = false;
            return { cleared: true };
          });
          if (!locked.ok || !locked.value || !locked.value.cleared) {
            const reason = !locked.ok ? locked.reason
              : locked.value && locked.value.reason ? locked.value.reason : 'clear-failed';
            return { cleared: false, reason };
          }
          return { cleared: true };
        });

        if (!delivery.ok || !delivery.value || !delivery.value.cleared) {
          const reason = !delivery.ok ? delivery.reason
            : delivery.value && delivery.value.reason ? delivery.value.reason : 'clear-failed';
          status('Could not clear the webhook queue safely. Existing stored events were preserved.' + storageWarning());
          renderQueue();
          return { cleared: false, reason };
        }

        status("All saved webhook events on this device and this tab's pending events were cleared. Unsaved events in other tabs remain there." + storageWarning());
        renderQueue();
        return { cleared: true };
      } finally {
        finishBusyOperation();
      }
    }

    function resetQueueAfterExternalClear() {
      // Compatibility entry point for a caller that has already completed a
      // coordinated durable queue clear. Never retain a session endpoint.
      const generation = taskMutation && taskMutation.readGeneration(storage);
      return invalidateForClearAll(generation && generation.ok ? generation.value.clearEpoch : clearEpoch + 1);
    }

    function prepareForClearAll() {
      const generation = taskMutation && taskMutation.readGeneration(storage);
      invalidateForClearAll(generation && generation.ok ? generation.value.clearEpoch : clearEpoch + 1);
      const legacyConfigCleared = clearLegacyConfig();
      legacyConfigCleanupFailed = !legacyConfigCleared;
      renderQueue();
      return { reset: true, legacyConfigCleared };
    }

    function onSave(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      const raw = urlEl && typeof urlEl.value === 'string' ? urlEl.value.trim() : '';
      if (!raw) {
        if (config) {
          config = null;
          endpointFingerprintPromise = null;
          status('Webhook disabled for this tab. Queued events remain on this device.' + storageWarning());
          return { saved: false, cleared: true, sessionOnly: true };
        }
        status('Add an https:// webhook URL to enable automation. The endpoint stays in this tab only and must be re-entered after reload.'
          + (pendingQueueView().length ? ' ' + queueNote() : '') + storageWarning());
        return { saved: false, cleared: false };
      }
      if (!webhookApi || !webhookApi.isValidWebhookUrl(raw)) {
        status('Enter a valid https:// webhook URL. Plain http is not allowed.');
        return { saved: false, cleared: false };
      }
      if (legacyConfigCleanupFailed) legacyConfigCleanupFailed = !clearLegacyConfig();
      if (legacyConfigCleanupFailed) {
        status('A legacy saved webhook endpoint could not be cleared. Clear this site\'s browser data before enabling webhook delivery.'
          + storageWarning());
        return { saved: false, cleared: false, reason: 'storage-unavailable' };
      }
      // The endpoint intentionally exists only in this page's memory. The
      // durable queue contains event payloads, never the destination URL.
      config = { version: 1, url: raw };
      endpointFingerprintPromise = null;
      status('Webhook enabled for this tab only. Re-enter the endpoint after reload. Queued events are isolated by a SHA-256 destination fingerprint; events for other endpoints stay queued until that endpoint is re-entered.' + storageWarning());
      if (queue.length || memoryOnlyEvents.length || queueWriteFailed) void attemptFlush();
      return { saved: true, cleared: false, sessionOnly: true };
    }

    async function onTest() {
      if (busy) return;
      if (legacyConfigCleanupFailed) {
        status('Webhook testing is paused because a legacy saved endpoint could not be cleared. Clear this site\'s browser data first.' + storageWarning());
        return;
      }
      const raw = urlEl && typeof urlEl.value === 'string' && urlEl.value.trim()
        ? urlEl.value.trim()
        : (config ? config.url : '');
      if (!webhookApi || !webhookApi.isValidWebhookUrl(raw)) {
        status('Enter a valid https:// webhook URL before sending a test.');
        return;
      }
      if (!fetchImpl) {
        status('Webhook delivery is unavailable: fetch is missing in this browser.');
        return;
      }
      if (!isOnline()) {
        status('Offline - connect to the internet before sending a test event. ' + queueNote());
        return;
      }
      const operationEpoch = clearEpoch;
      setBusy(true);
      status('Sending a test event...');
      try {
        const payload = webhookApi.buildTaskCompletedPayload({ title: 'Daymark test event', priority: 'medium' }, now());
        const delivery = await withDeliveryLock(async () => {
          if (operationEpoch !== clearEpoch) return { invalidated: true };
          try {
            await webhookApi.deliverWebhook(raw, payload, fetchImpl);
            return { delivered: true };
          } catch (error) {
            return { failed: true };
          }
        });
        if (operationEpoch !== clearEpoch || (delivery.ok && delivery.value && delivery.value.invalidated)) return;
        if (!delivery.ok) {
          status('Test event was not sent because this browser could not obtain the cross-tab delivery lock.' + storageWarning());
          return;
        }
        if (delivery.value && delivery.value.failed) {
          status('Test event failed. Check the endpoint and retry.');
          return;
        }
        status('Test event delivered. Your endpoint is reachable.' + (pendingQueueView().length ? ' ' + queueNote() : ''));
      } catch (error) {
        if (operationEpoch === clearEpoch) status('Test event failed. Check the endpoint and retry.');
      } finally {
        if (operationEpoch === clearEpoch) finishBusyOperation();
        else {
          setBusy(false);
          renderQueue();
        }
      }
    }

    function notifyTaskCompleted(task, options) {
      const deferDelivery = !!(options && options.deferDelivery === true);
      if (!webhookApi) return { queued: false, reason: 'unavailable' };
      if (storageAccessFailed || queueReadFailed || legacyConfigCleanupFailed) {
        status('Task completion was not queued or sent because browser storage could not be safely accessed.' + storageWarning());
        return { queued: false, reason: 'storage-unavailable' };
      }
      if (!config) return { queued: false, reason: 'disabled' };
      const operationEpoch = clearEpoch;
      const operationConfig = config;
      if (!queueCoordinatorAvailable()) {
        coordinationFailed = true;
        status('Task completion was not queued because this browser cannot safely coordinate the shared webhook queue across tabs.' + storageWarning());
        return { queued: false, reason: 'coordination-unavailable' };
      }

      let payload;
      try {
        payload = webhookApi.buildTaskCompletedPayload(task, now());
      } catch (error) {
        status('Could not prepare the webhook event.');
        return { queued: false, reason: 'invalid' };
      }

      return currentEndpointFingerprint().then((endpointFingerprint) => {
        if (operationEpoch !== clearEpoch || config !== operationConfig) {
          return { queued: false, reason: 'cleared' };
        }
        let event;
        try {
          event = webhookApi.makeQueueEvent(payload, now(), endpointFingerprint);
        } catch (error) {
          status('Could not prepare an endpoint-isolated webhook event.');
          return { queued: false, reason: 'fingerprint-unavailable' };
        }
        return withQueueLock(() => {
        if (operationEpoch !== clearEpoch || config !== operationConfig) {
          return { queued: false, reason: 'cleared' };
        }
        coordinationFailed = false;
        const state = readQueue();
        if (!state.ok) {
          queueReadFailed = true;
          status('Task completion was not queued or sent because the shared queue could not be read.' + storageWarning());
          renderQueue();
          return { queued: false, reason: 'storage-unavailable' };
        }
        queueReadFailed = false;
        // Never persist a newer completion ahead of older events that are
        // still held only in this tab. Keep the whole pending suffix in FIFO
        // order until the durable queue can accept it under the delivery lock.
        if (memoryOnlyEvents.length || queueWriteFailed) {
          try {
            memoryOnlyEvents = webhookApi.enqueueEvent(memoryOnlyEvents, event);
          } catch (error) {
            if (error && error.code === 'queue-full') {
              queue = state.value;
              queueWriteFailed = true;
              status('This tab\'s in-memory webhook queue is full. No new event was queued; existing pending events were preserved. '
                + queueNote() + storageWarning());
              renderQueue();
              return { queued: false, reason: 'queue-full' };
            }
            throw error;
          }
          queue = state.value;
          queueWriteFailed = true;
          renderQueue();
          status('Webhook event is held only in this tab behind earlier pending events; it was not sent because the queue could not be safely saved. '
            + queueNote() + storageWarning());
          return { queued: true, reason: 'memory-only' };
        }

        let nextQueue;
        try {
          nextQueue = webhookApi.enqueueEvent(state.value, event);
        } catch (error) {
          if (error && error.code === 'queue-full') {
            queue = state.value;
            status('Webhook queue is full. No new event was queued; existing events were preserved. '
              + 'Deliver or clear queued events before retrying. ' + queueNote() + storageWarning());
            renderQueue();
            return { queued: false, reason: 'queue-full' };
          }
          throw error;
        }
        if (!persistQueue(nextQueue)) {
          if (!memoryOnlyEvents.some((pending) => pending.id === event.id)) {
            try {
              memoryOnlyEvents = webhookApi.enqueueEvent(memoryOnlyEvents, event);
            } catch (error) {
              if (error && error.code === 'queue-full') {
                queue = state.value;
                queueWriteFailed = true;
                status('This tab\'s in-memory webhook queue is full. No new event was queued; existing pending events were preserved. '
                  + queueNote() + storageWarning());
                renderQueue();
                return { queued: false, reason: 'queue-full' };
              }
              throw error;
            }
          }
          queue = state.value;
          queueWriteFailed = true;
          renderQueue();
          status('Webhook event is held only in this tab; it was not sent because the queue could not be saved. '
            + queueNote() + storageWarning());
          return { queued: true, reason: 'memory-only' };
        }
        queue = nextQueue;
        queueWriteFailed = false;
        renderQueue();
        return { queued: true, reason: 'queued' };
      }).then(async (locked) => {
        if (operationEpoch !== clearEpoch || config !== operationConfig) {
          return { queued: false, reason: 'cleared' };
        }
        if (!locked.ok) {
          status('Task completion was not queued or sent because this browser could not obtain the cross-tab queue lock. '
            + storageWarning());
          renderQueue();
          return { queued: false, reason: 'coordination-unavailable' };
        }
        const result = locked.value;
        if (result && result.queued
            && (result.reason === 'queued' || result.reason === 'memory-only')) {
          if (busy) flushRequested = true;
          else if (deferDelivery) {
            // The caller still holds the task mutation lock. Persist the queue
            // append now, but schedule network delivery outside that callback.
            Promise.resolve().then(() => {
              if (busy) flushRequested = true;
              else void attemptFlush();
            });
          } else await attemptFlush();
        }
        return result;
        });
      }, () => {
        status('Task completion was not queued because this browser could not safely isolate webhook destinations. No event was sent.' + storageWarning());
        return { queued: false, reason: 'fingerprint-unavailable' };
      });
    }

    // Remove any endpoint saved by an older version, but never read or restore
    // it. The queue remains independent and can be delivered after re-entry.
    legacyConfigCleanupFailed = !clearLegacyConfig();
    const queueState = readQueue();
    queue = queueState.value;
    queueReadFailed = !queueState.ok;

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', onSave);
    }
    if (testEl && typeof testEl.addEventListener === 'function') {
      testEl.addEventListener('click', () => { void onTest(); });
    }
    if (flushEl && typeof flushEl.addEventListener === 'function') {
      flushEl.addEventListener('click', () => { void attemptFlush(); });
    }
    if (clearQueueEl && typeof clearQueueEl.addEventListener === 'function') {
      clearQueueEl.addEventListener('click', () => { void onClearQueue(); });
    }
    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('online', () => { void attemptFlush(); });
      // Keep this tab's queue count fresh when another tab writes. This event
      // is informational only; all read-modify-write and delivery operations
      // still require the Web Locks exclusive lock above.
      win.addEventListener('storage', (event) => {
        if (!event) return;
        const generationChanged = taskMutation
          && (event.key === taskMutation.GENERATION_KEY || event.key === null);
        if (generationChanged) {
          const generation = taskMutation.readGeneration(storage);
          if (!generation.ok) {
            invalidateForClearAll(clearEpoch + 1);
          } else if (generation.value.clearEpoch > clearEpoch) {
            invalidateForClearAll(generation.value.clearEpoch);
          }
        }
        if (!webhookApi || (event.key !== webhookApi.QUEUE_KEY && event.key !== null)) return;
        const state = readQueue();
        if (!state.ok) {
          queueReadFailed = true;
          status('The shared webhook queue could not be refreshed from browser storage.' + storageWarning());
        } else {
          queueReadFailed = false;
          queue = state.value;
        }
        renderQueue();
      });
    }
    status(storageAccessFailed || queueReadFailed || legacyConfigCleanupFailed
      ? 'Webhook storage could not be read or safely prepared; queued events were left untouched. Automatic delivery is paused.' + storageWarning()
      : 'Add an https:// webhook URL to enable automation. The endpoint is kept only in this tab and must be re-entered after reload.'
        + (queue.length ? ' ' + queueNote() : '') + storageWarning());

    renderQueue();

    const handle = {
      onSave,
      onTest,
      notifyTaskCompleted,
      flush: attemptFlush,
      clearQueue: onClearQueue,
      prepareForClearAll,
      resetQueueAfterExternalClear,
      readConfig: () => config,
      readQueue: () => pendingQueueView(),
      detach() {
        setBusy(false);
      }
    };
    activeHandle = handle;
    return handle;
  }

  const api = {
    attachWebhookUi,
    notifyTaskCompleted(task, options) {
      if (activeHandle) return activeHandle.notifyTaskCompleted(task, options);
      return { queued: false, reason: 'not-attached' };
    },
    clearQueue() {
      if (activeHandle) return activeHandle.clearQueue();
      return { cleared: false, reason: 'not-attached' };
    },
    prepareForClearAll() {
      if (activeHandle) return activeHandle.prepareForClearAll();
      return { reset: false, legacyConfigCleared: false };
    },
    resetQueueAfterExternalClear() {
      if (activeHandle) return activeHandle.resetQueueAfterExternalClear();
      return false;
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkWebhookUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachWebhookUi({ document, window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
