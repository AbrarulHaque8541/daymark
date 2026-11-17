'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../tls-gate-ui.js');
const engine = require('../tls-gate-logic.js');

function makeElement(tagName) {
  const el = {
    tagName,
    className: '',
    textContent: '',
    value: '',
    children: [],
    listeners: {},
    attributes: {},
    appendChild(child) { el.children.push(child); return child; },
    removeChild(child) {
      const index = el.children.indexOf(child);
      if (index !== -1) el.children.splice(index, 1);
      return child;
    },
    setAttribute(name, value) { el.attributes[name] = value; },
    removeAttribute(name) { delete el.attributes[name]; },
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
  for (const id of ids) {
    elements[id] = makeElement(id.includes('form') ? 'form' : (id.includes('select') ? 'select' : 'div'));
  }
  return {
    elements,
    getElementById(id) { return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null; },
    createElement(tagName) { return makeElement(tagName); }
  };
}

const ALL_IDS = ['tls-gate-failure', 'tls-gate-consent', 'tls-gate-status',
  'tls-gate-result', 'tls-gate-form', 'tls-gate-clear'];

test('attachTlsGateUi requires a document', () => {
  assert.throws(() => ui.attachTlsGateUi(null), /requires a document/);
  assert.throws(() => ui.attachTlsGateUi({}), /requires a document/);
});

test('the card plans the selected journey at boot', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['tls-gate-failure'].value = 'ERR_CERT_DATE_INVALID';
  doc.elements['tls-gate-consent'].value = 'undecided';
  const handle = ui.attachTlsGateUi({ document: doc, gateApi: engine });
  const status = doc.elements['tls-gate-status'].textContent;
  const result = doc.elements['tls-gate-result'];
  assert.match(status, /Planned \u00b7 Certificate date invalid/);
  assert.match(status, /never bypassable/);
  assert.equal(result.children[0].className, 'feed-item');
  assert.equal(result.children[0].children[0].className, 'feed-item-title');
  assert.equal(result.children[0].children[0].textContent, 'Certificate not valid yet or expired');
  // One head item + recoveries + consent-gate section (heading + 3 lines).
  assert.equal(result.children.length,
    1 + engine.explainTlsFailure('cert-date-invalid').recoveries.length + 4);
  assert.equal(typeof handle.plan, 'function');
  assert.equal(handle.isBusy(), false);
});

test('changing either picker re-plans the journey', () => {
  const doc = makeDoc(ALL_IDS);
  const failure = doc.elements['tls-gate-failure'];
  const consent = doc.elements['tls-gate-consent'];
  failure.value = 'ERR_SSL_PROTOCOL_ERROR';
  consent.value = 'online';
  ui.attachTlsGateUi({ document: doc, gateApi: engine });
  assert.ok(failure.listeners.change && failure.listeners.change.length === 1);
  assert.ok(consent.listeners.change && consent.listeners.change.length === 1);
  failure.listeners.change[0]();
  consent.listeners.change[0]();
  const result = doc.elements['tls-gate-result'];
  assert.equal(result.children[0].children[0].textContent,
    'Secure connection could not be negotiated');
  assert.ok(doc.elements['tls-gate-status'].textContent.includes('gate: Online (explicit consent)'));
});

test('the consent gate section always shows the no-network note for undecided', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['tls-gate-failure'].value = 'ERR_CERT_AUTHORITY_INVALID';
  doc.elements['tls-gate-consent'].value = '';
  ui.attachTlsGateUi({ document: doc, gateApi: engine });
  const result = doc.elements['tls-gate-result'];
  const gateHead = result.children[1 + engine.explainTlsFailure('cert-authority-invalid').recoveries.length];
  assert.equal(gateHead.textContent, 'Consent gate: No choice made yet');
  assert.match(result.children[result.children.length - 3].textContent,
    /No network access is planned/);
});

test('an unknown failure value fails closed to the generic explanation', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['tls-gate-failure'].value = 'ERR_NAME_NOT_RESOLVED';
  ui.attachTlsGateUi({ document: doc, gateApi: engine });
  const result = doc.elements['tls-gate-result'];
  assert.equal(result.children[0].children[0].textContent, 'Connection not trusted');
});

test('form submit re-plans and the clear button empties the card', () => {
  const doc = makeDoc(ALL_IDS);
  const form = doc.elements['tls-gate-form'];
  const clear = doc.elements['tls-gate-clear'];
  doc.elements['tls-gate-failure'].value = 'ERR_CERT_REVOKED';
  doc.elements['tls-gate-consent'].value = 'offline';
  ui.attachTlsGateUi({ document: doc, gateApi: engine });
  const submit = form.listeners.submit;
  const click = clear.listeners.click;
  assert.ok(submit && submit.length === 1, 'a submit listener must be wired');
  assert.ok(click && click.length === 1, 'a click listener must be wired');
  const event = makeElement('event');
  submit[0](event);
  assert.equal(event.prevented, true, 'submit must not actually submit');
  assert.equal(doc.elements['tls-gate-result'].children[0].children[0].textContent,
    'Certificate has been revoked');
  click[0]();
  assert.equal(doc.elements['tls-gate-result'].children.length, 0);
  assert.match(doc.elements['tls-gate-status'].textContent, /Cleared\./);
});

