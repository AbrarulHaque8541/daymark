/*
 * Daymark task-completion webhook logic for the web prototype.
 *
 * Offline-first automation parity with the Android app's TaskWebhook contract:
 * a user-chosen https:// endpoint receives a minimal JSON "task completed"
 * event. Delivery is POST-only, HTTPS-only, refuses redirects, is bounded in
 * size, and never exports internal task IDs. Failed deliveries queue on this
 * device (bounded) and are flushed only by an explicit user action, an
 * 'online' event, or the next completed task - no polling, no timers, no
 * automatic retry storm, no maintainer backend.
 */
((root) => {
  'use strict';

  const CONFIG_KEY = 'daymark.webhook.v1';
  const QUEUE_KEY = 'daymark.webhook.queue.v1';
  const MAX_QUEUE_EVENTS = 25;
  const MAX_PAYLOAD_CHARS = 8 * 1024;
  const MAX_TITLE_CHARS = 200;
  const MAX_TAGS = 12;
  const MAX_ATTEMPTS = 5;
  const DEFAULT_TIMEOUT_MS = 8000;
  const PRIORITIES = ['low', 'medium', 'high'];
  const TIMEOUT_MESSAGE = 'Webhook request timed out. No automatic retry was attempted.';

  function isValidWebhookUrl(value) {
    if (typeof value !== 'string') return false;
    const candidate = value.trim();
    if (!candidate) return false;
    let url = null;
    try { url = new URL(candidate); } catch (error) { return false; }
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    const host = url.hostname;
    return Boolean(host) && (host.includes('.') || host === 'localhost');
  }

  function clipText(value, max) {
    return String(value === null || value === undefined ? '' : value).trim().slice(0, max);
  }

  function isDateOnly(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
  }

  function isTimeOnly(value) {
    return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
  }

  function isIsoTimestamp(value) {
    return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
  }

  function buildTaskCompletedPayload(task, occurredAt) {
    if (!task || typeof task !== 'object') throw new Error('A task object is required.');
    const when = isIsoTimestamp(occurredAt) ? occurredAt : new Date().toISOString();
    const payload = {
      event: 'daymark.task.completed',
      occurredAt: when,
      task: {
        title: clipText(task.title, MAX_TITLE_CHARS) || 'Untitled task',
        completed: true,
        priority: PRIORITIES.includes(task.priority) ? task.priority : 'medium',
        dueDate: isDateOnly(task.dueDate) ? task.dueDate : null,
        dueTime: isTimeOnly(task.dueTime) ? task.dueTime : null,
        completedAt: isIsoTimestamp(task.updatedAt) ? task.updatedAt : when
      }
    };
    // Internal task IDs and free-form notes are intentionally never exported.
    if (Array.isArray(task.tags)) {
      const tags = task.tags.filter((tag) => typeof tag === 'string' && tag.trim()).slice(0, MAX_TAGS);
      if (tags.length) payload.task.tags = tags;
    }
    return payload;
  }

  function makeQueueEvent(payload, now) {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (typeof body !== 'string' || !body) throw new Error('A webhook payload is required.');
    if (body.length > MAX_PAYLOAD_CHARS) throw new Error('The webhook payload is too large to queue.');
    const queuedAt = isIsoTimestamp(now) ? now : new Date().toISOString();
    const id = 'wh-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 11);
    return { id, payload: body, queuedAt, attempts: 0 };
  }

  function isValidQueueEvent(event) {
    return Boolean(event && typeof event === 'object'
      && typeof event.id === 'string' && event.id.length > 0 && event.id.length <= 64
      && typeof event.payload === 'string' && event.payload.length > 0
      && event.payload.length <= MAX_PAYLOAD_CHARS
      && isIsoTimestamp(event.queuedAt)
      && Number.isInteger(event.attempts) && event.attempts >= 0 && event.attempts <= MAX_ATTEMPTS);
  }

  function validateQueue(value) {
    return Array.isArray(value) && value.length <= MAX_QUEUE_EVENTS && value.every(isValidQueueEvent);
  }

  function validateWebhookConfig(value) {
    return Boolean(value && typeof value === 'object'
      && value.version === 1
      && isValidWebhookUrl(value.url));
  }

  function enqueueEvent(queue, event) {
    if (!isValidQueueEvent(event)) throw new Error('Only well-formed webhook events can be queued.');
    const list = (Array.isArray(queue) ? queue : []).filter(isValidQueueEvent);
    list.push(event);
    // Bounded storage: when the queue is full the oldest events are dropped first.
    while (list.length > MAX_QUEUE_EVENTS) list.shift();
    return list;
  }

  async function deliverWebhook(url, payload, fetchImpl, timeoutMs) {
    if (!isValidWebhookUrl(url)) throw new Error('Enter a valid https:// webhook URL first. Plain http is not allowed.');
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (body.length > MAX_PAYLOAD_CHARS) throw new Error('The webhook payload is too large to send.');
    const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
    const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    let timedOut = false;
    let timer = null;
    const timeout = new Promise((resolve, reject) => {
      timer = root.setTimeout(() => {
        timedOut = true;
        if (controller) controller.abort();
        reject(new Error(TIMEOUT_MESSAGE));
      }, duration);
    });
    const request = (async () => {
      let response = null;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
          body,
          redirect: 'error',
          cache: 'no-store',
          signal: controller ? controller.signal : undefined
        });
      } catch (error) {
        if (timedOut) throw new Error(TIMEOUT_MESSAGE);
        throw new Error('Webhook delivery failed: '
          + (error && error.message ? error.message : 'network error')
          + '. No automatic retry was attempted.');
      }
      if (!response || !response.ok) {
        throw new Error('Webhook endpoint returned HTTP '
          + (response ? response.status : 'unknown')
          + '. No automatic retry was attempted.');
      }
      return { status: response.status || 200 };
    })();
    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timer !== null) root.clearTimeout(timer);
    }
  }

  async function flushQueue(queue, url, fetchImpl, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const maxAttempts = Number.isInteger(opts.maxAttempts) && opts.maxAttempts > 0 ? opts.maxAttempts : MAX_ATTEMPTS;
    let list = (Array.isArray(queue) ? queue : []).filter(isValidQueueEvent);
    let deliveredCount = 0;
    let droppedCount = 0;
    let failure = null;
    while (list.length) {
      const event = list[0];
      if (event.attempts >= maxAttempts) {
        droppedCount += 1;
        list = list.slice(1);
        continue;
      }
      try {
        await deliverWebhook(url, event.payload, fetchImpl, opts.timeoutMs);
        deliveredCount += 1;
        list = list.slice(1);
      } catch (error) {
        failure = error && error.message ? error.message : 'unknown error';
        const updated = list.slice();
        updated[0] = Object.assign({}, event, { attempts: event.attempts + 1 });
        if (updated[0].attempts >= maxAttempts) {
          droppedCount += 1;
          updated.shift();
        }
        list = updated;
        break;
      }
    }
    return { queue: list, deliveredCount, droppedCount, failure };
  }

  const api = {
    CONFIG_KEY,
    QUEUE_KEY,
    MAX_QUEUE_EVENTS,
    MAX_PAYLOAD_CHARS,
    MAX_TITLE_CHARS,
    MAX_TAGS,
    MAX_ATTEMPTS,
    DEFAULT_TIMEOUT_MS,
    TIMEOUT_MESSAGE,
    isValidWebhookUrl,
    buildTaskCompletedPayload,
    makeQueueEvent,
    isValidQueueEvent,
    validateQueue,
    validateWebhookConfig,
    enqueueEvent,
    deliverWebhook,
    flushQueue
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkWebhook = api;
})(globalThis);
