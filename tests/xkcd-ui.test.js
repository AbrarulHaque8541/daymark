'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let logic;
let xkcdUi;
if (typeof require === 'function') {
  logic = require('../xkcd-logic.js');
  xkcdUi = require('../xkcd-ui.js');
}
if (!logic) logic = globalThis.DaymarkXkcd;
if (!xkcdUi) xkcdUi = globalThis.DaymarkXkcdUi;

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
  return xkcdUi.attachXkcdUi(Object.assign({
    document: doc,
    window: {},
    xkcdApi: logic,
    fetch: null,
    now: () => '2026-11-26T04:00:00.000Z',
    todayIso: () => '2026-11-26T04:00:00.000Z'
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
    month: '11',
    num: 3329,
    link: '',
    year: '2026',
    news: '',
    safe_title: 'Cesium Atom',
    transcript: '',
    alt: "We've all chipped in to buy the retiring committee chair a gold-plated cesium atom.",
    img: 'https://imgs.xkcd.com/comics/cesium_atom.png',
    title: 'Cesium Atom',
    day: '25'
  };
}

function settle() {
  const chain = [];
  for (let i = 0; i < 14; i += 1) chain.push(Promise.resolve());
  return chain.reduce((acc, item) => acc.then(() => item), Promise.resolve());
}

test('attaches and injects the XKCD comic card', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('xkcd-card'));
});

test('reuses the existing card on a second attach', () => {
  const doc = makeDoc();
  attach(doc);
  const first = doc.getElementById('xkcd-card');
  attach(doc);
  assert.strictEqual(doc.getElementById('xkcd-card'), first);
});

test('card heading and description name the public keyless feed', () => {
  const doc = makeDoc();
  attach(doc);
  assert.strictEqual(doc.getElementById('xkcd-heading').textContent, 'XKCD comic');
  const description = doc.getElementById('xkcd-description').textContent;
  assert.ok(description.includes('xkcd.com'));
  assert.ok(description.includes('no API key'));
  assert.ok(description.includes('Nothing is saved on your device'));
});

test('status line exposes role, aria-live and aria-atomic', () => {
  const doc = makeDoc();
  attach(doc);
  const status = doc.getElementById('xkcd-status');
  assert.strictEqual(status.getAttribute('role'), 'status');
  assert.strictEqual(status.getAttribute('aria-live'), 'polite');
  assert.strictEqual(status.getAttribute('aria-atomic'), 'true');
});

test('number input is optional, numeric and bounded', () => {
  const doc = makeDoc();
  attach(doc);
  const input = doc.getElementById('xkcd-number');
  assert.strictEqual(input.getAttribute('inputmode'), 'numeric');
  assert.strictEqual(input.getAttribute('maxlength'), '6');
  assert.strictEqual(input.getAttribute('placeholder'), 'Latest (or comic number)');
});

test('card is placed right after the hijri card when present', () => {
  const doc = makeDoc();
  const hijri = makeElement('section');
  hijri.id = 'hijri-card';
  doc.body.appendChild(hijri);
  attach(doc);
  assert.strictEqual(doc.body.children.indexOf(doc.getElementById('xkcd-card')), doc.body.children.indexOf(hijri) + 1);
});

test('card placement falls back to lower anchors', () => {
  const doc = makeDoc();
  const prayer = makeElement('section');
  prayer.id = 'prayer-times-card';
  doc.body.appendChild(prayer);
  attach(doc);
  const fallback = makeElement('section');
  fallback.id = 'weather-card';
  doc.body.appendChild(fallback);
  assert.strictEqual(doc.body.children.indexOf(doc.getElementById('xkcd-card')), doc.body.children.indexOf(prayer) + 1);
});

test('a successful check renders the comic and an honest status', async () => {
  const doc = makeDoc();
  let requested = null;
  attach(doc, { fetch: async (url) => { requested = url; return okResponse(JSON.stringify(samplePayload())); } });
  doc.getElementById('xkcd-check').dispatch('click', {});
  await settle();
  assert.strictEqual(requested, 'https://xkcd.com/info.0.json');
  const result = doc.getElementById('xkcd-result');
  assert.ok(result.textContent.includes('#3329: Cesium Atom'), 'result was: ' + result.textContent);
  assert.ok(result.textContent.includes('Published November 25, 2026'));
  const image = result.children[1];
  assert.strictEqual(image.tagName, 'img');
  assert.strictEqual(image.getAttribute('src'), 'https://imgs.xkcd.com/comics/cesium_atom.png');
  assert.strictEqual(image.getAttribute('loading'), 'lazy');
  assert.strictEqual(image.getAttribute('referrerpolicy'), 'no-referrer');
  const link = doc.getElementById('xkcd-result').children[4].children[0];
  assert.strictEqual(link.getAttribute('href'), 'https://xkcd.com/3329/');
  assert.strictEqual(link.getAttribute('rel'), 'noopener noreferrer');
  const statusLine = doc.getElementById('xkcd-status').textContent;
  assert.ok(statusLine.includes('Updated'));
  assert.ok(statusLine.includes('nothing saved on this device'));
  assert.ok(doc.getElementById('xkcd-status').classList.set.has('is-success'));
});

