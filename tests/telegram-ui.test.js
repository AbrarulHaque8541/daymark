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
    classes: new Set(),
    appendChild(child) { el.children.push(child); return child; },
    removeChild(child) { const i = el.children.indexOf(child); if (i !== -1) el.children.splice(i, 1); return child; },
    addEventListener(type, handler) { (el.listeners[type] = el.listeners[type] || []).push(handler); },
    preventDefault() { el.prevented = true; },
    setAttribute(name, value) { el.attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : null; },
    removeAttribute(name) { delete el.attrs[name]; }
  };
  el.classList = {
    toggle(name, force) {
      if (force === true) el.classes.add(name);
      else if (force === false) el.classes.delete(name);
      else if (el.classes.has(name)) el.classes.delete(name);
      else el.classes.add(name);
      return el.classes.has(name);
    },
    contains(name) { return el.classes.has(name); },
    add(name) { el.classes.add(name); },
    remove(name) { el.classes.delete(name); }
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
  const handle = ui.attachTelegramUi(okEnv(doc, { logicApi: null }));
  fillValidInputs(doc);
  await handle.send();
  assert.match(doc.elements['telegram-status'].textContent, /unavailable/);
});
test('a missing task logic degrades honestly instead of guessing', async () => {
  const doc = makeDoc(ALL_IDS);
  const handle = ui.attachTelegramUi(okEnv(doc, { taskLogicApi: null }));
  fillValidInputs(doc);
  await handle.send();
  assert.match(doc.elements['telegram-status'].textContent, /validation is unavailable/);
});
test('empty token is rejected before any network call', async () => {
  const doc = makeDoc(ALL_IDS);
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { fetch: fetchFn }));
  doc.elements['telegram-chat'].value = '123456789';
  await handle.send();
  assert.equal(fetchFn.calls.length, 0);
  assert.match(doc.elements['telegram-status'].textContent, /bot token/);
});
test('malformed token is rejected before any network call', async () => {
  const doc = makeDoc(ALL_IDS);
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { fetch: fetchFn }));
  doc.elements['telegram-token'].value = 'not-a-token';
  doc.elements['telegram-chat'].value = '123456789';
  await handle.send();
  assert.equal(fetchFn.calls.length, 0);
  assert.match(doc.elements['telegram-status'].textContent, /bot token/);
});
test('empty chat target is rejected before any network call', async () => {
  const doc = makeDoc(ALL_IDS);
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { fetch: fetchFn }));
  doc.elements['telegram-token'].value = VALID_TOKEN;
  await handle.send();
  assert.equal(fetchFn.calls.length, 0);
  assert.match(doc.elements['telegram-status'].textContent, /chat ID/);
});
test('malformed chat target is rejected before any network call', async () => {
  const doc = makeDoc(ALL_IDS);
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { fetch: fetchFn }));
  doc.elements['telegram-token'].value = VALID_TOKEN;
  doc.elements['telegram-chat'].value = 'not a chat';
  await handle.send();
  assert.equal(fetchFn.calls.length, 0);
  assert.match(doc.elements['telegram-status'].textContent, /chat ID/);
});
test('successful send persists the chat target for next session', async () => {
  const doc = makeDoc(ALL_IDS);
  const storage = makeStorage({ 'daymark.tasks.v1': JSON.stringify([makeTask('ship the polish', { completed: true })]) });
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: storage }));
  fillValidInputs(doc);
  await handle.send();
  assert.equal(storage.getItem('daymark.telegram.lastChat.v1'), '123456789');
  assert.match(doc.elements['telegram-status'].textContent, /Sent/);
});
test('failed send does not persist the chat target', async () => {
  const doc = makeDoc(ALL_IDS);
  const storage = makeStorage({ 'daymark.tasks.v1': JSON.stringify([makeTask('ship the polish', { completed: true })]) });
  const fetchFn = makeFetch(() => ({ status: 401, json: () => Promise.resolve({ ok: false, description: 'Unauthorized' }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: storage, fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.send();
  assert.equal(storage.getItem('daymark.telegram.lastChat.v1'), null);
  assert.match(doc.elements['telegram-status'].textContent, /could not be delivered|Unauthorized/);
});
test('Clear empties only the token; chat target preference remains', async () => {
  const doc = makeDoc(ALL_IDS);
  const storage = makeStorage({ 'daymark.telegram.lastChat.v1': '123456789' });
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: storage }));
  doc.elements['telegram-token'].value = VALID_TOKEN;
  handle.clear();
  assert.equal(doc.elements['telegram-token'].value, '');
  assert.equal(doc.elements['telegram-chat'].value, '123456789');
  assert.equal(storage.getItem('daymark.telegram.lastChat.v1'), '123456789');
  assert.match(doc.elements['telegram-status'].textContent, /Cleared/);
});
test('pagehide and pageshow clear the token so navigation and bfcache cannot retain it', () => {
  const doc = makeDoc(ALL_IDS);
  const win = makeWindow();
  const handle = ui.attachTelegramUi(okEnv(doc, { window: win }));
  doc.elements['telegram-token'].value = VALID_TOKEN;
  win.dispatch('pagehide');
  assert.equal(doc.elements['telegram-token'].value, '', 'pagehide clears before unload or bfcache freeze');
  doc.elements['telegram-token'].value = VALID_TOKEN;
  win.dispatch('pageshow');
  assert.equal(doc.elements['telegram-token'].value, '', 'pageshow clears a restored page');
  handle.detach();
  assert.equal(doc.elements['telegram-token'].value, '', 'detach clears the in-memory credential');
});
test('index.html edit-repeat empty option says No repeat and telegram status is atomic live region', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(indexSource, /<option value="">No repeat<\/option>/, 'repeat empty option must say No repeat');
  assert.match(indexSource, /id="telegram-status"[^>]*aria-atomic="true"/, 'telegram status must be an atomic live region');
  assert.match(indexSource, /clear the Telegram preference in the Local data card/,
    'the card must disclose that Clear does not forget the chat target');
  assert.ok(indexSource.includes('id="telegram-clear" type="button">Clear token</button>'),
    'the clear action must not imply that it also forgets the saved chat target');
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
  assert.equal(doc.elements['telegram-send'].classList.contains('is-busy'), true);
  assert.equal(doc.elements['telegram-test'].classList.contains('is-busy'), true);
  assert.equal(doc.elements['telegram-clear'].classList.contains('is-busy'), true);
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
test('no completed tasks produces an honest status and no network call', async () => {
  const doc = makeDoc(ALL_IDS);
  const storage = makeStorage({ 'daymark.tasks.v1': JSON.stringify([makeTask('still open', { completed: false })]) });
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: storage, fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.send();
  assert.equal(fetchFn.calls.length, 0);
  assert.match(doc.elements['telegram-status'].textContent, /No completed tasks/);
});
test('a test message is sent with the fixed test text', async () => {
  const doc = makeDoc(ALL_IDS);
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true, result: { message_id: 3 } }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.test();
  assert.equal(fetchFn.calls.length, 1);
  const body = JSON.parse(fetchFn.calls[0].options.body);
  assert.equal(body.text, engine.TEST_MESSAGE);
  assert.match(doc.elements['telegram-status'].textContent, /Test message sent/);
});
test('form submit is prevented and triggers send', async () => {
  const doc = makeDoc(ALL_IDS);
  const storage = makeStorage({ 'daymark.tasks.v1': JSON.stringify([makeTask('ship the polish', { completed: true })]) });
  ui.attachTelegramUi(okEnv(doc, { storage: storage }));
  fillValidInputs(doc);
  const event = { preventDefault() { event.prevented = true; } };
  doc.elements['telegram-form'].listeners.submit[0](event);
  assert.equal(event.prevented, true);
});
test('clear is bound and empties the token', () => {
  const doc = makeDoc(ALL_IDS);
  ui.attachTelegramUi(okEnv(doc));
  assert.equal(doc.elements['telegram-clear'].listeners.click.length, 1);
  doc.elements['telegram-token'].value = VALID_TOKEN;
  doc.elements['telegram-clear'].listeners.click[0]();
  assert.equal(doc.elements['telegram-token'].value, '');
});
test('detach clears the token and removes lifecycle listeners', () => {
  const doc = makeDoc(ALL_IDS);
  const win = makeWindow();
  const handle = ui.attachTelegramUi(okEnv(doc, { window: win }));
  doc.elements['telegram-token'].value = VALID_TOKEN;
  handle.detach();
  assert.equal(doc.elements['telegram-token'].value, '');
  assert.equal(win.listeners.pagehide.length, 0);
  assert.equal(win.listeners.pageshow.length, 0);
});
test('a rejected fetch is reported as a delivery failure', async () => {
  const doc = makeDoc(ALL_IDS);
  const fetchFn = () => Promise.reject(new Error('network down'));
  const handle = ui.attachTelegramUi(okEnv(doc, { fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.send();
  assert.match(doc.elements['telegram-status'].textContent, /failed unexpectedly|could not be delivered/);
});
test('unreadable task storage is reported and nothing is sent', async () => {
  const doc = makeDoc(ALL_IDS);
  const storage = { getItem() { throw new Error('quota'); } };
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: storage, fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.send();
  assert.equal(fetchFn.calls.length, 0);
  assert.match(doc.elements['telegram-status'].textContent, /could not be read/);
});
test('malformed JSON task storage is reported and nothing is sent', async () => {
  const doc = makeDoc(ALL_IDS);
  const storage = makeStorage({ 'daymark.tasks.v1': '{not json' });
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: true }) }));
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: storage, fetch: fetchFn }));
  fillValidInputs(doc);
  await handle.send();
  assert.equal(fetchFn.calls.length, 0);
  assert.match(doc.elements['telegram-status'].textContent, /could not be read as JSON/);
});
test('rejected tasks are noted but valid completed tasks are still sent', async () => {
  const doc = makeDoc(ALL_IDS);
  const storage = makeStorage({ 'daymark.tasks.v1': JSON.stringify([makeTask('good', { completed: true }), { bad: true }]) });
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: storage }));
  fillValidInputs(doc);
  await handle.send();
  assert.match(doc.elements['telegram-status'].textContent, /unreadable task/);
  assert.match(doc.elements['telegram-status'].textContent, /Sent/);
});
test('second send while busy is rejected with a wait message', async () => {
  const doc = makeDoc(ALL_IDS);
  let resolveFetch;
  const fetchFn = makeFetch(() => new Promise((resolve) => { resolveFetch = resolve; }));
  const storage = makeStorage({ 'daymark.tasks.v1': JSON.stringify([makeTask('ship the polish', { completed: true })]) });
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: storage, fetch: fetchFn }));
  fillValidInputs(doc);
  const pending = handle.send();
  await handle.send();
  assert.match(doc.elements['telegram-status'].textContent, /Still sending/);
  resolveFetch({ status: 200, json: () => Promise.resolve({ ok: true, result: { message_id: 9 } }) });
  await pending;
});
test('Clear while busy is a no-op', async () => {
  const doc = makeDoc(ALL_IDS);
  let resolveFetch;
  const fetchFn = makeFetch(() => new Promise((resolve) => { resolveFetch = resolve; }));
  const storage = makeStorage({ 'daymark.tasks.v1': JSON.stringify([makeTask('ship the polish', { completed: true })]) });
  const handle = ui.attachTelegramUi(okEnv(doc, { storage: storage, fetch: fetchFn }));
  fillValidInputs(doc);
  const pending = handle.send();
  doc.elements['telegram-token'].value = 'still-here';
  handle.clear();
  assert.equal(doc.elements['telegram-token'].value, 'still-here', 'clear must not run while busy');
  resolveFetch({ status: 200, json: () => Promise.resolve({ ok: true, result: { message_id: 9 } }) });
  await pending;
});
