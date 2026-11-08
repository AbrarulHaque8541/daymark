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
  const storageData = {};
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { storageData[key] = String(value); },
    removeItem(key) { delete storageData[key]; }
  };
  const env = {
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; }
    },
    window: { addEventListener() {} },
    localStorage: storage,
    navigator: { onLine: opts.online !== false },
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

test('attach without a saved webhook prompts the user and ignores completions', () => {
  const { env, elements } = fakeEnv({});
  const handle = ui.attachWebhookUi(env);
  assert.equal(elements['webhook-status'].textContent, 'Add an https:// webhook URL to enable automation.');
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

test('saving a valid URL persists the config', () => {
  const { env, elements, storageData } = fakeEnv({ url: 'https://hooks.example.com/x' });
  const handle = ui.attachWebhookUi(env);
  const saved = handle.onSave({ preventDefault() {} });
  assert.equal(saved.saved, true);
  assert.deepEqual(JSON.parse(storageData[webhookApi.CONFIG_KEY]), { version: 1, url: 'https://hooks.example.com/x' });
  assert.ok(elements['webhook-status'].textContent.includes('Webhook saved'));
});

test('clearing the URL removes the saved webhook', () => {
  const { env, storageData } = fakeEnv({ url: 'https://hooks.example.com/x' });
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });
  env.document.getElementById('webhook-url').value = '';
  const cleared = handle.onSave({ preventDefault() {} });
  assert.equal(cleared.cleared, true);
  assert.equal(storageData[webhookApi.CONFIG_KEY], undefined);
});

test('a completed task with a failing endpoint queues the event on this device', async () => {
  const failing = async () => { throw new Error('offline'); };
  const { env, elements, storageData } = fakeEnv({ url: 'https://hooks.example.com/x', fetch: failing });
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });
  const notified = handle.notifyTaskCompleted(TASK);
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
  const notified = handle.notifyTaskCompleted(TASK);
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
  handle.notifyTaskCompleted(TASK);
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
  handle.notifyTaskCompleted(TASK);
  await settle();
  assert.equal(handle.readQueue().length, 1);
  fail = false;
  await handle.flush();
  assert.equal(handle.readQueue().length, 0, 'a recovered endpoint drains the queue on the explicit retry');
});

test('a saved config from a previous visit is restored on attach', () => {
  const { env, elements } = fakeEnv({});
  env.localStorage.setItem(webhookApi.CONFIG_KEY, JSON.stringify({ version: 1, url: 'https://hooks.example.com/saved' }));
  const handle = ui.attachWebhookUi(env);
  assert.equal(handle.readConfig().url, 'https://hooks.example.com/saved');
  assert.equal(elements['webhook-url'].value, 'https://hooks.example.com/saved');
  assert.ok(elements['webhook-status'].textContent.includes('Webhook ready'));
});

test('corrupt stored config and queue are preserved and block delivery instead of becoming empty state', () => {
  const { env, elements, storageData } = fakeEnv({});
  const badConfig = '{not json';
  const badQueue = '{"nope":1}';
  env.localStorage.setItem(webhookApi.CONFIG_KEY, badConfig);
  env.localStorage.setItem(webhookApi.QUEUE_KEY, badQueue);
  const handle = ui.attachWebhookUi(env);
  assert.equal(handle.readConfig(), null);
  assert.equal(handle.readQueue().length, 0);
  assert.match(elements['webhook-status'].textContent, /storage could not be read/);
  assert.deepEqual(handle.notifyTaskCompleted(TASK), { queued: false, reason: 'storage-unavailable' });
  assert.equal(storageData[webhookApi.CONFIG_KEY], badConfig);
  assert.equal(storageData[webhookApi.QUEUE_KEY], badQueue);
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
  let writes = 0;
  let fetchCalls = 0;
  env.localStorage = {
    getItem(key) {
      if (key === webhookApi.CONFIG_KEY) return JSON.stringify(config);
      throw new Error('queue read blocked');
    },
    setItem() { writes += 1; },
    removeItem() { writes += 1; }
  };
  env.fetch = async () => { fetchCalls += 1; return { ok: true, status: 200 }; };
  const handle = ui.attachWebhookUi(env);
  assert.equal(handle.readConfig().url, config.url);
  assert.match(elements['webhook-status'].textContent, /queued webhook events could not be read/);
  assert.deepEqual(handle.notifyTaskCompleted(TASK), { queued: false, reason: 'storage-unavailable' });
  await handle.flush();
  assert.equal(writes, 0, 'unknown queue state is never overwritten');
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
  const queued = handle.notifyTaskCompleted(TASK);
  assert.deepEqual(queued, { queued: true, reason: 'memory-only' });
  assert.equal(handle.readQueue().length, 1);
  assert.equal(storageData[webhookApi.QUEUE_KEY], undefined);
  assert.equal(fetchCalls, 0, 'the event is not sent before its queue is durable');
  failQueueWrite = false;
  await handle.flush();
  assert.equal(fetchCalls, 1);
  assert.deepEqual(JSON.parse(storageData[webhookApi.QUEUE_KEY]), []);
});

test('failed webhook clear does not claim that the saved configuration was removed', () => {
  const { env, elements, storageData } = fakeEnv({ url: 'https://hooks.example.com/x' });
  const backing = env.localStorage;
  backing.setItem(webhookApi.CONFIG_KEY, JSON.stringify({ version: 1, url: 'https://hooks.example.com/x' }));
  env.localStorage = {
    getItem: backing.getItem.bind(backing),
    setItem: backing.setItem.bind(backing),
    removeItem() { throw new Error('storage is read-only'); }
  };
  const handle = ui.attachWebhookUi(env);
  elements['webhook-url'].value = '';
  const result = handle.onSave({ preventDefault() {} });
  assert.deepEqual(result, { saved: false, cleared: false });
  assert.ok(storageData[webhookApi.CONFIG_KEY], 'the saved configuration remains');
  assert.match(elements['webhook-status'].textContent, /Webhook could not be cleared; saved settings were not changed/);
});

test('webhook boot does not eagerly evaluate window.localStorage', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'webhook-ui.js'), 'utf8');
  assert.doesNotMatch(source, /localStorage:\s*window\.localStorage/,
    'boot must pass window and let attachWebhookUi guard the storage getter');
});
