'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const ui = require('../capability-registry-ui.js');
const registry = require('../capability-registry-logic.js');

function makeElement(tagName) {
  const el = {
    tagName,
    className: '',
    textContent: '',
    value: '',
    children: [],
    listeners: {},
    classList: {
      add() {},
      remove() {},
      contains() { return false; }
    },
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

const ALL_IDS = ['capability-registry-feature', 'capability-registry-status',
  'capability-registry-result', 'capability-registry-form', 'capability-registry-clear'];

test('attachCapabilityRegistryUi requires a document', () => {
  assert.throws(() => ui.attachCapabilityRegistryUi(null), /requires a document/);
  assert.throws(() => ui.attachCapabilityRegistryUi({}), /requires a document/);
});

test('the card describes its first capability at boot', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['capability-registry-feature'].value = 'task-list';
  const handle = ui.attachCapabilityRegistryUi({ document: doc, registryApi: registry });
  const status = doc.elements['capability-registry-status'].textContent;
  assert.match(status, /Described \u00b7 Tasks, notes and tags/);
  const result = doc.elements['capability-registry-result'];
  assert.equal(result.children[0].className, 'feed-item');
  assert.equal(result.children[0].children[0].className, 'feed-item-title');
  assert.equal(result.children[0].children[0].textContent, 'The core of Daymark, fully working here');
  assert.equal(result.children[0].children[1].className, 'feed-item-summary');
  const expected = registry.describeFeature('task-list');
  assert.equal(result.children.length, 1 + 7 + expected.limitations.length,
    'a header plus the seven fixed contract lines plus limitations');
  assert.match(result.children[1].textContent, /^Capability id \u00b7 task-list/);
  assert.match(result.children[3].textContent, /^Availability \u00b7 available/);
  assert.match(result.children[4].textContent, /^Network \u00b7 none/);
  assert.match(result.children[5].textContent, /Permissions \u00b7 none/);
  assert.match(result.children[result.children.length - 1].textContent, /^Limitation \u00b7 /);
  assert.equal(typeof handle.describe, 'function');
});

test('switching to a device-only capability never renders it as available', () => {
  const doc = makeDoc(ALL_IDS);
  const feature = doc.elements['capability-registry-feature'];
  feature.value = 'daymark-browser';
  ui.attachCapabilityRegistryUi({ document: doc, registryApi: registry });
  const change = feature.listeners.change;
  assert.ok(change && change.length === 1, 'a change listener must be wired');
  change[0]();
  const status = doc.elements['capability-registry-status'].textContent;
  assert.match(status, /^Not available here \u00b7 Daymark browser/);
  assert.match(status, /nothing rendered as available/);
  const result = doc.elements['capability-registry-result'];
  assert.match(result.children[3].textContent, /Availability \u00b7 device-only/);
});

test('an unknown feature value fails closed to the honest unknown entry', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['capability-registry-feature'].value = 'definitely-not-a-capability';
  ui.attachCapabilityRegistryUi({ document: doc, registryApi: registry });
  const result = doc.elements['capability-registry-result'];
  assert.equal(result.children[0].children[0].textContent, 'This capability is not registered');
  assert.match(doc.elements['capability-registry-status'].textContent,
    /^Not available here \u00b7 Unknown capability/);
});

test('form submit re-describes and the clear button empties the card', () => {
  const doc = makeDoc(ALL_IDS);
  const form = doc.elements['capability-registry-form'];
  const clear = doc.elements['capability-registry-clear'];
  doc.elements['capability-registry-feature'].value = 'online-glance-cards';
  ui.attachCapabilityRegistryUi({ document: doc, registryApi: registry });
  const submit = form.listeners.submit;
  const click = clear.listeners.click;
  assert.ok(submit && submit.length === 1, 'a submit listener must be wired');
  assert.ok(click && click.length === 1, 'a click listener must be wired');
  const event = makeElement('event');
  submit[0](event);
  assert.equal(event.prevented, true, 'submit must not actually submit');
  assert.match(doc.elements['capability-registry-status'].textContent, /Described \u00b7 Online glance cards/);
  click[0]();
  assert.equal(doc.elements['capability-registry-result'].children.length, 0);
  assert.match(doc.elements['capability-registry-status'].textContent,
    /nothing was fetched, run or stored/);
});

