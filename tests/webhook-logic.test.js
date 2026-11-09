'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const webhook = require('../webhook-logic.js');

const TASK = {
  id: 'secret-internal-id',
  title: 'Ship the webhook card',
  priority: 'high',
  dueDate: '2026-11-05',
  dueTime: '09:30',
  createdAt: '2026-11-01T08:00:00.000Z',
  updatedAt: '2026-11-04T10:00:00.000Z',
  tags: ['work', 'automation'],
  notes: 'private note that must never leave the device'
};

function okFetch(seen) {
  return async (url, init) => {
    seen.push({ url, init });
    return { ok: true, status: 200 };
  };
}

const failingFetch = async () => {
  throw new Error('offline');
};

test('webhook URLs must be plain https URLs without credentials', () => {
  assert.equal(webhook.isValidWebhookUrl('https://hooks.example.com/abc'), true);
  assert.equal(webhook.isValidWebhookUrl(' https://example.com/hook '), true);
  assert.equal(webhook.isValidWebhookUrl('https://localhost:9000/hook'), true);
  assert.equal(webhook.isValidWebhookUrl('http://hooks.example.com/abc'), false, 'plain http is rejected for task data parity with the Android webhook');
  assert.equal(webhook.isValidWebhookUrl('https://user:pass@example.com/hook'), false);
  assert.equal(webhook.isValidWebhookUrl('ftp://example.com/hook'), false);
  assert.equal(webhook.isValidWebhookUrl('javascript:alert(1)'), false);
  assert.equal(webhook.isValidWebhookUrl(''), false);
  assert.equal(webhook.isValidWebhookUrl(null), false);
  assert.equal(webhook.isValidWebhookUrl(42), false);
});

test('completed-task payloads are minimal and never export IDs or notes', () => {
  const payload = webhook.buildTaskCompletedPayload(TASK, '2026-11-04T10:05:00.000Z');
  assert.equal(payload.event, 'daymark.task.completed');
  assert.equal(payload.occurredAt, '2026-11-04T10:05:00.000Z');
  assert.equal(payload.task.title, 'Ship the webhook card');
  assert.equal(payload.task.completed, true);
  assert.equal(payload.task.priority, 'high');
  assert.equal(payload.task.dueDate, '2026-11-05');
  assert.equal(payload.task.dueTime, '09:30');
  assert.equal(payload.task.completedAt, '2026-11-04T10:00:00.000Z');
  assert.deepEqual(payload.task.tags, ['work', 'automation']);
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes('secret-internal-id'), false, 'internal task IDs must never be exported');
  assert.equal(serialized.includes('private note'), false, 'task notes must never be exported');
  assert.throws(() => webhook.buildTaskCompletedPayload(null), /task object/);
  assert.throws(() => webhook.buildTaskCompletedPayload('nope'), /task object/);
});

test('payload fields are sanitized and overlong titles are clipped', () => {
  const payload = webhook.buildTaskCompletedPayload({
    title: 'x'.repeat(500),
    priority: 'urgent',
    dueDate: 'not-a-date',
    dueTime: '25:99',
    tags: ['a', 7, ' ', 'b'].concat(Array.from({ length: 20 }, (_, i) => 'tag' + i))
  }, '2026-11-04T10:05:00.000Z');
  assert.equal(payload.task.title.length, webhook.MAX_TITLE_CHARS);
  assert.equal(payload.task.priority, 'medium', 'unknown priorities fall back to medium');
  assert.equal(payload.task.dueDate, null);
  assert.equal(payload.task.dueTime, null);
  assert.equal(payload.task.tags.length, webhook.MAX_TAGS, 'tag lists are capped');
  assert.ok(payload.task.tags.every((tag) => typeof tag === 'string'));
  assert.equal(webhook.buildTaskCompletedPayload({ title: '   ' }, 'nope').task.title, 'Untitled task');
  const edgeTimes = webhook.buildTaskCompletedPayload({ title: 't', dueTime: '23:59' }, '2026-11-04T10:05:00.000Z');
  assert.equal(edgeTimes.task.dueTime, '23:59', 'a real 24-hour clock time is kept');
  assert.equal(webhook.buildTaskCompletedPayload({ title: 't', dueTime: '09:60' }, '2026-11-04T10:05:00.000Z').task.dueTime, null, 'minutes above 59 are rejected');
});

test('queue events are well-formed, bounded, and validated', () => {
  const event = webhook.makeQueueEvent(webhook.buildTaskCompletedPayload(TASK, '2026-11-04T10:05:00.000Z'), '2026-11-04T10:05:00.000Z');
  assert.equal(typeof event.id, 'string');
  assert.equal(event.attempts, 0);
  assert.equal(event.queuedAt, '2026-11-04T10:05:00.000Z');
  assert.ok(webhook.isValidQueueEvent(event));
  assert.throws(() => webhook.makeQueueEvent('x'.repeat(webhook.MAX_PAYLOAD_CHARS + 1)), /too large/);
  assert.equal(webhook.isValidQueueEvent({ id: 'a', payload: 'x', queuedAt: 'nope', attempts: 0 }), false);
  assert.equal(webhook.isValidQueueEvent({ id: 'a', payload: 'x', queuedAt: '2026-11-04T10:05:00.000Z', attempts: -1 }), false);
  assert.equal(webhook.validateQueue([]), true);
  assert.equal(webhook.validateQueue([event]), true);
  assert.equal(webhook.validateQueue(null), false);
  assert.equal(webhook.validateQueue([event, event]), true);
});

