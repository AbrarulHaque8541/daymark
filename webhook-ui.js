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

  let activeHandle = null;

  function attachWebhookUi(env) {
    if (!env || !env.document) throw new Error('attachWebhookUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const storage = env.localStorage || (win && win.localStorage) || null;
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
    const clearQueueEl = element('webhook-clear-queue');
    const statusEl = element('webhook-status');

    const LOCK_KEY = 'daymark.webhook.lock.v1';
    let config = null;
    let queue = [];
    let busy = false;

    function withQueueLock(mutator) {
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
        return { ok: false, reason: 'no-storage' };
      }
      const owner = Math.random().toString(36).slice(2, 10);
      const nowMs = Date.now();
      let acquired = false;
      for (let attempt = 0; attempt < 8 && !acquired; attempt++) {
        const existing = storage.getItem(LOCK_KEY);
        let stale = true;
        if (existing) {
          const parts = String(existing).split('|');
          const ts = Number(parts[0]);
          if (Number.isFinite(ts) && nowMs - ts < 5000) stale = false;
        }
        if (!existing || stale) {
          storage.setItem(LOCK_KEY, nowMs + '|' + owner);
          const check = storage.getItem(LOCK_KEY);
          if (check && check.endsWith('|' + owner)) acquired = true;
        }
      }
      if (!acquired) return { ok: false, reason: 'lock-busy' };
      try {
        const current = readQueue();
        const previous = current.slice();
        const next = mutator(current.slice());
        if (Array.isArray(next)) {
          queue = next;
          persistQueue();
        }
        return { ok: true, previous: previous, queue: queue.slice() };
      } finally {
        try {
          const held = storage.getItem(LOCK_KEY);
          if (held && held.endsWith('|' + owner) && typeof storage.removeItem === 'function') {
            storage.removeItem(LOCK_KEY);
          }
        } catch (error) {
          // best-effort release
        }
      }
    }

    function syncQueueFromStorage() {
      const latest = readQueue();
      queue = latest;
      renderQueue();
    }

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function isOnline() {
      return !navigator || typeof navigator.onLine !== 'boolean' || navigator.onLine;
    }

    function setBusy(isBusy) {
      busy = isBusy;
      [saveEl, testEl, flushEl, clearQueueEl].forEach((button) => {
        if (!button) return;
        button.disabled = isBusy || (button === flushEl && queue.length === 0);
        if (button.classList && typeof button.classList.toggle === 'function') {
          button.classList.toggle('is-busy', isBusy);
        }
        if (typeof button.setAttribute === 'function') {
          if (isBusy) button.setAttribute('aria-busy', 'true');
          else button.removeAttribute('aria-busy');
        }
      });
    }

    function readConfig() {
      if (!storage || typeof storage.getItem !== 'function' || !webhookApi) return null;
      const raw = storage.getItem(webhookApi.CONFIG_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return webhookApi.validateWebhookConfig(parsed) ? parsed : null;
      } catch (error) {
        return null;
      }
    }

    function persistConfig() {
      if (!storage || typeof storage.setItem !== 'function' || !webhookApi) return false;
      try {
        if (config) storage.setItem(webhookApi.CONFIG_KEY, JSON.stringify(config));
        else if (typeof storage.removeItem === 'function') storage.removeItem(webhookApi.CONFIG_KEY);
        else storage.setItem(webhookApi.CONFIG_KEY, JSON.stringify(null));
        return true;
      } catch (error) {
        return false;
      }
    }

    function readQueue() {
      if (!storage || typeof storage.getItem !== 'function' || !webhookApi) return [];
      const raw = storage.getItem(webhookApi.QUEUE_KEY);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return webhookApi.validateQueue(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    }

    function persistQueue() {
      if (!storage || typeof storage.setItem !== 'function' || !webhookApi) return false;
      try {
        storage.setItem(webhookApi.QUEUE_KEY, JSON.stringify(queue));
        return true;
      } catch (error) {
        return false;
      }
    }

    function queueNote() {
      return queue.length ? queue.length + ' event(s) queued on this device.' : '';
    }

    function renderQueue() {
      if (flushEl) flushEl.disabled = busy || queue.length === 0;
      if (clearQueueEl) clearQueueEl.disabled = busy || queue.length === 0;
    }

    async function attemptFlush() {
      if (busy) return;
      if (!config || !webhookApi) return;
      syncQueueFromStorage();
      if (!queue.length) return;
      if (!fetchImpl) {
        status('Webhook delivery is unavailable: fetch is missing in this browser. ' + queueNote());
        renderQueue();
        return;
      }
      if (!isOnline()) {
        status('Offline - ' + queueNote() + ' They send on the next connection or Retry.');
        renderQueue();
        return;
      }
      const claimed = withQueueLock((current) => {
        // Claim by removing from durable storage before delivery so concurrent tabs cannot double-send.
        return [];
      });
      if (!claimed.ok) {
        status('Could not claim the webhook queue right now. Try again in a moment. ' + queueNote());
        renderQueue();
        return;
      }
      const toDeliver = claimed.previous && claimed.previous.length ? claimed.previous : [];
      if (!toDeliver.length) {
        renderQueue();
        return;
      }
      setBusy(true);
      try {
        const result = await webhookApi.flushQueue(toDeliver, config.url, fetchImpl);
        const remaining = result.queue || [];
        if (remaining.length) {
          withQueueLock((current) => {
            const merged = current.concat(remaining);
            while (merged.length > (webhookApi.MAX_QUEUE_EVENTS || 25)) merged.shift();
            return merged;
          });
        }
        syncQueueFromStorage();
        const parts = [];
        if (result.deliveredCount > 0) parts.push('Delivered ' + result.deliveredCount + ' event(s).');
        if (result.droppedCount > 0) parts.push(result.droppedCount + ' event(s) were dropped after too many attempts.');
        if (result.failure) parts.push('Could not deliver: ' + result.failure);
        status((parts.join(' ') || 'No queued webhook events.') + (queue.length ? ' ' + queueNote() : ''));
      } catch (error) {
        // Put the claimed events back on failure to avoid silent loss.
        withQueueLock((current) => {
          const restored = toDeliver.concat(current);
          while (restored.length > (webhookApi.MAX_QUEUE_EVENTS || 25)) restored.shift();
          return restored;
        });
        syncQueueFromStorage();
        status('Could not deliver: ' + (error && error.message ? error.message : 'unknown error'));
      } finally {
        setBusy(false);
        renderQueue();
      }
    }

    function onSave(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      const raw = urlEl && typeof urlEl.value === 'string' ? urlEl.value.trim() : '';
      if (!raw) {
        if (config) {
          config = null;
          persistConfig();
          status('Webhook cleared. Completed tasks stay on this device.');
          return { saved: false, cleared: true };
        }
        status('Add an https:// webhook URL to enable automation.');
        return { saved: false, cleared: false };
      }
      if (!webhookApi || !webhookApi.isValidWebhookUrl(raw)) {
        status('Enter a valid https:// webhook URL. Plain http is not allowed.');
        return { saved: false, cleared: false };
      }
      config = { version: 1, url: raw };
      const saved = persistConfig();
      status(saved
        ? 'Webhook saved. Completed tasks will be announced to your endpoint.'
        : 'Webhook set for this tab, but browser storage could not save it.');
      void attemptFlush();
      return { saved: true, cleared: false };
    }

    async function onTest() {
      if (busy) return;
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
        status('Test event failed: ' + (error && error.message ? error.message : 'unknown error'));
      } finally {
        setBusy(false);
        renderQueue();
      }
    }

    function notifyTaskCompleted(task) {
      if (!webhookApi) return { queued: false, reason: 'unavailable' };
      if (!config) return { queued: false, reason: 'disabled' };
      let event;
      try {
        const payload = webhookApi.buildTaskCompletedPayload(task, now());
        event = webhookApi.makeQueueEvent(payload, now());
      } catch (error) {
        status('Could not prepare the webhook event: '
          + (error && error.message ? error.message : 'unknown error'));
        return { queued: false, reason: 'invalid' };
      }
      const locked = withQueueLock((current) => {
        try {
          return webhookApi.enqueueEvent(current, event);
        } catch (error) {
          throw error;
        }
      });
      if (!locked.ok) {
        status('Could not queue the webhook event right now (storage busy). Try again.');
        return { queued: false, reason: 'lock-busy' };
      }
      syncQueueFromStorage();
      renderQueue();
      void attemptFlush();
      return { queued: true, reason: 'queued' };
    }

    config = readConfig();
    queue = readQueue();
    if (config && urlEl && typeof urlEl.value === 'string' && !urlEl.value) urlEl.value = config.url;
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
      clearQueueEl.addEventListener('click', () => {
        const cleared = withQueueLock(() => []);
        if (cleared.ok) {
          syncQueueFromStorage();
          status('Queued webhook events cleared from this device.');
        } else {
          status('Could not clear the queue right now. Try again.');
        }
        renderQueue();
      });
    }
    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('online', () => { void attemptFlush(); });
      win.addEventListener('storage', (ev) => {
        if (ev && (ev.key === webhookApi.QUEUE_KEY || ev.key === LOCK_KEY || ev.key === null)) {
          syncQueueFromStorage();
        }
      });
    }
    status(config
      ? ('Webhook ready. Completed tasks will be announced to your endpoint.' + (queue.length ? ' ' + queueNote() : ''))
      : 'Add an https:// webhook URL to enable automation.');
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
    const boot = () => attachWebhookUi({ document, window, localStorage: window.localStorage });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
