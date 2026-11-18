'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const countryUi = require('../country-ui.js');

const rootDir = path.join(__dirname, '..');
const markup = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const requiredList = fs.readFileSync(path.join(rootDir, 'tests', 'REQUIRED_NODE_TEST_FILES.txt'), 'utf8');
const uiSource = fs.readFileSync(path.join(rootDir, 'country-ui.js'), 'utf8');

function utf8Bytes(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        code = 0x10000 + ((code - 0xD800) * 0x400) + (next - 0xDC00);
        i += 1;
      }
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
    else if (code < 0x10000) bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
    else bytes.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 0x3F), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
  }
  return new Uint8Array(bytes);
}

function streamResponse(text, opts) {
  const o = opts || {};
  let given = o.ok === false ? undefined : text;
  return {
    ok: !o || o.ok !== false,
    status: o.status === undefined ? 200 : o.status,
    headers: { get: () => null },
    body: {
      getReader() {
        return {
          releaseLock() {},
          async read() {
            if (given === undefined || given === null) return { done: true };
            const chunk = given;
            given = null;
            return { value: utf8Bytes(chunk), done: false };
          }
        };
      }
    }
  };
}

const FIXTURE = JSON.stringify([
  { name: { common: 'India', official: 'Republic of India' },
    cca2: 'IN', cca3: 'IND', capital: ['New Delhi'], region: 'Asia', subregion: 'Southern Asia',
    population: 1408712000,
    timezones: ['UTC+05:30', 'UTC+05:30 elsewhere', 'UTC+06:00'],
    currencies: { INR: { name: 'Indian rupee', symbol: '\u20b9' } },
    flag: '\ud83c\uddee\ud83c\uddf3' }
]);

function makeElement(registry) {
  const el = {
    children: [],
    handlers: {},
    value: '',
    disabled: false,
    textContent: '',
    parentNode: null,
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute(name, v) { this['attr:' + name] = v; },
    getAttribute(name) { return this['attr:' + name]; },
    removeAttribute(name) { delete this['attr:' + name]; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    insertBefore(child, ref) {
      child.parentNode = this;
      const i = ref ? this.children.indexOf(ref) : -1;
      if (i === -1) this.children.push(child);
      else this.children.splice(i, 0, child);
      return child;
    },
    addEventListener(name, fn) { (this.handlers[name] = this.handlers[name] || []).push(fn); },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i !== -1) this.children.splice(i, 1);
    }
  };
  if (registry) {
    Object.defineProperty(el, 'id', {
      configurable: true,
      get() { return el.__id; },
      set(v) { el.__id = v; if (v) registry.set(v, el); }
    });
  }
  return el;
}

function makeDoc(seedIds) {
  const byId = new Map();
  const doc = {
    readyState: 'complete',
    body: makeElement(),
    getElementById: (id) => byId.get(id) || null,
    createElement: () => makeElement(byId),
    addEventListener() {}
  };
  for (const id of seedIds || []) {
    const host = makeElement(byId);
    host.children = [];
    host.parentNode = makeElement();
    host.id = id;
  }
  doc.__byId = byId;
  return doc;
}

test('the country card is wired into index.html and the test inventory', () => {
  assert.match(markup, /<script src="country-logic\.js" defer><\/script>/);
  assert.match(markup, /<script src="country-ui\.js" defer><\/script>/);
  assert.match(requiredList, /tests\/country-logic\.test\.js/);
  assert.match(requiredList, /tests\/country-ui\.test\.js/);
});

test('the country card never reads or writes device storage', () => {
  assert.doesNotMatch(uiSource, /localStorage/);
  assert.doesNotMatch(uiSource, /sessionStorage/);
  assert.match(uiSource, /CARD_ID = 'country-card'/);
});

test('booting the module without a real page never throws or touches storage', () => {
  const runner = new Function('module', 'require', 'window', 'document', uiSource);
  assert.doesNotThrow(() => runner({ exports: {} }, () => null, undefined, undefined));
});

test('ensureCard is idempotent and lands after the launch card anchor', () => {
  const doc = makeDoc(['launch-card']);
  const first = countryUi.ensureCard(doc);
  const second = countryUi.ensureCard(doc);
  assert.ok(second === first);
  const anchor = doc.__byId.get('launch-card');
  assert.ok(anchor.parentNode.children.indexOf(first) !== -1);
  assert.ok(doc.getElementById('country-result'));
});

test('a successful lookup renders the countries and an honest status', async () => {
  const doc = makeDoc(['launch-card']);
  const ui = countryUi.attachCountryUi({
    document: doc,
    countryApi: require('../country-logic.js'),
    fetch: async () => streamResponse(FIXTURE),
    now: () => '2026-11-18T04:45:00Z'
  });
  doc.getElementById('country-name').value = 'India';
  await ui.onCheck();
  const result = doc.getElementById('country-result');
  const items = result.children.filter((c) => c.className === 'feed-item');
  assert.equal(items.length, 1);
  assert.match(items[0].children[0].textContent, /India/);
  assert.match(items[0].children[1].textContent, /Republic of India/);
  assert.match(items[0].children[2].textContent, /1,408,712,000/);
  const statusText = doc.getElementById('country-status').textContent;
  assert.match(statusText, /not saved on this device/);
});

test('without fetch the card says so instead of guessing', () => {
  const doc = makeDoc(['launch-card']);
  countryUi.attachCountryUi({ document: doc, countryApi: require('../country-logic.js') });
  assert.match(doc.getElementById('country-status').textContent, /fetch is unavailable/);
});

test('without the logic API the card degrades honestly', () => {
  const doc = makeDoc(['launch-card']);
  countryUi.attachCountryUi({ document: doc, countryApi: null });
  assert.match(doc.getElementById('country-status').textContent, /Country lookup is unavailable\./);
});

test('a concurrent second Check is skipped by the busy guard', async () => {
  const doc = makeDoc(['launch-card']);
  let calls = 0;
  const ui = countryUi.attachCountryUi({
    document: doc,
    countryApi: {
      fetchCountries: async () => { calls += 1; await Promise.resolve(); return { version: 1, countries: [], truncatedFields: 0, fetchedAt: '2026-11-18T04:45:00Z' }; },
      classifyCountryError: () => null
    },
    fetch: async () => streamResponse('[{}]')
  });
  doc.getElementById('country-name').value = 'India';
  await Promise.all([ui.onCheck(), ui.onCheck()]);
  assert.equal(calls, 1);
});

test('a not-found reply is explained in plain words and the view is cleared', async () => {
  const doc = makeDoc(['launch-card']);
  const ui = countryUi.attachCountryUi({
    document: doc,
    countryApi: require('../country-logic.js'),
    fetch: async () => streamResponse('', { ok: false, status: 404 })
  });
  doc.getElementById('country-name').value = 'Atlantis';
  await ui.onCheck();
  assert.match(doc.getElementById('country-status').textContent, /No country matched/);
  assert.equal(doc.getElementById('country-result').children.length, 0);
});

test('Clear empties the view and keeps the honest status', () => {
  const doc = makeDoc(['launch-card']);
  const ui = countryUi.attachCountryUi({ document: doc, countryApi: null });
  ui.onClear();
  assert.equal(doc.getElementById('country-result').children.length, 0);
  assert.match(doc.getElementById('country-status').textContent, /Cleared/);
});