test('the queue refuses overflow and preserves every existing event', () => {
  let queue = [];
  for (let index = 0; index < webhook.MAX_QUEUE_EVENTS; index += 1) {
    const payload = webhook.buildTaskCompletedPayload({ title: 'task-' + index, priority: 'low' }, '2026-11-04T10:05:00.000Z');
    queue = webhook.enqueueEvent(queue, webhook.makeQueueEvent(payload, '2026-11-04T10:05:00.000Z'));
  }
  const before = queue.slice();
  const overflowPayload = webhook.buildTaskCompletedPayload({ title: 'overflow-task', priority: 'low' }, '2026-11-04T10:05:00.000Z');
  const overflowEvent = webhook.makeQueueEvent(overflowPayload, '2026-11-04T10:05:00.000Z');
  assert.throws(
    () => webhook.enqueueEvent(queue, overflowEvent),
    (error) => error && error.code === 'queue-full',
    'a full queue rejects the new event with an explicit reason'
  );
  assert.deepEqual(queue, before, 'the caller-owned queue remains unchanged');
  assert.equal(queue.length, webhook.MAX_QUEUE_EVENTS);
  assert.equal(JSON.parse(queue[0].payload).task.title, 'task-0', 'the oldest event is preserved');
  assert.equal(JSON.parse(queue[queue.length - 1].payload).task.title, 'task-' + (webhook.MAX_QUEUE_EVENTS - 1));
  assert.throws(() => webhook.enqueueEvent(queue, { nope: true }), /well-formed/);
});

test('webhook configs validate strictly', () => {
  assert.equal(webhook.validateWebhookConfig({ version: 1, url: 'https://hooks.example.com/x' }), true);
  assert.equal(webhook.validateWebhookConfig({ version: 2, url: 'https://hooks.example.com/x' }), false);
  assert.equal(webhook.validateWebhookConfig({ version: 1, url: 'http://hooks.example.com/x' }), false);
  assert.equal(webhook.validateWebhookConfig(null), false);
});

test('flush delivers queued events in order and empties the queue', async () => {
  const seen = [];
  let queue = [];
  for (let index = 0; index < 3; index += 1) {
    const payload = webhook.buildTaskCompletedPayload({ title: 'ordered-' + index, priority: 'low' }, '2026-11-04T10:05:00.000Z');
    queue = webhook.enqueueEvent(queue, webhook.makeQueueEvent(payload, '2026-11-04T10:05:00.000Z'));
  }
  const result = await webhook.flushQueue(queue, 'https://hooks.example.com/x', okFetch(seen));
  assert.equal(result.deliveredCount, 3);
  assert.equal(result.droppedCount, 0);
  assert.equal(result.failure, null);
  assert.equal(result.queue.length, 0);
  assert.equal(seen.length, 3);
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.headers['Content-Type'], 'application/json');
  assert.equal(seen[0].init.headers['Cache-Control'], 'no-store');
  assert.equal(seen[0].init.redirect, 'error', 'webhook redirects must be refused');
  assert.equal(seen[0].init.credentials, 'omit', 'webhook requests must never attach ambient browser credentials');
  assert.equal(seen[0].init.referrerPolicy, 'no-referrer', 'webhook URLs and page context must not be exposed through the Referer header');
  const order = seen.map((entry) => JSON.parse(entry.init.body).task.title);
  assert.deepEqual(order, ['ordered-0', 'ordered-1', 'ordered-2']);
});

test('deliver cancels unconsumed response bodies on success and HTTP failure', async () => {
  let cancellations = 0;
  const response = (ok, status) => ({
    ok,
    status,
    body: {
      cancel() {
        cancellations += 1;
        return Promise.resolve();
      }
    }
  });

  const success = await webhook.deliverWebhook(
    'https://hooks.example.com/x',
    { event: 'daymark.task.completed' },
    async () => response(true, 204)
  );
  assert.equal(success.status, 204);
  assert.equal(cancellations, 1, 'successful response body is cancelled without being read');

  await assert.rejects(
    webhook.deliverWebhook(
      'https://hooks.example.com/x',
      { event: 'daymark.task.completed' },
      async () => response(false, 503)
    ),
    /HTTP 503/
  );
  assert.equal(cancellations, 2, 'HTTP error response body is cancelled before reporting failure');
});

