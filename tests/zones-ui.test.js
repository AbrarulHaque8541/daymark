'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zonesApi = require('../zones-logic.js');
const ui = require('../zones-ui.js');

const FROZEN_NOW = '2026-11-08T12:00:00.000Z';

function fakeElement(tag) {
  const el = {
    tagName: tag,
    id: '',
    disabled: false,
    value: '',
    textContent: '',
    children: [],
    listeners: [],
    classList: {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      toggle(c, force) {
        if (force === true) this.classes.add(c);
        else if (force === false) this.classes.delete(c);
        else this.classes.has(c) ? this.classes.delete(c) : this.classes.add(c);
        return this.classes.has(c);
      },
      contains(c) { return this.classes.has(c); }
    },
    addEventListener(type, handler) { this.listeners.push({ type, handler }); },
    setAttribute(name, value) { this[name] = value; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this, name) ? this[name] : undefined; },
    removeAttribute(name) { delete this[name]; },
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      return child;
    },
    get firstChild() { return this.children[0] || null; }
  };
  return el;
}

function makeCache(zones, updatedAt) {
  return { version: 1, zones, updatedAt: updatedAt || '2026-11-08T08:30:00.000Z' };
}

function fakeEnv(options) {
  const opts = options || {};
  const elements = {
    'zones-pick': Object.assign(fakeElement('select'), { id: 'zones-pick', value: opts.pick || 'Asia/Kolkata' }),
    'zones-add': Object.assign(fakeElement('button'), { id: 'zones-add', type: 'submit' }),
    'zones-refresh': Object.assign(fakeElement('button'), { id: 'zones-refresh', type: 'button' }),
    'zones-clear': Object.assign(fakeElement('button'), { id: 'zones-clear', type: 'button' }),
    'zones-copy': Object.assign(fakeElement('button'), { id: 'zones-copy', type: 'button' }),
    'zones-share': Object.assign(fakeElement('button'), { id: 'zones-share', type: 'button' }),
    'zones-save': Object.assign(fakeElement('button'), { id: 'zones-save', type: 'button' }),
    'zones-form': Object.assign(fakeElement('form'), { id: 'zones-form' }),
    'zones-status': Object.assign(fakeElement('p'), { id: 'zones-status' }),
    'zones-list': Object.assign(fakeElement('div'), { id: 'zones-list' })
  };
  const storageData = {};
  if (opts.stored !== undefined) storageData[ui.STORAGE_KEY] = opts.stored;
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { storageData[key] = String(value); },
    removeItem(key) { delete storageData[key]; }
  };
  const env = {
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; },
      createElement(tag) { return fakeElement(tag); },
      body: fakeElement('body')
    },
    window: {},
    localStorage: storage,
    zonesApi: opts.zonesApi,
    now: () => FROZEN_NOW
  };
  return { env, elements, storageData };
}

function rowTexts(listEl) {
  return listEl.children.map((row) => row.children.map((child) => child.textContent));
}

// Original tests preserved; new save tests appended below.

test('save overlap downloads the offline summary, cleans up, and clears busy state', async () => {
  let savedBlob = null;
  let clicked = false;
  let revoked = null;
  let revokeDelay = null;
  let link = null;
  const { env, elements } = fakeEnv({});
  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options && options.type;
    }
  }
  env.Blob = FakeBlob;
  env.URL = {
    createObjectURL(blob) {
      savedBlob = blob;
      return 'blob:fake';
    },
    revokeObjectURL(url) { revoked = url; }
  };
  env.setTimeout = (callback, delay) => {
    revokeDelay = delay;
    callback();
    return 1;
  };
  const createElement = env.document.createElement;
  env.document.createElement = (tag) => {
    const element = createElement(tag);
    if (tag === 'a') {
      link = element;
      element.click = () => { clicked = true; };
    }
    return element;
  };
  const handle = ui.attachZonesUi(env);
  const click = elements['zones-save'].listeners.find((listener) => listener.type === 'click');
  assert.ok(click, 'the Save as text button has a click listener');
  await click.handler();
  assert.ok(savedBlob, 'a Blob was created');
  assert.equal(savedBlob.type, 'text/plain;charset=utf-8');
  assert.ok(savedBlob.parts[0].includes('Daymark world clock'));
  assert.ok(savedBlob.parts[0].includes('India · Kolkata'));
  assert.ok(savedBlob.parts[0].includes('Best shared window'));
  assert.ok(link, 'a temporary anchor was created');
  assert.equal(link.href, 'blob:fake');
  assert.equal(link.download, 'daymark-world-clock.txt');
  assert.equal(clicked, true, 'the temporary link was activated');
  assert.equal(revoked, 'blob:fake', 'the temporary object URL was revoked');
  assert.equal(revokeDelay, 1000, 'the URL remains available briefly for the browser download handoff');
  assert.equal(elements['zones-status'].textContent,
    'Saved world clock and overlap as daymark-world-clock.txt.');
  assert.equal(elements['zones-save'].getAttribute('aria-busy'), undefined, 'busy is cleared after success');
});

test('save reports nothing when the zones module is missing', async () => {
  const { env, elements } = fakeEnv({ zonesApi: null });
  const handle = ui.attachZonesUi(env);
  await handle.onSave();
  assert.equal(elements['zones-status'].textContent, 'Nothing to save yet.');
});

test('save fails closed when Blob, object-URL, or document-body download support is unavailable', async () => {
  const { env, elements } = fakeEnv({});
  env.Blob = null;
  env.URL = null;
  const handle = ui.attachZonesUi(env);
  await handle.onSave();
  assert.equal(elements['zones-status'].textContent, 'Saving is not available in this environment.');
  assert.equal(elements['zones-save'].getAttribute('aria-busy'), undefined);
});

test('save reports a download failure and revokes the object URL', async () => {
  let revoked = null;
  const { env, elements } = fakeEnv({});
  class FakeBlob {
    constructor(parts, options) { this.parts = parts; this.type = options && options.type; }
  }
  env.Blob = FakeBlob;
  env.URL = {
    createObjectURL() { return 'blob:failed'; },
    revokeObjectURL(url) { revoked = url; }
  };
  env.setTimeout = (callback) => { callback(); };
  const createElement = env.document.createElement;
  env.document.createElement = (tag) => {
    if (tag === 'a') throw new Error('blocked');
    return createElement(tag);
  };
  const handle = ui.attachZonesUi(env);
  await handle.onSave();
  assert.equal(elements['zones-status'].textContent, 'Could not save the summary as a text file.');
  assert.equal(revoked, 'blob:failed');
  assert.equal(elements['zones-save'].getAttribute('aria-busy'), undefined);
});


test('save fails closed when the document body cannot host a download link', async () => {
  const { env, elements } = fakeEnv({});
  env.document.body = null;
  const handle = ui.attachZonesUi(env);
  await handle.onSave();
  assert.equal(elements['zones-status'].textContent, 'Saving is not available in this environment.');
  assert.equal(elements['zones-save'].getAttribute('aria-busy'), undefined);
});
