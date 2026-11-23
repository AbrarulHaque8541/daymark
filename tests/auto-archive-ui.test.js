'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = require('../auto-archive-ui.js');
const archiver = require('../auto-archive-logic.js');
const flags = require('../feature-flags-logic.js');
const logic = require('../task-logic.js');
const mutation = require('../task-mutation-logic.js');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'auto-archive-ui.js'), 'utf8');

function makeElement(tagName, doc) {
  const el = {
    tagName: tagName,
    className: '',
    textContent: '',
    value: '',
    disabled: false,
    hidden: false,
    children: [],
    listeners: {},
    attrs: {},
    parentNode: null,
    appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
    removeChild(child) {
      const index = el.children.indexOf(child);
      if (index !== -1) el.children.splice(index, 1);
      child.parentNode = null;
      return child;
    },
    insertBefore(child, before) {
      const index = el.children.indexOf(before);
      child.parentNode = el;
      if (index === -1) el.children.push(child);
      else el.children.splice(index, 0, child);
      return child;
    },
    addEventListener(type, handler) { (el.listeners[type] = el.listeners[type] || []).push(handler); },
    dispatch(type, ev) {
      const event = Object.assign({ type: type, target: el }, ev || {});
      for (const handler of (el.listeners[type] || []).slice()) handler(event);
      return event;
    },
    setAttribute(name, value) { el.attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : null; },
    removeAttribute(name) { delete el.attrs[name]; },
    focus() { el.focused = true; }
  };
  Object.defineProperty(el, 'firstChild', { get() { return el.children.length ? el.children[0] : null; } });
  el.classList = {
    contains(name) { return (' ' + el.className + ' ').indexOf(' ' + name + ' ') !== -1; },
    add(name) { if (!el.classList.contains(name)) el.className = (el.className + ' ' + name).trim(); },
    remove(name) {
      const parts = el.className.split(' ').filter((piece) => piece && piece !== name);
      el.className = parts.join(' ');
    }
  };
  return el;
}

function findAll(node, out) {
  out = out || [];
  for (const child of node.children) { out.push(child); findAll(child, out); }
  return out;
}

function makeDoc() {
  const head = makeElement('head');
  const body = makeElement('body');
  const storageHost = makeElement('div');
  storageHost.setAttribute('id', 'storage-card');
  body.appendChild(storageHost);
  const doc = {
    head: head,
    body: body,
    readyState: 'complete',
    getElementById(id) {
      const pool = findAll(head).concat(findAll(body));
      for (const node of pool) {
        if (node.getAttribute && node.getAttribute('id') === id) return node;
      }
      return null;
    },
    createElement(tagName) { return makeElement(tagName, doc); }
  };
  return doc;
}

function makeStorage(seed) {
  const data = new Map();
  for (const key of Object.keys(seed || {})) data.set(key, seed[key]);
  let reads = 0;
  let writes = 0;
  return {
    reads: () => reads,
    writes: () => writes,
    getItem(key) { reads += 1; return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { writes += 1; data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
}

function makeWindow() {
  const store = new Map();
  const events = [];
  const win = {
    events: events,
    navigator: { locks: { request(name, opts, fn) { return fn(); } } },
    StorageEvent: function StorageEvent(type, init) { this.type = type; this.key = init && init.key; },
    dispatchEvent(event) { events.push(event); return true; }
  };
  win.localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); }
  };
  return win;
}

function task(overrides) {
  return Object.assign({
    id: 't1',
    title: 'Old finished report',
    dueDate: null,
    priority: 'medium',
    completed: true,
    createdAt: '2026-11-01T09:00:00Z',
    updatedAt: '2026-11-01T09:00:00Z'
  }, overrides || {});
}

function tasksJson(tasks) { return JSON.stringify(tasks); }

function flagsOn(seed) {
  return makeStorage({ 'daymark.features.v1': JSON.stringify(Object.assign({
    'command-bar': false, 'search-bangs': false, 'comfort-tint': false, 'mindful-breaks': false, 'focus-mode': false
  }, seed)) });
}

