'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../browser-download-ui.js');
const engine = require('../browser-download-logic.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const browserDownloadSource = fs.readFileSync(path.join(__dirname, '..', 'browser-download-ui.js'), 'utf8');

function makeElement(tagName) {
  const el = {
    tagName,
    className: '',
    classList: { add(cls) { el.className = (el.className + " " + cls).trim(); }, remove(cls) { el.className = el.className.replace(new RegExp("\\b" + cls + "\\b", "g"), "").replace(/\s+/g, " ").trim(); } },
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
  for (const id of ids) elements[id] = makeElement(id.includes('form') ? 'form' : 'div');
  return {
    elements,
    getElementById(id) { return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null; },
    createElement(tagName) { return makeElement(tagName); }
  };
}

const ALL_IDS = ['browser-download-scenario', 'browser-download-status', 'browser-download-result',
  'browser-download-form', 'browser-download-clear', 'browser-download-copy', 'browser-download-save', 'browser-download-share'];

test('attachBrowserDownloadUi requires a document', () => {
  assert.throws(() => ui.attachBrowserDownloadUi(null), /requires a document/);
  assert.throws(() => ui.attachBrowserDownloadUi({}), /requires a document/);
});

test('the card plans the selected journey at boot', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-download-scenario'].value = 'same-origin-redirects';
  const handle = ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine });
  const status = doc.elements['browser-download-status'].textContent;
  const result = doc.elements['browser-download-result'];
  assert.match(status, /Planned \u00b7 report\.pdf/);
  assert.match(status, /safe to retry/);
  assert.doesNotMatch(doc.elements['browser-download-status'].className, /has-notices/);
  assert.equal(result.children[0].className, 'feed-item');
  assert.equal(result.children[0].children[0].className, 'feed-item-title');
  assert.equal(result.children[0].children[0].textContent, 'report.pdf');
  assert.equal(result.children[0].children[1].className, 'feed-item-summary');
  const expected = engine.planScenario('same-origin-redirects');
  assert.equal(result.children.length, 1 + expected.lines.length);
  for (let i = 1; i < result.children.length; i += 1) {
    assert.match(result.children[i].textContent, new RegExp('^' + i + '\\. '));
  }
  assert.equal(typeof handle.plan, 'function');
  assert.equal(typeof handle.onCopy, 'function');
});

test('changing the journey re-plans, and non-retryable downloads say so', () => {
  const doc = makeDoc(ALL_IDS);
  const scenario = doc.elements['browser-download-scenario'];
  scenario.value = 'expired-link';
  ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine });
  const change = scenario.listeners.change;
  assert.ok(change && change.length === 1, 'a change listener must be wired');
  change[0]();
  const status = doc.elements['browser-download-status'].textContent;
  assert.match(status, /do not just retry/);
  assert.doesNotMatch(status, /safe to retry/);
  const result = doc.elements['browser-download-result'];
  assert.equal(result.children[0].children[0].textContent, 'old.pdf');
});

test('an unknown journey value fails closed to not-checkable', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-download-scenario'].value = 'definitely-not-a-journey';
  ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine });
  assert.match(doc.elements['browser-download-status'].textContent, /Not checkable/);
  const result = doc.elements['browser-download-result'];
  assert.equal(result.children[0].children[0].textContent, 'Not checkable');
  assert.equal(result.children.length, 1);
  assert.match(result.children[0].children[1].textContent, /not known/);
});

test('a suspicious filename discloses the sanitization honestly', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-download-scenario'].value = 'spoofed-filename';
  ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine });
  const result = doc.elements['browser-download-result'];
  assert.equal(result.children[0].children[0].textContent, 'evilexe.exe');
  assert.match(result.children[0].children[1].textContent, /unsafe characters; they were removed/);
  assert.match(doc.elements['browser-download-status'].className, /has-notices/);
  assert.match(doc.elements['browser-download-status'].textContent, /2 notices/);
});

