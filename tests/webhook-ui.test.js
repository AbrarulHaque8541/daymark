'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const webhookApi = require('../webhook-logic.js');
const ui = require('../webhook-ui.js');
const fs = require('node:fs');
const path = require('node:path');

const TASK = {
  id: 'task-1',
  title: 'Ship the webhook card',
  priority: 'high',
  dueDate: '2026-11-05',
  updatedAt: '2026-11-04T10:00:00.000Z'
};

function fakeElement(tag) {
  return {
    tagName: tag,
    id: '',
    disabled: false,
    value: '',
    textContent: '',
    listeners: [],
    addEventListener(type, handler) { this.listeners.push({ type, handler }); },
    setAttribute() {},
    removeAttribute() {},
    classList: { toggle() {} }
  };
}

function createLockManager() {
  const tails = new Map();
  return {
    request(name, options, callback) {
      const previous = tails.get(name) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const tail = previous.then(() => gate);
      tails.set(name, tail);
      return previous.then(() => callback({ name, mode: options && options.mode || 'exclusive' }))
        .finally(() => {
          release();
          if (tails.get(name) === tail) tails.delete(name);
        });
    }
  };
}

function fakeEnv(options) {
  const opts = options || {};
  const elements = {
    'webhook-url': Object.assign(fakeElement('input'), { id: 'webhook-url', value: opts.url || '' }),
    'webhook-form': Object.assign(fakeElement('form'), { id: 'webhook-form' }),
    'webhook-save': Object.assign(fakeElement('button'), { id: 'webhook-save' }),
    'webhook-test': Object.assign(fakeElement('button'), { id: 'webhook-test' }),
    'webhook-flush': Object.assign(fakeElement('button'), { id: 'webhook-flush' }),
    'webhook-status': Object.assign(fakeElement('p'), { id: 'webhook-status' })
  };
  const storageData = opts.storageData || {};
  const storage = opts.storage || {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { storageData[key] = String(value); },
    removeItem(key) { delete storageData[key]; }
  };
  const locks = Object.prototype.hasOwnProperty.call(opts, 'locks') ? opts.locks : createLockManager();
  const env = {
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; }
    },
    window: { addEventListener() {} },
    localStorage: storage,
    navigator: { onLine: opts.online !== false, locks },
    webhookApi,
    fetch: opts.fetch,
    now: () => '2026-11-04T12:00:00.000Z'
  };
  return { env, elements, storageData };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test('the module exposes its API and stays inert under Node', () => {
  assert.equal(typeof ui.attachWebhookUi, 'function');
  assert.equal(typeof globalThis.DaymarkWebhookUi, 'object');
  assert.deepEqual(ui.notifyTaskCompleted(TASK), { queued: false, reason: 'not-attached' });
});

test('attach without a saved webhook prompts for a session-only endpoint and ignores completions', () => {
  const { env, elements } = fakeEnv({});
  const handle = ui.attachWebhookUi(env);
  assert.match(elements['webhook-status'].textContent, /Add an https:\/\/ webhook URL/);
  assert.match(elements['webhook-status'].textContent, /kept only in this tab|stays in this tab/);
  assert.match(elements['webhook-status'].textContent, /re-entered after reload/);
  assert.equal(handle.notifyTaskCompleted(TASK).queued, false);
  assert.equal(elements['webhook-flush'].disabled, true, 'retry is disabled with an empty queue');
});
test('saving an invalid or insecure URL is rejected without persistence', () => {
  const { env, elements, storageData } = fakeEnv({ url: 'http://insecure.example.com/hook', fetch: async () => ({ ok: true, status: 200 }) });
  const handle = ui.attachWebhookUi(env);
  const saved = handle.onSave({ preventDefault() {} });
  assert.equal(saved.saved, false);
  assert.ok(elements['webhook-status'].textContent.includes('Enter a valid https:// webhook URL'));
  assert.equal(storageData[webhookApi.CONFIG_KEY], undefined);
});

