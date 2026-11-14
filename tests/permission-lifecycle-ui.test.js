'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../permission-lifecycle-ui.js');
const engine = require('../permission-lifecycle-logic.js');

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

const ALL_IDS = ['permission-lifecycle-state', 'permission-lifecycle-status',
  'permission-lifecycle-result', 'permission-lifecycle-form', 'permission-lifecycle-clear'];

test('attachPermissionLifecycleUi requires a document', () => {
  assert.throws(() => ui.attachPermissionLifecycleUi(null), /requires a document/);
  assert.throws(() => ui.attachPermissionLifecycleUi({}), /requires a document/);
});

test('the card explains the selected permission state at boot', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['permission-lifecycle-state'].value = 'granted';
  const handle = ui.attachPermissionLifecycleUi({ document: doc, dataApi: engine });
  const status = doc.elements['permission-lifecycle-status'].textContent;
  assert.match(status, /Explained \u00b7 Permission granted/);
  assert.match(status, /changes no data/);
  const result = doc.elements['permission-lifecycle-result'];
  assert.equal(result.children[0].className, 'feed-item');
  assert.equal(result.children[0].children[0].className, 'feed-item-title');
  assert.equal(result.children[0].children[0].textContent, 'The capability is available right now');
  assert.equal(result.children[0].children[1].className, 'feed-item-summary');
  const expected = engine.explainPermissionState('granted');
  assert.equal(result.children.length,
    1 + expected.stillWorks.length + expected.lost.length + 5);
  let lineIndex = 1;
  for (let i = 0; i < expected.stillWorks.length; i += 1) {
    assert.match(result.children[lineIndex++].textContent, /^Still works \u00b7 /);
  }
  for (let i = 0; i < expected.lost.length; i += 1) {
    assert.match(result.children[lineIndex++].textContent, /^Lost until you act \u00b7 /);
  }
  assert.equal(result.children[lineIndex++].textContent, 'Prompts again \u00b7 no');
  assert.match(result.children[lineIndex].textContent, /^Recovery \u00b7 /);
  assert.equal(doc.elements['permission-lifecycle-clear'].textContent, 'Clear explanation');
  assert.equal(typeof handle.explain, 'function');
});

test('changing the state re-explains, and data-clearing states say so', () => {
  const doc = makeDoc(ALL_IDS);
  const state = doc.elements['permission-lifecycle-state'];
  state.value = 'site-reset';
  ui.attachPermissionLifecycleUi({ document: doc, dataApi: engine });
  const change = state.listeners.change;
  assert.ok(change && change.length === 1, 'a change listener must be wired');
  change[0]();
  const status = doc.elements['permission-lifecycle-status'].textContent;
  assert.match(status, /clears site data/);
  const result = doc.elements['permission-lifecycle-result'];
  assert.equal(result.children[0].children[0].textContent, 'One site starts over, everything else stays');
});

test('an unknown state value fails closed to the honest unknown entry', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['permission-lifecycle-state'].value = 'definitely-not-a-state';
  ui.attachPermissionLifecycleUi({ document: doc, dataApi: engine });
  const result = doc.elements['permission-lifecycle-result'];
  assert.equal(result.children[0].children[0].textContent, 'This state is not known');
  assert.match(doc.elements['permission-lifecycle-status'].textContent,
    /^Unavailable \u00b7 Unknown permission state \u00b7 no action was run/);
});

test('form submit re-explains and the clear button empties the card', () => {
  const doc = makeDoc(ALL_IDS);
  const form = doc.elements['permission-lifecycle-form'];
  const clear = doc.elements['permission-lifecycle-clear'];
  doc.elements['permission-lifecycle-state'].value = 'revoked-settings';
  ui.attachPermissionLifecycleUi({ document: doc, dataApi: engine });
  const submit = form.listeners.submit;
  const click = clear.listeners.click;
  assert.ok(submit && submit.length === 1, 'a submit listener must be wired');
  assert.ok(click && click.length === 1, 'a click listener must be wired');
  const event = makeElement('event');
  submit[0](event);
  assert.equal(event.prevented, true, 'submit must not actually submit');
  assert.equal(doc.elements['permission-lifecycle-result'].children[0].children[0].textContent,
    'Off everywhere, all at once');
  click[0]();
  assert.equal(doc.elements['permission-lifecycle-result'].children.length, 0);
  assert.match(doc.elements['permission-lifecycle-status'].textContent,
    /Explanation cleared; no permission, setting or stored data was changed/);
});

