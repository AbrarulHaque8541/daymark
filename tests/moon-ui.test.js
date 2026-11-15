'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const logic = globalThis.DaymarkMoon || require('../moon-logic.js');
const moonUi = globalThis.DaymarkMoonUi || require('../moon-ui.js');

function makeElement(tag) {
  const element = {
    tagName: tag,
    children: [],
    attributes: {},
    listeners: {},
    parentNode: null,
    nextSibling: null,
    id: '',
    className: '',
    textContent: '',
    disabled: false,
    value: '',
    href: '',
    classList: {
      set: new Set(),
      toggle(name, force) {
        const on = force === undefined ? !this.set.has(name) : force;
        if (on) this.set.add(name); else this.set.delete(name);
      },
      contains(name) { return this.set.has(name); }
    },
    setAttribute(name, value) { element.attributes[name] = String(value); },
    removeAttribute(name) { delete element.attributes[name]; },
    getAttribute(name) { return element.attributes[name]; },
    appendChild(child) {
      child.parentNode = element;
      element.children.push(child);
      if (child.textContent) element.textContent += child.textContent;
      registerTree(child);
      return child;
    },
    insertBefore(node, ref) {
      node.parentNode = element;
      const index = ref ? element.children.indexOf(ref) : element.children.length;
      element.children.splice(index < 0 ? element.children.length : index, 0, node);
      if (node.textContent) element.textContent += node.textContent;
      registerTree(node);
      return node;
    },
    removeChild(child) {
      const index = element.children.indexOf(child);
      if (index >= 0) element.children.splice(index, 1);
      element.textContent = element.children.map(c => c.textContent || '').join('');
      return child;
    },
    addEventListener(type, handler) {
      (element.listeners[type] = element.listeners[type] || []).push(handler);
    },
    dispatch(type, event) {
      (element.listeners[type] || []).forEach((handler) => handler(event));
    }
  };
  return element;
}

function registerTree(node) {
  if (!node || typeof node !== 'object') return;
  if (node.id && currentDoc) currentDoc[node.id] = node;
  (node.children || []).forEach(registerTree);
}

let currentDoc = null;

function makeDoc() {
  const doc = {
    body: makeElement('body'),
    readyState: 'complete'
  };
  doc.createElement = (tag) => makeElement(tag);
  doc.getElementById = (id) => doc[id] || null;
  doc.createTextNode = (text) => ({ textContent: text, nodeType: 3 });
  currentDoc = doc;
  return doc;
}

function attach(doc, overrides) {
  return moonUi.attachMoonUi(Object.assign({
    document: doc,
    window: {},
    moonApi: logic,
    now: () => '2026-11-15T10:00:00.000Z'
  }, overrides || {}));
}

test('attaches and injects the moon card', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('moon-card'));
});

test('reuses the existing card on a second attach', () => {
  const doc = makeDoc();
  attach(doc);
  attach(doc);
  assert.ok(doc.getElementById('moon-card').children.length > 0);
});

test('card heading and description promise offline, keyless computation', () => {
  const doc = makeDoc();
  attach(doc);
  assert.strictEqual(doc.getElementById('moon-heading').textContent, 'Moon phase, offline');
  const description = doc.getElementById('moon-description').textContent;
  assert.ok(description.includes('nothing is sent anywhere'));
  assert.ok(description.includes('No network request'));
  assert.ok(description.includes('approximate'));
});

test('status line exposes role, aria-live and aria-atomic', () => {
  const doc = makeDoc();
  attach(doc);
  const status = doc.getElementById('moon-status');
  assert.strictEqual(status.getAttribute('role'), 'status');
  assert.strictEqual(status.getAttribute('aria-live'), 'polite');
  assert.strictEqual(status.getAttribute('aria-atomic'), 'true');
});

test('initial status says the card works offline', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('moon-status').textContent.includes('offline'));
});

test('card is placed right after the on-this-day card when present', () => {
  const doc = makeDoc();
  const onthisday = makeElement('aside');
  onthisday.id = 'onthisday-card';
  doc.body.appendChild(onthisday);
  attach(doc);
  const card = doc.getElementById('moon-card');
  assert.strictEqual(card.parentNode, doc.body);
  assert.strictEqual(doc.body.children.indexOf(card), doc.body.children.indexOf(onthisday) + 1);
});

