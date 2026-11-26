'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let ui;
let logic;
if (typeof require === 'function') {
  ui = require('../advice-ui.js');
  logic = require('../advice-logic.js');
}
if (!ui) ui = globalThis.DaymarkAdviceUi;
if (!logic) logic = globalThis.DaymarkAdvice;

function makeDoc(seedIds) {
  const byId = Object.assign({}, seedIds || {});
  const doc = {
    body: { appendChild() {} },
    readyState: 'complete',
    getElementById(id) { return byId[id] || null; },
    createElement(tag) {
      const node = {
        tagName: tag,
        children: [],
        attributes: {},
        className: '',
        _ownText: '',
        get textContent() {
          let aggregated = node._ownText;
          for (const child of node.children) aggregated += child.textContent;
          return aggregated;
        },
        set textContent(value) { node._ownText = String(value); node.children = []; },
        appendChild(child) { node.children.push(child); },
        addEventListener() {},
        setAttribute(name, value) { node.attributes[name] = value; },
        removeAttribute(name) { delete node.attributes[name]; }
      };
      return node;
    },
    addEventListener() {},
    __register(node) { byId[node.id] = node; }
  };
  // Register nodes with ids as they are created so getElementById finds them,
  // mirroring how a real DOM works for these hand-built trees.
  const originalCreate = doc.createElement;
  doc.createElement = function (tag) {
    const node = originalCreate(tag);
    if (node && typeof node !== 'undefined') {
      const originalSet = node.setAttribute;
      node.setAttribute = function (name, value) {
        originalSet(name, value);
        if (name === 'id' && value) byId[value] = node;
      };
      Object.defineProperty(node, 'id', {
        set(value) { node.attributes.id = value; byId[value] = node; },
        get() { return node.attributes && node.attributes.id ? node.attributes.id : undefined; },
        configurable: true
      });
      Object.defineProperty(node, 'firstChild', {
        get() { return node.children.length ? node.children[0] : null; },
        configurable: true
      });
      node.removeChild = function (child) {
        const idx = node.children.indexOf(child);
        if (idx !== -1) node.children.splice(idx, 1);
      };
    }
    return node;
  };
  return doc;
}

function anchorCard(id) {
  const node = {
    id: id,
    parentNode: {
      insertBefore(child, ref) { anchorCard.inserted.push({ child: child, ref: ref }); }
    }
  };
  return node;
}

test('attachAdviceUi requires a document', () => {
  assert.throws(() => ui.attachAdviceUi({}), /requires a document/);
});

test('ensureCard builds the full advice card structure', () => {
  const doc = makeDoc();
  const card = ui.ensureCard(doc);
  assert.strictEqual(card.id, 'advice-card');
  assert.strictEqual(card.className, 'briefing-card');
  const ids = card.children.map((c) => c.id);
  assert.ok(ids.indexOf('advice-heading') !== -1, 'heading exists');
  assert.ok(ids.indexOf('advice-description') !== -1, 'description exists');
  assert.ok(ids.indexOf('advice-form') !== -1, 'form exists');
  assert.ok(ids.indexOf('advice-status') !== -1, 'status exists');
  assert.ok(ids.indexOf('advice-result') !== -1, 'result exists');
});

test('ensureCard is idempotent: an existing card is returned unchanged', () => {
  const doc = makeDoc();
  const first = ui.ensureCard(doc);
  const second = ui.ensureCard(doc);
  assert.strictEqual(first, second);
});

test('ensureCard injects the card right after the xkcd card when present', () => {
  const inserted = [];
  const anchor = anchorCard('xkcd-card');
  const doc = makeDoc({ 'xkcd-card': anchor });
  anchor.parentNode.insertBefore = (child, ref) => inserted.push(child.id);
  ui.ensureCard(doc);
  assert.strictEqual(inserted.length, 1);
  assert.strictEqual(inserted[0], 'advice-card');
});

test('ensureCard falls back through the glance-card anchors', () => {
  const inserted = [];
  const anchor = anchorCard('weather-card');
  const doc = makeDoc({ 'weather-card': anchor });
  anchor.parentNode.insertBefore = (child) => inserted.push(child.id);
  ui.ensureCard(doc);
  assert.strictEqual(inserted[0], 'advice-card');
});

test('attachAdviceUi wires the form, check and clear controls', () => {
  const doc = makeDoc();
  const handle = ui.attachAdviceUi({ document: doc, fetch: () => Promise.resolve({}) });
  assert.ok(handle && typeof handle.onCheck === 'function');
  assert.ok(typeof handle.onClear === 'function');
  assert.ok(typeof handle.detach === 'function');
});

