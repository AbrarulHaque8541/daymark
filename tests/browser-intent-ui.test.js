'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../browser-intent-ui.js');
const engine = require('../browser-intent-logic.js');

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
  for (const id of ids) elements[id] = makeElement(id === 'browser-intent-form' ? 'form' : 'div');
  return {
    elements,
    getElementById(id) { return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null; },
    createElement(tagName) { return makeElement(tagName); }
  };
}

const ALL_IDS = ['browser-intent-link', 'browser-intent-status', 'browser-intent-result',
  'browser-intent-form', 'browser-intent-clear'];

test('attachBrowserIntentUi requires a document', () => {
  assert.throws(() => ui.attachBrowserIntentUi(null), /requires a document/);
  assert.throws(() => ui.attachBrowserIntentUi({}), /requires a document/);
});

test('planning a tg:// link renders an honest handoff plan', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-intent-link'].value = 'tg://resolve?domain=example';
  const handle = ui.attachBrowserIntentUi({ document: doc, intentApi: engine });
  assert.equal(typeof handle.plan, 'function');
  handle.plan();
  const status = doc.elements['browser-intent-status'].textContent;
  assert.match(status, new RegExp('Planned · Telegram deep link'));
  assert.match(status, new RegExp('nothing was opened'));
  const result = doc.elements['browser-intent-result'];
  assert.equal(result.children[0].className, 'feed-item');
  assert.equal(result.children[0].children[0].textContent, 'Telegram deep link');
  const lines = result.children.slice(1).map((child) => child.textContent);
  assert.ok(lines.some((line) => line.indexOf('no store redirect') !== -1));
  assert.ok(lines.some((line) => line.indexOf('Network · None here') === 0));
});

test('planning an intent:// link discloses the package and fallback', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-intent-link'].value =
    'intent://scan/#Intent;scheme=zxing;package=com.example.scan;S.browser_fallback_url=https%3A%2F%2Fexample.com%2Fproduct;end';
  ui.attachBrowserIntentUi({ document: doc, intentApi: engine });
  doc.elements['browser-intent-form'].listeners.submit[0]({ preventDefault() {} });
  const lines = doc.elements['browser-intent-result'].children.slice(1).map((child) => child.textContent);
  assert.ok(lines.some((line) => line.indexOf('com.example.scan (pinned by the link)') !== -1));
  assert.ok(lines.some((line) => line.indexOf('https://example.com/product') !== -1));
});

test('malformed and unknown links fail closed in the card too', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-intent-link'].value = 'weirdapp://open';
  ui.attachBrowserIntentUi({ document: doc, intentApi: engine });
  handlePlan(doc);
  assert.match(doc.elements['browser-intent-status'].textContent, new RegExp('Unknown scheme, so nothing is planned'));
  doc.elements['browser-intent-link'].value = 'mailto:hello world';
  handlePlan(doc);
  assert.match(doc.elements['browser-intent-status'].textContent, new RegExp('Not planned'));
  function handlePlan(docRef) {
    docRef.elements['browser-intent-form'].listeners.submit[0]({ preventDefault() {} });
  }
});

test('form submit plans without submitting, and clear empties the card', () => {
  const doc = makeDoc(ALL_IDS);
  const form = doc.elements['browser-intent-form'];
  const clear = doc.elements['browser-intent-clear'];
  doc.elements['browser-intent-link'].value = 'https://example.com/';
  ui.attachBrowserIntentUi({ document: doc, intentApi: engine });
  const submit = form.listeners.submit;
  const click = clear.listeners.click;
  assert.ok(submit && submit.length === 1, 'a submit listener must be wired');
  assert.ok(click && click.length === 1, 'a click listener must be wired');
  const event = makeElement('event');
  submit[0](event);
  assert.equal(event.prevented, true, 'submit must not actually submit');
  assert.equal(doc.elements['browser-intent-result'].children[0].children[0].textContent, 'Stays in the browser');
  click[0]();
  assert.equal(doc.elements['browser-intent-result'].children.length, 0);
  assert.match(doc.elements['browser-intent-status'].textContent, /Plan cleared; no link was followed/);
});