test('saving a valid URL keeps the endpoint in tab memory only', () => {
  const secret = 'https://hooks.example.com/x?token=tab-only-secret';
  const { env, elements, storageData } = fakeEnv({ url: secret });
  const handle = ui.attachWebhookUi(env);
  const saved = handle.onSave({ preventDefault() {} });
  assert.deepEqual(saved, { saved: true, cleared: false, sessionOnly: true });
  assert.deepEqual(handle.readConfig(), { version: 1, url: secret });
  assert.equal(storageData[webhookApi.CONFIG_KEY], undefined, 'the endpoint is never persisted');
  assert.ok(elements['webhook-status'].textContent.includes('tab only'));
  assert.equal(elements['webhook-status'].textContent.includes(secret), false, 'status never echoes the endpoint');
});
test('clearing the URL disables only the in-memory endpoint and preserves the queue', () => {
  const { env, storageData } = fakeEnv({ url: 'https://hooks.example.com/x?token=memory-only' });
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });
  env.document.getElementById('webhook-url').value = '';
  const cleared = handle.onSave({ preventDefault() {} });
  assert.deepEqual(cleared, { saved: false, cleared: true, sessionOnly: true });
  assert.equal(handle.readConfig(), null);
  assert.equal(storageData[webhookApi.CONFIG_KEY], undefined);
});
test('a completed task with a failing endpoint queues the event on this device', async () => {
  const failing = async () => { throw new Error('offline'); };
  const { env, elements, storageData } = fakeEnv({ url: 'https://hooks.example.com/x', fetch: failing });
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });
  const notified = await handle.notifyTaskCompleted(TASK);
  assert.equal(notified.queued, true);
  await settle();
  const queued = handle.readQueue();
  assert.equal(queued.length, 1, 'a failed delivery stays queued');
  assert.equal(queued[0].attempts, 1);
  assert.ok(webhookApi.validateQueue(JSON.parse(storageData[webhookApi.QUEUE_KEY])), 'the queue is persisted in a valid shape');
  assert.ok(elements['webhook-status'].textContent.includes('Could not deliver'));
  assert.equal(elements['webhook-flush'].disabled, false, 'retry becomes available with a queued event');
});

test('a completed task while offline queues without touching the network', async () => {
  let fetchCalled = false;
  const { env, elements } = fakeEnv({ url: 'https://hooks.example.com/x', online: false, fetch: async () => { fetchCalled = true; return { ok: true, status: 200 }; } });
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });
  const notified = await handle.notifyTaskCompleted(TASK);
  await settle();
  assert.equal(notified.queued, true);
  assert.equal(fetchCalled, false, 'no network call happens while offline');
  assert.equal(handle.readQueue().length, 1);
  assert.ok(elements['webhook-status'].textContent.startsWith('Offline'));
});

test('a completed task online is delivered immediately and the queue empties', async () => {
  const seen = [];
  const { env, elements } = fakeEnv({ url: 'https://hooks.example.com/x', fetch: async (url, init) => { seen.push({ url, init }); return { ok: true, status: 200 }; } });
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });
  await handle.notifyTaskCompleted(TASK);
  await settle();
  assert.equal(seen.length, 1, 'exactly one POST was sent');
  assert.equal(seen[0].url, 'https://hooks.example.com/x');
  const body = JSON.parse(seen[0].init.body);
  assert.equal(body.event, 'daymark.task.completed');
  assert.equal(body.task.title, 'Ship the webhook card');
  assert.equal(body.task.id, undefined, 'internal IDs never reach the endpoint');
  assert.equal(handle.readQueue().length, 0);
  assert.ok(elements['webhook-status'].textContent.startsWith('Delivered 1 event(s).'));
  assert.equal(elements['webhook-flush'].disabled, true, 'retry disables again once the queue is empty');
});

test('a task completed during an active flush is retained and sent after the snapshot finishes', async () => {
  const { env, storageData } = fakeEnv({ url: 'https://hooks.example.com/x' });
  let releaseFirst;
  let firstStartedResolve;
  let secondStartedResolve;
  const firstStarted = new Promise((resolve) => { firstStartedResolve = resolve; });
  const secondStarted = new Promise((resolve) => { secondStartedResolve = resolve; });
  let calls = 0;
  const deliveredTitles = [];
  env.fetch = async (url, init) => {
    calls += 1;
    deliveredTitles.push(JSON.parse(init.body).task.title);
    if (calls === 1) {
      firstStartedResolve();
      return new Promise((resolve) => { releaseFirst = () => resolve({ ok: true, status: 200 }); });
    }
    secondStartedResolve();
    return { ok: true, status: 200 };
  };
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });
  const firstNotify = handle.notifyTaskCompleted(TASK);
  await firstStarted;
  const secondTask = Object.assign({}, TASK, { id: 'task-2', title: 'Completed during first delivery' });
  const secondNotify = handle.notifyTaskCompleted(secondTask);
  await secondNotify;
  assert.equal(JSON.parse(storageData[webhookApi.QUEUE_KEY]).length, 2,
    'the second completion is durably appended while the first tab holds the delivery lock');
  releaseFirst();
  await secondStarted;
  await Promise.all([firstNotify, secondNotify]);
  await settle();
  assert.equal(calls, 2, 'the new completion triggers one follow-up flush after the active one');
  assert.deepEqual(deliveredTitles, [TASK.title, secondTask.title],
    'the follow-up request contains the completion that arrived during the first request');
  assert.equal(handle.readQueue().length, 0, 'both completed events are removed only after delivery');
  assert.deepEqual(JSON.parse(storageData[webhookApi.QUEUE_KEY]), []);
});