test('a missing engine degrades honestly instead of guessing', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['permission-lifecycle-state'].value = 'granted';
  ui.attachPermissionLifecycleUi({ document: doc, dataApi: null });
  assert.equal(doc.elements['permission-lifecycle-status'].textContent,
    'Permission-lifecycle explanations are unavailable.');
  assert.equal(doc.elements['permission-lifecycle-result'].children.length, 0);
});

test('missing elements never throw; the card simply does less', () => {
  const doc = makeDoc(['permission-lifecycle-state']);
  const handle = ui.attachPermissionLifecycleUi({ document: doc, dataApi: engine });
  assert.equal(typeof handle.explain, 'function');
  handle.explain(); // no status/result elements: must be a no-op, not a crash
  handle.onClear();
  handle.detach();
});

test('the card clear button is explicitly scoped to the explanation only', () => {
  const doc = makeDoc(ALL_IDS);
  const button = doc.elements['permission-lifecycle-clear'];
  let ariaLabel = '';
  button.setAttribute = (name, value) => { if (name === 'aria-label') ariaLabel = value; };
  ui.attachPermissionLifecycleUi({ document: doc, dataApi: engine });
  assert.equal(button.textContent, 'Clear explanation');
  assert.match(ariaLabel, /no permission, setting or stored data is changed/);
});

// Source pin: index.html must wire the exact ids this card uses.
const fs = require('node:fs');
const path = require('node:path');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('index.html wires the permission-lifecycle card', () => {
  assert.ok(indexSource.includes('id="permission-lifecycle-card"'), 'the card container must exist');
  assert.ok(indexSource.includes('id="permission-lifecycle-state"'), 'the state select must exist');
  assert.ok(indexSource.includes('id="permission-lifecycle-result"'), 'the result element must exist');
  assert.ok(indexSource.includes('src="permission-lifecycle-logic.js"'), 'the logic script tag must exist');
  assert.ok(indexSource.includes('src="permission-lifecycle-ui.js"'), 'the ui script tag must exist');
});

// Boot-level regressions: this stateless card must not touch storage at all.
const uiSource = fs.readFileSync(path.join(__dirname, '..', 'permission-lifecycle-ui.js'), 'utf8');

function makeBootElement() {
  const children = [];
  return {
    children,
    listeners: Object.create(null),
    className: '',
    textContent: '',
    value: 'granted',
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
    'permission-lifecycle-state': makeBootElement(),
    'permission-lifecycle-status': makeBootElement(),
    'permission-lifecycle-result': makeBootElement(),
    'permission-lifecycle-form': makeBootElement(),
    'permission-lifecycle-clear': makeBootElement()
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
    DaymarkPermissionLifecycle: engine,
    module: { exports: {} },
    __dirname: '/repo/tests'
  };
  runInNewContext(uiSource, context, 'permission-lifecycle-ui.js');
  return {
    get localStorageReads() { return localStorageReads; },
    elements,
    documentListeners
  };
}

test('permission-lifecycle card boots and renders when the localStorage getter throws', () => {
  const result = bootWithBlockedStorage('complete');
  assert.equal(result.localStorageReads, 0, 'stateless card boot never reads localStorage');
  assert.equal(result.elements['permission-lifecycle-status'].textContent,
    'Explained \u00b7 Permission granted \u00b7 changes no data');
  const rendered = result.elements['permission-lifecycle-result'].children.length;
  assert.ok(rendered > 1, 'the explanation and scope lines render, got ' + rendered);
});

test('DOMContentLoaded boot also avoids a throwing localStorage getter', () => {
  const result = bootWithBlockedStorage('loading');
  assert.equal(result.localStorageReads, 0, 'registering the boot callback does not read storage');
  assert.equal(typeof result.documentListeners.DOMContentLoaded, 'function');
  assert.doesNotThrow(() => result.documentListeners.DOMContentLoaded());
  assert.equal(result.localStorageReads, 0, 'DOMContentLoaded rendering remains storage-independent');
  assert.equal(result.elements['permission-lifecycle-status'].textContent,
    'Explained \u00b7 Permission granted \u00b7 changes no data');
});