test('a missing engine degrades honestly instead of guessing', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-intent-link'].value = 'tg://resolve?domain=example';
  ui.attachBrowserIntentUi({ document: doc, intentApi: null });
  doc.elements['browser-intent-form'].listeners.submit[0]({ preventDefault() {} });
  assert.equal(doc.elements['browser-intent-status'].textContent, 'App-link planning is unavailable.');
  assert.equal(doc.elements['browser-intent-result'].children.length, 0);
});

test('missing elements never throw; the card simply does less', () => {
  const doc = makeDoc(['browser-intent-link']);
  const handle = ui.attachBrowserIntentUi({ document: doc, intentApi: engine });
  assert.equal(typeof handle.plan, 'function');
  handle.plan(); // no status/result elements: must be a no-op, not a crash
  handle.onClear();
  handle.detach();
});

test('the card clear button is explicitly scoped to the plan only', () => {
  const doc = makeDoc(ALL_IDS);
  const button = doc.elements['browser-intent-clear'];
  let ariaLabel = '';
  button.setAttribute = (name, value) => { if (name === 'aria-label') ariaLabel = value; };
  ui.attachBrowserIntentUi({ document: doc, intentApi: engine });
  assert.equal(button.textContent, 'Clear plan');
  assert.match(ariaLabel, /no link is followed and nothing is opened/);
});

// Source pin: index.html must wire the exact ids this card uses.
const fs = require('node:fs');
const path = require('node:path');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('index.html wires the app-link planner card', () => {
  assert.ok(indexSource.includes('id="browser-intent-card"'), 'the card container must exist');
  assert.ok(indexSource.includes('id="browser-intent-link"'), 'the link input must exist');
  assert.ok(indexSource.includes('id="browser-intent-result"'), 'the result element must exist');
  assert.ok(indexSource.includes('src="browser-intent-logic.js"'), 'the logic script tag must exist');
  assert.ok(indexSource.includes('src="browser-intent-ui.js"'), 'the ui script tag must exist');
  const labelFor = indexSource.indexOf('for="browser-intent-link"');
  assert.ok(labelFor !== -1, 'the link input must have an associated label');
});

// Boot-level regression: this stateless card must not touch storage at all.
const vm = require('node:vm');
const browserIntentUiSource = fs.readFileSync(path.join(__dirname, '..', 'browser-intent-ui.js'), 'utf8');

function makeBootElement() {
  const children = [];
  return {
    children,
    listeners: Object.create(null),
    className: '',
    textContent: '',
    value: '',
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
    'browser-intent-link': makeBootElement(),
    'browser-intent-status': makeBootElement(),
    'browser-intent-result': makeBootElement(),
    'browser-intent-form': makeBootElement(),
    'browser-intent-clear': makeBootElement()
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
    DaymarkBrowserIntent: engine,
    module: { exports: {} }
  };
  vm.runInNewContext(browserIntentUiSource, context, { filename: 'browser-intent-ui.js' });
  return {
    get localStorageReads() { return localStorageReads; },
    elements,
    documentListeners
  };
}

test('the app-link card boots without reading localStorage', () => {
  const result = bootWithBlockedStorage('complete');
  assert.equal(result.localStorageReads, 0, 'stateless card boot never reads localStorage');
});

test('DOMContentLoaded boot also avoids a throwing localStorage getter', () => {
  const result = bootWithBlockedStorage('loading');
  assert.equal(result.localStorageReads, 0, 'registering the boot callback does not read storage');
  assert.equal(typeof result.documentListeners.DOMContentLoaded, 'function');
  assert.doesNotThrow(() => result.documentListeners.DOMContentLoaded());
  assert.equal(result.localStorageReads, 0, 'DOMContentLoaded rendering remains storage-independent');
});
