/*
 * Daymark task-completion webhook UI wiring for the web prototype.
 *
 * A small offline-first automation card: save an https:// webhook URL and every
 * task completed in this prototype announces a minimal JSON event to it.
 * Offline, failures, and a missing fetch all degrade gracefully - events queue
 * on this device (bounded) and are sent only on an explicit Retry, an 'online'
 * event, or the next completed task. Nothing polls and nothing wakes the radio
 * on a timer: zero battery drain by design. Mirrors the weather/currency
 * module style: attachWebhookUi(env) is fully injectable for unit tests.
 */
((root) => {
  'use strict';

  const QUEUE_LOCK_NAME = 'daymark.webhook.queue.v1';
  let activeHandle = null;

  function attachWebhookUi(env) {
    if (!env || !env.document) throw new Error('attachWebhookUi requires a document.');
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
    const webhookApi = env.webhookApi || root.DaymarkWebhook || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);
    const navigator = env.navigator || (win && win.navigator) || null;

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const urlEl = element('webhook-url');
    const formEl = element('webhook-form');
    const saveEl = element('webhook-save');
    const testEl = element('webhook-test');
    const flushEl = element('webhook-flush');
    const statusEl = element('webhook-status');

    let config = null;
    let queue = [];
    let busy = false;
    let queueReadFailed = storageAccessFailed;
    let legacyConfigCleanupFailed = false;
    let queueWriteFailed = false;
    let flushRequested = false;
    let coordinationFailed = false;
    let memoryOnlyEvents = [];

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

    function queueCoordinatorAvailable() {
      try {
        return !!(navigator && navigator.locks && typeof navigator.locks.request === 'function');
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

    async function withQueueLock(operation) {
      let locks = null;
      try {
        locks = navigator && navigator.locks;
      } catch (error) {
        locks = null;
      }
      if (!locks || typeof locks.request !== 'function') {
        coordinationFailed = true;
        return { ok: false, reason: 'unavailable' };
      }
      try {
        const value = await locks.request(QUEUE_LOCK_NAME, { mode: 'exclusive' }, operation);
        coordinationFailed = false;
        return { ok: true, value };
      } catch (error) {
        coordinationFailed = true;
        return { ok: false, reason: 'failed' };
      }
    }

    function setBusy(isBusy) {
      busy = isBusy;
      [saveEl, testEl, flushEl].forEach((button) => {
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

    function queueNote() {
      return queue.length ? queue.length + ' event(s) queued on this device.' : '';
    }

    function renderQueue() {
      if (flushEl) flushEl.disabled = busy || (queue.length === 0 && !queueWriteFailed)
        || storageAccessFailed || queueReadFailed || legacyConfigCleanupFailed || !queueCoordinatorAvailable();
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
      if (!fetchImpl) {
        status('Webhook delivery is unavailable: fetch is missing in this browser. ' + queueNote() + storageWarning());
        renderQueue();
        return;
      }
      if (!isOnline()) {
        status('Offline - ' + queueNote() + ' They send on the next connection or Retry.' + storageWarning());
        renderQueue();
        return;
      }

      setBusy(true);
      try {
        const locked = await withQueueLock(async () => {
          coordinationFailed = false;
          // Always read the latest durable queue while holding the origin-wide
          // exclusive Web Lock. The storage event below is UI refresh only; it
          // is deliberately not used as a mutual-exclusion mechanism.
          const state = readQueue();
          if (!state.ok) {
            queueReadFailed = true;
            status('Webhook delivery is paused because the shared queue could not be read.' + storageWarning());
            renderQueue();
            return { reason: 'storage-unavailable' };
          }
          queueReadFailed = false;
          queue = state.value;

          // Events whose first durable write failed are held only in this tab.
          // Reconcile just those explicit memory-only events with the fresh
          // locked snapshot; never write a stale tab snapshot over another tab.
          if (memoryOnlyEvents.length) {
            let merged = queue.slice();
            const seen = new Set(merged.map((event) => event.id));
            memoryOnlyEvents.forEach((event) => {
              if (!seen.has(event.id)) {
                merged = webhookApi.enqueueEvent(merged, event);
                seen.add(event.id);
              }
            });
            if (!persistQueue(merged)) {
              queue = merged;
              queueWriteFailed = true;
              status('Webhook delivery is paused because the queued events could not be saved. '
                + queueNote() + storageWarning());
              renderQueue();
              return { reason: 'storage-unavailable' };
            }
            queue = merged;
            memoryOnlyEvents = [];
            queueWriteFailed = false;
          }

          if (!config) return { reason: 'disabled' };
          if (!queue.length) {
            queueWriteFailed = false;
            status('No queued webhook events.' + storageWarning());
            renderQueue();
            return { reason: 'empty' };
          }

          // Verify that the current snapshot is still writable before sending.
          if (!persistQueue(queue)) {
            status('Webhook delivery is paused because the queued events could not be saved. '
              + queueNote() + storageWarning());
            renderQueue();
            return { reason: 'storage-unavailable' };
          }
          if (!isOnline()) {
            status('Offline - ' + queueNote() + ' They send on the next connection or Retry.' + storageWarning());
            renderQueue();
            return { reason: 'offline' };
          }

          // Hold the same exclusive lock across the POSTs and final queue write.
          // A second tab must re-read after this operation; it cannot send the
          // same snapshot concurrently or overwrite it with stale state.
          const flushingQueue = queue.slice();
          const result = await webhookApi.flushQueue(flushingQueue, config.url, fetchImpl);
          const persisted = persistQueue(result.queue);
          queue = result.queue;
          if (!persisted) queueWriteFailed = true;

          const parts = [];
          if (result.deliveredCount > 0) parts.push('Delivered ' + result.deliveredCount + ' event(s).');
          if (result.droppedCount > 0) parts.push(result.droppedCount + ' event(s) were dropped after too many attempts.');
          if (result.failure) parts.push('Could not deliver webhook events. Check the endpoint and retry.');
          if (!persisted) parts.push('Queue state could not be saved; delivered events may be retried after reload.');
          status((parts.join(' ') || 'No queued webhook events.')
            + (queue.length ? ' ' + queueNote() : '') + storageWarning());
          renderQueue();
          return { reason: 'flushed', result, persisted };
        });

        if (!locked.ok) {
          status('Webhook delivery is paused because this browser could not obtain the cross-tab queue lock. '
            + storageWarning());
          renderQueue();
          return;
        }
      } finally {
        finishBusyOperation();
      }
    }

    function onSave(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      const raw = urlEl && typeof urlEl.value === 'string' ? urlEl.value.trim() : '';
      if (!raw) {
        if (config) {
          config = null;
          status('Webhook disabled for this tab. Queued events remain on this device.' + storageWarning());
          return { saved: false, cleared: true, sessionOnly: true };
        }
        status('Add an https:// webhook URL to enable automation. The endpoint stays in this tab only and must be re-entered after reload.'
          + (queue.length ? ' ' + queueNote() : '') + storageWarning());
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
      status('Webhook enabled for this tab only. Re-enter the endpoint after reload.' + storageWarning());
      void attemptFlush();
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
      setBusy(true);
      status('Sending a test event...');
      try {
        const payload = webhookApi.buildTaskCompletedPayload({ title: 'Daymark test event', priority: 'medium' }, now());
        await webhookApi.deliverWebhook(raw, payload, fetchImpl);
        status('Test event delivered. Your endpoint is reachable.' + (queue.length ? ' ' + queueNote() : ''));
      } catch (error) {
        status('Test event failed. Check the endpoint and retry.');
      } finally {
        finishBusyOperation();
      }
    }

    function notifyTaskCompleted(task) {
      if (!webhookApi) return { queued: false, reason: 'unavailable' };
      if (storageAccessFailed || legacyConfigCleanupFailed) {
        status('Task completion was not queued or sent because browser storage could not be safely accessed.' + storageWarning());
        return { queued: false, reason: 'storage-unavailable' };
      }
      if (!config) return { queued: false, reason: 'disabled' };
      if (!queueCoordinatorAvailable()) {
        coordinationFailed = true;
        status('Task completion was not queued because this browser cannot safely coordinate the shared webhook queue across tabs.' + storageWarning());
        return { queued: false, reason: 'coordination-unavailable' };
      }

      let event;
      try {
        const payload = webhookApi.buildTaskCompletedPayload(task, now());
        event = webhookApi.makeQueueEvent(payload, now());
      } catch (error) {
        status('Could not prepare the webhook event.');
        return { queued: false, reason: 'invalid' };
      }

      return withQueueLock(() => {
        coordinationFailed = false;
        const state = readQueue();
        if (!state.ok) {
          queueReadFailed = true;
          status('Task completion was not queued or sent because the shared queue could not be read.' + storageWarning());
          renderQueue();
          return { queued: false, reason: 'storage-unavailable' };
        }
        queueReadFailed = false;
        const nextQueue = webhookApi.enqueueEvent(state.value, event);
        if (!persistQueue(nextQueue)) {
          queue = nextQueue;
          if (!memoryOnlyEvents.some((pending) => pending.id === event.id)) memoryOnlyEvents.push(event);
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
        if (!locked.ok) {
          status('Task completion was not queued or sent because this browser could not obtain the cross-tab queue lock. '
            + storageWarning());
          renderQueue();
          return { queued: false, reason: 'coordination-unavailable' };
        }
        const result = locked.value;
        if (result && result.queued && result.reason === 'queued') {
          if (busy) flushRequested = true;
          else await attemptFlush();
        }
        return result;
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
    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('online', () => { void attemptFlush(); });
      // Keep this tab's queue count fresh when another tab writes. This event
      // is informational only; all read-modify-write and delivery operations
      // still require the Web Locks exclusive lock above.
      win.addEventListener('storage', (event) => {
        if (!event || !webhookApi || event.key !== webhookApi.QUEUE_KEY) return;
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
      readConfig: () => config,
      readQueue: () => queue.slice(),
      detach() {
        setBusy(false);
      }
    };
    activeHandle = handle;
    return handle;
  }

  const api = {
    attachWebhookUi,
    notifyTaskCompleted(task) {
      if (activeHandle) return activeHandle.notifyTaskCompleted(task);
      return { queued: false, reason: 'not-attached' };
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
