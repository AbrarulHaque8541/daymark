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

function fakeEnv() {
  const doc = fakeDoc();
  return { env: { document: doc, window: {}, proxyFailuresApi: logic }, doc };
}

function elementsOf(doc) {
  return {
    card: doc.registry['proxy-failures-card'],
    select: doc.registry['proxy-failures-scenario'],
    show: doc.registry['proxy-failures-show'],
    form: doc.registry['proxy-failures-form'],
    status: doc.registry['proxy-failures-status'],
    result: doc.registry['proxy-failures-result'],
    clear: doc.registry['proxy-failures-clear'],
    heading: doc.registry['proxy-failures-heading'],
    description: doc.registry['proxy-failures-description']
  };
}

// Section titles live in a child span of each feed-item head, so the fake
// DOM needs a two-level walk to approximate real textContent.
function resultText(els) {
  const parts = [];
  for (const child of els.result.children) {
    parts.push(child.textContent || '');
    for (const grand of (child.children || [])) parts.push(grand.textContent || '');
  }
  return parts.join('\n');
}

test('attach injects the card once with the expected structure', () => {
  const { env, doc } = fakeEnv();
  const handle = ui.attachBrowserProxyFailuresUi(env);
  const els = elementsOf(doc);
  assert.ok(els.card, 'card must be created');
  assert.equal(els.card.className, 'briefing-card');
  assert.equal(els.card.getAttribute('aria-labelledby'), 'proxy-failures-heading');
  assert.ok(els.select && els.show && els.form && els.status && els.result && els.clear && els.heading && els.description);
  assert.equal(els.form.getAttribute('novalidate'), 'novalidate');
  assert.equal(els.status.getAttribute('role'), 'status');
  assert.ok(doc.created.indexOf(els.card) !== -1, 'card was created by the module');
  assert.ok(els.card.parentNode !== null, 'card must be attached to the document');
  assert.equal(typeof handle.onShow, 'function');
  assert.equal(typeof handle.onClear, 'function');
  assert.ok(els.description.textContent.indexOf('stateless') !== -1, 'must disclose statelessness');
  assert.ok(els.description.textContent.indexOf('nothing is routed anywhere') !== -1, 'must disclose no routing');
});

test('attach reuses existing markup instead of duplicating the card', () => {
  const { env, doc } = fakeEnv();
  ui.attachBrowserProxyFailuresUi(env);
  const cardBefore = doc.registry['proxy-failures-card'];
  const createdBefore = doc.created.filter((el) => el.tagName === 'aside').length;
  ui.attachBrowserProxyFailuresUi(env);
  const createdAfter = doc.created.filter((el) => el.tagName === 'aside').length;
  assert.equal(createdBefore, 1, 'the first attach creates exactly one card');
  assert.equal(createdAfter, createdBefore, 'a second attach must not create another card');
  assert.equal(doc.registry['proxy-failures-card'], cardBefore, 'the card element itself must be reused');
});

test('the injected card slots in after the proxy planner card when present', () => {
  const { env, doc } = fakeEnv();
  const proxy = fakeElement('aside', doc);
  proxy.id = 'browser-proxy-card';
  doc.body.appendChild(proxy);
  ui.attachBrowserProxyFailuresUi(env);
  const els = elementsOf(doc);
  assert.equal(els.card.parentNode, doc.body);
  assert.ok(doc.body.children.indexOf(els.card) === doc.body.children.indexOf(proxy) + 1,
    'playbook card must follow the proxy planner card');
});

test('the scenario picker is filled from the logic catalog', () => {
  const { env, doc } = fakeEnv();
  ui.attachBrowserProxyFailuresUi(env);
  const els = elementsOf(doc);
  const options = els.select.children;
  assert.equal(options.length, 6);
  assert.deepEqual(options.map((option) => option.value),
    ['proxy-unreachable', 'auth-required', 'bypass-rules', 'dns-leak', 'tls-interception', 'session-reset']);
  assert.ok(els.status.textContent.indexOf('Pick a scenario') !== -1);
});

test('show renders behavior, recovery and limits with an honest status line', () => {
  const { env, doc } = fakeEnv();
  const handle = ui.attachBrowserProxyFailuresUi(env);
  const els = elementsOf(doc);
  els.select.value = 'dns-leak';
  handle.onShow();
  const text = resultText(els);
  assert.ok(text.indexOf('What happens') !== -1);
  assert.ok(text.indexOf('How to recover') !== -1);
  assert.ok(text.indexOf('Honest limits') !== -1);
  assert.ok(text.indexOf('resolved on this device first') !== -1);
  assert.ok(els.status.textContent.indexOf('Showing: Where site names are resolved') === 0);
});

test('form submit prevents navigation and shows the selected scenario', () => {
  const { env, doc } = fakeEnv();
  ui.attachBrowserProxyFailuresUi(env);
  const els = elementsOf(doc);
  els.select.value = 'session-reset';
  const submit = els.form.listeners.find((listener) => listener.type === 'submit');
  assert.ok(submit, 'form should handle native submit events');
  let prevented = false;
  submit.handler({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'native form navigation should be prevented');
  assert.ok(resultText(els).indexOf('Nothing is restored on its own') !== -1);
});

test('an unknown scenario id fails closed with an honest status', () => {
  const { env, doc } = fakeEnv();
  const handle = ui.attachBrowserProxyFailuresUi(env);
  const els = elementsOf(doc);
  els.select.value = 'made-up-scenario';
  handle.onShow();
  assert.equal(els.result.children.length, 0, 'nothing may be rendered for an unknown id');
  assert.ok(els.status.textContent.indexOf('could not be explained') !== -1);
});

test('a missing logic module degrades honestly', () => {
  const { env, doc } = fakeEnv();
  env.proxyFailuresApi = null;
  const hadGlobal = Object.prototype.hasOwnProperty.call(globalThis, 'DaymarkBrowserProxyFailures');
  const savedGlobal = globalThis.DaymarkBrowserProxyFailures;
  if (hadGlobal) delete globalThis.DaymarkBrowserProxyFailures;
  try {
    const handle = ui.attachBrowserProxyFailuresUi(env);
    const els = elementsOf(doc);
    assert.equal(els.select.children.length, 0, 'no options can be offered without logic');
    handle.onShow();
    assert.equal(els.status.textContent, 'The proxy failure playbook is unavailable.');
  } finally {
    if (hadGlobal) globalThis.DaymarkBrowserProxyFailures = savedGlobal;
  }
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
  assert.ok(required.indexOf('tests/browser-proxy-failures-logic.test.js') !== -1, 'logic test must be registered');
  assert.ok(required.indexOf('tests/browser-proxy-failures-ui.test.js') !== -1, 'ui test must be registered');
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