test('card falls back to the wiki card anchor', () => {
  const doc = makeDoc();
  const wiki = makeElement('aside');
  wiki.id = 'wiki-card';
  doc.body.appendChild(wiki);
  attach(doc);
  const card = doc.getElementById('moon-card');
  assert.strictEqual(doc.body.children.indexOf(card), doc.body.children.indexOf(wiki) + 1);
});

test('an empty date computes today from the injected clock, with no network', () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('moon-check').dispatch('click', {});
  const result = doc.getElementById('moon-result');
  assert.ok(result.textContent.includes('2026-11-15'));
  assert.ok(result.textContent.includes('Waxing crescent'));
  assert.ok(result.textContent.includes('27% lit'));
  assert.ok(result.textContent.includes('approximate'));
});

test('a successful check reports that no network was used', () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('moon-check').dispatch('click', {});
  const status = doc.getElementById('moon-status').textContent;
  assert.ok(status.includes('no network request'));
  assert.ok(status.includes('not saved on this device'));
});

test('an explicit date is honoured', () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('moon-date').value = '2026-01-03';
  doc.getElementById('moon-check').dispatch('click', {});
  const result = doc.getElementById('moon-result').textContent;
  assert.ok(result.includes('2026-01-03'));
  assert.ok(result.includes('99% lit'));
});

test('a malformed date is blocked with guidance', () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('moon-date').value = 'someday';
  doc.getElementById('moon-check').dispatch('click', {});
  assert.ok(doc.getElementById('moon-status').textContent.includes('YYYY-MM-DD'));
  assert.strictEqual(doc.getElementById('moon-result').textContent, '');
});

test('an impossible date is blocked fail-closed', () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('moon-date').value = '2026-02-30';
  doc.getElementById('moon-check').dispatch('click', {});
  assert.ok(doc.getElementById('moon-status').textContent.includes('YYYY-MM-DD'));
});

test('a failed check clears any previous result', () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('moon-check').dispatch('click', {});
  doc.getElementById('moon-date').value = '2026-02-31';
  doc.getElementById('moon-check').dispatch('click', {});
  assert.strictEqual(doc.getElementById('moon-result').textContent, '');
});

test('clear empties the input and the result', () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('moon-date').value = '2026-01-03';
  doc.getElementById('moon-check').dispatch('click', {});
  doc.getElementById('moon-clear').dispatch('click', {});
  assert.strictEqual(doc.getElementById('moon-date').value, '');
  assert.strictEqual(doc.getElementById('moon-result').textContent, '');
  assert.ok(doc.getElementById('moon-status').textContent.includes('Cleared'));
});

test('form submit is prevented and runs the check', () => {
  const doc = makeDoc();
  let prevented = false;
  attach(doc);
  doc.getElementById('moon-form').dispatch('submit', { preventDefault: () => { prevented = true; } });
  assert.strictEqual(prevented, true);
  assert.ok(doc.getElementById('moon-result').textContent.includes('2026-11-15'));
});

test('missing moon API degrades with an honest message', () => {
  const doc = makeDoc();
  const savedApi = globalThis.DaymarkMoon;
  delete globalThis.DaymarkMoon;
  try {
    attach(doc, { moonApi: null });
    doc.getElementById('moon-check').dispatch('click', {});
  } finally {
    if (savedApi) globalThis.DaymarkMoon = savedApi;
  }
  assert.ok(doc.getElementById('moon-status').textContent.includes('unavailable'));
});

test('index.html wires both moon modules as defer scripts', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(/<script src="moon-logic\.js" defer><\/script>/.test(html));
  assert.ok(/<script src="moon-ui\.js" defer><\/script>/.test(html));
});

test('boot never reads localStorage (stateless, offline card)', () => {
  const vm = require('node:vm');
  const code = fs.readFileSync(path.join(__dirname, '..', 'moon-ui.js'), 'utf8');
  const sandbox = {
    window: undefined,
    document: undefined
  };
  sandbox.module = { exports: {} };
  sandbox.globalThis = sandbox;
  sandbox.require = (name) => { throw new Error('unexpected require ' + name); };
  vm.runInNewContext(code, sandbox);
  assert.ok(sandbox.module.exports.attachMoonUi);
  assert.strictEqual(sandbox.localStorage, undefined);
});