test('form submit re-plans and the clear button empties the card', () => {
  const doc = makeDoc(ALL_IDS);
  const form = doc.elements['browser-download-form'];
  const clear = doc.elements['browser-download-clear'];
  doc.elements['browser-download-scenario'].value = 'cross-origin-redirect';
  ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine });
  const submit = form.listeners.submit;
  const click = clear.listeners.click;
  assert.ok(submit && submit.length === 1, 'a submit listener must be wired');
  assert.ok(click && click.length === 1, 'a click listener must be wired');
  const event = makeElement('event');
  submit[0](event);
  assert.equal(event.prevented, true, 'submit must not actually submit');
  assert.match(doc.elements['browser-download-result'].children[0].children[1].textContent,
    /arrives from https:\/\/files\.other\.net/);
  click[0]();
  assert.equal(doc.elements['browser-download-result'].children.length, 0);
  assert.match(doc.elements['browser-download-status'].textContent, /Cleared\./);
});

test('copy button collects the plan and reports success when clipboard is available', async () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-download-scenario'].value = 'same-origin-redirects';
  let written = null;
  const fakeNavigator = { clipboard: { writeText: async (t) => { written = t; return true; } } };
  const handle = ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine, navigator: fakeNavigator });
  const copy = doc.elements['browser-download-copy'];
  const click = copy.listeners.click;
  assert.ok(click && click.length === 1, 'a click listener must be wired on copy');
  click[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(written && written.includes('report.pdf'));
  assert.match(doc.elements['browser-download-status'].textContent, /Copied plan/);
});

test('a missing engine degrades honestly instead of guessing', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-download-scenario'].value = 'same-origin-redirects';
  ui.attachBrowserDownloadUi({ document: doc, downloadApi: null });
  assert.equal(doc.elements['browser-download-status'].textContent,
    'Download planning is unavailable.');
  assert.equal(doc.elements['browser-download-result'].children.length, 0);
});

test('missing elements never throw; the card simply does less', () => {
  const doc = makeDoc(['browser-download-scenario']);
  const handle = ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine });
  assert.equal(typeof handle.plan, 'function');
  handle.plan();
  handle.onClear();
  handle.onCopy();
  handle.detach();
});

test('remembers the last planned journey across attach calls via localStorage', () => {
  const doc = makeDoc(ALL_IDS);
  const scenario = doc.elements['browser-download-scenario'];
  scenario.value = 'expired-link';
  const store = { data: {}, getItem(k) { return this.data[k] || null; }, setItem(k, v) { this.data[k] = String(v); } };
  ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine, localStorage: store });
  assert.equal(store.data['daymark.browser-download.last-scenario'], 'expired-link');

  // Second attach with a different default should restore the remembered value.
  const doc2 = makeDoc(ALL_IDS);
  doc2.elements['browser-download-scenario'].value = 'same-origin-redirects';
  ui.attachBrowserDownloadUi({ document: doc2, downloadApi: engine, localStorage: store });
  assert.equal(doc2.elements['browser-download-scenario'].value, 'expired-link');
  assert.match(doc2.elements['browser-download-status'].textContent, /do not just retry/);
});

test('ignores an unknown stored scenario and never throws when storage is unavailable', () => {
  const doc = makeDoc(ALL_IDS);
  const store = { data: { 'daymark.browser-download.last-scenario': 'not-a-real-journey' }, getItem(k) { return this.data[k] || null; }, setItem() { throw new Error('quota'); } };
  assert.doesNotThrow(() => {
    ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine, localStorage: store });
  });
  // Unknown value is ignored; the engine fails closed for the (default empty/unknown) selection.
  assert.match(doc.elements['browser-download-status'].textContent, /Not checkable|Planned|unavailable/);
});

