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
    let configReadFailed = storageAccessFailed;
    let queueReadFailed = storageAccessFailed;
    let configWriteFailed = false;
    let queueWriteFailed = false;

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function isOnline() {
      return !navigator || typeof navigator.onLine !== 'boolean' || navigator.onLine;
    }

    function setBusy(isBusy) {
      busy = isBusy;
      [saveEl, testEl, flushEl].forEach((button) => {
        if (!button) return;
        button.disabled = isBusy || (button === flushEl
          && ((queue.length === 0 && !queueWriteFailed) || storageAccessFailed || queueReadFailed));
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
      if (storageAccessFailed || !storage || !webhookApi) return { ok: false, value: null };
      try {
        if (typeof storage.getItem !== 'function') return { ok: false, value: null };
        const raw = storage.getItem(webhookApi.CONFIG_KEY);
        if (raw === null) return { ok: true, value: null };
        const parsed = JSON.parse(raw);
        if (parsed === null) return { ok: true, value: null };
        return webhookApi.validateWebhookConfig(parsed)
          ? { ok: true, value: parsed }
          : { ok: false, value: null };
      } catch (error) {
        return { ok: false, value: null };
      }
    }

    function persistConfig(nextConfig, allowUnreadableReplacement) {
      if (storageAccessFailed || !storage || !webhookApi
        || (configReadFailed && !allowUnreadableReplacement)) {
        configWriteFailed = true;
        return false;
      }
      try {
        if (nextConfig) {
          if (typeof storage.setItem !== 'function') throw new Error('storage write unavailable');
          storage.setItem(webhookApi.CONFIG_KEY, JSON.stringify(nextConfig));
        } else if (typeof storage.removeItem === 'function') {
          storage.removeItem(webhookApi.CONFIG_KEY);
        } else if (typeof storage.setItem === 'function') {
          storage.setItem(webhookApi.CONFIG_KEY, JSON.stringify(null));
        } else {
          throw new Error('storage removal unavailable');
        }
        configWriteFailed = false;
        return true;
      } catch (error) {
        configWriteFailed = true;
        return false;
      }
    }

    function readQueue() {
      if (storageAccessFailed || !storage || !webhookApi) return { ok: false, value: [] };
      try {
        if (typeof storage.getItem !== 'function') return { ok: false, value: [] };
        const raw = storage.getItem(webhookApi.QUEUE_KEY);
        if (raw === null) return { ok: true, value: []; };
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
      if (configReadFailed) problems.push('saved webhook settings could not be read');
      if (queueReadFailed) problems.push('queued webhook events could not be read');
      if (configWriteFailed) problems.push('webhook settings could not be saved');
      if (queueWriteFailed) problems.push('queued webhook events could not be saved');
      return problems.length
        ? ' Storage warning: ' + problems.join('; ') + '. No unreadable stored values were overwritten.'
        : '';
    }

    function queueNote() {
      return queue.length ? queue.length + ' event(s) queued on this device.' : '';
    }

    function renderQueue() {
      if (flushEl) flushEl.disabled = busy || (queue.length === 0 && !queueWriteFailed)
        || storageAccessFailed || queueReadFailed;
    }

    async function attemptFlush() {
      if (busy) return;
      if (storageAccessFailed || configReadFailed || queueReadFailed) {
        status('Webhook delivery is paused because saved settings or queued events could not be read.' + storageWarning());
        renderQueue();
        return;
      }
      let queuePersisted = false;
      if (queueWriteFailed) {
        queuePersisted = persistQueue(queue);
        if (!queuePersisted) {
          status('Webhook delivery is paused because the queued events could not be saved. ' + queueNote() + storageWarning());
          renderQueue();
          return;
        }
      }
      if (!config || !webhookApi || !queue.length) {
        renderQueue();
        return;
      }
      if (!queuePersisted && !persistQueue(queue)) {
        status('Webhook delivery is paused because the queued events could not be saved. ' + queueNote() + storageWarning());
        renderQueue();
        return;
      }
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
      setBusy(true);
      try {
        const result = await webhookApi.flushQueue(queue, config.url, fetchImpl);
        queue = result.queue;
        const persisted = persistQueue(queue);
        const parts = [];
        if (result.deliveredCount > 0) parts.push('Delivered ' + result.deliveredCount + ' event(s).');
        if (result.droppedCount > 0) parts.push(result.droppedCount + ' event(s) were dropped after too many attempts.');
        if (result.failure) parts.push('Could not deliver: ' + result.failure);
        if (!persisted) parts.push('Queue state could not be saved; delivered events may be retried after reload.');
        status((parts.join(' ') || 'No queued webhook events.') + (queue.length ? ' ' + queueNote() : '') + storageWarning());
      } catch (error) {
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
        if (configReadFailed || storageAccessFailed) {
          status('Saved webhook settings could not be read; nothing was cleared.' + storageWarning());
          return { saved: false, cleared: false };
        }
        if (config) {
          if (!persistConfig(null, false)) {
            status('Webhook could not be cleared; saved settings were not changed.' + storageWarning());
            return { saved: false, cleared: false };
          }
          config = null;
          status('Webhook cleared. Completed tasks stay on this device.' + storageWarning());
          return { saved: false, cleared: true };
        }
        status('Add an https:// webhook URL to enable automation.' + storageWarning());
        return { saved: false, cleared: false };
      }
      if (!webhookApi || !webhookApi.isValidWebhookUrl(raw)) {
        status('Enter a valid https:// webhook URL. Plain http is not allowed.');
        return { saved: false, cleared: false };
      }
      if (storageAccessFailed || !storage) {
        status('Browser storage is unavailable; the webhook was not saved.' + storageWarning());
        return { saved: false, cleared: false };
      }
      const nextConfig = { version: 1, url: raw };
      const saved = persistConfig(nextConfig, true);
      if (!saved) {
        status('Webhook could not be saved; existing settings were not changed.' + storageWarning());
        return { saved: false, cleared: false };
      }
      configReadFailed = false;
      config = nextConfig;
      status('Webhook saved. Completed tasks will be announced to your endpoint.' + storageWarning());
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
      if (storageAccessFailed || configReadFailed || queueReadFailed) {
        status('Task completion was not queued or sent because saved webhook settings or queued events could not be read.' + storageWarning());
        return { queued: false, reason: 'storage-unavailable' };
      }
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
      let nextQueue;
      try {
        nextQueue = webhookApi.enqueueEvent(queue, event);
      } catch (error) {
        status('Could not queue the webhook event: '
          + (error && error.message ? error.message : 'unknown error'));
        return { queued: false, reason: 'invalid' };
      }
      if (!persistQueue(nextQueue)) {
        queue = nextQueue;
        renderQueue();
        status('Webhook event is held only in this tab; it was not sent because the queue could not be saved. '
          + queueNote() + storageWarning());
        return { queued: true, reason: 'memory-only' };
      }
      queue = nextQueue;
      renderQueue();
      void attemptFlush();
      return { queued: true, reason: 'queued' };
    }

    const configState = readConfig();
    config = configState.value;
    configReadFailed = !configState.ok;
    const queueState = readQueue();
    queue = queueState.value;
    queueReadFailed = !queueState.ok;
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
    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('online', () => { void attemptFlush(); });
    }
    status(configReadFailed || queueReadFailed || storageAccessFailed
      ? 'Webhook storage could not be read; existing settings and queued events were left untouched. Automatic delivery is paused.' + storageWarning()
      : config
        ? ('Webhook ready. Completed tasks will be announced to your endpoint.' + (queue.length ? ' ' + queueNote() : ''))
        : 'Add an https:// webhook URL to enable automation.' + storageWarning());
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
