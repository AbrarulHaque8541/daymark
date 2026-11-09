'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const webhookApi = require('../webhook-logic.js');
const ui = require('../webhook-ui.js');

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

test('corrupt stored config and queue data are ignored instead of crashing', () => {
  const { env, elements } = fakeEnv({});
  env.localStorage.setItem(webhookApi.CONFIG_KEY, '{not json');
  env.localStorage.setItem(webhookApi.QUEUE_KEY, '{"nope":1}');
  const handle = ui.attachWebhookUi(env);
  assert.equal(handle.readConfig(), null);
  assert.equal(handle.readQueue().length, 0);
  assert.equal(elements['webhook-status'].textContent, 'Add an https:// webhook URL to enable automation.');
});

test('the form and buttons are wired on attach', () => {
  const { env, elements } = fakeEnv({});
  const handle = ui.attachWebhookUi(env);
  assert.ok(elements['webhook-form'].listeners.some((entry) => entry.type === 'submit'));
  assert.ok(elements['webhook-test'].listeners.some((entry) => entry.type === 'click'));
  assert.ok(elements['webhook-flush'].listeners.some((entry) => entry.type === 'click'));
  handle.detach();
});

test('concurrent tabs do not lose enqueued events', async () => {
  const { env, storageData } = fakeEnv({ url: 'https://hooks.example.com/x', fetch: async () => ({ ok: false, status: 500 }) });
  const handleA = ui.attachWebhookUi(env);
  const handleB = ui.attachWebhookUi(Object.assign({}, env, { document: env.document }));
  // Force both to have the config
  handleA.onSave({ preventDefault() {} });
  handleB.onSave({ preventDefault() {} });
  const taskA = Object.assign({}, TASK, { title: 'Task A' });
  const taskB = Object.assign({}, TASK, { title: 'Task B' });
  const resA = handleA.notifyTaskCompleted(taskA);
  const resB = handleB.notifyTaskCompleted(taskB);
  assert.equal(resA.queued, true);
  assert.equal(resB.queued, true);
  await settle();
  const raw = storageData[webhookApi.QUEUE_KEY];
  assert.ok(raw, 'queue was persisted');
  const parsed = JSON.parse(raw);
  assert.ok(webhookApi.validateQueue(parsed));
  const titles = parsed.map((ev) => {
    try { return JSON.parse(ev.payload).task.title; } catch { return ''; }
  });
  assert.ok(titles.includes('Task A'), 'Task A survived');
  assert.ok(titles.includes('Task B'), 'Task B survived');
});

test('clear queue removes persisted events under the lock', async () => {
  const { env, elements, storageData } = fakeEnv({ url: 'https://hooks.example.com/x', fetch: async () => ({ ok: false, status: 500 }) });
  // inject clear button into the fake document
  elements['webhook-clear-queue'] = Object.assign(fakeElement('button'), { id: 'webhook-clear-queue' });
  const handle = ui.attachWebhookUi(env);
  handle.onSave({ preventDefault() {} });
  handle.notifyTaskCompleted(TASK);
  await settle();
  assert.ok(storageData[webhookApi.QUEUE_KEY]);
  // simulate click
  const btn = elements['webhook-clear-queue'];
  const click = btn.listeners.find((l) => l.type === 'click');
  assert.ok(click, 'clear button is wired');
  click.handler();
  await settle();
  const raw = storageData[webhookApi.QUEUE_KEY];
  const parsed = raw ? JSON.parse(raw) : [];
  assert.equal(parsed.length, 0, 'queue is empty after clear');
  assert.ok(elements['webhook-status'].textContent.includes('cleared'));
});