test('two tabs serialize queue appends so neither task completion is overwritten', async () => {
  const storageData = {};
  const locks = createLockManager();
  const delivered = [];
  const fetch = async (url, init) => {
    delivered.push(JSON.parse(init.body).task.title);
    return { ok: true, status: 200 };
  };
  const first = fakeEnv({ storageData, locks, url: 'https://hooks.example.com/x', fetch });
  const second = fakeEnv({ storageData, locks, url: 'https://hooks.example.com/x', fetch });
  const firstHandle = ui.attachWebhookUi(first.env);
  const secondHandle = ui.attachWebhookUi(second.env);
  firstHandle.onSave({ preventDefault() {} });
  secondHandle.onSave({ preventDefault() {} });

  const taskA = Object.assign({}, TASK, { title: 'Task A from tab A' });
  const taskB = Object.assign({}, TASK, { id: 'task-b', title: 'Task B from tab B' });
  const results = await Promise.all([
    firstHandle.notifyTaskCompleted(taskA),
    secondHandle.notifyTaskCompleted(taskB)
  ]);

  assert.deepEqual(results.map((result) => result.reason), ['queued', 'queued']);
  assert.deepEqual(delivered.slice().sort(), [taskA.title, taskB.title].sort(),
    'both events are delivered once even when the tabs append concurrently');
  assert.deepEqual(JSON.parse(storageData[webhookApi.QUEUE_KEY]), [],
    'the shared durable queue is empty only after both deliveries');
});

test('two tabs cannot deliver the same stored event concurrently', async () => {
  const storageData = {};
  const locks = createLockManager();
  const event = webhookApi.makeQueueEvent(
    webhookApi.buildTaskCompletedPayload(TASK, '2026-11-04T12:00:00.000Z'),
    '2026-11-04T12:00:00.000Z'
  );
  storageData[webhookApi.QUEUE_KEY] = JSON.stringify([event]);
  const delivered = [];
  const fetch = async (url, init) => {
    delivered.push(JSON.parse(init.body).task.title);
    await settle();
    return { ok: true, status: 200 };
  };
  const first = fakeEnv({ storageData, locks, online: false, url: 'https://hooks.example.com/x', fetch });
  const second = fakeEnv({ storageData, locks, online: false, url: 'https://hooks.example.com/x', fetch });
  const firstHandle = ui.attachWebhookUi(first.env);
  const secondHandle = ui.attachWebhookUi(second.env);
  firstHandle.onSave({ preventDefault() {} });
  secondHandle.onSave({ preventDefault() {} });
  await settle();
  first.env.navigator.onLine = true;
  second.env.navigator.onLine = true;

  await Promise.all([firstHandle.flush(), secondHandle.flush()]);

  assert.deepEqual(delivered, [TASK.title], 'only the lock holder sends the shared event');
  assert.deepEqual(JSON.parse(storageData[webhookApi.QUEUE_KEY]), []);
});

test('a second tab completion waits for an in-flight delivery and is not lost', async () => {
  const storageData = {};
  const locks = createLockManager();
  const initialEvent = webhookApi.makeQueueEvent(
    webhookApi.buildTaskCompletedPayload(TASK, '2026-11-04T12:00:00.000Z'),
    '2026-11-04T12:00:00.000Z'
  );
  storageData[webhookApi.QUEUE_KEY] = JSON.stringify([initialEvent]);
  let releaseFirst;
  let firstStartedResolve;
  const firstStarted = new Promise((resolve) => { firstStartedResolve = resolve; });
  const delivered = [];
  const fetch = async (url, init) => {
    const title = JSON.parse(init.body).task.title;
    delivered.push(title);
    if (delivered.length === 1) {
      firstStartedResolve();
      return new Promise((resolve) => { releaseFirst = () => resolve({ ok: true, status: 200 }); });
    }
    return { ok: true, status: 200 };
  };
  const first = fakeEnv({ storageData, locks, online: false, url: 'https://hooks.example.com/x', fetch });
  const second = fakeEnv({ storageData, locks, online: false, url: 'https://hooks.example.com/x', fetch });
  const firstHandle = ui.attachWebhookUi(first.env);
  const secondHandle = ui.attachWebhookUi(second.env);
  firstHandle.onSave({ preventDefault() {} });
  secondHandle.onSave({ preventDefault() {} });
  await settle();
  first.env.navigator.onLine = true;
  second.env.navigator.onLine = true;

  const flushing = firstHandle.flush();
  await firstStarted;
  const secondTask = Object.assign({}, TASK, { id: 'task-b', title: 'Task completed in second tab' });
  const enqueue = secondHandle.notifyTaskCompleted(secondTask);
  await settle();
  const queuedDuringDelivery = JSON.parse(storageData[webhookApi.QUEUE_KEY]);
  assert.equal(queuedDuringDelivery.length, 2,
    'the second tab durably appends while the first tab holds only the delivery lock');
  assert.deepEqual(queuedDuringDelivery.map((event) => JSON.parse(event.payload).task.title),
    [TASK.title, secondTask.title]);

  releaseFirst();
  await Promise.all([flushing, enqueue]);
  assert.deepEqual(delivered, [TASK.title, secondTask.title]);
  assert.deepEqual(JSON.parse(storageData[webhookApi.QUEUE_KEY]), []);
});

