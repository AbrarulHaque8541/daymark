'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = require('../mindful-breaks-ui.js');
const logic = require('../mindful-breaks-logic.js');
const flags = require('../feature-flags-logic.js');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'mindful-breaks-ui.js'), 'utf8');

function makeElement(tagName) {
  const el = {
    tagName: tagName,
    className: '',
    textContent: '',
    value: '',
    disabled: false,
    hidden: false,
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
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : null; },
    dispatchDoc() {}
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

function attach(doc, storage, clock) {
  const attached = ui.attachMindfulBreaksUi({
    document: doc,
    flags: flags,
    mindfulBreaks: logic,
    storage: storage,
    nowMs: clock || (() => 0)
  });
  return attached ? attached.handle : null;
}

function flagsOn(seed) {
  return makeStorage({ 'daymark.features.v1': JSON.stringify(Object.assign({
    'command-bar': false, 'search-bangs': false, 'comfort-tint': false, 'mindful-breaks': false, 'focus-mode': false
  }, seed)) });
}

test('attach fails closed without engines, an existing card or a registry', () => {
  assert.equal(ui.attachMindfulBreaksUi(null), null);
  assert.equal(ui.attachMindfulBreaksUi({}), null);
  const doc = makeDoc();
  assert.equal(ui.attachMindfulBreaksUi({ document: doc, flags: null, mindfulBreaks: logic, storage: makeStorage({}) }), null, 'missing flags registry');
  assert.equal(ui.attachMindfulBreaksUi({ document: doc, flags: flags, mindfulBreaks: null, storage: makeStorage({}) }), null, 'missing breaks logic');
});

test('the card mounts with its id, class and a status live region, then mounts nowhere else', () => {
  const doc = makeDoc();
  const handle = attach(doc, flagsOn({ 'mindful-breaks': false }));
  assert.ok(handle);
  const card = doc.getElementById('mindful-breaks-card');
  assert.ok(card);
  assert.equal(card.className, 'suggestion-card');
  const status = doc.getElementById('mindful-breaks-status');
  assert.ok(status);
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(attach(doc, flagsOn({})), null, 'a second attach must not duplicate the card');
});

test('the interval picker has the honest choices with 30 minutes as default', () => {
  const doc = makeDoc();
  attach(doc, flagsOn({}));
  const select = doc.getElementById('mindful-breaks-interval');
  assert.ok(select);
  const options = findAll(select).filter((node) => node.tagName === 'option');
  assert.deepEqual(options.map((option) => option.getAttribute('value')), ['10', '20', '30', '45', '60']);
  assert.equal(select.value, '30');
});

test('without storage the card says the switch could not be read', () => {
  const doc = makeDoc();
  const handle = attach(doc, null);
  handle.update();
  assert.match(handle.statusEl.textContent, /Local storage is unavailable/);
});

test('with the flag off the status points to the Feature settings switch instead of pretending', () => {
  const doc = makeDoc();
  const handle = attach(doc, flagsOn({}));
  handle.update();
  assert.match(handle.statusEl.textContent, /not confirmed on/);
  assert.match(handle.statusEl.textContent, /Feature settings/);
  assert.equal(handle.doneButton.hidden, true);
});

test('while waiting the status counts minutes on the page and minutes to go', () => {
  let now = 0;
  const doc = makeDoc();
  const handle = attach(doc, flagsOn({ 'mindful-breaks': true }), () => now);
  handle.update();
  now = 7 * 60000;
  handle.update();
  assert.match(handle.statusEl.textContent, /On\./);
  assert.match(handle.statusEl.textContent, /23 minute\(s\) to go/);
  assert.match(handle.statusEl.textContent, /7 minute\(s\) on this page so far/);
  assert.equal(handle.doneButton.hidden, true);
});

test('when the interval elapses the nudge names a real suggestion and reveals the Done button', () => {
  let now = 0;
  const doc = makeDoc();
  const handle = attach(doc, flagsOn({ 'mindful-breaks': true }), () => now);
  handle.update();
  now = 31 * 60000;
  handle.update();
  assert.match(handle.statusEl.textContent, /Time for a short reset: /);
  const suggestion = handle.statusEl.textContent.split('Time for a short reset: ')[1];
  assert.equal(logic.BREAK_SUGGESTIONS.indexOf(suggestion) !== -1, true, 'the suggestion comes from the fixed list');
  assert.equal(handle.doneButton.hidden, false);
});

test('the Done button restarts the on-page timer honestly', () => {
  let now = 0;
  const doc = makeDoc();
  const handle = attach(doc, flagsOn({ 'mindful-breaks': true }), () => now);
  handle.update();
  now = 31 * 60000;
  handle.update();
  assert.equal(handle.doneButton.hidden, false);
  now = 31 * 60000 + 5000;
  handle.takeBreak();
  assert.equal(handle.doneButton.hidden, true);
  assert.match(handle.statusEl.textContent, /On\./);
  assert.match(handle.statusEl.textContent, /30 minute\(s\) to go/);
});

test('the Check now button recomputes the status from the current clock', () => {
  let now = 0;
  const doc = makeDoc();
  const handle = attach(doc, flagsOn({ 'mindful-breaks': true }), () => now);
  handle.update();
  now = 3 * 60000;
  handle.checkButton.dispatch('click', {});
  assert.match(handle.statusEl.textContent, /27 minute\(s\) to go/);
});

test('attaching and updating never writes to storage', () => {
  const doc = makeDoc();
  const storage = flagsOn({ 'mindful-breaks': true });
  const handle = attach(doc, storage, () => 0);
  handle.update();
  handle.takeBreak();
  assert.equal(storage.writes(), 0);
});

test('index.html loads each mindful-breaks script exactly once, between focus mode and storage UI', () => {
  for (const name of ['mindful-breaks-logic.js', 'mindful-breaks-ui.js']) {
    const tag = '<script src="' + name + '" defer></script>';
    assert.equal(indexHtml.split(tag).length - 1, 1, name + ' must appear exactly once');
  }
  const pos = (name) => indexHtml.indexOf('<script src="' + name + '" defer></script>');
  assert.ok(pos('focus-mode-ui.js') < pos('mindful-breaks-logic.js'));
  assert.ok(pos('mindful-breaks-logic.js') < pos('mindful-breaks-ui.js'));
  assert.ok(pos('mindful-breaks-ui.js') < pos('storage-ui.js'));
  assert.equal(indexHtml.indexOf('id="mindful-breaks'), -1, 'card markup must stay dynamic');
});

test('the module boots through vm against a DOM without localStorage', () => {
  const doc = makeDoc();
  const sandboxSource = fs.readFileSync(path.join(__dirname, '..', 'mindful-breaks-ui.js'), 'utf8');
  const sandbox = { window: {}, document: doc, DaymarkFeatureFlags: flags, DaymarkMindfulBreaks: logic };
  vm.runInNewContext(sandboxSource, sandbox);
  const card = doc.getElementById('mindful-breaks-card');
  assert.ok(card, 'the card bootstrapped without throwing');
  const status = doc.getElementById('mindful-breaks-status');
  assert.ok(status);
});

test('mindful-breaks ui source stays free of banned runtime patterns', () => {
  const clean = ['TO' + 'DO', 'FIX' + 'ME', 'place' + 'holder', 'setInt' + 'erval', 'XMLHt' + 'tpRequest', 'fe' + 'tch('];
  for (const needle of clean) {
    assert.equal(uiSrc.indexOf(needle), -1, needle + ' must not appear in mindful-breaks-ui.js');
  }
});