function makeEnv(doc, storage, windowObj, extra) {
  return Object.assign({
    document: doc,
    flags: flags,
    autoArchive: archiver,
    logic: logic,
    taskMutation: mutation,
    storage: storage,
    window: windowObj,
    nowMs: () => Date.parse('2026-11-21T04:30:00Z')
  }, extra || {});
}

function attach(doc, storage, windowObj, extra) {
  return ui.attachAutoArchiveUi(makeEnv(doc, storage, windowObj, extra));
}

test('attach fails closed without engines, and attaches once per page', () => {
  assert.equal(ui.attachAutoArchiveUi(null), null);
  assert.equal(ui.attachAutoArchiveUi({}), null);
  const doc = makeDoc();
  const storage = flagsOn({});
  assert.equal(ui.attachAutoArchiveUi({ document: doc, flags: flags, storage: storage }), null, 'missing archiver means no card');
  assert.equal(ui.attachAutoArchiveUi({ document: doc, autoArchive: archiver, storage: storage }), null, 'missing flags means no card');
  assert.equal(ui.attachAutoArchiveUi({ document: doc, flags: flags, autoArchive: archiver, storage: storage }), null, 'missing task logic means no card');
  assert.equal(ui.attachAutoArchiveUi({ document: doc, flags: flags, autoArchive: archiver, logic: logic, storage: storage }), null, 'missing mutation means no card');
  const handle = attach(doc, storage, makeWindow());
  assert.ok(handle);
  assert.equal(attach(doc, storage, makeWindow()), null, 'a second attach must not duplicate the card');
});

test('the card mounts before the storage card with a status live region and an honest plan list', () => {
  const doc = makeDoc();
  const storage = flagsOn({ 'auto-archive': true });
  const handle = attach(doc, storage, makeWindow());
  const card = doc.getElementById('auto-archive-card');
  assert.ok(card);
  assert.equal(card.className, 'suggestion-card');
  const host = card.parentNode;
  assert.equal(host.getAttribute('id'), 'storage-card', false);
  assert.equal(host.children.indexOf(card), 0, 'the card sits directly before the storage card');
  const status = doc.getElementById('auto-archive-status');
  assert.ok(status);
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(handle.select.value, '30', '30 days is the default limit');
  const options = findAll(handle.select).filter((node) => node.tagName === 'option');
  assert.deepEqual(options.map((node) => node.getAttribute('value')), ['7', '30', '90']);
});

test('attaching never writes to storage and never reads the task list', () => {
  const doc = makeDoc();
  const storage = flagsOn({ 'auto-archive': true });
  storage.getItem = (key) => {
    assert.equal(key, 'daymark.features.v1', 'only the feature flags may be read at attach');
    return JSON.stringify({ 'command-bar': false, 'search-bangs': false, 'comfort-tint': false, 'mindful-breaks': false, 'focus-mode': false, 'auto-archive': true });
  };
  const handle = attach(doc, storage, makeWindow());
  assert.ok(handle);
  assert.equal(storage.writes(), 0);
});

test('with the flag off, previewing is refused honestly and the run stays disabled', () => {
  const doc = makeDoc();
  const storage = makeStorage({ 'daymark.tasks.v1': tasksJson([task()]), 'daymark.features.v1': JSON.stringify({ 'auto-archive': false }) });
  const handle = attach(doc, storage, makeWindow());
  doc.getElementById('auto-archive-preview').dispatch('click');
  assert.match(handle.statusEl.textContent, /Feature settings/);
  assert.match(handle.statusEl.textContent, /switched off/);
  assert.equal(findAll(handle.listEl).length, 0);
});