test('webhook queue fails closed when the Web Locks API is unavailable', async () => {
  let fetchCalls = 0;
  const { env, elements, storageData } = fakeEnv({
    url: 'https://hooks.example.com/x',
    locks: null,
    fetch: async () => { fetchCalls += 1; return { ok: true, status: 200 }; }
  });
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });
  const result = handle.notifyTaskCompleted(TASK);
  assert.deepEqual(result, { queued: false, reason: 'coordination-unavailable' });
  await handle.flush();
  assert.equal(storageData[webhookApi.QUEUE_KEY], undefined, 'no unsafe localStorage read-modify-write occurs');
  assert.equal(fetchCalls, 0, 'no event is sent without cross-tab serialization');
  assert.equal(elements['webhook-flush'].disabled, true);
  assert.match(elements['webhook-status'].textContent, /cross-tab queue coordination is unavailable/i);
});

test('a failed Web Lock request fails closed and a later lock recovery can queue and deliver', async () => {
  const manager = createLockManager();
  let fail = true;
  const locks = {
    request(name, options, callback) {
      if (fail) return Promise.reject(new Error('private lock backend detail'));
      return manager.request(name, options, callback);
    }
  };
  let fetchCalls = 0;
  const { env, elements, storageData } = fakeEnv({
    url: 'https://hooks.example.com/x',
    locks,
    fetch: async () => { fetchCalls += 1; return { ok: true, status: 200 }; }
  });
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });
  await settle();
  const blocked = await handle.notifyTaskCompleted(TASK);
  assert.deepEqual(blocked, { queued: false, reason: 'coordination-unavailable' });
  assert.equal(storageData[webhookApi.QUEUE_KEY], undefined);
  assert.equal(fetchCalls, 0);
  assert.doesNotMatch(elements['webhook-status'].textContent, /private lock backend detail/);

  fail = false;
  const recovered = await handle.notifyTaskCompleted(TASK);
  assert.deepEqual(recovered, { queued: true, reason: 'queued' });
  assert.equal(fetchCalls, 1);
  assert.deepEqual(JSON.parse(storageData[webhookApi.QUEUE_KEY]), []);
});

test('the retry button flushes a queued event when the endpoint recovers', async () => {
  let fail = true;
  const { env } = fakeEnv({
    url: 'https://hooks.example.com/x',
    fetch: async () => {
      if (fail) throw new Error('offline');
      return { ok: true, status: 200 };
    }
  });
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });
  await handle.notifyTaskCompleted(TASK);
  await settle();
  assert.equal(handle.readQueue().length, 1);
  fail = false;
  await handle.flush();
  assert.equal(handle.readQueue().length, 0, 'a recovered endpoint drains the queue on the explicit retry');
});

test('a legacy endpoint is removed without being read and queued events wait for re-entry', async () => {
  const legacyUrl = 'https://hooks.example.com/saved?token=legacy-secret';
  const newUrl = 'https://hooks.example.com/new?token=current-secret';
  const event = webhookApi.makeQueueEvent(webhookApi.buildTaskCompletedPayload(TASK, '2026-11-04T12:00:00.000Z'), '2026-11-04T12:00:00.000Z');
  const seen = [];
  const { env, elements, storageData } = fakeEnv({
    fetch: async (url, init) => { seen.push({ url, init }); return { ok: true, status: 200 }; }
  });
  storageData[webhookApi.CONFIG_KEY] = JSON.stringify({ version: 1, url: legacyUrl });
  storageData[webhookApi.QUEUE_KEY] = JSON.stringify([event]);
  const backing = env.localStorage;
  const reads = [];
  env.localStorage = {
    getItem(key) { reads.push(key); return backing.getItem(key); },
    setItem: backing.setItem.bind(backing),
    removeItem: backing.removeItem.bind(backing)
  };
  const handle = ui.attachWebhookUi(env);
  assert.equal(handle.readConfig(), null, 'a previous endpoint is never restored');
  assert.equal(elements['webhook-url'].value, '', 'the user must re-enter the endpoint');
  assert.equal(storageData[webhookApi.CONFIG_KEY], undefined, 'the legacy secret is removed');
  assert.equal(reads.includes(webhookApi.CONFIG_KEY), false, 'the legacy endpoint is never read');
  assert.deepEqual(handle.readQueue(), [event], 'queued events survive the endpoint migration');
  assert.equal(seen.length, 0, 'queued events are not sent while the endpoint is unknown');
  assert.equal(elements['webhook-status'].textContent.includes(legacyUrl), false);
  elements['webhook-url'].value = newUrl;
  const saved = handle.onSave({ preventDefault() {} });
  assert.equal(saved.sessionOnly, true);
  await settle();
  assert.equal(seen.length, 1, 're-entering an endpoint resumes the preserved queue');
  assert.equal(seen[0].url, newUrl);
  assert.deepEqual(handle.readQueue(), []);
  assert.equal(storageData[webhookApi.CONFIG_KEY], undefined, 'the new endpoint is not persisted either');
  assert.equal(elements['webhook-status'].textContent.includes(newUrl), false);
});
test('corrupt queue data is preserved while any legacy endpoint is removed and delivery stays paused', () => {
  const legacyUrl = 'https://hooks.example.com/legacy?token=secret';
  const { env, elements, storageData } = fakeEnv({});
  const badQueue = '{"nope":1}';
  storageData[webhookApi.CONFIG_KEY] = JSON.stringify({ version: 1, url: legacyUrl });
  storageData[webhookApi.QUEUE_KEY] = badQueue;
  const handle = ui.attachWebhookUi(env);
  assert.equal(handle.readConfig(), null);
  assert.equal(handle.readQueue().length, 0);
  assert.match(elements['webhook-status'].textContent, /storage could not be read/);
  assert.deepEqual(handle.notifyTaskCompleted(TASK), { queued: false, reason: 'storage-unavailable' });
  assert.equal(storageData[webhookApi.CONFIG_KEY], undefined, 'legacy endpoint is cleared without reading it');
  assert.equal(storageData[webhookApi.QUEUE_KEY], badQueue, 'unreadable queue data is preserved');
  assert.equal(elements['webhook-status'].textContent.includes(legacyUrl), false);
});
test('the form and buttons are wired on attach', () => {
  const { env, elements } = fakeEnv({});
  const handle = ui.attachWebhookUi(env);
  assert.ok(elements['webhook-form'].listeners.some((entry) => entry.type === 'submit'));
  assert.ok(elements['webhook-test'].listeners.some((entry) => entry.type === 'click'));
  assert.ok(elements['webhook-flush'].listeners.some((entry) => entry.type === 'click'));
  handle.detach();
});


