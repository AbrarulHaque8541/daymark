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

  const ENDPOINT_FINGERPRINT_RE = /^[a-f0-9]{64}$/;

  function isValidEndpointFingerprint(value) {
    return typeof value === 'string' && ENDPOINT_FINGERPRINT_RE.test(value);
  }

  async function fingerprintWebhookUrl(value, cryptoImpl, textEncoderImpl) {
    if (!isValidWebhookUrl(value)) {
      throw new Error('A valid https:// webhook URL is required to isolate its queue.');
    }
    const cryptoApi = cryptoImpl || root.crypto;
    const Encoder = textEncoderImpl || root.TextEncoder;
    if (!cryptoApi || !cryptoApi.subtle || typeof cryptoApi.subtle.digest !== 'function'
        || typeof Encoder !== 'function') {
      throw new Error('Web Crypto SHA-256 is unavailable; endpoint-isolated webhook queueing is disabled.');
    }
    const normalized = new URL(value.trim());
    // Fragments are not sent in HTTP requests and must not split one endpoint's queue.
    normalized.hash = '';
    const digest = await cryptoApi.subtle.digest('SHA-256', new Encoder().encode(normalized.href));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function clipText(value, max) {
    return String(value === null || value === undefined ? '' : value).trim().slice(0, max);
  }

  function isDateOnly(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
  }

  function isTimeOnly(value) {
    return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
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

  function makeQueueEvent(payload, now, endpointFingerprint) {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (typeof body !== 'string' || !body) throw new Error('A webhook payload is required.');
    if (body.length > MAX_PAYLOAD_CHARS) throw new Error('The webhook payload is too large to queue.');
    if (!isValidEndpointFingerprint(endpointFingerprint)) {
      throw new Error('A verified webhook endpoint fingerprint is required to queue an event.');
    }
    const queuedAt = isIsoTimestamp(now) ? now : new Date().toISOString();
    const id = 'wh-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 11);
    return { id, payload: body, queuedAt, attempts: 0, endpointFingerprint };
  }

  function isValidQueueEvent(event) {
    const fingerprint = event && event.endpointFingerprint;
    const legacyUnassigned = fingerprint === undefined || fingerprint === null;
    return Boolean(event && typeof event === 'object'
      && typeof event.id === 'string' && event.id.length > 0 && event.id.length <= 64
      && typeof event.payload === 'string' && event.payload.length > 0
      && event.payload.length <= MAX_PAYLOAD_CHARS
      && isIsoTimestamp(event.queuedAt)
      && Number.isInteger(event.attempts) && event.attempts >= 0 && event.attempts <= MAX_ATTEMPTS
      && (legacyUnassigned || isValidEndpointFingerprint(fingerprint)));
  }

  function validateQueue(value) {
    if (!Array.isArray(value) || value.length > MAX_QUEUE_EVENTS) return false;
    const ids = new Set();
    for (const event of value) {
      if (!isValidQueueEvent(event) || ids.has(event.id)) return false;
      ids.add(event.id);
    }
    return true;
  }

  function validateWebhookConfig(value) {
    return Boolean(value && typeof value === 'object'
      && value.version === 1
      && isValidWebhookUrl(value.url));
  }

  function enqueueEvent(queue, event) {
    if (!isValidQueueEvent(event)) throw new Error('Only well-formed webhook events can be queued.');
    const list = Array.isArray(queue) ? queue.slice() : [];
    if (!validateQueue(list)) {
      throw new Error('The existing webhook queue is invalid; no events were changed.');
    }
    if (list.some((item) => item.id === event.id)) {
      const error = new Error('Webhook event IDs must be unique.');
      error.code = 'duplicate-event-id';
      throw error;
    }
    if (list.length >= MAX_QUEUE_EVENTS) {
      const error = new Error('The webhook queue is full; existing events were preserved.');
      error.code = 'queue-full';
      throw error;
    }
    list.push(event);
    return list;
  }

  function cancelResponseBody(response) {
    const body = response && response.body;
    if (!body || typeof body.cancel !== 'function') return;
    try {
      const cancellation = body.cancel();
      if (cancellation && typeof cancellation.catch === 'function') {
        cancellation.catch(() => {});
      }
    } catch (error) {
      // Response cleanup must not turn a completed webhook POST into a failure.
    }
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
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          redirect: 'error',
          cache: 'no-store',
          signal: controller ? controller.signal : undefined
        });
      } catch (error) {
        if (timedOut) throw new Error(TIMEOUT_MESSAGE);
        // Fetch implementations may include the full endpoint in their
        // error text. Never surface arbitrary network errors: webhook URLs may
        // contain bearer tokens in their path or query string.
        throw new Error('Webhook delivery failed due to a network error. No automatic retry was attempted.');
      }
      // Webhook responses are not needed. Cancel their bodies on both
      // success and HTTP failure so a hostile endpoint cannot make Daymark
      // download an unbounded response after the POST has completed.
      cancelResponseBody(response);
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
    if (!Array.isArray(queue) || !validateQueue(queue)) {
      throw new Error('The webhook queue is invalid; no events were changed.');
    }
    if (!isValidEndpointFingerprint(opts.endpointFingerprint)) {
      throw new Error('A verified webhook endpoint fingerprint is required before delivery.');
    }
    const actualFingerprint = await fingerprintWebhookUrl(url, opts.crypto, opts.TextEncoder);
    if (actualFingerprint !== opts.endpointFingerprint) {
      throw new Error('The supplied endpoint fingerprint does not match the webhook URL.');
    }
    if (queue.some((event) => event.endpointFingerprint !== opts.endpointFingerprint)) {
      throw new Error('The webhook queue contains an event for a different or unassigned endpoint; no delivery was attempted.');
    }
    let list = queue.slice();
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
    isValidEndpointFingerprint,
    fingerprintWebhookUrl,
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