test('a successful check renders the advice and an honest success status', async () => {
  const calls = [];
  const doc = makeDoc();
  const payloadText = JSON.stringify(samplePayload());
  const fetchImpl = async (url) => { calls.push(url); return { ok: true, status: 200, headers: { get: () => null }, body: streamOf([payloadText]), text: async () => payloadText }; };
  const handle = ui.attachAdviceUi({ document: doc, fetch: fetchImpl, now: () => '2026-11-26T12:00:00Z', adviceApi: logic });
  let caught = null;
  try { await handle.onCheck(); } catch (error) { caught = error && error.message; }
  const status = doc.getElementById('advice-status');
  const result = doc.getElementById('advice-result');
  assert.ok(status.textContent.indexOf('Updated · 2026-11-26 12:00 UTC') !== -1, 'status was: ' + status.textContent + ' caught: ' + caught);
  assert.ok(status.textContent.indexOf('nothing saved on this device') !== -1, 'status was: ' + status.textContent);
  assert.ok(result.textContent.indexOf('Do not fall in love with the first thing that catches your eye; look twice.') !== -1, 'result was: ' + result.textContent);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0], 'https://api.adviceslip.com/advice');
});

test('a successful render links to the adviceslip.com page', async () => {
  const doc = makeDoc();
  const fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => null }, body: streamOf([JSON.stringify(samplePayload())]), text: async () => JSON.stringify(samplePayload()) });
  const handle = ui.attachAdviceUi({ document: doc, fetch: fetchImpl, adviceApi: logic });
  await handle.onCheck();
  const result = doc.getElementById('advice-result');
  assert.ok(result.textContent.includes('https://adviceslip.com/advice') || JSON.stringify(result.children).includes('adviceslip.com'));
});

test('a failed check shows a friendly message and clears the result', async () => {
  const doc = makeDoc();
  const failing = async () => ({ ok: false, status: 503, headers: { get: () => null }, body: streamOf(['{}']) });
  const handle = ui.attachAdviceUi({ document: doc, fetch: failing, adviceApi: logic });
  await handle.onCheck();
  const status = doc.getElementById('advice-status');
  const result = doc.getElementById('advice-result');
  assert.ok(status.textContent.includes('server problem'));
  assert.strictEqual(result.children.length, 0);
});

test('a busy check is a no-op until the first one settles', async () => {
  const doc = makeDoc();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const slow = async () => { calls += 1; await gate; return { ok: true, status: 200, headers: { get: () => null }, body: streamOf([JSON.stringify(samplePayload())]), text: async () => JSON.stringify(samplePayload()) }; };
  const handle = ui.attachAdviceUi({ document: doc, fetch: slow, adviceApi: logic });
  const first = handle.onCheck();
  await handle.onCheck();
  release();
  await first;
  assert.strictEqual(calls, 1);
});

test('a check with fetch unavailable reports honestly', async () => {
  const doc = makeDoc();
  const handle = ui.attachAdviceUi({ document: doc, window: {}, fetch: null, adviceApi: logic });
  await handle.onCheck();
  const status = doc.getElementById('advice-status');
  assert.ok(status.textContent.includes('fetch is unavailable'));
});

test('a check with the logic module unavailable reports honestly', async () => {
  const doc = makeDoc();
  const handle = ui.attachAdviceUi({ document: doc, window: {}, fetch: () => Promise.resolve({}), adviceApi: null });
  await handle.onCheck();
  const status = doc.getElementById('advice-status');
  assert.ok(status.textContent.includes('unavailable in this environment'));
});

test('onClear empties the result and resets the status', async () => {
  const doc = makeDoc();
  const fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => null }, body: streamOf([JSON.stringify(samplePayload())]), text: async () => JSON.stringify(samplePayload()) });
  const handle = ui.attachAdviceUi({ document: doc, fetch: fetchImpl, adviceApi: logic });
  await handle.onCheck();
  handle.onClear();
  const status = doc.getElementById('advice-status');
  const result = doc.getElementById('advice-result');
  assert.ok(status.textContent.includes('Cleared. Tap Check'));
  assert.strictEqual(result.children.length, 0);
});

test('attachAdviceUi does not touch localStorage at boot', () => {
  const doc = makeDoc();
  let storageTouched = false;
  const env = {
    document: doc,
    fetch: () => Promise.resolve({}),
    adviceApi: logic
  };
  Object.defineProperty(env, 'localStorage', {
    get() { storageTouched = true; return {}; },
    configurable: true
  });
  ui.attachAdviceUi(env);
  assert.strictEqual(storageTouched, false);
});

test('the module boots against a real window and document (vm-safe, no timers required)', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'advice-ui.js'), 'utf8');
  const doc = makeDoc();
  const windowShim = {};
  const factory = new Function('document', 'window', 'globalThis', source);
  factory(doc, windowShim, undefined);
  const card = doc.getElementById('advice-card');
  assert.ok(card, 'advice-card was injected at boot');
});

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

function samplePayload() {
  return {
    slip: {
      id: 217,
      advice: 'Do not fall in love with the first thing that catches your eye; look twice.'
    }
  };
}