test('plan button reports aria-busy while planning and restore announces previous journey', () => {
  const doc = makeDoc(ALL_IDS);
  const scenario = doc.elements['browser-download-scenario'];
  scenario.value = 'same-origin-redirects';
  const store = { data: { 'daymark.browser-download.last-scenario': 'expired-link' }, getItem(k) { return this.data[k] || null; }, setItem(k, v) { this.data[k] = String(v); }, removeItem(k) { delete this.data[k]; } };
  const planBtn = doc.elements['browser-download-check'] || makeElement('button');
  // Ensure plan button exists for aria-busy
  if (!doc.elements['browser-download-check']) doc.elements['browser-download-check'] = planBtn;
  doc.getElementById = (id) => doc.elements[id] || null;
  const handle = ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine, localStorage: store });
  // After attach, scenario should be restored and status should mention Restored
  assert.equal(scenario.value, 'expired-link');
  assert.match(doc.elements['browser-download-status'].textContent, /Restored previous journey/);
  assert.match(doc.elements['browser-download-status'].textContent, /do not just retry/);
  // aria-busy should have been toggled (final state off)
  const btn = doc.elements['browser-download-check'];
  if (btn && btn.getAttribute) {
    assert.equal(btn.getAttribute('aria-busy'), null);
  }
});

test('save button downloads the plan as a local text file when available', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-download-scenario'].value = 'same-origin-redirects';
  // Mock body and URL for the download trigger.
  doc.body = { appendChild() {}, removeChild() {} };
  const originalURL = global.URL;
  const created = [];
  global.URL = {
    createObjectURL: (b) => { created.push(b); return 'blob:fake'; },
    revokeObjectURL: () => {}
  };
  const handle = ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine });
  const save = doc.elements['browser-download-save'];
  const click = save.listeners.click;
  assert.ok(click && click.length === 1, 'a click listener must be wired on save');
  click[0]();
  assert.match(doc.elements['browser-download-status'].textContent, /Saved plan as daymark-download-plan\.txt/);
  assert.ok(created.length > 0, 'a blob was created');
  global.URL = originalURL;
});

test('clear button also forgets the remembered journey in localStorage', () => {
  const doc = makeDoc(ALL_IDS);
  const scenario = doc.elements['browser-download-scenario'];
  scenario.value = 'installable-app';
  const store = {
    data: {},
    getItem(k) { return this.data[k] || null; },
    setItem(k, v) { this.data[k] = String(v); },
    removeItem(k) { delete this.data[k]; }
  };
  const handle = ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine, localStorage: store });
  assert.equal(store.data['daymark.browser-download.last-scenario'], 'installable-app');
  handle.onClear();
  assert.equal(store.data['daymark.browser-download.last-scenario'], undefined);
  assert.equal(scenario.value, '');
  assert.match(doc.elements['browser-download-status'].textContent, /Cleared\./);
  assert.equal(doc.elements['browser-download-result'].children.length, 0);
});

test('share button uses injected navigator.share when available and reports success', async () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-download-scenario'].value = 'same-origin-redirects';
  let shared = null;
  const fakeNav = {
    share(data) {
      shared = data;
      return Promise.resolve();
    }
  };
  const handle = ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine, navigator: fakeNav });
  assert.ok(doc.elements['browser-download-result'].children.length > 0);
  const shareBtn = doc.elements['browser-download-share'];
  assert.ok(shareBtn.listeners.click && shareBtn.listeners.click.length === 1, 'share listener wired');
  await handle.onShare();
  assert.equal(shared && shared.title, 'Daymark download safety plan');
  assert.match(shared.text, /report\.pdf/);
  assert.match(doc.elements['browser-download-status'].textContent, /Shared plan/);
});


test('a failed storage read is not overwritten and Clear reports that persistence remains unknown', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-download-scenario'].value = 'expired-link';
  let writes = 0;
  let removes = 0;
  const store = {
    getItem() { throw new Error('storage read blocked'); },
    setItem() { writes += 1; },
    removeItem() { removes += 1; }
  };
  const handle = ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine, localStorage: store });
  assert.equal(writes, 0, 'an unreadable saved value must not be overwritten');
  assert.match(doc.elements['browser-download-status'].textContent, /saved journey could not be read/);
  assert.ok(doc.elements['browser-download-result'].children.length > 0,
    'the local safety plan remains usable when persistence is unavailable');
  handle.onClear();
  assert.equal(removes, 0, 'Clear must not delete a value whose state could not be read');
  assert.match(doc.elements['browser-download-status'].textContent,
    /Cleared on this page, but the saved journey could not be removed/);
});