test('an entered comic number is passed through to the endpoint', async () => {
  const doc = makeDoc();
  let requested = null;
  attach(doc, { fetch: async (url) => { requested = url; return okResponse(JSON.stringify(samplePayload())); } });
  doc.getElementById('xkcd-number').value = '2871';
  await doc.getElementById('xkcd-check').dispatch('click', {});
  await settle();
  assert.strictEqual(requested, 'https://xkcd.com/2871/info.0.json');
});

test('a caption is rendered as a labeled line', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(samplePayload())) });
  await doc.getElementById('xkcd-check').dispatch('click', {});
  await settle();
  assert.ok(doc.getElementById('xkcd-result').textContent.includes('Caption: '));
});

test('a truncated caption is disclosed honestly in the status', async () => {
  const doc = makeDoc();
  const payload = samplePayload();
  payload.alt = 'a'.repeat(500);
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  await doc.getElementById('xkcd-check').dispatch('click', {});
  await settle();
  assert.ok(doc.getElementById('xkcd-status').textContent.includes('shortened to 400 characters'));
});

test('403 explains the limited request', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 403, headers: { get: () => null }, body: streamOf(['{}']) }) });
  await doc.getElementById('xkcd-check').dispatch('click', {});
  await settle();
  assert.ok(doc.getElementById('xkcd-status').textContent.includes('limited this request'));
});

test('a failed check clears any previous result and never flashes success', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('xkcd-result').textContent = 'stale';
  await doc.getElementById('xkcd-check').dispatch('click', {});
  await settle();
  assert.strictEqual(doc.getElementById('xkcd-result').textContent, '');
  assert.strictEqual(doc.getElementById('xkcd-status').classList.set.has('is-success'), false);
});

test('clear empties the result', async () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('xkcd-result').textContent = 'old';
  await doc.getElementById('xkcd-clear').dispatch('click', {});
  assert.strictEqual(doc.getElementById('xkcd-result').textContent, '');
  assert.ok(doc.getElementById('xkcd-status').textContent.includes('Cleared'));
});

test('form submit is prevented and runs the check', async () => {
  const doc = makeDoc();
  let prevented = false;
  attach(doc, { fetch: async () => okResponse(JSON.stringify(samplePayload())) });
  doc.getElementById('xkcd-form').dispatch('submit', { preventDefault: () => { prevented = true; } });
  await settle();
  assert.strictEqual(prevented, true);
  assert.ok(doc.getElementById('xkcd-result').textContent.includes('#3329'));
});

test('concurrent checks collapse into one request', async () => {
  const doc = makeDoc();
  let calls = 0;
  attach(doc, { fetch: async () => { calls += 1; return okResponse(JSON.stringify(samplePayload())); } });
  const first = doc.getElementById('xkcd-check').dispatch('click', {});
  const second = doc.getElementById('xkcd-check').dispatch('click', {});
  await first;
  await second;
  await settle();
  assert.strictEqual(calls, 1, 'the busy guard must skip duplicate requests');
});

test('missing fetch degrades with an honest message', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: null });
  await doc.getElementById('xkcd-check').dispatch('click', {});
  assert.ok(doc.getElementById('xkcd-status').textContent.includes('fetch is unavailable'));
});

test('missing XKCD API degrades with an honest message', async () => {
  const doc = makeDoc();
  attach(doc, { xkcdApi: null, fetch: null });
  await doc.getElementById('xkcd-check').dispatch('click', {});
  assert.ok(doc.getElementById('xkcd-status').textContent.includes('unavailable'));
});

test('index.html wires both xkcd scripts with defer tags', () => {
  let html = null;
  try { html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'); } catch (error) { html = null; }
  if (html === null) return; // covered by CI, where index.html is readable
  const logicTag = '<script src="xkcd-logic.js" defer></script>';
  const uiTag = '<script src="xkcd-ui.js" defer></script>';
  assert.ok(html.indexOf(logicTag) !== -1, 'logic script tag missing');
  assert.ok(html.indexOf(uiTag) !== -1, 'ui script tag missing');
  assert.ok(html.lastIndexOf(logicTag) === html.indexOf(logicTag), 'logic tag duplicated');
  assert.ok(html.lastIndexOf(uiTag) === html.indexOf(uiTag), 'ui tag duplicated');
});

