'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ui = require('../browser-proxy-ui.js');
const engine = require('../browser-proxy-logic.js');

function makeElement(tagName) {
  const el = {
    tagName,
    className: '',
    classList: { add(cls) { el.className = (el.className + " " + cls).trim(); }, remove(cls) { el.className = el.className.replace(new RegExp("\\b" + cls + "\\b", "g"), "").replace(/\s+/g, " ").trim(); } },
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
    addEventListener(type, handler) { (el.listeners[type] = el.listeners[type] || []).push(handler); },
    setAttribute(name, val) { el.attributes[name] = String(val); },
    getAttribute(name) { return el.attributes && Object.prototype.hasOwnProperty.call(el.attributes, name) ? el.attributes[name] : null; },
    removeAttribute(name) { delete el.attributes[name]; },
    preventDefault() { el.prevented = true; },
    click() { el.clicked = true; },
    style: {}
  };
  Object.defineProperty(el, 'firstChild', {
    get() { return el.children.length ? el.children[0] : null; }
  });
  return el;
}

function makeDoc(ids) {
  const elements = {};
  for (const id of ids) elements[id] = makeElement(id.includes('form') ? 'form' : (id.includes('address') ? 'input' : 'div'));
  return {
    elements,
    getElementById(id) { return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null; },
    createElement(tagName) { return makeElement(tagName); }
  };
}

const ALL_IDS = ['browser-proxy-address', 'browser-proxy-status', 'browser-proxy-result',
  'browser-proxy-form', 'browser-proxy-clear', 'browser-proxy-copy', 'browser-proxy-plan'];

test('attachBrowserProxyUi requires a document', () => {
  assert.throws(() => ui.attachBrowserProxyUi(null), /requires a document/);
  assert.throws(() => ui.attachBrowserProxyUi({}), /requires a document/);
});

test('an empty card at boot prompts honestly and plans nothing', () => {
  const doc = makeDoc(ALL_IDS);
  ui.attachBrowserProxyUi({ document: doc, proxyApi: engine });
  assert.match(doc.elements['browser-proxy-status'].textContent, /Enter a proxy address/);
  assert.equal(doc.elements['browser-proxy-result'].children.length, 0);
});

test('the card plans a typed address at boot and renders the honest lines', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-proxy-address'].value = 'proxy.example.org:8080';
  const handle = ui.attachBrowserProxyUi({ document: doc, proxyApi: engine });
  const status = doc.elements['browser-proxy-status'].textContent;
  const result = doc.elements['browser-proxy-result'];
  assert.match(status, /Planned \u00b7 http:\/\/proxy\.example\.org:8080/);
  assert.equal(result.children[0].className, 'feed-item');
  assert.equal(result.children[0].children[0].className, 'feed-item-title');
  assert.equal(result.children[0].children[0].textContent, 'http://proxy.example.org:8080');
  const expected = engine.planProfile('proxy.example.org:8080');
  assert.equal(result.children.length, 1 + expected.lines.length);
  for (let i = 1; i < result.children.length; i += 1) {
    assert.match(result.children[i].textContent, new RegExp('^' + i + '\\. '));
  }
  assert.match(result.children[5].textContent, /no public per-app proxy API/);
  assert.equal(typeof handle.plan, 'function');
});

test('form submit strips credentials from the input and remembered storage', () => {
  const doc = makeDoc(ALL_IDS);
  const form = doc.elements['browser-proxy-form'];
  const input = doc.elements['browser-proxy-address'];
  const store = {
    data: {},
    getItem(k) { return this.data[k] || null; },
    setItem(k, v) { this.data[k] = String(v); },
    removeItem(k) { delete this.data[k]; }
  };
  ui.attachBrowserProxyUi({ document: doc, proxyApi: engine, localStorage: store });
  input.value = 'http://alice:secret@proxy.example.org:3128';
  const submit = form.listeners.submit;
  assert.ok(submit && submit.length === 1, 'a submit listener must be wired');
  const event = makeElement('event');
  submit[0](event);
  assert.equal(event.prevented, true, 'submit must not actually submit');
  assert.match(doc.elements['browser-proxy-status'].textContent, /1 notice/);
  assert.match(doc.elements['browser-proxy-status'].className, /has-notices/);
  assert.equal(input.value, 'http://proxy.example.org:3128');
  assert.equal(store.data['daymark.browser-proxy.last-profile'], 'http://proxy.example.org:3128');
  const text = doc.elements['browser-proxy-result'].children.map((c) => c.textContent).join('\n');
  assert.ok(!text.includes('alice'));
  assert.ok(!text.includes('secret'));
  assert.ok(!JSON.stringify(store.data).includes('alice'));
  assert.ok(!JSON.stringify(store.data).includes('secret'));
});