test('a throwing localStorage getter does not abort the webhook card or send task data', async () => {
  const { env, elements, storageData } = fakeEnv({ url: 'https://hooks.example.com/x' });
  delete env.localStorage;
  let fetchCalls = 0;
  env.fetch = async () => { fetchCalls += 1; return { ok: true, status: 200 }; };
  Object.defineProperty(env.window, 'localStorage', {
    configurable: true,
    get() { throw new Error('storage access blocked'); }
  });
  const handle = ui.attachWebhookUi(env);
  assert.match(elements['webhook-status'].textContent, /storage could not be read/);
  assert.deepEqual(handle.notifyTaskCompleted(TASK), { queued: false, reason: 'storage-unavailable' });
  await settle();
  assert.equal(fetchCalls, 0, 'no task event is sent when saved settings/queue cannot be read');
  assert.equal(storageData[webhookApi.CONFIG_KEY], undefined);
  assert.equal(storageData[webhookApi.QUEUE_KEY], undefined);
});

test('a queue read failure preserves the unknown queue and pauses task delivery', async () => {
  const { env, elements } = fakeEnv({});
  const config = { version: 1, url: 'https://hooks.example.com/x' };
  let queueWrites = 0;
  let fetchCalls = 0;
  const readKeys = [];
  env.localStorage = {
    getItem(key) {
      readKeys.push(key);
      if (key === webhookApi.CONFIG_KEY) return JSON.stringify(config);
      throw new Error('queue read blocked');
    },
    setItem() { queueWrites += 1; },
    removeItem(key) { if (key === webhookApi.QUEUE_KEY) queueWrites += 1; }
  };
  env.fetch = async () => { fetchCalls += 1; return { ok: true, status: 200 }; };
  const handle = ui.attachWebhookUi(env);
  assert.equal(handle.readConfig(), null, 'legacy endpoint is not restored');
  assert.equal(readKeys.includes(webhookApi.CONFIG_KEY), false, 'legacy endpoint is never read');
  elements['webhook-url'].value = config.url;
  handle.onSave({ preventDefault() {} });
  assert.equal(handle.readConfig().url, config.url, 'explicit re-entry keeps the endpoint in memory');
  assert.match(elements['webhook-status'].textContent, /queued webhook events could not be read/);
  assert.deepEqual(handle.notifyTaskCompleted(TASK), { queued: false, reason: 'storage-unavailable' });
  await handle.flush();
  assert.equal(queueWrites, 0, 'unknown queue state is never overwritten');
  assert.equal(fetchCalls, 0, 'unknown queued events are never flushed');
});