test('a missing engine degrades honestly instead of guessing', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['tls-gate-failure'].value = 'ERR_CERT_DATE_INVALID';
  ui.attachTlsGateUi({ document: doc, gateApi: null });
  assert.equal(doc.elements['tls-gate-status'].textContent,
    'TLS and consent-gate planning is unavailable.');
  assert.equal(doc.elements['tls-gate-result'].children.length, 0);
});

test('missing elements never throw; the card simply does less', () => {
  const doc = makeDoc(['tls-gate-failure']);
  const handle = ui.attachTlsGateUi({ document: doc, gateApi: engine });
  assert.equal(typeof handle.plan, 'function');
  handle.plan(); // no status/result elements: must be a no-op, not a crash
  handle.onClear();
  handle.detach();
  assert.equal(handle.isBusy(), false);
});

test('a busy guard prevents overlapping plans', () => {
  const doc = makeDoc(ALL_IDS);
  let calls = 0;
  let reentrant = false;
  let handle = null;
  const slowEngine = {
    planTlsJourney(input) {
      calls += 1;
      // While the outer plan is in flight, try to re-enter.
      if (reentrant) handle.plan();
      return engine.planTlsJourney(input);
    }
  };
  handle = ui.attachTlsGateUi({ document: doc, gateApi: slowEngine });
  assert.equal(calls, 1, 'the boot plan ran once');
  reentrant = true;
  handle.plan();
  assert.equal(calls, 2, 'the re-entrant plan call was skipped by the busy guard');
  assert.equal(handle.isBusy(), false);
});

// Boot-level regressions: this stateless card must not touch storage at all.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tlsGateSource = fs.readFileSync(path.join(__dirname, '..', 'tls-gate-ui.js'), 'utf8');

function makeBootElement() {
  const children = [];
  return {
    children,
    listeners: Object.create(null),
    className: '',
    textContent: '',
    value: 'ERR_CERT_DATE_INVALID',
    attributes: {},
    get firstChild() { return children[0] || null; },
    appendChild(child) { children.push(child); return child; },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      return child;
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
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
    'tls-gate-failure': makeBootElement(),
    'tls-gate-consent': makeBootElement(),
    'tls-gate-status': makeBootElement(),
    'tls-gate-result': makeBootElement(),
    'tls-gate-form': makeBootElement(),
    'tls-gate-clear': makeBootElement()
  };
  const documentListeners = Object.create(null);
  const document = {
    readyState,
    getElementById(id) { return elements[id] || null; },
    createElement() { return makeBootElement(); },
    addEventListener(name, listener) { documentListeners[name] = listener; }
  };
  const gate = {
    planTlsJourney(input) {
      assert.equal(input.code, 'ERR_CERT_DATE_INVALID');
      return engine.planTlsJourney(input);
    }
  };
  const context = {
    window,
    document,
    DaymarkTlsGate: gate,
    module: { exports: {} }
  };
  vm.runInNewContext(tlsGateSource, context, { filename: 'tls-gate-ui.js' });
  return {
    get localStorageReads() { return localStorageReads; },
    elements,
    documentListeners
  };
}

test('tls gate card boots and renders when the localStorage getter throws', () => {
  const result = bootWithBlockedStorage('complete');
  assert.equal(result.localStorageReads, 0, 'stateless card boot never reads localStorage');
  assert.match(result.elements['tls-gate-status'].textContent,
    /Planned \u00b7 Certificate date invalid/);
  assert.ok(result.elements['tls-gate-result'].children.length >= 2,
    'the explanation and gate plan render');
});

test('DOMContentLoaded boot also avoids a throwing localStorage getter', () => {
  const result = bootWithBlockedStorage('loading');
  assert.equal(result.localStorageReads, 0, 'registering the boot callback does not read storage');
  assert.equal(typeof result.documentListeners.DOMContentLoaded, 'function');
  assert.doesNotThrow(() => result.documentListeners.DOMContentLoaded());
  assert.equal(result.localStorageReads, 0, 'DOMContentLoaded rendering remains storage-independent');
  assert.match(result.elements['tls-gate-status'].textContent,
    /Planned \u00b7 Certificate date invalid/);
});

// Source pins: the card must be wired in index.html and stay stateless.
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('index.html wires the tls gate card and both modules', () => {
  assert.ok(indexSource.includes('id="tls-gate-card"'), 'card markup must exist in index.html');
  assert.ok(indexSource.includes('id="tls-gate-failure"'), 'failure picker must exist');
  assert.ok(indexSource.includes('id="tls-gate-consent"'), 'consent picker must exist');
  assert.ok(/<script src="tls-gate-logic\.js" defer><\/script>/.test(indexSource),
    'tls-gate-logic.js script tag must exist');
  assert.ok(/<script src="tls-gate-ui\.js" defer><\/script>/.test(indexSource),
    'tls-gate-ui.js script tag must exist');
  const logicAt = indexSource.indexOf('<script src="tls-gate-logic.js" defer></script>');
  const uiAt = indexSource.indexOf('<script src="tls-gate-ui.js" defer></script>');
  const appAt = indexSource.indexOf('<script src="app.js" defer></script>');
  assert.ok(logicAt !== -1 && uiAt !== -1 && appAt !== -1);
  assert.ok(logicAt < uiAt && uiAt < appAt, 'tls gate scripts load before app.js');
});

test('tls gate ui source stays stateless: no localStorage access anywhere', () => {
  assert.doesNotMatch(tlsGateSource, /localStorage/);
});