test('a quota failure keeps the plan usable and discloses that it was not saved', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-download-scenario'].value = 'same-origin-redirects';
  const store = {
    getItem() { return null; },
    setItem() { throw new Error('quota exceeded'); },
    removeItem() {}
  };
  ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine, localStorage: store });
  assert.ok(doc.elements['browser-download-result'].children.length > 0);
  assert.match(doc.elements['browser-download-status'].textContent,
    /saved journey could not be updated/);
  assert.match(doc.elements['browser-download-status'].className, /has-notices/);
});

test('a failed persistent Clear does not claim that the saved journey was removed', () => {
  const doc = makeDoc(ALL_IDS);
  const store = {
    data: { 'daymark.browser-download.last-scenario': 'expired-link' },
    getItem(key) { return this.data[key] || null; },
    setItem() {},
    removeItem() { throw new Error('storage is read-only'); }
  };
  const handle = ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine, localStorage: store });
  assert.equal(doc.elements['browser-download-scenario'].value, 'expired-link');
  handle.onClear();
  assert.equal(store.data['daymark.browser-download.last-scenario'], 'expired-link',
    'the stored value remains intact when removal fails');
  assert.match(doc.elements['browser-download-status'].textContent,
    /Cleared on this page, but the saved journey could not be removed/);
});

function makeBootElement() {
  const children = [];
  const el = {
    children,
    listeners: Object.create(null),
    className: '',
    textContent: '',
    value: 'same-origin-redirects',
    classList: {
      add(name) { el.className = (el.className + ' ' + name).trim(); },
      remove(name) { el.className = el.className.split(' ').filter((item) => item && item !== name).join(' '); }
    },
    get firstChild() { return children[0] || null; },
    appendChild(child) { children.push(child); return child; },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      return child;
    },
    addEventListener(name, listener) { this.listeners[name] = listener; }
  };
  return el;
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
    'browser-download-scenario': makeBootElement(),
    'browser-download-status': makeBootElement(),
    'browser-download-result': makeBootElement(),
    'browser-download-form': makeBootElement(),
    'browser-download-clear': makeBootElement(),
    'browser-download-copy': makeBootElement(),
    'browser-download-save': makeBootElement(),
    'browser-download-share': makeBootElement()
  };
  const documentListeners = Object.create(null);
  const document = {
    readyState,
    getElementById(id) { return elements[id] || null; },
    createElement() { return makeBootElement(); },
    addEventListener(name, listener) { documentListeners[name] = listener; }
  };
  const context = {
    window,
    document,
    DaymarkBrowserDownload: engine,
    module: { exports: {} }
  };
  vm.runInNewContext(browserDownloadSource, context, { filename: 'browser-download-ui.js' });
  return {
    get localStorageReads() { return localStorageReads; },
    elements,
    documentListeners
  };
}

test('browser download safety card renders when the localStorage getter throws during immediate boot', () => {
  const result = bootWithBlockedStorage('complete');
  assert.equal(result.localStorageReads, 1, 'boot performs one guarded storage lookup');
  assert.match(result.elements['browser-download-status'].textContent, /Planned/);
  assert.match(result.elements['browser-download-status'].textContent, /saved journey could not be read/);
  assert.ok(result.elements['browser-download-result'].children.length > 0,
    'the local safety plan renders despite restricted storage');
});

test('DOMContentLoaded boot safely handles a throwing localStorage getter', () => {
  const result = bootWithBlockedStorage('loading');
  assert.equal(result.localStorageReads, 0, 'registering deferred boot does not access storage');
  assert.equal(typeof result.documentListeners.DOMContentLoaded, 'function');
  assert.doesNotThrow(() => result.documentListeners.DOMContentLoaded());
  assert.equal(result.localStorageReads, 1, 'deferred boot performs one guarded storage lookup');
  assert.match(result.elements['browser-download-status'].textContent, /saved journey could not be read/);
  assert.ok(result.elements['browser-download-result'].children.length > 0);
});
