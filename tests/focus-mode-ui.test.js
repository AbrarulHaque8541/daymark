'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = require('../focus-mode-ui.js');
const focus = require('../focus-mode-logic.js');
const flags = require('../feature-flags-logic.js');
const logic = require('../task-logic.js');
const mutation = require('../task-mutation-logic.js');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'focus-mode-ui.js'), 'utf8');

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
    focus() { el.focused = true; if (doc) doc.activeElement = el; },
    scrollIntoView() { el.scrolled = (el.scrolled || 0) + 1; }
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
  for (const child of node.children) {
    out.push(child);
    findAll(child, out);
  }
  return out;
}

function textOfTree(node) {
  let out = node.textContent || '';
  for (const child of node.children) out += ' ' + textOfTree(child);
  return out;
}

function makeDoc() {
  const head = makeElement('head');
  const body = makeElement('body');
  const docListeners = {};
  const doc = {
    head: head,
    body: body,
    activeElement: body,
    readyState: 'complete',
    getElementById(id) {
      const pool = findAll(head).concat(findAll(body));
      for (const node of pool) {
        if (node.getAttribute && node.getAttribute('id') === id) return node;
      }
      return null;
    },
    createElement(tagName) { return makeElement(tagName, doc); },
    addEventListener(type, handler) { (docListeners[type] = docListeners[type] || []).push(handler); },
    dispatchDoc(type, ev) {
      for (const handler of (docListeners[type] || []).slice()) handler(Object.assign({ type: type, target: doc }, ev || {}));
    }
  };
  return doc;
}

function makeStorage(seed) {
  const data = new Map();
  for (const key of Object.keys(seed || {})) data.set(key, seed[key]);
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
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
    title: 'Write the report',
    dueDate: null,
    priority: 'medium',
    completed: false,
    createdAt: '2026-11-01T09:00:00Z',
    updatedAt: '2026-11-01T09:00:00Z'
  }, overrides || {});
}

function tasksJson(tasks) { return JSON.stringify(tasks); }

function flagsJson(range) {
  return JSON.stringify(Object.assign({ 'command-bar': false, 'search-bangs': false, 'comfort-tint': false, 'mindful-breaks': false }, range));
}

function makeEnv(doc, storage, windowObj, extra) {
  return Object.assign({
    document: doc,
    flags: flags,
    focusMode: focus,
    logic: logic,
    taskMutation: mutation,
    storage: storage,
    window: windowObj,
    now: () => '2026-11-21T04:30:00Z'
  }, extra || {});
}

function attach(doc, storage, windowObj, extra) {
  return ui.attachFocusModeUi(makeEnv(doc, storage, windowObj, extra));
}

test('attach fails closed without engines, and attaches once per page', () => {
  assert.equal(ui.attachFocusModeUi(null), null);
  assert.equal(ui.attachFocusModeUi({}), null);
  const doc = makeDoc();
  const storage = makeStorage({});
  assert.equal(ui.attachFocusModeUi({ document: doc, flags: flags, focusMode: focus, storage: storage }), null, 'missing task logic means no card');
  assert.equal(ui.attachFocusModeUi({ document: doc, focusMode: focus, logic: logic, taskMutation: mutation, storage: storage }), null, 'missing flags means no card');
  const handle = attach(doc, storage, makeWindow());
  assert.ok(handle);
  assert.equal(attach(doc, storage, makeWindow()), null, 'a second attach must not duplicate the card');
});

test('the card mounts before the storage card with a status live region and mounted chooser', () => {
  const doc = makeDoc();
  const storage = makeStorage({ 'daymark.tasks.v1': tasksJson([task()]), 'daymark.features.v1': flagsJson({ 'focus-mode': true }) });
  const handle = attach(doc, storage, makeWindow());
  const card = doc.getElementById('focus-mode-card');
  assert.ok(card);
  assert.equal(card.className, 'suggestion-card');
  const status = doc.getElementById('focus-mode-status');
  assert.ok(status);
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(doc.body.children.indexOf(card) !== -1, true);
  assert.ok(handle.select);
  assert.equal(handle.select.parentNode, card, 'the task chooser select must be mounted inside the card');
  assert.equal(card.children.indexOf(handle.select) >= 0, true);
});

