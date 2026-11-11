'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = require('../telegram-ui.js');
const engine = require('../telegram-logic.js');
const taskLogic = require('../task-logic.js');
function makeElement(tagName) {
  const el = {
    tagName: tagName,
    className: '',
    textContent: '',
    value: '',
    disabled: false,
    children: [],
    listeners: {},
    attrs: {},
    appendChild(child) { el.children.push(child); return child; },
    removeChild(child) { const i = el.children.indexOf(child); if (i !== -1) el.children.splice(i, 1); return child; },
    addEventListener(type, handler) { (el.listeners[type] = el.listeners[type] || []).push(handler); },
    preventDefault() { el.prevented = true; },
    setAttribute(name, value) { el.attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : null; }
  };
  Object.defineProperty(el, 'firstChild', { get() { return el.children.length ? el.children[0] : null; } });
  return el;
}
function makeDoc(ids) {
  const elements = {};
  for (const id of ids) elements[id] = makeElement(id.indexOf('form') === -1 ? 'div' : 'form');
  return {
    elements: elements,
    getElementById(id) { return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null; },
    createElement(tagName) { return makeElement(tagName); }
  };
}
const ALL_IDS = ['telegram-token', 'telegram-chat', 'telegram-status', 'telegram-form', 'telegram-test', 'telegram-clear', 'telegram-send'];
const VALID_TOKEN = '123456789:AAEfiK0sdVHqWlsZb2t3rJpQ5vLmNoPqR4sT';
function makeTask(title, options) {
  options = options || {};
  return {
    id: 'task-' + Math.abs(options.id !== undefined ? options.id : title.length),
    title: title,
    completed: options.completed === true,
    priority: 'medium',
    dueDate: options.dueDate || null,
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: '2026-11-10T09:00:00.000Z'
  };
}
function makeStorage(seed) {
  const data = new Map();
  for (const key of Object.keys(seed || {})) data.set(key, seed[key]);
  let reads = 0;
  const readKeys = [];
  return {
    readCount() { return reads; },
    readKeys() { return readKeys.slice(); },
    getItem(key) { reads += 1; readKeys.push(key); return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); }
  };
}
function makeFetch(handler) {
  const calls = [];
  const fn = (url, options) => { calls.push({ url, options }); return Promise.resolve(handler(calls.length)); };
  fn.calls = calls;
  return fn;
}
class FakeAbortController {
  constructor() { this.signal = { aborted: false }; }
  abort() { this.signal.aborted = true; }
}
function okEnv(doc, options) {
  options = options || {};
  const env = {
    document: doc,
    logicApi: options.logicApi === undefined ? engine : options.logicApi,
    taskLogicApi: options.taskLogicApi === undefined ? taskLogic : options.taskLogicApi,
    storage: options.storage || makeStorage(options.seed || {}),
    fetch: options.fetch || makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true, result: { message_id: 7 } }) })),
    AbortController: FakeAbortController,
    setTimeout: () => 0,
    clearTimeout: () => {}
  };
  if (options.window) env.window = options.window;
  return env;
}
function makeWindow() {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, handler) { (listeners[type] = listeners[type] || []).push(handler); },
    removeEventListener(type, handler) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((candidate) => candidate !== handler);
    },
    dispatch(type) { for (const handler of (listeners[type] || []).slice()) handler({ type }); }
  };
}
function fillValidInputs(doc) {
  doc.elements['telegram-token'].value = VALID_TOKEN;
  doc.elements['telegram-chat'].value = '123456789';
}
test('attachTelegramUi requires a document', () => {
  assert.throws(() => ui.attachTelegramUi(null), /requires a document/);
  assert.throws(() => ui.attachTelegramUi({}), /requires a document/);
});
test('a missing engine degrades honestly instead of guessing', async () => {
  const doc = makeDoc(ALL_IDS);
  const handle = ui.attachTelegramUi({ document: doc, logicApi: null, taskLogicApi: taskLogic, storage: makeStorage({}) });
  await handle.send();
  assert.equal(doc.elements['telegram-status'].textContent, 'Telegram digest is unavailable.');
});
test('an invalid token reports honestly, does not read task storage, sends nothing', async () => {
  const doc = makeDoc(ALL_IDS);
  const storage = makeStorage({});
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: storage, fetch: fetchFn }));
  doc.elements['telegram-token'].value = 'not-a-token';
  doc.elements['telegram-chat'].value = '123456789';
  await handle.send();
  assert.match(doc.elements['telegram-status'].textContent, /bot token from @BotFather first/);
  assert.deepEqual(storage.readKeys(), ['daymark.telegram.lastChat.v1'], 'only the non-secret chat preference may be restored at attach');
  assert.equal(storage.readKeys().includes('daymark.tasks.v1'), false, 'invalid input must never read task data');
  assert.equal(fetchFn.calls.length, 0);
});
test('an invalid chat target reports honestly and sends nothing', async () => {
  const doc = makeDoc(ALL_IDS);
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { fetch: fetchFn }));
  fillValidInputs(doc);
  doc.elements['telegram-chat'].value = 'nope';
  await handle.send();
  assert.match(doc.elements['telegram-status'].textContent, /numeric chat ID for a private chat, or an @channelusername for a public channel/);
  assert.equal(fetchFn.calls.length, 0);
});
test('chat guidance distinguishes private chat IDs from public channel usernames', async () => {
  const doc = makeDoc(ALL_IDS);
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { fetch: fetchFn }));
  assert.equal(doc.elements['telegram-chat'].placeholder, 'Private chat ID or public @channelusername');
  fillValidInputs(doc);
  doc.elements['telegram-chat'].value = 'not a target';
  await handle.send();
  assert.match(doc.elements['telegram-status'].textContent, /numeric chat ID for a private chat, or an @channelusername for a public channel/);
  assert.equal(fetchFn.calls.length, 0);
});
test('a partial Telegram engine without chat validation fails closed before reading storage', async () => {
  const doc = makeDoc(ALL_IDS);
  const storage = makeStorage({ 'daymark.tasks.v1': '[]' });
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const partialLogic = {
    isBotToken: engine.isBotToken,
    buildCompletedDigest: engine.buildCompletedDigest,
    sendTelegramMessage: engine.sendTelegramMessage
  };
  const handle = ui.attachTelegramUi(okEnv(doc, { logicApi: partialLogic, storage: storage, fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.send();
  assert.match(doc.elements['telegram-status'].textContent, /input validation is unavailable/);
  assert.equal(storage.readCount(), 0);
  assert.equal(fetchFn.calls.length, 0);
});
test('sending a digest delivers only completed tasks to Telegram', async () => {
  const doc = makeDoc(ALL_IDS);
  const seed = {};
  seed['daymark.tasks.v1'] = JSON.stringify([
    makeTask('Buy milk', { completed: true, dueDate: '2026-11-10', id: 1 }),
    makeTask('Write report', { completed: true, id: 2 }),
    makeTask('Still open', { id: 3 })
  ]);
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true, result: { message_id: 7 } }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { seed: seed, fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.send();
  assert.equal(fetchFn.calls.length, 1);
  const payload = JSON.parse(fetchFn.calls[0].options.body);
  assert.match(payload.text, /Buy milk/);
  assert.doesNotMatch(payload.text, /Still open/);
  assert.match(doc.elements['telegram-status'].textContent, /Sent \u00b7 2 completed task\(s\) delivered to Telegram/);
});
test('with no completed tasks the card says so and sends nothing', async () => {
  const doc = makeDoc(ALL_IDS);
  const seed = {};
  seed['daymark.tasks.v1'] = JSON.stringify([makeTask('Still open', { id: 1 })]);
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { seed: seed, fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.send();
  assert.match(doc.elements['telegram-status'].textContent, /No completed tasks to announce/);
  assert.equal(fetchFn.calls.length, 0);
});
test('unreadable saved tasks are disclosed honestly', async () => {
  const doc = makeDoc(ALL_IDS);
  const seed = {};
  seed['daymark.tasks.v1'] = JSON.stringify([
    makeTask('Buy milk', { completed: true, id: 1 }),
    { broken: true, not: 'a valid task' }
  ]);
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true, result: { message_id: 7 } }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { seed: seed, fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.send();
  assert.equal(fetchFn.calls.length, 1);
  assert.match(doc.elements['telegram-status'].textContent, /1 unreadable task\(s\) skipped/);
});
test('a malformed saved list fails closed without sending', async () => {
  const doc = makeDoc(ALL_IDS);
  const seed = {};
  seed['daymark.tasks.v1'] = 'not json{';
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { seed: seed, fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.send();
  assert.match(doc.elements['telegram-status'].textContent, /could not be read as JSON/);
  assert.equal(fetchFn.calls.length, 0);
});
test('an empty saved task key is malformed rather than absent and sends nothing', async () => {
  const doc = makeDoc(ALL_IDS);
  const storage = makeStorage({ 'daymark.tasks.v1': '' });
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: storage, fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.send();
  assert.match(doc.elements['telegram-status'].textContent, /could not be read as JSON/);
  assert.match(doc.elements['telegram-status'].textContent, /Nothing was sent/);
  assert.equal(fetchFn.calls.length, 0);
});

test('a non-string task-store adapter result fails closed instead of becoming an empty list', async () => {
  const doc = makeDoc(ALL_IDS);
  const storage = { getItem() { return 0; } };
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: storage, fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.send();
  assert.match(doc.elements['telegram-status'].textContent, /could not be read safely/);
  assert.match(doc.elements['telegram-status'].textContent, /Nothing was sent/);
  assert.equal(fetchFn.calls.length, 0);
});

test('a missing task key remains a legitimate empty task list and sends nothing', async () => {
  const doc = makeDoc(ALL_IDS);
  const storage = makeStorage({});
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: storage, fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.send();
  assert.match(doc.elements['telegram-status'].textContent, /No completed tasks to announce/);
  assert.equal(fetchFn.calls.length, 0);
});

test('a network failure is reported in plain words without the token', async () => {
  const doc = makeDoc(ALL_IDS);
  const seed = {};
  seed['daymark.tasks.v1'] = JSON.stringify([makeTask('Buy milk', { completed: true, id: 1 })]);
  const fetchFn = () => Promise.reject(new Error('offline'));
  const handle = ui.attachTelegramUi(okEnv(doc, { seed: seed, fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.send();
  const statusText = doc.elements['telegram-status'].textContent;
  assert.match(statusText, /could not reach Telegram/);
  assert.ok(statusText.indexOf(VALID_TOKEN) === -1, 'the token must never appear in the status');
});
test('the Test button sends only the fixed test message', async () => {
  const doc = makeDoc(ALL_IDS);
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true, result: { message_id: 9 } }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.test();
  assert.equal(fetchFn.calls.length, 1);
  const payload = JSON.parse(fetchFn.calls[0].options.body);
  assert.equal(payload.text, engine.TEST_MESSAGE);
  assert.equal(doc.elements['telegram-status'].textContent, 'Test message sent to Telegram.');
});
test('Clear empties the token field and says nothing was saved', () => {
  const doc = makeDoc(ALL_IDS);
  const handle = ui.attachTelegramUi(okEnv(doc, {}));
  doc.elements['telegram-token'].value = VALID_TOKEN;
  handle.clear();
  assert.equal(doc.elements['telegram-token'].value, '');
  assert.match(doc.elements['telegram-status'].textContent, /nothing was ever saved/);
});
test('pagehide and pageshow clear the token so navigation and bfcache cannot retain it', () => {
  const doc = makeDoc(ALL_IDS);
  const view = makeWindow();
  // Production boot passes only { document }; the real lifecycle target is document.defaultView.
  doc.defaultView = view;
  const handle = ui.attachTelegramUi(okEnv(doc, {}));
  doc.elements['telegram-token'].value = VALID_TOKEN;
  view.dispatch('pagehide');
  assert.equal(doc.elements['telegram-token'].value, '', 'pagehide clears before unload or bfcache freeze');
  doc.elements['telegram-token'].value = VALID_TOKEN;
  view.dispatch('pageshow');
  assert.equal(doc.elements['telegram-token'].value, '', 'pageshow clears a restored page');
  assert.equal(view.listeners.pagehide.length, 1);
  assert.equal(view.listeners.pageshow.length, 1);
  handle.detach();
  assert.equal(doc.elements['telegram-token'].value, '', 'detach clears the in-memory credential');
  assert.equal(view.listeners.pagehide.length, 0);
  assert.equal(view.listeners.pageshow.length, 0);
  doc.elements['telegram-token'].value = VALID_TOKEN;
  view.dispatch('pagehide');
  assert.equal(doc.elements['telegram-token'].value, VALID_TOKEN, 'detached handlers no longer run');
});
test('boot restores only the non-secret chat preference and never reads task data', () => {
  const storage = makeStorage({
    'daymark.tasks.v1': '[]',
    'daymark.telegram.lastChat.v1': '987654321'
  });
  const doc = makeDoc(ALL_IDS);
  ui.attachTelegramUi(okEnv(doc, { storage: storage }));
  assert.equal(doc.elements['telegram-chat'].value, '987654321');
  assert.deepEqual(storage.readKeys(), ['daymark.telegram.lastChat.v1']);
});
test('a throwing or malformed task validator fails closed without exposing its error', async () => {
  for (const validator of [
    { validateStoredTasks() { throw new Error('sensitive validator detail'); } },
    { validateStoredTasks() { return { tasks: 'not a task list', rejectedCount: 0 }; } }
  ]) {
    const doc = makeDoc(ALL_IDS);
    const seed = { 'daymark.tasks.v1': JSON.stringify([makeTask('Buy milk', { completed: true, id: 1 })]) };
    const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
    const handle = ui.attachTelegramUi(okEnv(doc, { seed: seed, taskLogicApi: validator, fetch: fetchFn }));
    fillValidInputs(doc);
    await handle.send();
    assert.match(doc.elements['telegram-status'].textContent, /could not be validated safely/);
    assert.doesNotMatch(doc.elements['telegram-status'].textContent, /sensitive validator detail/);
    assert.equal(fetchFn.calls.length, 0);
  }
});
test('a throwing storage read is reported honestly', async () => {
  const doc = makeDoc(ALL_IDS);
  const brokenStorage = { getItem() { throw new Error('blocked'); } };
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: brokenStorage, fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.send();
  assert.match(doc.elements['telegram-status'].textContent, /Task storage could not be read/);
  assert.equal(fetchFn.calls.length, 0);
});
test('submit and buttons are wired', async () => {
  const doc = makeDoc(ALL_IDS);
  ui.attachTelegramUi(okEnv(doc, {}));
  assert.equal(doc.elements['telegram-form'].listeners.submit.length, 1);
  assert.equal(doc.elements['telegram-test'].listeners.click.length, 1);
  assert.equal(doc.elements['telegram-clear'].listeners.click.length, 1);
  const event = makeElement('event');
  doc.elements['telegram-token'].value = 'not-a-token';
  doc.elements['telegram-form'].listeners.submit[0](event);
  assert.equal(event.prevented, true);
  for (let i = 0; i < 25 && !doc.elements['telegram-status'].textContent; i += 1) {
    await Promise.resolve();
  }
  assert.match(doc.elements['telegram-status'].textContent, /bot token/);
});
test('missing elements never throw; the card simply does less', async () => {
  const doc = makeDoc(['telegram-token']);
  const handle = ui.attachTelegramUi(okEnv(doc, {}));
  await handle.send();
  handle.clear();
  handle.detach();
});
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('index.html wires the Telegram card with a password token field', () => {
  assert.ok(indexSource.includes('id="telegram-card"'), 'the card container must exist');
  assert.ok(indexSource.includes('id="telegram-token"'), 'the token input must exist');
  assert.ok(indexSource.includes('id="telegram-chat"'), 'the chat input must exist');
  assert.ok(indexSource.includes('id="telegram-send"'), 'the send button must exist');
  assert.ok(indexSource.includes('id="telegram-status"'), 'the status element must exist');
  assert.ok(indexSource.includes('src="telegram-logic.js"'), 'the logic script tag must exist');
  assert.ok(indexSource.includes('src="telegram-ui.js"'), 'the ui script tag must exist');
  assert.match(indexSource.match(/<input[^>]*id="telegram-token"[^>]*>/)[0], /type="password"/, 'the bot token input must be masked');
});

test('buttons are disabled and aria-busy is set while a send is in flight', async () => {
  const doc = makeDoc(ALL_IDS);
  let resolveFetch;
  const fetchFn = makeFetch(() => new Promise((resolve) => { resolveFetch = resolve; }));
  const storage = makeStorage({ 'daymark.tasks.v1': JSON.stringify([makeTask('ship the polish', { completed: true })]) });
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: storage, fetch: fetchFn }));
  fillValidInputs(doc);
  const pending = handle.send();
  // After starting, controls should be busy
  assert.equal(doc.elements['telegram-send'].disabled, true);
  assert.equal(doc.elements['telegram-test'].disabled, true);
  assert.equal(doc.elements['telegram-clear'].disabled, true);
  assert.equal(doc.elements['telegram-form'].getAttribute('aria-busy'), 'true');
  assert.equal(doc.elements['telegram-status'].getAttribute('aria-busy'), 'true');
  resolveFetch({ status: 200, json: () => Promise.resolve({ ok: true, result: { message_id: 9 } }) });
  await pending;
  assert.equal(doc.elements['telegram-send'].disabled, false);
  assert.equal(doc.elements['telegram-test'].disabled, false);
  assert.equal(doc.elements['telegram-form'].getAttribute('aria-busy'), 'false');
  assert.match(doc.elements['telegram-status'].textContent, /Sent/);
});

test('last valid chat target is restored on attach when storage holds one', () => {
  const doc = makeDoc(ALL_IDS);
  const storage = makeStorage({ 'daymark.telegram.lastChat.v1': '987654321' });
  ui.attachTelegramUi(okEnv(doc, { storage: storage }));
  assert.equal(doc.elements['telegram-chat'].value, '987654321');
});

test('an invalid or missing stored chat target is ignored', () => {
  const doc = makeDoc(ALL_IDS);
  const storage = makeStorage({ 'daymark.telegram.lastChat.v1': 'not-a-target' });
  ui.attachTelegramUi(okEnv(doc, { storage: storage }));
  assert.equal(doc.elements['telegram-chat'].value, '');
});

test('successful send persists the chat target for next session', async () => {
  const doc = makeDoc(ALL_IDS);
  const storage = makeStorage({
    'daymark.tasks.v1': JSON.stringify([makeTask('ship it', { completed: true })])
  });
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true, result: { message_id: 11 } }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: storage, fetch: fetchFn }));
  fillValidInputs(doc);
  doc.elements['telegram-chat'].value = '@daymarkchannel';
  await handle.send();
  assert.equal(storage.getItem('daymark.telegram.lastChat.v1'), '@daymarkchannel');
});

test('failed send does not persist the chat target', async () => {
  const doc = makeDoc(ALL_IDS);
  const storage = makeStorage({});
  storage.setItem = () => { throw new Error('should not be called'); };
  const fetchFn = makeFetch(() => ({ status: 403, json: () => Promise.resolve({ ok: false }) }));
  const seed = { 'daymark.tasks.v1': JSON.stringify([makeTask('ship it', { completed: true })]) };
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: storage, seed: seed, fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.send();
  // no throw means setItem was not called
});

test('Clear empties only the token; chat target preference remains', () => {
  const doc = makeDoc(ALL_IDS);
  const handle = ui.attachTelegramUi(okEnv(doc, {}));
  doc.elements['telegram-token'].value = VALID_TOKEN;
  doc.elements['telegram-chat'].value = '123456789';
  handle.clear();
  assert.equal(doc.elements['telegram-token'].value, '');
  assert.equal(doc.elements['telegram-chat'].value, '123456789');
  assert.match(doc.elements['telegram-status'].textContent, /chat target remains available/);
  assert.doesNotMatch(doc.elements['telegram-status'].textContent, /nothing was ever saved/);
});
