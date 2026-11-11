'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../browser-data-ui.js');
const engine = require('../browser-data-logic.js');

function makeElement(tagName) {
  const el = {
    tagName,
    className: '',
    textContent: '',
    value: '',
    children: [],
    listeners: {},
    appendChild(child) { el.children.push(child); return child; },
    removeChild(child) {
      const index = el.children.indexOf(child);
      if (index !== -1) el.children.splice(index, 1);
      return child;
    },
    addEventListener(type, handler) { (el.listeners[type] = el.listeners[type] || []).push(handler); },
    preventDefault() { el.prevented = true; }
  };
  Object.defineProperty(el, 'firstChild', {
    get() { return el.children.length ? el.children[0] : null; }
  });
  return el;
}

function makeDoc(ids) {
  const elements = {};
  for (const id of ids) elements[id] = makeElement(id.includes('form') ? 'form' : 'div');
  return {
    elements,
    getElementById(id) { return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null; },
    createElement(tagName) { return makeElement(tagName); }
  };
}

const ALL_IDS = ['browser-data-action', 'browser-data-status', 'browser-data-result',
  'browser-data-form', 'browser-data-clear'];

test('attachBrowserDataUi requires a document', () => {
  assert.throws(() => ui.attachBrowserDataUi(null), /requires a document/);
  assert.throws(() => ui.attachBrowserDataUi({}), /requires a document/);
});

test('the card explains the selected clear action at boot', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-data-action'].value = 'clear-completed';
  const handle = ui.attachBrowserDataUi({ document: doc, dataApi: engine });
  const status = doc.elements['browser-data-status'].textContent;
  assert.match(status, /Explained · Clear completed tasks/);
  assert.match(status, /deletes data/);
  const result = doc.elements['browser-data-result'];
  assert.equal(result.children[0].className, 'feed-item');
  assert.equal(result.children[0].children[0].className, 'feed-item-title');
  assert.equal(result.children[0].children[0].textContent, 'Clear completed tasks');
  assert.equal(result.children[0].children[1].className, 'feed-item-summary');
  const expected = engine.explainClearAction('clear-completed');
  assert.equal(result.children.length,
    1 + expected.removes.length + expected.keeps.length + 3 + (expected.undoWindowSeconds > 0 ? 1 : 0));
  let lineIndex = 1;
  for (let i = 0; i < expected.removes.length; i += 1) {
    assert.match(result.children[lineIndex++].textContent, /^Removes · /);
  }
  for (let i = 0; i < expected.keeps.length; i += 1) {
    assert.match(result.children[lineIndex++].textContent, /^Keeps · /);
  }
  let recoveryIndex = lineIndex;
  if (expected.undoWindowSeconds > 0) {
    assert.equal(result.children[recoveryIndex].textContent, 'Undo window · 7 seconds');
    recoveryIndex += 1;
  }
  assert.match(result.children[recoveryIndex].textContent, /^Comes back · /);
  assert.match(result.children[recoveryIndex + 1].textContent, /^Scope · This device only/);
  assert.match(result.children[recoveryIndex + 2].textContent, /^Network · /);
  assert.equal(doc.elements['browser-data-clear'].textContent, 'Clear explanation');
  assert.equal(typeof handle.explain, 'function');
});

test('changing the action re-explains, and delete-free actions say so', () => {
  const doc = makeDoc(ALL_IDS);
  const action = doc.elements['browser-data-action'];
  action.value = 'clear-search';
  ui.attachBrowserDataUi({ document: doc, dataApi: engine });
  const change = action.listeners.change;
  assert.ok(change && change.length === 1, 'a change listener must be wired');
  change[0]();
  const status = doc.elements['browser-data-status'].textContent;
  assert.match(status, /deletes nothing/);
  const result = doc.elements['browser-data-result'];
  assert.equal(result.children[0].children[0].textContent, 'Clear task search');
});

test('an unknown action value fails closed to the honest unknown entry', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-data-action'].value = 'definitely-not-an-action';
  ui.attachBrowserDataUi({ document: doc, dataApi: engine });
  const result = doc.elements['browser-data-result'];
  assert.equal(result.children[0].children[0].textContent, 'What this button does is not known');
  assert.match(result.children[0].children[1].textContent, /no honest description/);
});

test('form submit re-explains and the clear button empties the card', () => {
  const doc = makeDoc(ALL_IDS);
  const form = doc.elements['browser-data-form'];
  const clear = doc.elements['browser-data-clear'];
  doc.elements['browser-data-action'].value = 'webhook-clear-queue';
  ui.attachBrowserDataUi({ document: doc, dataApi: engine });
  const submit = form.listeners.submit;
  const click = clear.listeners.click;
  assert.ok(submit && submit.length === 1, 'a submit listener must be wired');
  assert.ok(click && click.length === 1, 'a click listener must be wired');
  const event = makeElement('event');
  submit[0](event);
  assert.equal(event.prevented, true, 'submit must not actually submit');
  assert.equal(doc.elements['browser-data-result'].children[0].children[0].textContent,
    'Clear webhook queue');
  click[0]();
  assert.equal(doc.elements['browser-data-result'].children.length, 0);
  assert.match(doc.elements['browser-data-status'].textContent, /Explanation cleared; no task or storage data was changed/);
});

test('a missing engine degrades honestly instead of guessing', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-data-action'].value = 'clear-completed';
  ui.attachBrowserDataUi({ document: doc, dataApi: null });
  assert.equal(doc.elements['browser-data-status'].textContent,
    'Clear-action explanations are unavailable.');
  assert.equal(doc.elements['browser-data-result'].children.length, 0);
});

