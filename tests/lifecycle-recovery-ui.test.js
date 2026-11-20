'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const engine = require('../lifecycle-recovery-logic.js');
const ui = require('../lifecycle-recovery-ui.js');

const SCENARIO_SELECT_ID = 'lifecycle-recovery-scenario';
const STATUS_ID = 'lifecycle-recovery-status';
const RESULT_ID = 'lifecycle-recovery-result';
const FORM_ID = 'lifecycle-recovery-form';
const CLEAR_ID = 'lifecycle-recovery-clear';
const CARD_IDS = [FORM_ID, SCENARIO_SELECT_ID, STATUS_ID, RESULT_ID, CLEAR_ID];

function makeElement(id, tag) {
  const el = {
    id,
    tagName: (tag || 'div').toUpperCase(),
    textContent: '',
    value: '',
    listeners: {},
    children: [],
    attributes: {},
    setAttribute(name, v) { this.attributes[name] = v; },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    },
    addEventListener(type, fn) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(fn);
    },
    dispatch(type, event) {
      const handlers = this.listeners[type] || [];
      for (const fn of handlers) fn(event);
    },
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
    },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i > -1) this.children.splice(i, 1);
      child.parentNode = null;
    },
    get firstChild() {
      return this.children.length > 0 ? this.children[0] : null;
    }
  };
  if (id === SCENARIO_SELECT_ID) el.value = 'rotation';
  return el;
}

function makeDoc(readyState) {
  const elements = {};
  elements[FORM_ID] = makeElement(FORM_ID, 'form');
  elements[SCENARIO_SELECT_ID] = makeElement(SCENARIO_SELECT_ID, 'select');
  elements[STATUS_ID] = makeElement(STATUS_ID, 'p');
  elements[RESULT_ID] = makeElement(RESULT_ID, 'div');
  elements[CLEAR_ID] = makeElement(CLEAR_ID, 'button');
  const doc = {
    readyState: readyState || 'complete',
    listeners: {},
    createElement(tag) { return makeElement('', tag); },
    getElementById(id) { return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null; },
    addEventListener(type, fn) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(fn);
    },
    dispatch(type, event) {
      const handlers = this.listeners[type] || [];
      for (const fn of handlers) fn(event);
    }
  };
  return { doc, elements };
}

test('boot explains the selected scenario exactly once', () => {
  const made = makeDoc();
  const outcome = ui.attachLifecycleRecoveryUi({ document: made.doc, engine });
  assert.equal(outcome.ok, true);
  assert.ok(made.elements[STATUS_ID].textContent.indexOf(ui.AVAILABLE_PREFIX) === 0);
  assert.ok(made.elements[STATUS_ID].textContent.indexOf('Rotation and other configuration changes') !== -1);
  assert.ok(made.elements[STATUS_ID].textContent.indexOf(ui.AVAILABLE_SUFFIX) !== -1);
  assert.equal(made.elements[RESULT_ID].children.length, 7);
});

test('change re-explains the chosen scenario', () => {
  const made = makeDoc();
  ui.attachLifecycleRecoveryUi({ document: made.doc, engine });
  const select = made.elements[SCENARIO_SELECT_ID];
  select.value = 'process-death';
  select.dispatch('change', {});
  assert.ok(made.elements[STATUS_ID].textContent.indexOf('Android stopped the app in the background') !== -1);
  assert.equal(made.elements[RESULT_ID].children.length, 7);
  assert.ok(made.elements[STATUS_ID].textContent.indexOf('rotation scenario') === -1);
});

test('unknown scenario fails closed with the unavailable notice', () => {
  const made = makeDoc();
  ui.attachLifecycleRecoveryUi({ document: made.doc, engine });
  const select = made.elements[SCENARIO_SELECT_ID];
  select.value = 'not-a-real-scenario';
  select.dispatch('change', {});
  assert.equal(made.elements[STATUS_ID].textContent, ui.UNAVAILABLE_MESSAGE);
  assert.equal(made.elements[RESULT_ID].children.length, 0);
  made.elements[FORM_ID].dispatch('submit', { preventDefault() {} });
  assert.equal(made.elements[STATUS_ID].textContent, ui.UNAVAILABLE_MESSAGE);
  assert.equal(made.elements[RESULT_ID].children.length, 0);
});

