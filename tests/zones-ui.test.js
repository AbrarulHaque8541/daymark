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

test('save overlap creates a local text file via Blob and reports status', async () => {
  let created = null;
  let clicked = false;
  const { env, elements } = fakeEnv({});
  global.URL = {
    createObjectURL(blob) {
      created = blob;
      return 'blob:fake';
    },
    revokeObjectURL() {}
  };
  const handle = ui.attachZonesUi(env);
  const click = elements['zones-save'].listeners.find((l) => l.type === 'click');
  assert.ok(click, 'the save button has a click listener');
  const origCreate = env.document.createElement;
  env.document.createElement = (tag) => {
    const el = origCreate(tag);
    if (tag === 'a') {
      el.click = () => { clicked = true; };
    }
    return el;
  };
  await click.handler();
  assert.ok(created instanceof Blob, 'a Blob was created');
  assert.equal(created.type, 'text/plain');
  assert.equal(clicked, true, 'the temporary link was clicked');
  assert.equal(elements['zones-status'].textContent, 'Saved world clock and overlap as daymark-world-clock.txt.');
  assert.equal(elements['zones-save'].getAttribute('aria-busy'), undefined, 'busy is cleared after success');
});

test('save reports nothing when the zones module is missing', async () => {
  const { env, elements } = fakeEnv({ zonesApi: null });
  const handle = ui.attachZonesUi(env);
  handle.onSave();
  assert.equal(elements['zones-status'].textContent, 'Nothing to save yet.');
});

test('save reports unavailable when URL.createObjectURL is missing', async () => {
  const { env, elements } = fakeEnv({});
  delete global.URL;
  const handle = ui.attachZonesUi(env);
  const click = elements['zones-save'].listeners.find((l) => l.type === 'click');
  assert.ok(click);
  await click.handler();
  assert.equal(elements['zones-status'].textContent, 'Saving is not available in this environment.');
});