test('attaching or exiting never writes to storage', () => {
  const doc = makeDoc();
  const storage = makeStorage({ 'daymark.tasks.v1': tasksJson([task()]), 'daymark.features.v1': flagsJson({ 'focus-mode': true }) });
  const handle = attach(doc, storage, makeWindow());
  const beforeTasks = storage.getItem('daymark.tasks.v1');
  handle.enterFocus();
  handle.closeOverlay();
  assert.equal(storage.getItem('daymark.tasks.v1'), beforeTasks);
});

test('the chooser lists open tasks, sorted, and skips completed ones', () => {
  const doc = makeDoc();
  const storage = makeStorage({
    'daymark.tasks.v1': tasksJson([task(), task({ id: 't2', title: 'Mid', dueDate: '2026-11-22', completed: false }), task({ id: 't3', title: 'Done', completed: true })]),
    'daymark.features.v1': flagsJson({ 'focus-mode': true })
  });
  const handle = attach(doc, storage, makeWindow());
  const options = findAll(handle.select).filter((node) => node.tagName === 'option');
  assert.equal(options.length, 2);
  assert.equal(options[0].getAttribute('value'), 't2', 'dated tasks sort before undated ones');
  assert.equal(options[0].textContent, 'Mid · due 2026-11-22');
  assert.equal(options[1].getAttribute('value'), 't1', 'undated tasks sort last');
  assert.equal(options[1].textContent, 'Write the report');
});

test('with the flag off, entering focus is refused honestly and nothing opens', () => {
  const doc = makeDoc();
  const storage = makeStorage({ 'daymark.tasks.v1': tasksJson([task()]) });
  const handle = attach(doc, storage, makeWindow());
  const enter = doc.getElementById('focus-mode-enter');
  enter.dispatch('click');
  assert.equal(handle.overlayOpen(), false);
  assert.equal(overlayOpenCls(handle), false);
  assert.match(handle.statusEl.textContent, /Feature settings/);
});

function overlayOpenCls(handle) {
  return handle.overlay.classList.contains('is-open');
}

test('entering focus opens a labelled dialog overlay with the task in plain words', () => {
  const doc = makeDoc();
  const storage = makeStorage({
    'daymark.tasks.v1': tasksJson([task({ dueDate: '2026-11-21', priority: 'high', notes: 'For the review.' })]),
    'daymark.features.v1': flagsJson({ 'focus-mode': true })
  });
  const handle = attach(doc, storage, makeWindow());
  handle.select.value = 't1';
  handle.enterFocus();
  assert.equal(overlayOpenCls(handle), true);
  assert.equal(handle.overlay.getAttribute('role'), 'dialog');
  assert.equal(handle.overlay.getAttribute('aria-modal'), 'true');
  assert.equal(handle.overlay.getAttribute('aria-labelledby'), 'focus-mode-title');
  assert.equal(doc.getElementById('focus-mode-title').textContent, 'One task, one view');
  assert.match(doc.getElementById('focus-mode-result').textContent, /Write the report/);
  const plan = findAll(handle.overlay).filter((node) => node.tagName === 'li').map((node) => node.textContent);
  assert.equal(plan.length, 8, 'entry plan (4) plus the described task lines');
  assert.equal(plan.join(' ').indexOf('Nothing is written to storage until you mark the task complete') !== -1, true);
  assert.equal(plan.join(' ').indexOf('Due today') !== -1, true);
  assert.equal(plan.join(' ').indexOf('Notes: For the review.') !== -1, true);
});