test('a queue write failure keeps the event in this tab and retries persistence before delivery', async () => {
  const { env, storageData } = fakeEnv({ url: 'https://hooks.example.com/x' });
  const backing = env.localStorage;
  backing.setItem(webhookApi.CONFIG_KEY, JSON.stringify({ version: 1, url: 'https://hooks.example.com/x' }));
  let failQueueWrite = true;
  let fetchCalls = 0;
  env.fetch = async () => { fetchCalls += 1; return { ok: true, status: 200 }; };
  env.localStorage = {
    getItem: backing.getItem.bind(backing),
    setItem(key, value) {
      if (key === webhookApi.QUEUE_KEY && failQueueWrite) throw new Error('quota exceeded');
      backing.setItem(key, value);
    },
    removeItem: backing.removeItem.bind(backing)
  };
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });
  const queued = await handle.notifyTaskCompleted(TASK);
  assert.deepEqual(queued, { queued: true, reason: 'memory-only' });
  assert.equal(handle.readQueue().length, 1);
  assert.equal(storageData[webhookApi.QUEUE_KEY], undefined);
  assert.equal(fetchCalls, 0, 'the event is not sent before its queue is durable');
  failQueueWrite = false;
  await handle.flush();
  assert.equal(fetchCalls, 1);
  assert.deepEqual(JSON.parse(storageData[webhookApi.QUEUE_KEY]), []);
});

test('failed legacy endpoint cleanup blocks webhook use without exposing either endpoint', () => {
  const legacyUrl = 'https://hooks.example.com/old?token=old-secret';
  const newUrl = 'https://hooks.example.com/new?token=new-secret';
  const { env, elements, storageData } = fakeEnv({});
  const backing = env.localStorage;
  backing.setItem(webhookApi.CONFIG_KEY, JSON.stringify({ version: 1, url: legacyUrl }));
  env.localStorage = {
    getItem: backing.getItem.bind(backing),
    setItem() { throw new Error('storage is read-only'); },
    removeItem() { throw new Error('storage is read-only'); }
  };
  const handle = ui.attachWebhookUi(env);
  elements['webhook-url'].value = newUrl;
  const saved = handle.onSave({ preventDefault() {} });
  assert.deepEqual(saved, { saved: false, cleared: false, reason: 'storage-unavailable' });
  assert.equal(handle.readConfig(), null, 'no new endpoint is activated while the old secret cannot be cleared');
  assert.deepEqual(handle.notifyTaskCompleted(TASK), { queued: false, reason: 'storage-unavailable' });
  assert.ok(storageData[webhookApi.CONFIG_KEY].includes(legacyUrl), 'the failed cleanup is explicit in the fixture');
  assert.equal(elements['webhook-status'].textContent.includes(legacyUrl), false);
  assert.equal(elements['webhook-status'].textContent.includes(newUrl), false);
  assert.match(elements['webhook-status'].textContent, /clear this site/);
});
test('webhook boot does not eagerly evaluate window.localStorage', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'webhook-ui.js'), 'utf8');
  assert.doesNotMatch(source, /localStorage:\s*window\.localStorage/,
    'boot must pass window and let attachWebhookUi guard the storage getter');
});


test('a storage adapter without removeItem overwrites the legacy endpoint with a null marker', () => {
  const legacyUrl = 'https://hooks.example.com/legacy?token=secret';
  const newUrl = 'https://hooks.example.com/current?token=memory';
  const { env, elements, storageData } = fakeEnv({});
  const backing = env.localStorage;
  backing.setItem(webhookApi.CONFIG_KEY, JSON.stringify({ version: 1, url: legacyUrl }));
  env.localStorage = {
    getItem: backing.getItem.bind(backing),
    setItem: backing.setItem.bind(backing)
  };
  const handle = ui.attachWebhookUi(env);
  assert.equal(storageData[webhookApi.CONFIG_KEY], 'null');
  assert.equal(handle.readConfig(), null);
  elements['webhook-url'].value = newUrl;
  assert.deepEqual(handle.onSave({ preventDefault() {} }), { saved: true, cleared: false, sessionOnly: true });
  assert.equal(storageData[webhookApi.CONFIG_KEY], 'null', 'the new endpoint never replaces the legacy null marker');
  const second = fakeEnv({});
  second.env.localStorage = env.localStorage;
  const restored = ui.attachWebhookUi(second.env);
  assert.equal(restored.readConfig(), null);
  assert.equal(second.elements['webhook-url'].value, '');
  assert.match(second.elements['webhook-status'].textContent, /re-entered after reload/);
});
test('failed persistence after delivery keeps an empty queue retryable until it is durable', async () => {
  const { env, elements, storageData } = fakeEnv({
    url: 'https://hooks.example.com/x',
    fetch: async () => ({ ok: true, status: 200 })
  });
  const backing = env.localStorage;
  backing.setItem(webhookApi.CONFIG_KEY, JSON.stringify({ version: 1, url: 'https://hooks.example.com/x' }));
  let failEmptyQueueOnce = true;
  env.localStorage = {
    getItem: backing.getItem.bind(backing),
    setItem(key, value) {
      if (key === webhookApi.QUEUE_KEY && value === '[]' && failEmptyQueueOnce) {
        failEmptyQueueOnce = false;
        throw new Error('temporary storage write failure');
      }
      backing.setItem(key, value);
    },
    removeItem: backing.removeItem.bind(backing)
  };
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });
  await handle.notifyTaskCompleted(TASK);
  await settle();
  assert.equal(handle.readQueue().length, 0, 'the endpoint accepted the event');
  assert.ok(storageData[webhookApi.QUEUE_KEY] !== '[]',
    'the old persisted queue remains until the empty state can be saved');
  assert.equal(elements['webhook-flush'].disabled, false,
    'Retry remains available even though the in-memory queue is empty');
  assert.match(elements['webhook-status'].textContent, /may be retried after reload/);
  await handle.flush();
  assert.equal(storageData[webhookApi.QUEUE_KEY], '[]',
    'Retry persists the empty queue without sending the already-delivered event again');
  assert.equal(elements['webhook-flush'].disabled, true);
  assert.match(elements['webhook-status'].textContent, /Webhook queue state is now saved/);
  assert.doesNotMatch(elements['webhook-status'].textContent, /may be retried after reload/);
});


