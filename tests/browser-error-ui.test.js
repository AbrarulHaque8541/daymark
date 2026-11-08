'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../browser-error-ui.js');
const engine = require('../browser-error-logic.js');

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

const ALL_IDS = ['browser-error-scenario', 'browser-error-status', 'browser-error-result',
  'browser-error-form', 'browser-error-clear'];

test('attachBrowserErrorUi requires a document', () => {
  assert.throws(() => ui.attachBrowserErrorUi(null), /requires a document/);
  assert.throws(() => ui.attachBrowserErrorUi({}), /requires a document/);
});

test('the card explains the selected scenario at boot', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-error-scenario'].value = 'offline';
  const handle = ui.attachBrowserErrorUi({ document: doc, errorApi: engine });
  const status = doc.elements['browser-error-status'].textContent;
  const result = doc.elements['browser-error-result'];
  assert.match(status, /Explained \u00b7 Offline/);
  assert.match(status, /you can retry/);
  // One head item plus one recovery per taxonomy entry step.
  assert.equal(result.children[0].className, 'feed-item');
  assert.equal(result.children[0].children[0].className, 'feed-item-title');
  assert.equal(result.children[0].children[0].textContent, 'You are offline');
  assert.equal(result.children[0].children[1].className, 'feed-item-summary');
  assert.equal(result.children.length, 1 + engine.explainError('offline').recoveries.length);
  for (let i = 1; i < result.children.length; i += 1) {
    assert.match(result.children[i].textContent, new RegExp('^' + i + '\\. '));
  }
  assert.equal(typeof handle.explain, 'function');
});

test('changing the scenario re-explains, and non-retryable failures say so', () => {
  const doc = makeDoc(ALL_IDS);
  const scenario = doc.elements['browser-error-scenario'];
  scenario.value = 'tls';
  ui.attachBrowserErrorUi({ document: doc, errorApi: engine });
  const change = scenario.listeners.change;
  assert.ok(change && change.length === 1, 'a change listener must be wired');
  change[0]();
  const status = doc.elements['browser-error-status'].textContent;
  assert.doesNotMatch(status, /you can retry/);
  const result = doc.elements['browser-error-result'];
  assert.equal(result.children[0].children[0].textContent, 'Connection not trusted');
});

test('an unknown scenario value fails closed to the honest unknown explanation', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-error-scenario'].value = 'definitely-not-a-scenario';
  ui.attachBrowserErrorUi({ document: doc, errorApi: engine });
  const result = doc.elements['browser-error-result'];
  assert.equal(result.children[0].children[0].textContent, 'Something went wrong');
  assert.match(result.children[0].children[1].textContent, /could not be determined/);
});

test('form submit re-explains and the clear button empties the card', () => {
  const doc = makeDoc(ALL_IDS);
  const form = doc.elements['browser-error-form'];
  const clear = doc.elements['browser-error-clear'];
  doc.elements['browser-error-scenario'].value = 'http-server-error';
  ui.attachBrowserErrorUi({ document: doc, errorApi: engine });
  const submit = form.listeners.submit;
  const click = clear.listeners.click;
  assert.ok(submit && submit.length === 1, 'a submit listener must be wired');
  assert.ok(click && click.length === 1, 'a click listener must be wired');
  const event = makeElement('event');
  submit[0](event);
  assert.equal(event.prevented, true, 'submit must not actually submit');
  assert.equal(doc.elements['browser-error-result'].children[0].children[0].textContent,
    'The site is having trouble');
  click[0]();
  assert.equal(doc.elements['browser-error-result'].children.length, 0);
  assert.match(doc.elements['browser-error-status'].textContent, /Cleared\./);
});

test('a missing engine degrades honestly instead of guessing', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-error-scenario'].value = 'offline';
  ui.attachBrowserErrorUi({ document: doc, errorApi: null });
  assert.equal(doc.elements['browser-error-status'].textContent,
    'Error explanations are unavailable.');
  assert.equal(doc.elements['browser-error-result'].children.length, 0);
});

test('missing elements never throw; the card simply does less', () => {
  const doc = makeDoc(['browser-error-scenario']);
  const handle = ui.attachBrowserErrorUi({ document: doc, errorApi: engine });
  assert.equal(typeof handle.explain, 'function');
  handle.explain(); // no status/result elements: must be a no-op, not a crash
  handle.onClear();
  handle.detach();
});