test('the overlay plan list styles target its generated panel class', () => {
  const doc = makeDoc();
  const storage = makeStorage({
    'daymark.tasks.v1': tasksJson([task()]),
    'daymark.features.v1': flagsJson({ 'focus-mode': true })
  });
  const handle = attach(doc, storage, makeWindow());
  handle.enterFocus();

  const panel = findAll(handle.overlay).find((node) => node.className === 'focus-mode-panel');
  const planList = findAll(handle.overlay).find((node) => node.className === 'focus-mode-plan');
  const style = doc.head.children.find((node) => node.tagName === 'style');
  assert.ok(panel, 'the dialog panel is generated with the focus-mode-panel class');
  assert.ok(planList, 'the plan list is generated with the focus-mode-plan class');
  assert.equal(planList.parentNode, panel, 'the plan list is inside its styled panel');
  assert.ok(style, 'the overlay stylesheet is injected into the document head');
  assert.match(style.textContent, /\.focus-mode-panel \.focus-mode-plan\{/);
  assert.match(style.textContent, /#focus-mode-task/);
  assert.match(style.textContent, /:active/);
});

test('Escape and the Exit button close the overlay', () => {
  const doc = makeDoc();
  const storage = makeStorage({ 'daymark.tasks.v1': tasksJson([task()]), 'daymark.features.v1': flagsJson({ 'focus-mode': true }) });
  const handle = attach(doc, storage, makeWindow());
  handle.enterFocus();
  assert.equal(overlayOpenCls(handle), true);
  doc.dispatchDoc('keydown', { key: 'Escape' });
  assert.equal(overlayOpenCls(handle), false);
  handle.enterFocus();
  doc.getElementById('focus-mode-exit').dispatch('click');
  assert.equal(overlayOpenCls(handle), false);
});

test('mark complete writes through the coordinator and asks app.js to reload', () => {
  const doc = makeDoc();
  const win = makeWindow();
  const storage = makeStorage({
    'daymark.tasks.v1': tasksJson([task(), task({ id: 't2', title: 'Other' })]),
    'daymark.features.v1': flagsJson({ 'focus-mode': true })
  });
  const handle = attach(doc, storage, win);
  handle.select.value = 't1';
  handle.enterFocus();
  const before = handle.markComplete();
  assert.equal(typeof before.then === 'function', true, 'markComplete is async');
  return before.then((saved) => {
    assert.equal(saved, true);
    const stored = JSON.parse(storage.getItem('daymark.tasks.v1'));
    assert.equal(stored[0].completed, true);
    assert.equal(stored[0].updatedAt, '2026-11-21T04:30:00Z');
    assert.equal(stored[1].completed, false);
    const generation = JSON.parse(storage.getItem('daymark.tasks.generation.v1'));
    assert.equal(generation.generation, 1);
    assert.deepEqual(win.events.map((event) => event.key), ['daymark.tasks.v1']);
    assert.match(handle.overlayStatus.textContent, /marked complete/);
  });
});

test('mark complete without the lock API refuses honestly and saves nothing', () => {
  const doc = makeDoc();
  const storage = makeStorage({ 'daymark.tasks.v1': tasksJson([task()]), 'daymark.features.v1': flagsJson({ 'focus-mode': true }) });
  const win = makeWindow();
  win.navigator.locks = undefined;
  const handle = attach(doc, storage, win);
  handle.enterFocus();
  return handle.markComplete().then((saved) => {
    assert.equal(saved, false);
    assert.match(handle.overlayStatus.textContent, /nothing was saved/);
    assert.equal(JSON.parse(storage.getItem('daymark.tasks.v1'))[0].completed, false);
  });
});

test('mark complete losing a race to another tab names the conflict, saves nothing', () => {
  const doc = makeDoc();
  const storage = makeStorage({ 'daymark.tasks.v1': tasksJson([task()]), 'daymark.features.v1': flagsJson({ 'focus-mode': true }) });
  const win = makeWindow();
  // A competing writer wins the commit; the overlay must report it honestly.
  const rival = Object.assign({}, mutation, {
    commitTaskSnapshot() { return Promise.resolve({ ok: false, reason: 'conflict', conflictIds: ['t1'] }); }
  });
  const handle = ui.attachFocusModeUi(makeEnv(doc, storage, win, { taskMutation: rival }));
  assert.ok(handle);
  handle.enterFocus();
  return handle.markComplete().then((saved) => {
    assert.equal(saved, false);
    assert.match(handle.overlayStatus.textContent, /Exit, then try again/);
    assert.equal(JSON.parse(storage.getItem('daymark.tasks.v1'))[0].completed, false);
    assert.deepEqual(win.events, [], 'no refresh hint may fire on a failed save');
  });
});

test('with no open tasks the entry is refused and the chooser says so', () => {
  const doc = makeDoc();
  const storage = makeStorage({ 'daymark.tasks.v1': tasksJson([task({ completed: true })]), 'daymark.features.v1': flagsJson({ 'focus-mode': true }) });
  const handle = attach(doc, storage, makeWindow());
  handle.enterFocus();
  assert.equal(overlayOpenCls(handle), false);
  assert.match(handle.statusEl.textContent, /No open tasks/);
});

test('a truncated chooser announces the cap', () => {
  const doc = makeDoc();
  const tasks = [];
  for (let i = 0; i < 55; i += 1) tasks.push(task({ id: 't' + i, title: 'Task ' + i }));
  const storage = makeStorage({ 'daymark.tasks.v1': tasksJson(tasks), 'daymark.features.v1': flagsJson({ 'focus-mode': true }) });
  const handle = attach(doc, storage, makeWindow());
  handle.refreshChooser();
  assert.match(handle.statusEl.textContent, /truncated at 50/);
  const options = findAll(handle.select).filter((node) => node.tagName === 'option');
  assert.equal(options.length, 50);
});

test('a corrupted task store is named, not guessed', () => {
  const doc = makeDoc();
  const storage = makeStorage({ 'daymark.tasks.v1': '{nope', 'daymark.features.v1': flagsJson({ 'focus-mode': true }) });
  const handle = attach(doc, storage, makeWindow());
  handle.enterFocus();
  assert.equal(overlayOpenCls(handle), false);
  assert.match(handle.statusEl.textContent, /could not be read/);
});

test('index.html gains each focus-mode script exactly once, flagged markup stays dynamic', () => {
  for (const name of ['focus-mode-logic.js', 'focus-mode-ui.js']) {
    const tag = '<script src="' + name + '" defer></script>';
    assert.equal(indexHtml.split(tag).length - 1, 1, name + ' must appear exactly once');
  }
  const pos = (name) => indexHtml.indexOf('<script src="' + name + '" defer></script>');
  assert.ok(pos('focus-mode-logic.js') < pos('focus-mode-ui.js'));
  assert.ok(pos('command-bar-ui.js') < pos('focus-mode-logic.js'));
  assert.ok(pos('focus-mode-ui.js') < pos('storage-ui.js'));
  assert.equal(indexHtml.indexOf('focus-mode-layer'), -1, 'overlay markup must stay dynamic');
  assert.equal(indexHtml.indexOf('focus-mode-card'), -1, 'card markup must stay dynamic');
});

test('the module boots through vm against a DOM without localStorage', () => {
  const doc = makeDoc();
  const win = makeWindow();
  delete win.localStorage;
  const sandboxSource = fs.readFileSync(path.join(__dirname, '..', 'focus-mode-ui.js'), 'utf8');
  const sandbox = { window: win, document: doc, DaymarkFeatureFlags: flags, DaymarkFocusMode: focus, DaymarkLogic: logic, DaymarkTaskMutation: mutation };
  vm.runInNewContext(sandboxSource, sandbox);
  const card = doc.getElementById('focus-mode-card');
  assert.ok(card, 'the card bootstrapped without throwing');
  assert.match(doc.getElementById('focus-mode-status').textContent, /Feature settings|could not be read/);
});

test('focus-mode ui source stays free of the banned patterns', () => {
  const clean = ['TO' + 'DO', 'FIX' + 'ME', 'place' + 'holder', 'setInt' + 'erval', 'XMLHt' + 'tpRequest', 'fe' + 'tch(', 'local' + '-first', 'off' + 'line-' + 'first', 'priv' + 'ate-' + 'first'];
  for (const needle of clean) {
    assert.equal(uiSrc.indexOf(needle), -1, needle + ' must not appear in focus-mode-ui.js');
  }
});

test('nothing is written to storage on attach or exit', () => {
  const doc = makeDoc();
  const storage = makeStorage({ 'daymark.tasks.v1': tasksJson([task()]), 'daymark.features.v1': flagsJson({ 'focus-mode': true }) });
  const handle = attach(doc, storage, makeWindow());
  const before = storage.getItem('daymark.tasks.v1');
  handle.enterFocus();
  handle.closeOverlay();
  assert.equal(storage.getItem('daymark.tasks.v1'), before);
});
