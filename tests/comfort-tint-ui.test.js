'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = require('../comfort-tint-ui.js');
const logic = require('../comfort-tint-logic.js');
const flags = require('../feature-flags-logic.js');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'comfort-tint-ui.js'), 'utf8');

function makeElement(tagName) {
  const el = {
    tagName: tagName,
    className: '',
    textContent: '',
    value: '',
    disabled: false,
    hidden: false,
    style: '',
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
      return event;
    },
    setAttribute(name, value) { el.attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : null; }
  };
  Object.defineProperty(el, 'firstChild', { get() { return el.children.length ? el.children[0] : null; } });
  return el;
}

function findAll(node, out) {
  out = out || [];
  for (const child of node.children) { out.push(child); findAll(child, out); }
  return out;
}

function makeDoc() {
  const head = makeElement('head');
  const body = makeElement('body');
  const docListeners = {};
  return {
    head: head,
    body: body,
    readyState: 'complete',
    getElementById(id) {
      const pool = findAll(head).concat(findAll(body));
      for (const node of pool) {
        if (node.getAttribute && node.getAttribute('id') === id) return node;
      }
      return null;
    },
    createElement(tagName) { return makeElement(tagName); },
    addEventListener(type, handler) { (docListeners[type] = docListeners[type] || []).push(handler); },
    dispatchDoc(type, ev) {
      for (const handler of (docListeners[type] || []).slice()) handler(Object.assign({ type: type, target: null }, ev || {}));
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
  const attached = ui.attachComfortTintUi({
    document: doc,
    flags: flags,
    comfortTint: logic,
    storage: storage
  });
  return attached ? attached.handle : null;
}

function flagsOn(seed) {
  return makeStorage({ 'daymark.features.v1': JSON.stringify(Object.assign({
    'command-bar': false, 'search-bangs': false, 'comfort-tint': false, 'mindful-breaks': false, 'focus-mode': false
  }, seed)) });
}

function overlayIn(doc) { return doc.getElementById('comfort-tint-overlay'); }

test('attach fails closed without engines, an existing card, a body or a registry', () => {
  assert.equal(ui.attachComfortTintUi(null), null);
  assert.equal(ui.attachComfortTintUi({}), null);
  const doc = makeDoc();
  assert.equal(ui.attachComfortTintUi({ document: doc, flags: null, comfortTint: logic, storage: makeStorage({}), body: null }), null, 'missing flags registry');
  assert.equal(ui.attachComfortTintUi({ document: doc, flags: flags, comfortTint: null, storage: makeStorage({}) }), null, 'missing tint logic');
});

test('the card mounts with its id, class and a status live region, then mounts nowhere else', () => {
  const doc = makeDoc();
  const handle = attach(doc, flagsOn({}));
  assert.ok(handle);
  const card = doc.getElementById('comfort-tint-card');
  assert.ok(card);
  assert.equal(card.className, 'suggestion-card');
  const status = doc.getElementById('comfort-tint-status');
  assert.ok(status);
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.deepEqual(attach(doc, flagsOn({})), null, 'a second attach must not duplicate the card');
});

test('the mode picker exposes the three strengths with dim as default', () => {
  const doc = makeDoc();
  attach(doc, flagsOn({}));
  const select = doc.getElementById('comfort-tint-mode');
  assert.ok(select);
  const options = findAll(select).filter((node) => node.tagName === 'option');
  assert.deepEqual(options.map((option) => option.getAttribute('value')), ['dim', 'warm', 'night']);
  assert.equal(select.value, 'dim');
});

test('without storage the card says the switch could not be read', () => {
  const doc = makeDoc();
  const handle = attach(doc, null);
  handle.update();
  assert.match(handle.statusEl.textContent, /Local storage is unavailable/);
  assert.equal(overlayIn(doc), null);
});

test('with the flag off there is no overlay and the status points to Feature settings', () => {
  const doc = makeDoc();
  const handle = attach(doc, flagsOn({}));
  handle.update();
  assert.match(handle.statusEl.textContent, /not confirmed on/);
  assert.match(handle.statusEl.textContent, /Feature settings/);
  assert.equal(overlayIn(doc), null);
  assert.ok(handle.listEl.children.length >= 4, 'the plan stays readable while the tint is off');
});

test('with the flag on the overlay joins the body with tap-through and the accent untouched', () => {
  const doc = makeDoc();
  const handle = attach(doc, flagsOn({ 'comfort-tint': true }));
  handle.update();
  const overlay = overlayIn(doc);
  assert.ok(overlay, 'an overlay exists');
  assert.equal(overlay.style.indexOf('pointer-events: none') !== -1, true);
  assert.equal(overlay.style.indexOf('#16705f'), -1, 'the accent color is never the tint');
  assert.ok(handle.statusEl.textContent.indexOf('Soft dim') !== -1);
});

test('the Turn the tint on button saves the single existing flag switch', () => {
  const doc = makeDoc();
  const storage = flagsOn({});
  const handle = attach(doc, storage);
  handle.applyButton.dispatch('click', {});
  assert.ok(overlayIn(doc), 'tint applied');
  const parsed = JSON.parse(storage.getItem('daymark.features.v1'));
  assert.equal(parsed['comfort-tint'], true);
  assert.equal(overlayIn(doc).style.indexOf('#16705f'), -1);
});

test('the Turn the tint off button removes the overlay instantly', () => {
  const doc = makeDoc();
  const handle = attach(doc, flagsOn({ 'comfort-tint': true }));
  handle.update();
  assert.ok(overlayIn(doc));
  handle.clearButton.dispatch('click', {});
  assert.equal(overlayIn(doc), null);
  assert.match(handle.statusEl.textContent, /not confirmed on/);
});

test('a failed save removes the overlay and reports honestly', () => {
  const doc = makeDoc();
  const storage = flagsOn({});
  const handle = attach(doc, storage);
  storage.setItem = () => { throw new Error('disk unavailable'); };
  handle.applyButton.dispatch('click', {});
  assert.equal(overlayIn(doc), null, 'no overlay may survive a failed save');
  assert.match(handle.statusEl.textContent, /Could not save the comfort-tint switch/);
});

test('switching the mode with the change event re-applies the new strength', () => {
  const doc = makeDoc();
  const handle = attach(doc, flagsOn({ 'comfort-tint': true }));
  handle.update();
  handle.modeSelect.value = 'night';
  handle.modeSelect.dispatch('change', {});
  const overlay = overlayIn(doc);
  assert.ok(overlay);
  const night = logic.modeById('night');
  assert.ok(overlay.style.indexOf(night.overlay) !== -1, 'the deep night veil is used');
});

test('switching the mode while off keeps the overlay off', () => {
  const doc = makeDoc();
  const handle = attach(doc, flagsOn({}));
  handle.modeSelect.value = 'warm';
  handle.update();
  assert.equal(overlayIn(doc), null);
});

test('attaching and idly updating never writes to storage', () => {
  const doc = makeDoc();
  const storage = flagsOn({ 'comfort-tint': true });
  const handle = attach(doc, storage);
  handle.update();
  handle.update();
  assert.equal(storage.writes(), 0);
});

test('index.html loads each comfort-tint script exactly once, between mindful-breaks and storage UI', () => {
  for (const name of ['comfort-tint-logic.js', 'comfort-tint-ui.js']) {
    const tag = '<script src="' + name + '" defer></script>';
    assert.equal(indexHtml.split(tag).length - 1, 1, name + ' must appear exactly once');
  }
  const pos = (name) => indexHtml.indexOf('<script src="' + name + '" defer></script>');
  assert.ok(pos('mindful-breaks-ui.js') < pos('comfort-tint-logic.js'));
  assert.ok(pos('comfort-tint-logic.js') < pos('comfort-tint-ui.js'));
  assert.ok(pos('comfort-tint-ui.js') < pos('storage-ui.js'));
  assert.equal(indexHtml.indexOf('id="comfort-tint'), -1, 'card markup must stay dynamic');
});

test('the required test inventory registers both comfort-tint suites', () => {
  const required = fs.readFileSync(path.join(__dirname, 'REQUIRED_NODE_TEST_FILES.txt'), 'utf8');
  assert.ok(required.indexOf('tests/comfort-tint-logic.test.js') !== -1);
  assert.ok(required.indexOf('tests/comfort-tint-ui.test.js') !== -1);
});

test('the module boots through vm against a DOM without localStorage', () => {
  const doc = makeDoc();
  const sandboxSource = fs.readFileSync(path.join(__dirname, '..', 'comfort-tint-ui.js'), 'utf8');
  const sandbox = { window: {}, document: doc, DaymarkFeatureFlags: flags, DaymarkComfortTint: logic };
  vm.runInNewContext(sandboxSource, sandbox);
  const card = doc.getElementById('comfort-tint-card');
  assert.ok(card, 'the card bootstrapped without throwing');
  const status = doc.getElementById('comfort-tint-status');
  assert.ok(status);
});

test('comfort-tint ui source stays free of banned runtime patterns', () => {
  const clean = ['TO' + 'DO', 'FIX' + 'ME', 'place' + 'holder', 'setInt' + 'erval', 'XMLHt' + 'tpRequest', 'fe' + 'tch('];
  for (const needle of clean) {
    assert.equal(uiSrc.indexOf(needle), -1, needle + ' must not appear in comfort-tint-ui.js');
  }
  assert.equal(uiSrc.indexOf('localStor' + 'age.setItem'), -1, 'the card writes only through the flags registry');
});