test('an empty legacy config is cleared but an empty queue remains corrupt rather than absent', () => {
  const { env, storageData } = fakeEnv({});
  storageData[webhookApi.CONFIG_KEY] = '';
  storageData[webhookApi.QUEUE_KEY] = '';
  const handle = ui.attachWebhookUi(env);
  assert.match(env.document.getElementById('webhook-status').textContent, /storage could not be read/);
  assert.deepEqual(handle.notifyTaskCompleted(TASK), { queued: false, reason: 'storage-unavailable' });
  assert.equal(storageData[webhookApi.CONFIG_KEY], undefined, 'legacy config is removed without parsing it');
  assert.equal(storageData[webhookApi.QUEUE_KEY], '', 'the corrupt queue is preserved');
});

test('status never echoes a webhook endpoint from a network error', async () => {
  const secret = 'https://hooks.example.com/private/path?token=do-not-show';
  const { env, elements } = fakeEnv({url:secret,fetch:async()=>{throw new Error('Network error for '+secret);}});
  const handle = ui.attachWebhookUi(env);
  handle.onSave({preventDefault(){}});
  await settle();
  await handle.onTest();
  assert.match(elements['webhook-status'].textContent,/Test event failed/);
  assert.equal(elements['webhook-status'].textContent.includes(secret),false);
});

test('the app persists a newly completed task before queueing its webhook', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok(app.includes("const result = webhookUi.notifyTaskCompleted(task);"));
  assert.ok(app.includes("result.catch((error) =>"));

  const toggleStart = app.indexOf("if (button.dataset.action === 'toggle')");
  const toggleEnd = app.indexOf("} else if", toggleStart);
  assert.ok(toggleStart >= 0 && toggleEnd > toggleStart, 'the task toggle branch must remain identifiable');
  const toggle = app.slice(toggleStart, toggleEnd);
  const persistAt = toggle.indexOf('const saved = persistTasks();');
  const notifyAt = toggle.indexOf('notifyWebhookTaskCompleted(task)');
  assert.ok(persistAt >= 0 && notifyAt > persistAt,
    'the external webhook must never be queued before the local task write succeeds');
  assert.ok(toggle.includes('if (saved && task.completed && !wasCompleted) notifyWebhookTaskCompleted(task);'),
    'only a successfully persisted transition from open to completed may emit an event');
});

test('index markup exposes task-completion webhook controls and session-only disclosure', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const id of ['webhook-url','webhook-form','webhook-save','webhook-test','webhook-flush','webhook-status']) {
    assert.ok(html.includes('id="'+id+'"'),id+' must be present for webhook-ui.js');
  }
  assert.match(html,/stays in this tab only/);
  assert.match(html,/must be re-entered after reload/);
  assert.doesNotMatch(html,/Local webhook preview/);
});

test('queued delivery errors never echo the endpoint into status text', async () => {
  const secret = 'https://hooks.example.com/private/path?token=do-not-show';
  const event = webhookApi.makeQueueEvent(
    webhookApi.buildTaskCompletedPayload(TASK, '2026-11-04T12:00:00.000Z'),
    '2026-11-04T12:00:00.000Z'
  );
  const { env, elements, storageData } = fakeEnv({
    url: secret,
    fetch: async () => { throw new Error('Network error for ' + secret); }
  });
  storageData[webhookApi.QUEUE_KEY] = JSON.stringify([event]);
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });
  await settle();
  assert.match(elements['webhook-status'].textContent, /Could not deliver webhook events/);
  assert.equal(elements['webhook-status'].textContent.includes(secret), false);
});


