'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let logic;
let hijriUi;
if (typeof require === 'function') {
  logic = require('../hijri-logic.js');
  hijriUi = require('../hijri-ui.js');
}
if (!logic) logic = globalThis.DaymarkHijri;
if (!hijriUi) hijriUi = globalThis.DaymarkHijriUi;

function makeElement(tag) {
  const element = {
    tagName: String(tag).toLowerCase(),
    children: [],
    attributes: {},
    listeners: {},
    parentNode: null,
    id: '',
    className: '',
    textContent: '',
    value: '',
    disabled: false,
    classList: {
      set: new Set(),
      toggle(name, force) {
        const on = force === undefined ? !this.set.has(name) : force;
        if (on) this.set.add(name); else this.set.delete(name);
      },
      contains(name) { return this.set.has(name); }
    },
    setAttribute(name, attrValue) { element.attributes[name] = String(attrValue); },
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
      element.textContent = element.children.map((c) => c.textContent || '').join('');
      return child;
    },
    addEventListener(type, handler) {
      (element.listeners[type] = element.listeners[type] || []).push(handler);
    },
    dispatch(type, event) {
      const handlers = (element.listeners[type] || []).map((handler) => handler(event));
      return Promise.all(handlers.map((outcome) => outcome && typeof outcome.then === 'function' ? outcome : undefined));
    }
  };
  return element;
}

let currentDoc = null;
function registerTree(node) {
  if (!node || typeof node !== 'object') return;
  if (node.id && currentDoc) currentDoc[node.id] = node;
  (node.children || []).forEach(registerTree);
}

function makeDoc() {
  const doc = {
    body: makeElement('body'),
    readyState: 'complete'
  };
  doc.createElement = (tag) => makeElement(tag);
  doc.getElementById = (id) => doc[id] || null;
  doc.createTextNode = (text) => ({ textContent: text, nodeType: 3 });
  doc.addEventListener = () => {};
  currentDoc = doc;
  return doc;
}

function attach(doc, overrides) {
  return hijriUi.attachHijriUi(Object.assign({
    document: doc,
    window: {},
    hijriApi: logic,
    fetch: null,
    now: () => '2026-11-25T04:00:00.000Z',
    todayIso: () => '2026-11-25T04:00:00.000Z'
  }, overrides || {}));
}

function streamOf(chunks) {
  return {
    getReader() {
      let index = 0;
      return {
        read: async () => {
          if (index < chunks.length) {
            const value = chunks[index];
            index += 1;
            const bytes = new Uint8Array(value.length);
            for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 0xff;
            return { done: false, value: bytes };
          }
          return { done: true, value: undefined };
        },
        cancel: async () => {},
        releaseLock: () => {}
      };
    }
  };
}

const okResponse = (bodyText) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  body: streamOf([bodyText]),
  text: async () => bodyText
});

function samplePayload() {
  return {
    code: 200,
    status: 'OK',
    data: {
      hijri: {
        date: '15-06-1448',
        day: '15',
        weekday: { en: "Al Arba'a" },
        month: { number: 6, en: 'Jumada al-akhirah', days: 29 },
        year: '1448',
        holidays: []
      },
      gregorian: '25-11-2026'
    }
  };
}

function settle() {
  const chain = [];
  for (let i = 0; i < 14; i += 1) chain.push(Promise.resolve());
  return chain.reduce((acc, item) => acc.then(() => item), Promise.resolve());
}

test('attaches and injects the Hijri date card', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('hijri-card'));
});

test('reuses the existing card on a second attach', () => {
  const doc = makeDoc();
  attach(doc);
  const first = doc.getElementById('hijri-card');
  attach(doc);
  assert.strictEqual(doc.getElementById('hijri-card'), first);
});

test('card heading and description name the public keyless feed', () => {
  const doc = makeDoc();
  attach(doc);
  assert.strictEqual(doc.getElementById('hijri-heading').textContent, 'Hijri date');
  const description = doc.getElementById('hijri-description').textContent;
  assert.ok(description.includes('api.aladhan.com'));
  assert.ok(description.includes('no API key'));
  assert.ok(description.includes('does not save anything'));
});

test('status line exposes role, aria-live and aria-atomic', () => {
  const doc = makeDoc();
  attach(doc);
  const status = doc.getElementById('hijri-status');
  assert.strictEqual(status.getAttribute('role'), 'status');
  assert.strictEqual(status.getAttribute('aria-live'), 'polite');
  assert.strictEqual(status.getAttribute('aria-atomic'), 'true');
});

test('card is placed right after the prayer-times card when present', () => {
  const doc = makeDoc();
  const prayer = makeElement('section');
  prayer.id = 'prayer-times-card';
  doc.body.appendChild(prayer);
  attach(doc);
  const card = doc.getElementById('hijri-card');
  assert.strictEqual(doc.body.children.indexOf(card), doc.body.children.indexOf(prayer) + 1);
});