test('a malformed address fails closed to not-checkable in the card', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-proxy-address'].value = 'definitely not a proxy';
  ui.attachBrowserProxyUi({ document: doc, proxyApi: engine });
  assert.match(doc.elements['browser-proxy-status'].textContent, /Not checkable/);
  const result = doc.elements['browser-proxy-result'];
  assert.equal(result.children.length, 1);
  assert.equal(result.children[0].children[0].textContent, 'Not checkable');
  assert.match(result.children[0].children[1].textContent, /could not be checked/);
});

test('the clear button empties the card, forgets storage and reports it', () => {
  const doc = makeDoc(ALL_IDS);
  const clear = doc.elements['browser-proxy-clear'];
  doc.elements['browser-proxy-address'].value = 'proxy.example.org:8080';
  const store = {
    data: {},
    getItem(k) { return this.data[k] || null; },
    setItem(k, v) { this.data[k] = String(v); },
    removeItem(k) { delete this.data[k]; }
  };
  const handle = ui.attachBrowserProxyUi({ document: doc, proxyApi: engine, localStorage: store });
  assert.equal(store.data['daymark.browser-proxy.last-profile'], 'proxy.example.org:8080');
  const click = clear.listeners.click;
  assert.ok(click && click.length === 1, 'a click listener must be wired on clear');
  click[0]();
  assert.equal(doc.elements['browser-proxy-result'].children.length, 0);
  assert.equal(doc.elements['browser-proxy-address'].value, '');
  assert.equal(store.data['daymark.browser-proxy.last-profile'], undefined);
  assert.match(doc.elements['browser-proxy-status'].textContent, /Cleared\./);
});

test('copy button collects the plan and reports success when clipboard is available', async () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-proxy-address'].value = 'proxy.example.org:8080';
  let written = null;
  const fakeNavigator = { clipboard: { writeText: async (t) => { written = t; return true; } } };
  ui.attachBrowserProxyUi({ document: doc, proxyApi: engine, navigator: fakeNavigator });
  const click = doc.elements['browser-proxy-copy'].listeners.click;
  assert.ok(click && click.length === 1, 'a click listener must be wired on copy');
  click[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(written && written.includes('http://proxy.example.org:8080'));
  assert.match(doc.elements['browser-proxy-status'].textContent, /Copied plan/);
});

test('a missing engine degrades honestly instead of guessing', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-proxy-address'].value = 'proxy.example.org:8080';
  ui.attachBrowserProxyUi({ document: doc, proxyApi: null });
  assert.equal(doc.elements['browser-proxy-status'].textContent, 'Proxy planning is unavailable.');
  assert.equal(doc.elements['browser-proxy-result'].children.length, 0);
});

test('remembers the last accepted address across attach calls via localStorage', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-proxy-address'].value = 'proxy.example.org:8080';
  const store = { data: {}, getItem(k) { return this.data[k] || null; }, setItem(k, v) { this.data[k] = String(v); }, removeItem(k) { delete this.data[k]; } };
  ui.attachBrowserProxyUi({ document: doc, proxyApi: engine, localStorage: store });

  const doc2 = makeDoc(ALL_IDS);
  doc2.elements['browser-proxy-address'].value = '';
  ui.attachBrowserProxyUi({ document: doc2, proxyApi: engine, localStorage: store });
  assert.equal(doc2.elements['browser-proxy-address'].value, 'proxy.example.org:8080');
  assert.match(doc2.elements['browser-proxy-status'].textContent, /Restored previous address/);
  assert.match(doc2.elements['browser-proxy-status'].textContent, /Planned/);
});

test('ignores an unknown stored address and never throws when storage is broken', () => {
  const doc = makeDoc(ALL_IDS);
  const store = { data: { 'daymark.browser-proxy.last-profile': 'not a proxy' }, getItem(k) { return this.data[k] || null; }, setItem() { throw new Error('quota'); } };
  assert.doesNotThrow(() => {
    ui.attachBrowserProxyUi({ document: doc, proxyApi: engine, localStorage: store });
  });
  assert.equal(doc.elements['browser-proxy-address'].value, '');
  assert.match(doc.elements['browser-proxy-status'].textContent, /Enter a proxy address/);
});

test('legacy remembered credentials are sanitized before display and re-persisted', () => {
  const doc = makeDoc(ALL_IDS);
  const store = {
    data: { 'daymark.browser-proxy.last-profile': 'http://alice:secret@proxy.example.org:3128' },
    getItem(k) { return this.data[k] || null; },
    setItem(k, v) { this.data[k] = String(v); },
    removeItem(k) { delete this.data[k]; }
  };
  ui.attachBrowserProxyUi({ document: doc, proxyApi: engine, localStorage: store });
  assert.equal(doc.elements['browser-proxy-address'].value, 'http://proxy.example.org:3128');
  assert.equal(store.data['daymark.browser-proxy.last-profile'], 'http://proxy.example.org:3128');
  assert.ok(!JSON.stringify(store.data).includes('alice'));
  assert.ok(!JSON.stringify(store.data).includes('secret'));
});