test('a full durable queue rejects a new completion and preserves every existing event', async () => {
  const fullQueue = Array.from({ length: webhookApi.MAX_QUEUE_EVENTS }, (_, index) => {
    const payload = webhookApi.buildTaskCompletedPayload({
      title: 'durable-' + index,
      priority: 'low'
    }, '2026-11-04T12:00:00.000Z');
    return webhookApi.makeQueueEvent(payload, '2026-11-04T12:00:00.000Z');
  });
  const storageData = { [webhookApi.QUEUE_KEY]: JSON.stringify(fullQueue) };
  let fetchCalled = false;
  const { env, elements } = fakeEnv({
    url: 'https://hooks.example.com/x',
    online: false,
    storageData,
    fetch: async () => { fetchCalled = true; return { ok: true, status: 200 }; }
  });
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });
  await settle();

  const result = await handle.notifyTaskCompleted(Object.assign({}, TASK, {
    id: 'overflow-task',
    title: 'Must not evict an older completion'
  }));

  assert.deepEqual(result, { queued: false, reason: 'queue-full' });
  assert.deepEqual(JSON.parse(storageData[webhookApi.QUEUE_KEY]), fullQueue,
    'the durable queue is byte-for-byte equivalent after overflow is rejected');
  assert.equal(handle.readQueue().length, webhookApi.MAX_QUEUE_EVENTS);
  assert.match(elements['webhook-status'].textContent, /queue is full/i);
  assert.match(elements['webhook-status'].textContent, /existing events were preserved/i);
  assert.equal(fetchCalled, false, 'offline queue-full handling never touches the network');
});

test('tab-local events wait behind a full durable queue and are delivered without eviction', async () => {
  const storageData = {};
  let failQueueWrites = true;
  const storage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null;
    },
    setItem(key, value) {
      if (key === webhookApi.QUEUE_KEY && failQueueWrites) throw new Error('quota');
      storageData[key] = String(value);
    },
    removeItem(key) { delete storageData[key]; }
  };
  const { env } = fakeEnv({
    url: 'https://hooks.example.com/x',
    online: false,
    storage
  });
  const deliveredTitles = [];
  env.fetch = async (url, init) => {
    deliveredTitles.push(JSON.parse(init.body).task.title);
    return { ok: true, status: 200 };
  };
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });
  await settle();

  const memoryOnlyTask = Object.assign({}, TASK, {
    id: 'memory-only-task',
    title: 'memory-only-after-durable-queue'
  });
  const queued = await handle.notifyTaskCompleted(memoryOnlyTask);
  assert.deepEqual(queued, { queued: true, reason: 'memory-only' });
  assert.equal(handle.readQueue().length, 1);
  assert.equal(storageData[webhookApi.QUEUE_KEY], undefined,
    'the failed write keeps the event only in this tab');

  const fullQueue = Array.from({ length: webhookApi.MAX_QUEUE_EVENTS }, (_, index) => {
    const payload = webhookApi.buildTaskCompletedPayload({
      title: 'durable-' + index,
      priority: 'low'
    }, '2026-11-04T12:00:00.000Z');
    return webhookApi.makeQueueEvent(payload, '2026-11-04T12:00:00.000Z');
  });
  storageData[webhookApi.QUEUE_KEY] = JSON.stringify(fullQueue);
  failQueueWrites = false;
  env.navigator.onLine = true;

  await handle.flush();

  assert.deepEqual(deliveredTitles, fullQueue.map((event) => JSON.parse(event.payload).task.title)
    .concat('memory-only-after-durable-queue'),
  'all existing durable events are delivered before the tab-local event, with no eviction');
  assert.equal(handle.readQueue().length, 0);
  assert.deepEqual(JSON.parse(storageData[webhookApi.QUEUE_KEY]), []);
});


test('older tab-local webhook events stay ahead of later completions after storage recovers', async () => {
  const storageData = {};
  let failQueueWrites = true;
  const storage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null;
    },
    setItem(key, value) {
      if (key === webhookApi.QUEUE_KEY && failQueueWrites) throw new Error('quota');
      storageData[key] = String(value);
    },
    removeItem(key) { delete storageData[key]; }
  };
  const deliveredTitles = [];
  const { env } = fakeEnv({
    storage,
    url: 'https://hooks.example.com/x',
    fetch: async (url, init) => {
      deliveredTitles.push(JSON.parse(init.body).task.title);
      return { ok: true, status: 200 };
    }
  });
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });

  const olderTask = Object.assign({}, TASK, {
    id: 'older-memory-only',
    title: 'older memory-only event'
  });
  const newerTask = Object.assign({}, TASK, {
    id: 'newer-after-recovery',
    title: 'newer completion after storage recovery'
  });

  const older = await handle.notifyTaskCompleted(olderTask);
  assert.deepEqual(older, { queued: true, reason: 'memory-only' });
  assert.equal(handle.readQueue().length, 1);
  assert.equal(storageData[webhookApi.QUEUE_KEY], undefined,
    'the older event remains tab-local while durable writes fail');

  failQueueWrites = false;
  const newer = await handle.notifyTaskCompleted(newerTask);
  assert.deepEqual(newer, { queued: true, reason: 'memory-only' },
    'a newer completion joins the pending FIFO suffix instead of jumping ahead in durable storage');
  await settle();

  assert.deepEqual(deliveredTitles, [
    'older memory-only event',
    'newer completion after storage recovery'
  ], 'delivery preserves completion order across a storage failure and recovery');
  assert.equal(handle.readQueue().length, 0);
  assert.deepEqual(JSON.parse(storageData[webhookApi.QUEUE_KEY]), []);
});