test('submit explains and prevents default navigation', () => {
  const made = makeDoc();
  ui.attachLifecycleRecoveryUi({ document: made.doc, engine });
  let prevented = false;
  made.elements[FORM_ID].dispatch('submit', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.ok(made.elements[STATUS_ID].textContent.indexOf('Rotation and other configuration changes') !== -1);
  assert.equal(made.elements[RESULT_ID].children.length, 7);
});

test('clear empties the explanation', () => {
  const made = makeDoc();
  ui.attachLifecycleRecoveryUi({ document: made.doc, engine });
  const clearBtn = made.elements[CLEAR_ID];
  assert.equal(clearBtn.getAttribute('aria-label'), ui.CLEAR_ARIA_LABEL);
  clearBtn.dispatch('click', {});
  assert.equal(made.elements[STATUS_ID].textContent, '');
  assert.equal(made.elements[RESULT_ID].children.length, 0);
});

test('missing engine degrades with an honest notice and no throw', () => {
  const made = makeDoc();
  const outcome = ui.attachLifecycleRecoveryUi({ document: made.doc, engine: null });
  assert.equal(outcome.ok, true);
  assert.equal(made.elements[STATUS_ID].textContent, ui.NO_ENGINE_MESSAGE);
  assert.equal(made.elements[RESULT_ID].children.length, 0);
});

test('missing card elements return a graceful no instead of throwing', () => {
  const made = makeDoc();
  delete made.elements[STATUS_ID];
  let outcome = null;
  assert.doesNotThrow(() => {
    outcome = ui.attachLifecycleRecoveryUi({ document: made.doc, engine });
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'missing-elements');
});

test('index.html pins the card, its five ids and both script tags', () => {
  const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(source.indexOf('id="lifecycle-recovery-card"') !== -1);
  for (const id of CARD_IDS) {
    assert.ok(source.indexOf('id="' + id + '"') !== -1, 'missing id ' + id);
  }
  assert.ok(source.indexOf('<script src="lifecycle-recovery-logic.js" defer></script>') !== -1);
  assert.ok(source.indexOf('<script src="lifecycle-recovery-ui.js" defer></script>') !== -1);
  const cardAt = source.indexOf('id="lifecycle-recovery-card"');
  const compatAt = source.indexOf('id="release-compat-card"');
  assert.ok(cardAt > -1 && compatAt > -1 && cardAt < compatAt);
});

test('boot in a ready document explains immediately and never reads window.localStorage', () => {
  const made = makeDoc('complete');
  const fakeWindow = {};
  Object.defineProperty(fakeWindow, 'localStorage', {
    get() { throw new Error('localStorage must not be read at boot'); }
  });
  fakeWindow.DaymarkLifecycleRecovery = engine;
  const source = fs.readFileSync(path.join(__dirname, '../lifecycle-recovery-ui.js'), 'utf8');
  vm.runInNewContext(source, { window: fakeWindow, document: made.doc });
  assert.ok(made.elements[STATUS_ID].textContent.indexOf(ui.AVAILABLE_PREFIX) === 0);
  assert.equal(made.elements[RESULT_ID].children.length, 7);
});

test('boot in a loading document defers the first explanation', () => {
  const made = makeDoc('loading');
  const fakeWindow = {};
  Object.defineProperty(fakeWindow, 'localStorage', {
    get() { throw new Error('localStorage must not be read at boot'); }
  });
  fakeWindow.DaymarkLifecycleRecovery = engine;
  const source = fs.readFileSync(path.join(__dirname, '../lifecycle-recovery-ui.js'), 'utf8');
  vm.runInNewContext(source, { window: fakeWindow, document: made.doc });
  assert.equal(made.elements[STATUS_ID].textContent, '');
  assert.equal(made.elements[RESULT_ID].children.length, 0);
  made.doc.dispatch('DOMContentLoaded', {});
  assert.ok(made.elements[STATUS_ID].textContent.indexOf(ui.AVAILABLE_PREFIX) === 0);
  assert.equal(made.elements[RESULT_ID].children.length, 7);
});