test('a failed flush keeps the event, counts one attempt, and stops there', async () => {
  const event = webhook.makeQueueEvent(webhook.buildTaskCompletedPayload(TASK, '2026-11-04T10:05:00.000Z'), '2026-11-04T10:05:00.000Z');
  const second = webhook.makeQueueEvent(webhook.buildTaskCompletedPayload({ title: 'later', priority: 'low' }, '2026-11-04T10:05:00.000Z'), '2026-11-04T10:05:00.000Z');
  const result = await webhook.flushQueue([event, second], 'https://hooks.example.com/x', failingFetch);
  assert.equal(result.deliveredCount, 0);
  assert.equal(result.queue.length, 2);
  assert.equal(result.queue[0].attempts, 1, 'only the failed event gains an attempt');
  assert.equal(result.queue[1].attempts, 0, 'later events keep their place untouched');
  assert.match(result.failure, /network error/);
  assert.match(result.failure, /No automatic retry was attempted/);
  const retry = await webhook.flushQueue(result.queue, 'https://hooks.example.com/x', failingFetch);
  assert.equal(retry.queue[0].attempts, 2);
});

test('events that exhausted their attempts are dropped during a flush', async () => {
  const event = webhook.makeQueueEvent(webhook.buildTaskCompletedPayload(TASK, '2026-11-04T10:05:00.000Z'), '2026-11-04T10:05:00.000Z');
  event.attempts = webhook.MAX_ATTEMPTS;
  let fetchCalled = false;
  const result = await webhook.flushQueue([event], 'https://hooks.example.com/x', async () => {
    fetchCalled = true;
    return { ok: true, status: 200 };
  });
  assert.equal(fetchCalled, false, 'an exhausted event is dropped without another delivery attempt');
  assert.equal(result.queue.length, 0);
  assert.equal(result.droppedCount, 1);
});

test('the final failed attempt drops the event instead of looping forever', async () => {
  const event = webhook.makeQueueEvent(webhook.buildTaskCompletedPayload(TASK, '2026-11-04T10:05:00.000Z'), '2026-11-04T10:05:00.000Z');
  event.attempts = webhook.MAX_ATTEMPTS - 1;
  const result = await webhook.flushQueue([event], 'https://hooks.example.com/x', failingFetch);
  assert.equal(result.queue.length, 0);
  assert.equal(result.droppedCount, 1);
  assert.match(result.failure, /network error/);
});

test('deliver rejects non-2xx responses with an honest no-retry message', async () => {
  await assert.rejects(
    webhook.deliverWebhook('https://hooks.example.com/x', { event: 'daymark.task.completed' }, async () => ({ ok: false, status: 500 })),
    /HTTP 500.*No automatic retry was attempted/
  );
});

test('deliver times out stalled webhook requests', async () => {
  await assert.rejects(
    webhook.deliverWebhook('https://hooks.example.com/x', { event: 'daymark.task.completed' }, () => new Promise(() => {}), 30),
    /timed out/
  );
});

test('plain http endpoints and missing fetch are rejected before any send', async () => {
  await assert.rejects(
    webhook.deliverWebhook('http://hooks.example.com/x', { event: 'daymark.task.completed' }, async () => ({ ok: true, status: 200 })),
    /https/
  );
  await assert.rejects(
    webhook.deliverWebhook('https://hooks.example.com/x', { event: 'daymark.task.completed' }, null),
    /fetch unavailable/
  );
});

test('oversized payloads are refused before the network', async () => {
  let fetchCalled = false;
  await assert.rejects(
    webhook.deliverWebhook('https://hooks.example.com/x', 'x'.repeat(webhook.MAX_PAYLOAD_CHARS + 1), async () => {
      fetchCalled = true;
      return { ok: true, status: 200 };
    }),
    /too large/
  );
  assert.equal(fetchCalled, false);
});

test('the module exposes its constants and stays inert under Node', () => {
  assert.equal(webhook.CONFIG_KEY, 'daymark.webhook.v1');
  assert.equal(webhook.QUEUE_KEY, 'daymark.webhook.queue.v1');
  assert.equal(typeof globalThis.DaymarkWebhook, 'object');
});


test('network error messages never expose webhook endpoint paths or query secrets', async () => {
  const secretUrl = 'https://hooks.example.com/private/path?token=super-secret-token';
  const event = webhook.makeQueueEvent(
    webhook.buildTaskCompletedPayload(TASK, '2026-11-04T10:05:00.000Z'),
    '2026-11-04T10:05:00.000Z'
  );
  const result = await webhook.flushQueue([event], secretUrl, async () => {
    throw new Error('Failed to fetch ' + secretUrl);
  });
  assert.match(result.failure, /network error/);
  assert.equal(result.failure.includes('super-secret-token'), false);
  assert.equal(result.failure.includes('/private/path'), false);
  assert.equal(result.failure.includes('hooks.example.com'), false);
  assert.equal(result.queue.length, 1, 'a failed delivery remains queued');
  assert.equal(result.queue[0].attempts, 1);
});
