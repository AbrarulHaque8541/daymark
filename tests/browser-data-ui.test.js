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
    disabled: false,
    children: [],
    listeners: {},
    classList: {
      add(cls) { el.className = (el.className + ' ' + cls).trim(); },
      remove(cls) { el.className = el.className.replace(new RegExp('\\b' + cls + '\\b', 'g'), '').replace(/\s+/g, ' ').trim(); }
    },
    setAttribute(name, value) { el[name] = value; },
    removeAttribute(name) { delete el[name]; },
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
  'browser-data-form', 'browser-data-clear', 'browser-data-explain'];

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
    1 + expected.removes.length + expected.keeps.length + 3);
  assert.match(result.children[1].textContent, /^Removes · /);
  assert.match(result.children[2].textContent, /^Keeps · /);
  const recoveryIndex = 1 + expected.removes.length + expected.keeps.length;
  assert.match(result.children[recoveryIndex].textContent, /^No undo · /);
  assert.match(result.children[recoveryIndex + 1].textContent, /^Scope · This device only/);
  assert.match(result.children[recoveryIndex + 2].textContent, /^Network · /);
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
  assert.match(doc.elements['browser-data-status'].textContent, /Cleared./);
});

test('a missing engine degrades honestly instead of guessing', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-data-action'].value = 'clear-completed';
  ui.attachBrowserDataUi({ document: doc, dataApi: null });
  assert.equal(doc.elements['browser-data-status'].textContent,
    'Clear-action explanations are unavailable.');
  assert.equal(doc.elements['browser-data-result'].children.length, 0);
});

test('detach clears the status without touching storage', () => {
  const doc = makeDoc(ALL_IDS);
  const handle = ui.attachBrowserDataUi({ document: doc, dataApi: engine });
  handle.detach();
  assert.equal(doc.elements['browser-data-status'].textContent, '');
});

test('index.html wires the clear-action card and the fixed error-card ids', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="browser-data-card"/);
  assert.match(html, /id="browser-data-action"/);
  assert.match(html, /id="browser-data-explain"/);
  assert.match(html, /id="browser-error-scenario"/);
  assert.match(html, /id="browser-error-result"/);
});

test('clear-action card boots and renders when the localStorage getter throws', () => {
  const doc = makeDoc(ALL_IDS);
  Object.defineProperty(doc, 'localStorage', {
    get() { throw new Error('storage denied'); }
  });
  const handle = ui.attachBrowserDataUi({ document: doc, dataApi: engine });
  assert.equal(typeof handle.explain, 'function');
  assert.match(doc.elements['browser-data-status'].textContent, /Explained/);
});

test('DOMContentLoaded boot also avoids a throwing localStorage getter', () => {
  const doc = makeDoc(ALL_IDS);
  Object.defineProperty(doc, 'localStorage', {
    get() { throw new Error('storage denied'); }
  });
  doc.readyState = 'loading';
  const listeners = [];
  doc.addEventListener = (type, fn) => { if (type === 'DOMContentLoaded') listeners.push(fn); };
  // Simulate the boot path that registers the listener
  const originalDocument = global.document;
  global.document = doc;
  try {
    delete require.cache[require.resolve('../browser-data-ui.js')];
    require('../browser-data-ui.js');
    assert.equal(listeners.length, 1);
    listeners[0]();
    assert.match(doc.elements['browser-data-status'].textContent, /Explained/);
  } finally {
    global.document = originalDocument;
  }
});

test('Explain button shows busy state during explanation and clears it', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-data-action'].value = 'clear-completed';
  const explainBtn = doc.elements['browser-data-explain'];
  let busyDuring = false;
  const originalExplain = engine.explainClearAction;
  engine.explainClearAction = (action) => {
    busyDuring = explainBtn['aria-busy'] === 'true' && explainBtn.disabled === true && /is-busy/.test(explainBtn.className);
    return originalExplain(action);
  };
  try {
    ui.attachBrowserDataUi({ document: doc, dataApi: engine });
    assert.equal(busyDuring, true, 'button must be busy while the engine runs');
    assert.equal(explainBtn['aria-busy'], undefined, 'aria-busy cleared after');
    assert.equal(explainBtn.disabled, false, 'button re-enabled');
    assert.doesNotMatch(explainBtn.className, /is-busy/, 'is-busy class removed');
  } finally {
    engine.explainClearAction = originalExplain;
  }
});