test('a throwing localStorage getter does not prevent the proxy card from working', () => {
  const doc = makeDoc(ALL_IDS);
  const env = { document: doc, proxyApi: engine };
  Object.defineProperty(env, 'localStorage', {
    get() { throw new Error('SecurityError: storage is blocked'); }
  });
  const handle = ui.attachBrowserProxyUi(env);
  doc.elements['browser-proxy-address'].value = 'proxy.example.org:8080';
  assert.doesNotThrow(() => handle.plan());
  assert.match(doc.elements['browser-proxy-status'].textContent, /Planned/);
});

test('automatic browser boot survives a throwing window.localStorage getter', () => {
  const doc = makeDoc(ALL_IDS);
  doc.readyState = 'complete';
  const win = {};
  Object.defineProperty(win, 'localStorage', {
    get() { throw new Error('SecurityError: storage is blocked'); }
  });
  const context = vm.createContext({
    window: win,
    document: doc,
    DaymarkBrowserProxy: engine,
    URL,
    Promise,
    setTimeout,
    clearTimeout
  });
  const source = fs.readFileSync(require.resolve('../browser-proxy-ui.js'), 'utf8');
  assert.doesNotThrow(() => vm.runInContext(source, context));
  assert.match(doc.elements['browser-proxy-status'].textContent, /Enter a proxy address/);
});

test('missing elements never throw; the card simply does less', () => {
  const doc = makeDoc(['browser-proxy-address']);
  const handle = ui.attachBrowserProxyUi({ document: doc, proxyApi: engine });
  assert.equal(typeof handle.plan, 'function');
  handle.plan();
  handle.onClear();
  handle.onCopy();
  handle.detach();
});

test('plan button reports aria-busy only while planning', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-proxy-address'].value = 'proxy.example.org:8080';
  const planBtn = doc.elements['browser-proxy-plan'];
  ui.attachBrowserProxyUi({ document: doc, proxyApi: engine });
  assert.equal(planBtn.getAttribute('aria-busy'), null);
});

test('clear writes an empty tombstone when removeItem throws', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-proxy-address'].value = 'proxy.example.org:8080';
  const store = {
    data: {},
    getItem(k) { return this.data[k] || null; },
    setItem(k, v) { this.data[k] = String(v); },
    removeItem() { throw new Error('remove blocked'); }
  };
  ui.attachBrowserProxyUi({ document: doc, proxyApi: engine, localStorage: store });
  assert.equal(store.data['daymark.browser-proxy.last-profile'], 'proxy.example.org:8080');
  doc.elements['browser-proxy-clear'].listeners.click[0]();
  assert.equal(store.data['daymark.browser-proxy.last-profile'], '', 'the old address is replaced by a durable empty marker');
  assert.match(doc.elements['browser-proxy-status'].textContent, /Cleared\./);
});

test('clear reports failure when removal and the empty tombstone both fail', () => {
  const doc = makeDoc(ALL_IDS);
  const remembered = 'proxy.example.org:8080';
  const store = {
    data: { 'daymark.browser-proxy.last-profile': remembered },
    getItem(k) { return this.data[k] || null; },
    setItem() { throw new Error('write blocked'); },
    removeItem() { throw new Error('remove blocked'); }
  };
  ui.attachBrowserProxyUi({ document: doc, proxyApi: engine, localStorage: store });
  doc.elements['browser-proxy-clear'].listeners.click[0]();
  assert.equal(doc.elements['browser-proxy-address'].value, '');
  assert.equal(store.data['daymark.browser-proxy.last-profile'], remembered, 'failed storage operations do not pretend the key was removed');
  assert.doesNotMatch(doc.elements['browser-proxy-status'].textContent, /Cleared\./);
  assert.match(doc.elements['browser-proxy-status'].textContent, /could not be removed/);
  assert.match(doc.elements['browser-proxy-status'].textContent, /Clear this site/);
});

test('legacy credentials remain explicitly warned about when both safe cleanup paths fail', () => {
  const doc = makeDoc(ALL_IDS);
  const legacy = 'http://alice:secret@proxy.example.org:3128';
  const store = {
    data: { 'daymark.browser-proxy.last-profile': legacy },
    getItem(k) { return this.data[k] || null; },
    setItem() { throw new Error('write blocked'); },
    removeItem() { throw new Error('remove blocked'); }
  };
  ui.attachBrowserProxyUi({ document: doc, proxyApi: engine, localStorage: store });
  assert.equal(doc.elements['browser-proxy-address'].value, 'http://proxy.example.org:3128');
  assert.equal(store.data['daymark.browser-proxy.last-profile'], legacy, 'the test proves cleanup really failed');
  const status = doc.elements['browser-proxy-status'].textContent;
  assert.match(status, /could not be removed/);
  assert.match(status, /Clear this site's browser data/);
  assert.equal(status.includes('alice'), false);
  assert.equal(status.includes('secret'), false);
});