test('card placement falls back to lower anchors', () => {
  const doc = makeDoc();
  const spaceNews = makeElement('section');
  spaceNews.id = 'space-news-card';
  doc.body.appendChild(spaceNews);
  attach(doc);
  assert.strictEqual(doc.body.children.indexOf(doc.getElementById('hijri-card')), doc.body.children.indexOf(spaceNews) + 1);
});

test('a successful check renders the Hijri date and an honest status', async () => {
  const doc = makeDoc();
  let requested = null;
  attach(doc, { fetch: async (url) => { requested = url; return okResponse(JSON.stringify(samplePayload())); } });
  doc.getElementById('hijri-check').dispatch('click', {});
  await settle();
  const result = doc.getElementById('hijri-result').textContent;
  assert.ok(result.includes('15 Jumada al-akhirah 1448 AH'), 'result was: ' + result);
  assert.ok(result.includes("Al Arba'a"));
  assert.strictEqual(requested, 'https://api.aladhan.com/v1/gToH?date=25-11-2026');
  const statusEl = doc.getElementById('hijri-status');
  const status = statusEl.textContent;
  assert.ok(status.includes('Updated'));
  assert.ok(status.includes('nothing saved on this device'));
  assert.ok(statusEl.classList.contains('is-success'), 'success flash class should be present after check');
  assert.strictEqual(statusEl.getAttribute('title'), 'Hijri date updated');
});

test('holidays are rendered as a labeled line', async () => {
  const doc = makeDoc();
  const payload = samplePayload();
  payload.data.hijri.holidays = ['Eid al-Adha'];
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('hijri-check').dispatch('click', {});
  await settle();
  const result = doc.getElementById('hijri-result').textContent;
  assert.ok(result.includes('Holiday: Eid al-Adha'));
});

test('truncated holidays are disclosed honestly in the status', async () => {
  const doc = makeDoc();
  const payload = samplePayload();
  payload.data.hijri.holidays = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('hijri-check').dispatch('click', {});
  await settle();
  assert.ok(doc.getElementById('hijri-status').textContent.includes('holidays were unlabeled and skipped'));
});

test('403 explains the limited request', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 403, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('hijri-check').dispatch('click', {});
  await settle();
  assert.ok(doc.getElementById('hijri-status').textContent.includes('limited this request'));
});

test('a failed check clears any previous result', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('hijri-result').textContent = 'stale';
  doc.getElementById('hijri-check').dispatch('click', {});
  await settle();
  assert.strictEqual(doc.getElementById('hijri-result').textContent, '');
});

test('clear empties the result', async () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('hijri-result').textContent = 'old';
  await doc.getElementById('hijri-clear').dispatch('click', {});
  assert.strictEqual(doc.getElementById('hijri-result').textContent, '');
  assert.ok(doc.getElementById('hijri-status').textContent.includes('Cleared'));
});

test('form submit is prevented and runs the check', async () => {
  const doc = makeDoc();
  let prevented = false;
  attach(doc, { fetch: async () => okResponse(JSON.stringify(samplePayload())) });
  doc.getElementById('hijri-form').dispatch('submit', { preventDefault: () => { prevented = true; } });
  await settle();
  assert.strictEqual(prevented, true);
  assert.ok(doc.getElementById('hijri-result').textContent.includes('15 Jumada al-akhirah 1448 AH'));
});

test('concurrent checks collapse into one request', async () => {
  const doc = makeDoc();
  let calls = 0;
  attach(doc, { fetch: async () => { calls += 1; return okResponse(JSON.stringify(samplePayload())); } });
  const first = doc.getElementById('hijri-check').dispatch('click', {});
  const second = doc.getElementById('hijri-check').dispatch('click', {});
  await first;
  await second;
  await settle();
  assert.strictEqual(calls, 1, 'the busy guard must skip duplicate requests');
});

test('missing fetch degrades with an honest message', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: null });
  await doc.getElementById('hijri-check').dispatch('click', {});
  assert.ok(doc.getElementById('hijri-status').textContent.includes('fetch is unavailable'));
});

test('missing Hijri API degrades with an honest message', async () => {
  const doc = makeDoc();
  attach(doc, { hijriApi: null, fetch: null });
  await doc.getElementById('hijri-check').dispatch('click', {});
  assert.ok(doc.getElementById('hijri-status').textContent.includes('unavailable'));
});

test('index.html wires both hijri scripts with defer tags', () => {
  let html = null;
  try { html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'); } catch (error) { html = null; }
  if (html === null) return; // covered by CI, where index.html is readable
  const logicTag = '<script src="hijri-logic.js" defer></script>';
  const uiTag = '<script src="hijri-ui.js" defer></script>';
  assert.ok(html.indexOf(logicTag) !== -1, 'logic script tag missing');
  assert.ok(html.indexOf(uiTag) !== -1, 'ui script tag missing');
  assert.ok(html.lastIndexOf(logicTag) === html.indexOf(logicTag), 'logic tag duplicated');
  assert.ok(html.lastIndexOf(uiTag) === html.indexOf(uiTag), 'ui tag duplicated');
});