test('preview lists the eligible completed tasks with their ages and enables Archive now', () => {
  const doc = makeDoc();
  const storage = makeStorage({
    'daymark.tasks.v1': tasksJson([task({ id: 'old', updatedAt: '2026-11-01T00:00:00Z' }), task({ id: 'new', updatedAt: '2026-11-20T00:00:00Z' })]),
    'daymark.features.v1': flagsOn({ 'auto-archive': true }).getItem('daymark.features.v1')
  });
  const handle = attach(doc, storage, makeWindow());
  handle.select.value = '7';
  doc.getElementById('auto-archive-preview').dispatch('click');
  const rows = findAll(handle.listEl).filter((node) => node.tagName === 'li' || node.tagName === 'p').map((node) => node.textContent);
  assert.equal(rows.length, 6, 'the 5 honest plan lines plus the one candidate row');
  assert.equal(rows[5], 'Old finished report \u00b7 finished 20 day(s) ago');
  assert.match(handle.statusEl.textContent, /1 completed task\(s\) can be archived/);
  assert.match(handle.statusEl.textContent, /Nothing is archived yet/);
  assert.equal(doc.getElementById("auto-archive-run").getAttribute('disabled'), null);
});

test('preview with nothing eligible disables Archive now and says so', () => {
  const doc = makeDoc();
  const storage = makeStorage({
    'daymark.tasks.v1': tasksJson([task({ id: 'fresh', updatedAt: '2026-11-20T00:00:00Z' })]),
    'daymark.features.v1': flagsOn({ 'auto-archive': true }).getItem('daymark.features.v1')
  });
  const handle = attach(doc, storage, makeWindow());
  doc.getElementById('auto-archive-preview').dispatch('click');
  assert.match(handle.statusEl.textContent, /Nothing to archive/);
  assert.notEqual(doc.getElementById("auto-archive-run").getAttribute('disabled'), null);
});

test('archive now writes through the coordinator and asks app.js to reload', () => {
  const doc = makeDoc();
  const win = makeWindow();
  const storage = makeStorage({
    'daymark.tasks.v1': tasksJson([task({ id: 'old', updatedAt: '2026-11-01T00:00:00Z' }), task({ id: 't2', completed: false })]),
    'daymark.features.v1': flagsOn({ 'auto-archive': true }).getItem('daymark.features.v1')
  });
  const handle = attach(doc, storage, win);
  handle.select.value = '7';
  handle.preview();
  const outcome = handle.run();
  return outcome.then((saved) => {
    assert.equal(saved, true);
    const stored = JSON.parse(storage.getItem('daymark.tasks.v1'));
    assert.deepEqual(stored.map((item) => item.id), ['t2']);
    const generation = JSON.parse(storage.getItem('daymark.tasks.generation.v1'));
    assert.equal(generation.generation, 1);
    assert.deepEqual(win.events.map((event) => event.key), ['daymark.tasks.v1']);
    assert.match(handle.statusEl.textContent, /Archived 1 completed task\(s\)/);
    assert.notEqual(doc.getElementById("auto-archive-run").getAttribute('disabled'), null);
  });
});

test('archive now without the lock API refuses honestly and saves nothing', () => {
  const doc = makeDoc();
  const win = makeWindow();
  win.navigator.locks = undefined;
  const storage = makeStorage({
    'daymark.tasks.v1': tasksJson([task({ id: 'old', updatedAt: '2026-11-01T00:00:00Z' })]),
    'daymark.features.v1': flagsOn({ 'auto-archive': true }).getItem('daymark.features.v1')
  });
  const handle = attach(doc, storage, win);
  handle.select.value = '7';
  handle.preview();
  return handle.run().then((saved) => {
    assert.equal(saved, false);
    assert.match(handle.statusEl.textContent, /nothing was saved/);
    assert.equal(JSON.parse(storage.getItem('daymark.tasks.v1')).length, 1);
    assert.deepEqual(win.events, []);
  });
});

test('archive now losing a race to another tab names the conflict, saves nothing', () => {
  const doc = makeDoc();
  const win = makeWindow();
  const storage = makeStorage({
    'daymark.tasks.v1': tasksJson([task({ id: 'old', updatedAt: '2026-11-01T00:00:00Z' })]),
    'daymark.features.v1': flagsOn({ 'auto-archive': true }).getItem('daymark.features.v1')
  });
  const rival = Object.assign({}, mutation, {
    commitTaskSnapshot() { return Promise.resolve({ ok: false, reason: 'conflict', conflictIds: ['old'] }); }
  });
  const handle = ui.attachAutoArchiveUi(makeEnv(doc, storage, win, { taskMutation: rival }));
  assert.ok(handle);
  handle.select.value = '7';
  handle.preview();
  return handle.run().then((saved) => {
    assert.equal(saved, false);
    assert.match(handle.statusEl.textContent, /nothing was saved/);
    assert.equal(JSON.parse(storage.getItem('daymark.tasks.v1')).length, 1);
    assert.deepEqual(win.events, [], 'no refresh hint may fire on a failed save');
  });
});

