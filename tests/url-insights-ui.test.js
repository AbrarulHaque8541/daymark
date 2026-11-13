'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../url-insights-ui.js');
const engine = require('../url-insights-logic.js');

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
  for (const id of ids) elements[id] = makeElement(id === 'url-insights-form' ? 'form' : 'div');
  return {
    elements,
    getElementById(id) { return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null; },
    createElement(tagName) { return makeElement(tagName); }
  };
}

const ALL_IDS = ['url-insights-input', 'url-insights-status', 'url-insights-result',
  'url-insights-form', 'url-insights-clear'];

test('attachUrlInsightsUi requires a document', () => {
  assert.throws(() => ui.attachUrlInsightsUi(null), /requires a document/);
  assert.throws(() => ui.attachUrlInsightsUi({}), /requires a document/);
});

test('planning a web address renders the honest breakdown', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['url-insights-input'].value = 'https://example.com:8443/path';
  const handle = ui.attachUrlInsightsUi({ document: doc, insightsApi: engine });
  assert.equal(typeof handle.plan, 'function');
  handle.plan();
  const status = doc.elements['url-insights-status'].textContent;
  assert.match(status, new RegExp('Planned · Reads as a web address'));
  assert.match(status, new RegExp('nothing was opened or fetched'));
  const result = doc.elements['url-insights-result'];
  assert.equal(result.children[0].className, 'feed-item');
  assert.equal(result.children[0].children[0].textContent, 'Reads as a web address');
  const lines = result.children.slice(1).map((child) => child.textContent);
  assert.ok(lines.some((line) => line.indexOf('Port · 8443 (explicit)') !== -1));
  assert.ok(lines.some((line) => line.indexOf('Network · None here.') === 0));
});

test('planning search text keeps the query visible', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['url-insights-input'].value = 'kerala train schedule';
  ui.attachUrlInsightsUi({ document: doc, insightsApi: engine });
  doc.elements['url-insights-form'].listeners.submit[0]({ preventDefault() {} });
  const lines = doc.elements['url-insights-result'].children.slice(1).map((child) => child.textContent);
  assert.ok(lines.some((line) => line.indexOf('Query kept · kerala train schedule') !== -1));
  assert.ok(lines.some((line) => line.indexOf('nothing is trimmed away') !== -1));
});

test('malformed input fails closed in the card too', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['url-insights-input'].value = 'ftp://files.example.com/pub/';
  ui.attachUrlInsightsUi({ document: doc, insightsApi: engine });
  doc.elements['url-insights-form'].listeners.submit[0]({ preventDefault() {} });
  const status = doc.elements['url-insights-status'].textContent;
  assert.match(status, new RegExp('Not a readable address'));
  assert.match(status, new RegExp('nothing was opened'));
  doc.elements['url-insights-input'].value = 'https://exa mple.com/';
  doc.elements['url-insights-form'].listeners.submit[0]({ preventDefault() {} });
  assert.match(doc.elements['url-insights-status'].textContent, new RegExp('Not a readable address'));
});

test('form submit plans without submitting, and clear empties the card', () => {
  const doc = makeDoc(ALL_IDS);
  const form = doc.elements['url-insights-form'];
  const clear = doc.elements['url-insights-clear'];
  doc.elements['url-insights-input'].value = 'https://example.com/';
  ui.attachUrlInsightsUi({ document: doc, insightsApi: engine });
  const submit = form.listeners.submit;
  const click = clear.listeners.click;
  assert.ok(submit && submit.length === 1, 'a submit listener must be wired');
  assert.ok(click && click.length === 1, 'a click listener must be wired');
  const event = makeElement('event');
  submit[0](event);
  assert.equal(event.prevented, true, 'submit must not actually submit');
  assert.equal(doc.elements['url-insights-result'].children[0].children[0].textContent, 'Reads as a web address');
  click[0]();
  assert.equal(doc.elements['url-insights-result'].children.length, 0);
  assert.match(doc.elements['url-insights-status'].textContent, /Plan cleared; nothing was opened/);
});

test('a missing engine degrades honestly instead of guessing', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['url-insights-input'].value = 'https://example.com';
  ui.attachUrlInsightsUi({ document: doc, insightsApi: null });
  doc.elements['url-insights-form'].listeners.submit[0]({ preventDefault() {} });
  assert.equal(doc.elements['url-insights-status'].textContent, 'Address explanation is unavailable.');
  assert.equal(doc.elements['url-insights-result'].children.length, 0);
});

test('missing elements never throw; the card simply does less', () => {
  const doc = makeDoc(['url-insights-input']);
  const handle = ui.attachUrlInsightsUi({ document: doc, insightsApi: engine });
  assert.equal(typeof handle.plan, 'function');
  handle.plan();
  handle.onClear();
  handle.detach();
});

test('the card clear button is explicitly scoped to the plan only', () => {
  const doc = makeDoc(ALL_IDS);
  const button = doc.elements['url-insights-clear'];
  let ariaLabel = '';
  button.setAttribute = (name, value) => { if (name === 'aria-label') ariaLabel = value; };
  ui.attachUrlInsightsUi({ document: doc, insightsApi: engine });
  assert.equal(button.textContent, 'Clear plan');
  assert.match(ariaLabel, /nothing is fetched/);
});

// Source pin: index.html must wire the exact ids this card uses.
const fs = require('node:fs');
const path = require('node:path');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('index.html wires the address insights card', () => {
  assert.ok(indexSource.includes('id="url-insights-card"'), 'the card container must exist');
  assert.ok(indexSource.includes('id="url-insights-input"'), 'the input must exist');
  assert.ok(indexSource.includes('id="url-insights-result"'), 'the result element must exist');
  assert.ok(indexSource.includes('src="url-insights-logic.js"'), 'the logic script tag must exist');
  assert.ok(indexSource.includes('src="url-insights-ui.js"'), 'the ui script tag must exist');
  const labelFor = indexSource.indexOf('for="url-insights-input"');
  assert.ok(labelFor !== -1, 'the input must have an associated label');
});

// Boot-level regression: this stateless card must not touch storage at all.
const vm = require('node:vm');
const urlInsightsUiSource = fs.readFileSync(path.join(__dirname, '..', 'url-insights-ui.js'), 'utf8');

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
    'url-insights-input': makeBootElement(),
    'url-insights-status': makeBootElement(),
    'url-insights-result': makeBootElement(),
    'url-insights-form': makeBootElement(),
    'url-insights-clear': makeBootElement()
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
    DaymarkUrlInsights: engine,
    module: { exports: {} }
  };
  vm.runInNewContext(urlInsightsUiSource, context, { filename: 'url-insights-ui.js' });
  return {
    get localStorageReads() { return localStorageReads; },
    elements,
    documentListeners
  };
}

test('the address insights card boots without reading localStorage', () => {
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
