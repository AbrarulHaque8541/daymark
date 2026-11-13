'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const logic = require('../browser-proxy-failures-logic.js');
const ui = require('../browser-proxy-failures-ui.js');

function fakeElement(tag, doc) {
  const el = {
    tagName: tag,
    className: '',
    disabled: false,
    value: '',
    textContent: '',
    children: [],
    listeners: [],
    parentNode: null,
    appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
    insertBefore(child, ref) { child.parentNode = el; el.children.push(child); return child; },
    setAttribute(name, value) { el.attrs = el.attrs || {}; el.attrs[name] = String(value); },
    removeAttribute(name) { if (el.attrs) delete el.attrs[name]; },
    getAttribute(name) { return el.attrs ? el.attrs[name] : null; },
    addEventListener(type, handler) { el.listeners.push({ type, handler }); }
  };
  Object.defineProperty(el, 'firstChild', { get() { return el.children[0] || null; } });
  el.removeChild = (child) => {
    const index = el.children.indexOf(child);
    if (index !== -1) el.children.splice(index, 1);
    return child;
  };
  Object.defineProperty(el, 'id', {
    get() { return el._id || ''; },
    set(v) { el._id = v; if (doc) doc.registry[v] = el; }
  });
  return el;
}

function fakeDoc() {
  const doc = {
    readyState: 'complete',
    registry: {},
    created: [],
    body: null,
    getElementById(id) { return doc.registry[id] || null; },
    createElement(tag) { const el = fakeElement(tag, doc); doc.created.push(el); return el; }
  };
  doc.body = fakeElement('body', doc);
  return doc;
}

function fakeEnv(overrides) {
  const doc = fakeDoc();
  return { document: doc, ...overrides };
}

function elementsOf(doc) {
  return {
    card: doc.registry['proxy-failures-card'],
    heading: doc.registry['proxy-failures-heading'],
    description: doc.registry['proxy-failures-description'],
    form: doc.registry['proxy-failures-form'],
    select: doc.registry['proxy-failures-scenario'],
    show: doc.registry['proxy-failures-show'],
    clear: doc.registry['proxy-failures-clear'],
    status: doc.registry['proxy-failures-status'],
    result: doc.registry['proxy-failures-result']
  };
}

test('ensureCard injects the playbook card after the proxy card when present', () => {
  const doc = fakeDoc();
  const proxy = fakeElement('aside', doc);
  proxy.id = 'browser-proxy-card';
  doc.body.appendChild(proxy);
  const card = ui.ensureCard(doc);
  assert.equal(card.id, 'proxy-failures-card');
  assert.equal(card.getAttribute('aria-labelledby'), 'proxy-failures-heading');
  assert.ok(doc.registry['proxy-failures-show'] && doc.registry['proxy-failures-clear']);
});

test('attach wires the form and buttons', () => {
  const { env, doc } = fakeEnv();
  const handle = ui.attachBrowserProxyFailuresUi(env);
  const els = elementsOf(doc);
  assert.ok(els.select && els.show && els.form && els.status && els.result && els.clear);
  assert.equal(typeof handle.onShow, 'function');
  assert.equal(typeof handle.onClear, 'function');
});

test('show renders behavior, recovery and limits with an honest status line', () => {
  const { env, doc } = fakeEnv();
  const handle = ui.attachBrowserProxyFailuresUi(env);
  const els = elementsOf(doc);
  els.select.value = 'unreachable';
  handle.onShow();
  assert.ok(els.result.children.length > 0);
  assert.ok(els.status.textContent.includes('unreachable') || els.status.textContent.includes('Showing'));
});

test('form submit prevents navigation and shows the selected scenario', () => {
  const { env, doc } = fakeEnv();
  ui.attachBrowserProxyFailuresUi(env);
  const els = elementsOf(doc);
  els.select.value = 'auth-demand';
  let prevented = false;
  const event = { preventDefault() { prevented = true; } };
  els.form.listeners.find(l => l.type === 'submit').handler(event);
  assert.equal(prevented, true);
  assert.ok(els.result.children.length > 0);
});

test('clear empties the view and the card never touches storage', () => {
  const { env, doc } = fakeEnv();
  const handle = ui.attachBrowserProxyFailuresUi(env);
  const els = elementsOf(doc);
  els.select.value = 'tls-interception';
  handle.onShow();
  assert.ok(els.result.children.length > 0);
  handle.onClear();
  assert.equal(els.result.children.length, 0);
  assert.equal(els.status.textContent, 'Cleared. Pick a scenario and tap Show.');
  const source = fs.readFileSync(path.join(__dirname, '..', 'browser-proxy-failures-ui.js'), 'utf8');
  assert.equal(source.indexOf('localStorage'), -1, 'the card must be stateless');
});

test('the module registers its tests and stays inert when loaded without a DOM', () => {
  const required = fs.readFileSync(path.join(__dirname, 'REQUIRED_NODE_TEST_FILES.txt'), 'utf8');
  assert.ok(required.indexOf('tests/browser-proxy-failures-logic.test.js') !== -1);
  assert.ok(required.indexOf('tests/browser-proxy-failures-ui.test.js') !== -1);
  const source = fs.readFileSync(path.join(__dirname, '..', 'browser-proxy-failures-ui.js'), 'utf8');
  const context = {};
  context.globalThis = context;
  assert.doesNotThrow(() => vm.runInNewContext(source, context));
});

test('the module exposes its API', () => {
  assert.equal(typeof ui.attachBrowserProxyFailuresUi, 'function');
  assert.equal(typeof ui.ensureCard, 'function');
  assert.equal(typeof globalThis.DaymarkBrowserProxyFailuresUi, 'object');
});

test('show and clear apply brief glass busy feedback without re-entry', () => {
  const { env, doc } = fakeEnv();
  const handle = ui.attachBrowserProxyFailuresUi(env);
  const els = elementsOf(doc);

  for (const btn of [els.show, els.clear]) {
    btn.classList = {
      classes: new Set(),
      toggle(name, force) {
        if (force === true || (force !== false && !this.classes.has(name))) this.classes.add(name);
        else this.classes.delete(name);
        return this.classes.has(name);
      },
      contains(name) { return this.classes.has(name); }
    };
  }

  els.select.value = 'unreachable';
  handle.onShow();
  assert.equal(els.show.disabled, false, 'busy is released after show');
  assert.equal(els.show.getAttribute('aria-busy'), undefined, 'aria-busy cleared after show');
  assert.ok(!els.show.classList.contains('is-busy'), 'is-busy class cleared after show');

  handle.onClear();
  assert.equal(els.clear.disabled, false);
  assert.ok(!els.clear.classList.contains('is-busy'));
});