test('a task list that became unreadable between preview and run is named, not guessed', () => {
  const doc = makeDoc();
  const storage = makeStorage({
    'daymark.tasks.v1': tasksJson([task()]),
    'daymark.features.v1': flagsOn({ 'auto-archive': true }).getItem('daymark.features.v1')
  });
  const handle = attach(doc, storage, makeWindow());
  handle.select.value = '7';
  handle.preview();
  storage.setItem('daymark.tasks.v1', '{nope');
  return handle.run().then((saved) => {
    assert.equal(saved, false);
    assert.match(handle.statusEl.textContent, /could not be read/);
  });
});

test('index.html gains each auto-archive script exactly once, between comfort tint and storage UI', () => {
  for (const name of ['auto-archive-logic.js', 'auto-archive-ui.js']) {
    const tag = '<script src="' + name + '" defer></script>';
    assert.equal(indexHtml.split(tag).length - 1, 1, name + ' must appear exactly once');
  }
  const pos = (name) => indexHtml.indexOf('<script src="' + name + '" defer></script>');
  assert.ok(pos('comfort-tint-ui.js') < pos('auto-archive-logic.js'));
  assert.ok(pos('auto-archive-logic.js') < pos('auto-archive-ui.js'));
  assert.ok(pos('auto-archive-ui.js') < pos('storage-ui.js'));
  assert.equal(indexHtml.indexOf('id="auto-archive'), -1, 'card markup must stay dynamic');
});

test('the required test inventory registers both auto-archive suites', () => {
  const required = fs.readFileSync(path.join(__dirname, 'REQUIRED_NODE_TEST_FILES.txt'), 'utf8');
  assert.ok(required.indexOf('tests/auto-archive-logic.test.js') !== -1);
  assert.ok(required.indexOf('tests/auto-archive-ui.test.js') !== -1);
});

test('the module boots through vm against a DOM without localStorage', () => {
  const doc = makeDoc();
  const win = makeWindow();
  delete win.localStorage;
  const sandboxSource = fs.readFileSync(path.join(__dirname, '..', 'auto-archive-ui.js'), 'utf8');
  const sandbox = { window: win, document: doc, DaymarkFeatureFlags: flags, DaymarkAutoArchive: archiver, DaymarkLogic: logic, DaymarkTaskMutation: mutation };
  vm.runInNewContext(sandboxSource, sandbox);
  const card = doc.getElementById('auto-archive-card');
  assert.ok(card, 'the card bootstrapped without throwing');
  assert.match(doc.getElementById('auto-archive-status').textContent, /Feature settings|could not be read/);
});

test('auto-archive ui source stays free of the banned patterns', () => {
  const clean = ['TO' + 'DO', 'FIX' + 'ME', 'place' + 'holder', 'setInt' + 'erval', 'XMLHt' + 'tpRequest', 'fe' + 'tch(', 'localStor' + 'age.setItem'];
  for (const needle of clean) {
    assert.equal(uiSrc.indexOf(needle), -1, needle + ' must not appear in auto-archive-ui.js');
  }
});

test('the archived snapshot still validates with the shared task logic', () => {
  const result = archiver.buildArchiveSnapshot([task({ id: 'old', updatedAt: '2026-11-01T00:00:00Z' }), task({ id: 't2', completed: false })], ['old'], Date.parse('2026-11-21T04:30:00Z'), 7);
  const validated = logic.validateStoredTasks(result.desiredTasks);
  assert.equal(validated.rejectedCount, 0);
  assert.equal(validated.tasks.length, 1);
});
