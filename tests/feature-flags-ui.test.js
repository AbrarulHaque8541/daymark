'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../feature-flags-ui.js');
const flags = require('../feature-flags-logic.js');

const PLANNED_NOTE = 'Planned, not switchable yet.';
const NOT_DO_LINE = 'What it does not do:';
const NO_SAVED_TEXT = 'No saved preferences yet; defaults are shown. Nothing was fetched.';

function makeElement(tagName) {
  const el = {
    tagName: tagName,
    className: '',
    textContent: '',
    value: '',
    disabled: false,
    checked: false,
    children: [],
    listeners: {},
    attrs: {},
    parentNode: null,
    appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
    insertBefore(child, before) {
      const index = el.children.indexOf(before);
      child.parentNode = el;
      if (index === -1) el.children.push(child);
      else el.children.splice(index, 0, child);
      return child;
    },
    removeChild(child) {
      const index = el.children.indexOf(child);
      if (index !== -1) el.children.splice(index, 1);
      child.parentNode = null;
      return child;
    },
    addEventListener(type, handler) { (el.listeners[type] = el.listeners[type] || []).push(handler); },
    dispatch(type, ev) {
      const event = Object.assign({ type: type, target: el }, ev || {});
      for (const handler of (el.listeners[type] || []).slice()) handler(event);
    },
    setAttribute(name, value) { el.attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : null; },
    focus() { el.focused = true; },
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

function makeDoc() {
  const head = makeElement('head');
  const body = makeElement('body');
  const elements = { 'storage-card': makeElement('div') };
  const docListeners = {};
  return {
    head: head,
    body: body,
    getElementById(id) {
      if (Object.prototype.hasOwnProperty.call(elements, id)) return elements[id];
      const pool = findAll(head).concat(findAll(body));
      for (const node of pool) {
        if (node.getAttribute('id') === id) return node;
      }
      return null;
    },
    createElement(tagName) { return makeElement(tagName); },
    addEventListener(type, handler) { (docListeners[type] = docListeners[type] || []).push(handler); },
    dispatchDoc(type, ev) {
      for (const handler of (docListeners[type] || []).slice()) handler(ev);
    }
  };
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

function attach(doc, storage) {
  return ui.attachFeatureFlagsUi({ document: doc, flags: flags, storage: storage });
}

function checkboxById(doc, id) {
  const card = doc.getElementById('feature-flags-card');
  for (const node of findAll(card)) {
    if (node.getAttribute && node.getAttribute('data-feature-id') === id) return node;
  }
  return null;
}

function textOfTree(node) {
  let out = node.textContent || '';
  for (const child of node.children) out += ' ' + textOfTree(child);
  return out;
}

test('attach fails closed without a document or a flags registry', () => {
  assert.deepEqual(ui.attachFeatureFlagsUi(null), { attached: false, reason: 'document-unavailable' });
  assert.deepEqual(ui.attachFeatureFlagsUi({}), { attached: false, reason: 'document-unavailable' });
  const doc = makeDoc();
  const noRegistry = ui.attachFeatureFlagsUi({ document: doc, flags: null, storage: makeStorage({}) });
  assert.deepEqual(noRegistry, { attached: false, reason: 'registry-unavailable' });
});

test('the card mounts with its id, class and a status live region, then mounts nowhere else', () => {
  const doc = makeDoc();
  const storage = makeStorage({});
  const first = attach(doc, storage);
  assert.equal(first.attached, true);
  const card = doc.getElementById('feature-flags-card');
  assert.ok(card);
  assert.equal(card.className, 'suggestion-card');
  assert.equal(card.getAttribute('id'), 'feature-flags-card');
  const status = doc.getElementById('feature-flags-status');
  assert.ok(status);
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  const second = attach(doc, storage);
  assert.deepEqual(second, { attached: false, reason: 'already-attached' });
});

test('every switch is live now: no checkbox is disabled and no note is shown', () => {
  const doc = makeDoc();
  attach(doc, makeStorage({}));
  const card = doc.getElementById('feature-flags-card');
  for (const id of ['command-bar', 'search-bangs', 'comfort-tint', 'mindful-breaks', 'focus-mode', 'auto-archive', 'snooze-pages']) {
    assert.equal(checkboxById(doc, id).disabled, false);
  }
  assert.equal(textOfTree(card).split(PLANNED_NOTE).length - 1, 0);
});

test('the card says what it does not do', () => {
  const doc = makeDoc();
  attach(doc, makeStorage({}));
  assert.equal(textOfTree(doc.getElementById('feature-flags-card')).indexOf(NOT_DO_LINE) !== -1, true);
});

test('no storage reads happen at attach; reads only start on hydrate', () => {
  const doc = makeDoc();
  const storage = makeStorage({});
  attach(doc, storage);
  assert.equal(storage.reads(), 0);
});

test('hydrating with no saved state shows the honest defaults message', () => {
  const doc = makeDoc();
  const storage = makeStorage({});
  const attached = attach(doc, storage);
  attached.handle.hydrate();
  assert.equal(doc.getElementById('feature-flags-status').textContent, NO_SAVED_TEXT);
});

test('hydrating a saved state checks the matching boxes', () => {
  const doc = makeDoc();
  const saved = { 'command-bar': true, 'search-bangs': false, 'comfort-tint': false, 'mindful-breaks': false, 'focus-mode': false, 'auto-archive': false, 'snooze-pages': false };
  const attached = attach(doc, makeStorage({ 'daymark.features.v1': JSON.stringify(saved) }));
  attached.handle.hydrate();
  assert.equal(checkboxById(doc, 'command-bar').checked, true);
  assert.equal(checkboxById(doc, 'search-bangs').checked, false);
  assert.equal(doc.getElementById('feature-flags-status').textContent, 'Saved preferences on this device are shown.');
});

test('hydrating malformed saved state says the state was unreadable', () => {
  const doc = makeDoc();
  const attached = attach(doc, makeStorage({ 'daymark.features.v1': '{nope' }));
  attached.handle.hydrate();
  assert.equal(doc.getElementById('feature-flags-status').textContent, 'Saved preferences were unreadable, so defaults are shown.');
});

test('flipping a checkbox through a change event persists the switch', () => {
  const doc = makeDoc();
  const storage = makeStorage({});
  attach(doc, storage);
  const box = checkboxById(doc, 'command-bar');
  box.checked = true;
  doc.dispatchDoc('change', { target: box });
  const saved = JSON.parse(storage.getItem('daymark.features.v1'));
  assert.equal(saved['command-bar'], true);
  assert.equal(box.checked, true);
  assert.match(doc.getElementById('feature-flags-status').textContent, /is now on/);
});

test('flipping the live focus-mode switch persists too', () => {
  const doc = makeDoc();
  const storage = makeStorage({});
  attach(doc, storage);
  const box = checkboxById(doc, 'focus-mode');
  box.checked = true;
  doc.dispatchDoc('change', { target: box });
  const saved = JSON.parse(storage.getItem('daymark.features.v1'));
  assert.equal(saved['focus-mode'], true);
  assert.equal(box.checked, true);
  assert.match(doc.getElementById('feature-flags-status').textContent, /Focus view \(one task, one view\)/);
});

test('every implemented feature kind has an enabled switch that persists changes', () => {
  const doc = makeDoc();
  const storage = makeStorage({});
  attach(doc, storage);
  const implemented = flags.FEATURE_FLAGS.filter((flag) => flag.kind === 'feature');
  assert.deepEqual(implemented.map((flag) => flag.id), ['command-bar', 'search-bangs', 'comfort-tint', 'mindful-breaks', 'focus-mode', 'auto-archive', 'snooze-pages']);
  for (const flag of implemented) {
    const box = checkboxById(doc, flag.id);
    assert.ok(box, flag.id + ' checkbox exists');
    assert.equal(box.disabled, false, flag.id + ' checkbox is enabled');
    box.checked = true;
    doc.dispatchDoc('change', { target: box });
    const saved = JSON.parse(storage.getItem('daymark.features.v1'));
    assert.equal(saved[flag.id], true, flag.id + ' change is persisted');
  }
});

test('a failed save reverts the checkbox to the stored value and says so honestly', () => {
  const doc = makeDoc();
  const base = { 'command-bar': false, 'search-bangs': false, 'comfort-tint': false, 'mindful-breaks': false, 'focus-mode': false, 'auto-archive': false, 'snooze-pages': false };
  const storage = makeStorage({ 'daymark.features.v1': JSON.stringify(base) });
  attach(doc, storage);
  storage.setItem = () => { throw new Error('disk unavailable'); };
  const box = checkboxById(doc, 'command-bar');
  box.checked = true;
  doc.dispatchDoc('change', { target: box });
  assert.equal(box.checked, false);
  assert.match(doc.getElementById('feature-flags-status').textContent, /Could not save this switch/);
});

test('the comfort-tint switch persists through the parity change event and reports it', () => {
  const doc = makeDoc();
  const storage = makeStorage({});
  attach(doc, storage);
  const box = checkboxById(doc, 'comfort-tint');
  box.checked = true;
  doc.dispatchDoc('change', { target: box });
  assert.equal(storage.writes(), 1);
  const saved = JSON.parse(storage.getItem('daymark.features.v1'));
  assert.equal(saved['comfort-tint'], true);
  assert.match(doc.getElementById('feature-flags-status').textContent, /Comfort tint is now on/);
});

test('a focus-mode save failure reverts the switch honestly', () => {
  const doc = makeDoc();
  const storage = makeStorage({});
  attach(doc, storage);
  storage.setItem = () => { throw new Error('disk unavailable'); };
  const box = checkboxById(doc, 'focus-mode');
  box.checked = true;
  doc.dispatchDoc('change', { target: box });
  assert.equal(box.checked, false);
  assert.match(doc.getElementById('feature-flags-status').textContent, /Could not save this switch/);
});