test('a missing registry engine degrades honestly instead of guessing', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['capability-registry-feature'].value = 'task-list';
  ui.attachCapabilityRegistryUi({ document: doc, registryApi: null });
  assert.equal(doc.elements['capability-registry-status'].textContent,
    'Capability registry descriptions are unavailable.');
  assert.equal(doc.elements['capability-registry-result'].children.length, 0);
});

test('missing elements never throw; the card simply does less', () => {
  const doc = makeDoc(['capability-registry-feature']);
  const handle = ui.attachCapabilityRegistryUi({ document: doc, registryApi: registry });
  assert.equal(typeof handle.describe, 'function');
  handle.describe();
  handle.onClear();
  handle.detach();
});

test('the card clear button is explicitly scoped to the registry view', () => {
  const doc = makeDoc(ALL_IDS);
  const button = doc.elements['capability-registry-clear'];
  let ariaLabel = '';
  button.setAttribute = (name, value) => { if (name === 'aria-label') ariaLabel = value; };
  ui.attachCapabilityRegistryUi({ document: doc, registryApi: registry });
  assert.equal(button.textContent, 'Clear');
  assert.match(ariaLabel, /nothing is fetched, run or stored/);
});

// Source pin: index.html must wire the exact ids this card uses.
const fs = require('node:fs');
const path = require('node:path');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('index.html wires the capability-registry card', () => {
  assert.ok(indexSource.includes('id="capability-registry-card"'), 'the card container must exist');
  assert.ok(indexSource.includes('id="capability-registry-feature"'), 'the feature select must exist');
  assert.ok(indexSource.includes('id="capability-registry-result"'), 'the result element must exist');
  assert.ok(indexSource.includes('src="capability-registry-logic.js"'), 'the logic script tag must exist');
  assert.ok(indexSource.includes('src="capability-registry-ui.js"'), 'the ui script tag must exist');
});

// Boot-level regression: this stateless card must not touch storage at all.
const uiSource = fs.readFileSync(path.join(__dirname, '..', 'capability-registry-ui.js'), 'utf8');

function makeBootElement() {
  const children = [];
  return {
    children,
    listeners: Object.create(null),
    className: '',
    textContent: '',
    value: 'task-list',
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
    'capability-registry-feature': makeBootElement(),
    'capability-registry-status': makeBootElement(),
    'capability-registry-result': makeBootElement(),
    'capability-registry-form': makeBootElement(),
    'capability-registry-clear': makeBootElement()
  };
  const documentListeners = Object.create(null);
  const document = {
    readyState,
    getElementById(id) { return elements[id] || null; },
    createElement() { return makeBootElement(); },
    addEventListener(name, listener) { documentListeners[name] = listener; }
  };
  const sandbox = {
    window,
    document,
    DaymarkCapabilityRegistry: registry,
    module: { exports: {} }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(uiSource, sandbox, { filename: 'capability-registry-ui.js' });
  return {
    get localStorageReads() { return localStorageReads; },
    elements,
    documentListeners
  };
}

test('capability-registry card boots and renders when the localStorage getter throws', () => {
  const result = bootWithBlockedStorage('complete');
  assert.equal(result.localStorageReads, 0, 'stateless card boot never reads localStorage');
  assert.equal(result.elements['capability-registry-status'].textContent,
    'Described \u00b7 Tasks, notes and tags');
  const rendered = result.elements['capability-registry-result'].children.length;
  assert.ok(rendered > 1, 'the description and contract lines render, got ' + rendered);
});

test('DOMContentLoaded boot also avoids a throwing localStorage getter', () => {
  const result = bootWithBlockedStorage('loading');
  assert.equal(result.localStorageReads, 0, 'registering the boot callback does not read storage');
  assert.equal(typeof result.documentListeners.DOMContentLoaded, 'function');
  assert.doesNotThrow(() => result.documentListeners.DOMContentLoaded());
  assert.equal(result.localStorageReads, 0, 'DOMContentLoaded rendering remains storage-independent');
  assert.equal(result.elements['capability-registry-status'].textContent,
    'Described \u00b7 Tasks, notes and tags');
});
