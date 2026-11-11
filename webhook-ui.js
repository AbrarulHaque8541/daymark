/*
 * Daymark task-completion webhook UI wiring for the web prototype.
 *
 * A small network-delivery automation card with bounded queue/retry: save an https:// webhook URL and every
 * task completed in this prototype announces a minimal JSON event to it.
 * Offline, failures, and a missing fetch all degrade gracefully - events queue
 * on this device (bounded) and are sent only on an explicit Retry, an 'online'
 * event, or the next completed task. Nothing polls and nothing wakes the radio
 * on a timer: zero battery drain by design. Mirrors the weather/currency
 * module style: attachWebhookUi(env) is fully injectable for unit tests.
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
    let memoryOnlyEvents = [];
    // If a POST succeeded but the queue-removal write failed, remember those
    // resolved IDs in this tab so Retry can persist their removal without
    // sending them a second time during the same page lifetime.
    let resolvedUnpersistedIds = new Set();

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
        const legacyAssignment = await assignLegacyQueueToEndpoint(endpointFingerprint);
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
          let deliveredCount = 0;
          let droppedCount = 0;
          let lastFailure = null;

          // The delivery lock prevents two tabs from sending the same queue
          // entry. The separate, short-lived queue lock is released before
          // network I/O so another tab can durably append a completion while
          // this tab is waiting for the webhook endpoint.
          while (true) {
            const snapshot = await withQueueLock(() => {
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
            const event = queue[0];
            if (event.endpointFingerprint !== endpointFingerprint) {
              status('Skipped a queued event bound to a different endpoint. ' + queueNote() + storageWarning());
              break;
            }
            let response;
            try {
              response = await fetchImpl(config.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event.payload)
              });
            } catch (error) {
              lastFailure = error;
              status('Webhook delivery failed: ' + (error && error.message ? error.message : 'network error')
                + '. ' + queueNote() + storageWarning());
              break;
            }
            if (!response || !response.ok) {
              lastFailure = new Error('HTTP ' + (response && response.status));
              status('Webhook delivery failed: HTTP ' + (response && response.status) + '. '
                + queueNote() + storageWarning());
              break;
            }
            deliveredCount += 1;
            const remaining = queue.slice(1);
            if (!persistQueue(remaining)) {
              resolvedUnpersistedIds.add(event.id);
              queueWriteFailed = true;
              status('Delivered 1 event, but could not remove it from the shared queue. Retry will skip it in this tab. '
                + storageWarning());
              break;
            }
            queue = remaining;
            if (droppedCount) {
              status('Delivered ' + deliveredCount + ' event(s); dropped ' + droppedCount + ' older event(s) that exceeded the queue limit. ' + storageWarning());
            }
          }
          return { deliveredCount, droppedCount, lastFailure };
        });
        if (delivery.ok && delivery.value) {
          if (delivery.value.deliveredCount > 0 && !delivery.value.lastFailure) {
            status('Delivered ' + delivery.value.deliveredCount + ' webhook event(s). ' + queueNote() + storageWarning());
          }
        }
      } finally {
        finishBusyOperation();
      }
    }

    function onSave(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (!webhookApi || !urlEl) return;
      const raw = typeof urlEl.value === 'string' ? urlEl.value.trim() : '';
      if (!raw) {
        status('Enter an https:// webhook URL.');
        return;
      }
      let parsed;
      try {
        parsed = webhookApi.parseWebhookUrl(raw);
      } catch (error) {
        status('Invalid webhook URL: ' + (error && error.message ? error.message : 'must be https://'));
        return;
      }
      config = { url: parsed.href };
      endpointFingerprintPromise = null;
      status('Webhook endpoint set for this tab. Events will be delivered on task completion or Retry.' + storageWarning());
      void attemptFlush();
    }

    function onTest() {
      if (!config) {
        status('Save an https:// webhook URL first.');
        return;
      }
      const testEvent = webhookApi.createEvent({
        id: 'test-' + Date.now(),
        type: 'daymark.webhook.test',
        taskId: null,
        title: 'Daymark webhook test',
        completedAt: now()
      });
      memoryOnlyEvents.push(testEvent);
      status('Queued a test event. ' + queueNote());
      void attemptFlush();
    }

    function onFlush() {
      flushRequested = true;
      void attemptFlush();
    }

    function onClearQueue() {
      if (!confirmImpl && !env.confirm) {
        status('Could not ask for confirmation. Queue was not cleared.');
        return;
      }
      const confirmed = (typeof env.confirm === 'function' ? env.confirm : win.confirm)(
        'Clear all queued webhook events in this browser? This cannot be undone.'
      ) === true;
      if (!confirmed) {
        status('Cancelled. Queue was not cleared.');
        return;
      }
      setBusy(true);
      withQueueLock(() => {
        if (persistQueue([])) {
          queue = [];
          memoryOnlyEvents = [];
          resolvedUnpersistedIds.clear();
          queueWriteFailed = false;
          status('Cleared all queued webhook events.' + storageWarning());
        } else {
          status('Could not clear the queue: storage write failed.' + storageWarning());
        }
      }).then(() => finishBusyOperation());
    }

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', onSave);
    }
    if (saveEl && typeof saveEl.addEventListener === 'function') {
      saveEl.addEventListener('click', onSave);
    }
    if (testEl && typeof testEl.addEventListener === 'function') {
      testEl.addEventListener('click', onTest);
    }
    if (flushEl && typeof flushEl.addEventListener === 'function') {
      flushEl.addEventListener('click', onFlush);
    }
    if (clearQueueEl && typeof clearQueueEl.addEventListener === 'function') {
      clearQueueEl.addEventListener('click', onClearQueue);
    }

    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('online', () => { if (!busy) void attemptFlush(); });
    }

    status('Webhook card ready. Enter an https:// URL and Save to enable delivery.' + storageWarning());
    renderQueue();

    return {
      attemptFlush,
      onSave,
      onTest,
      onFlush,
      onClearQueue,
      detach() {
        if (formEl && typeof formEl.removeEventListener === 'function') formEl.removeEventListener('submit', onSave);
      }
    };
  }

  const api = { attachWebhookUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkWebhookUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachWebhookUi({ document, window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