test('missing elements never throw; the card simply does less', () => {
  const doc = makeDoc(['browser-data-action']);
  const handle = ui.attachBrowserDataUi({ document: doc, dataApi: engine });
  assert.equal(typeof handle.explain, 'function');
  handle.explain(); // no status/result elements: must be a no-op, not a crash
  handle.onClear();
  handle.detach();
});

// Source pin: index.html must wire the exact ids this card uses, and the
// browser error card ids must match its UI module (regression for the
// browser-error-pick / browser-error-list mismatch fixed alongside this card).
const fs = require('node:fs');
const path = require('node:path');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('index.html wires the clear-action card and the fixed error-card ids', () => {
  assert.ok(indexSource.includes('id="browser-data-card"'), 'the card container must exist');
  assert.ok(indexSource.includes('id="browser-data-action"'), 'the action select must exist');
  assert.ok(indexSource.includes('id="browser-data-result"'), 'the result element must exist');
  assert.ok(indexSource.includes('src="browser-data-logic.js"'), 'the logic script tag must exist');
  assert.ok(indexSource.includes('src="browser-data-ui.js"'), 'the ui script tag must exist');
  assert.ok(indexSource.includes('id="browser-error-scenario"'), 'error card select must match its UI module');
  assert.ok(indexSource.includes('id="browser-error-result"'), 'error card result must match its UI module');
  assert.ok(!indexSource.includes('browser-error-pick'), 'the old error select id must be gone');
  assert.ok(!indexSource.includes('browser-error-list'), 'the old error result id must be gone');
});

// Boot-level regressions: this stateless card must not touch storage at all.
const vm = require('node:vm');
const browserDataSource = fs.readFileSync(path.join(__dirname, '..', 'browser-data-ui.js'), 'utf8');

function makeBootElement() {
  const children = [];
  return {
    children,
    listeners: Object.create(null),
    className: '',
    textContent: '',
    value: 'clear-completed',
    get firstChild() { return children[0] || null; },
    appendChild(child) { children.push(child); return child; },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      return child;
    },
    addEventListener(name, listener) { this.listeners[name] = listener; }
  };
}

function bootWithBlockedStorage(readyState) {
  let localStorageReads = 0;
  const window = {};
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      localStorageReads += 1;
      throw new Error('localStorage access is blocked by browser policy');
    }
  });
  const elements = {
    'browser-data-action': makeBootElement(),
    'browser-data-status': makeBootElement(),
    'browser-data-result': makeBootElement(),
    'browser-data-form': makeBootElement(),
    'browser-data-clear': makeBootElement()
  };
  const documentListeners = Object.create(null);
  const document = {
    readyState,
    getElementById(id) { return elements[id] || null; },
    createElement() { return makeBootElement(); },
    addEventListener(name, listener) { documentListeners[name] = listener; }
  };
  const context = {
    window,
    document,
    DaymarkBrowserData: engine,
    module: { exports: {} }
  };
  vm.runInNewContext(browserDataSource, context, { filename: 'browser-data-ui.js' });
  return {
    get localStorageReads() { return localStorageReads; },
    elements,
    documentListeners
  };
}

test('clear-action card boots and renders when the localStorage getter throws', () => {
  const result = bootWithBlockedStorage('complete');
  assert.equal(result.localStorageReads, 0, 'stateless card boot never reads localStorage');
  assert.equal(result.elements['browser-data-status'].textContent,
    'Explained · Clear completed tasks · deletes data');
  const rendered = result.elements['browser-data-result'].children.length;
  assert.ok(rendered > 1, 'the explanation and scope lines render, got ' + rendered);
});

test('DOMContentLoaded boot also avoids a throwing localStorage getter', () => {
  const result = bootWithBlockedStorage('loading');
  assert.equal(result.localStorageReads, 0, 'registering the boot callback does not read storage');
  assert.equal(typeof result.documentListeners.DOMContentLoaded, 'function');
  assert.doesNotThrow(() => result.documentListeners.DOMContentLoaded());
  assert.equal(result.localStorageReads, 0, 'DOMContentLoaded rendering remains storage-independent');
  assert.equal(result.elements['browser-data-status'].textContent,
    'Explained · Clear completed tasks · deletes data');
});


test('an unknown action is disclosed as unavailable without claiming an action ran', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-data-action'].value = 'definitely-not-an-action';
  ui.attachBrowserDataUi({ document: doc, dataApi: engine });
  assert.match(doc.elements['browser-data-status'].textContent,
    /^Unavailable · Unknown action · no action was run/);
  assert.match(doc.elements['browser-data-result'].children[0].children[1].textContent,
    /no honest description/);
});

test('the wired storage status controls explain as delete-free and clear-all as destructive', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-data-action'].value = 'storage-clear-status';
  ui.attachBrowserDataUi({ document: doc, dataApi: engine });
  assert.match(doc.elements['browser-data-status'].textContent,
    /^Explained · Clear storage status · deletes nothing/);

  doc.elements['browser-data-action'].value = 'storage-clear-all';
  doc.elements['browser-data-action'].listeners.change[0]();
  assert.match(doc.elements['browser-data-status'].textContent,
    /^Explained · Clear all local data · deletes data/);
});

test('the card clear button is explicitly scoped to the explanation only', () => {
  const doc = makeDoc(ALL_IDS);
  const button = doc.elements['browser-data-clear'];
  let ariaLabel = '';
  button.setAttribute = (name, value) => { if (name === 'aria-label') ariaLabel = value; };
  ui.attachBrowserDataUi({ document: doc, dataApi: engine });
  assert.equal(button.textContent, 'Clear explanation');
  assert.match(ariaLabel, /no task or storage data is changed/);
});
