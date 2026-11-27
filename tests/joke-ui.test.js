'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let ui;
let logic;
if (typeof require === 'function') {
  ui = require('../joke-ui.js');
  logic = require('../joke-logic.js');
}
if (!ui) ui = globalThis.DaymarkJokeUi;
if (!logic) logic = globalThis.DaymarkJoke;

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

test('attachJokeUi requires a document', () => {
  assert.throws(() => ui.attachJokeUi({}), /requires a document/);
});

test('ensureCard builds the full joke card structure', () => {
  const doc = makeDoc();
  const card = ui.ensureCard(doc);
  assert.strictEqual(card.id, 'joke-card');
  assert.strictEqual(card.className, 'briefing-card');
  const ids = card.children.map((c) => c.id);
  assert.ok(ids.indexOf('joke-heading') !== -1, 'heading exists');
  assert.ok(ids.indexOf('joke-description') !== -1, 'description exists');
  assert.ok(ids.indexOf('joke-form') !== -1, 'form exists');
  assert.ok(ids.indexOf('joke-status') !== -1, 'status exists');
  assert.ok(ids.indexOf('joke-result') !== -1, 'result exists');
});

test('ensureCard is idempotent: an existing card is returned unchanged', () => {
  const doc = makeDoc();
  const first = ui.ensureCard(doc);
  const second = ui.ensureCard(doc);
  assert.strictEqual(first, second);
});

test('ensureCard injects the card right after the advice card when present', () => {
  const inserted = [];
  const anchor = anchorCard('advice-card');
  const doc = makeDoc({ 'advice-card': anchor });
  anchor.parentNode.insertBefore = (child, ref) => inserted.push(child.id);
  ui.ensureCard(doc);
  assert.strictEqual(inserted.length, 1);
  assert.strictEqual(inserted[0], 'joke-card');
});

test('ensureCard falls back through the glance-card anchors', () => {
  const inserted = [];
  const anchor = anchorCard('weather-card');
  const doc = makeDoc({ 'weather-card': anchor });
  anchor.parentNode.insertBefore = (child) => inserted.push(child.id);
  ui.ensureCard(doc);
  assert.strictEqual(inserted[0], 'joke-card');
});

test('attachJokeUi wires the form, check and clear controls', () => {
  const doc = makeDoc();
  const handle = ui.attachJokeUi({ document: doc, fetch: () => Promise.resolve({}) });
  assert.ok(handle && typeof handle.onCheck === 'function');
  assert.ok(typeof handle.onClear === 'function');
  assert.ok(typeof handle.detach === 'function');
});

test('a successful check renders the joke and an honest success status', async () => {
  const calls = [];
  const doc = makeDoc();
  const payloadText = JSON.stringify(sampleSingle());
  const fetchImpl = async (url) => { calls.push(url); return { ok: true, status: 200, headers: { get: () => null }, body: streamOf([payloadText]), text: async () => payloadText }; };
  const handle = ui.attachJokeUi({ document: doc, fetch: fetchImpl, now: () => '2026-11-27T12:00:00Z', jokeApi: logic });
  let caught = null;
  try { await handle.onCheck(); } catch (error) { caught = error && error.message; }
  const status = doc.getElementById('joke-status');
  const result = doc.getElementById('joke-result');
  assert.ok(status.textContent.indexOf('Updated · 2026-11-27 12:00 UTC') !== -1, 'status was: ' + status.textContent + ' caught: ' + caught);
  assert.ok(status.textContent.indexOf('nothing saved on this device') !== -1, 'status was: ' + status.textContent);
  assert.ok(result.textContent.indexOf('bedside table') !== -1, 'result was: ' + result.textContent + ' caught: ' + caught);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0], 'https://v2.jokeapi.dev/joke/Any?safe-mode&type=single,twopart');
});

test('a successful twopart check renders setup and delivery', async () => {
  const doc = makeDoc();
  const payloadText = JSON.stringify(sampleTwopart());
  const fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => null }, body: streamOf([payloadText]), text: async () => payloadText });
  const handle = ui.attachJokeUi({ document: doc, fetch: fetchImpl, jokeApi: logic });
  await handle.onCheck();
  const result = doc.getElementById('joke-result');
  assert.ok(result.textContent.includes('Why do programmers prefer dark mode?'));
  assert.ok(result.textContent.includes('Because light attracts bugs.'));
  assert.ok(result.textContent.includes('safe mode'));
});

test('a successful render links to jokeapi.dev', async () => {
  const doc = makeDoc();
  const payloadText = JSON.stringify(sampleSingle());
  const fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => null }, body: streamOf([payloadText]), text: async () => payloadText });
  const handle = ui.attachJokeUi({ document: doc, fetch: fetchImpl, jokeApi: logic });
  await handle.onCheck();
  const result = doc.getElementById('joke-result');
  assert.ok(JSON.stringify(result.children).includes('jokeapi.dev'));
});

test('a truncated joke discloses the truncation in the status', async () => {
  const doc = makeDoc();
  const payload = sampleSingle();
  payload.joke = 'x'.repeat(500);
  const payloadText = JSON.stringify(payload);
  const fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => null }, body: streamOf([payloadText]), text: async () => payloadText });
  const handle = ui.attachJokeUi({ document: doc, fetch: fetchImpl, jokeApi: logic });
  await handle.onCheck();
  const status = doc.getElementById('joke-status');
  assert.ok(status.textContent.includes('the joke was shortened to 400 characters'), 'status was: ' + status.textContent);
});

test('a failed check shows a friendly message and clears the result', async () => {
  const doc = makeDoc();
  const failing = async () => ({ ok: false, status: 503, headers: { get: () => null }, body: streamOf(['{}']) });
  const handle = ui.attachJokeUi({ document: doc, fetch: failing, jokeApi: logic });
  await handle.onCheck();
  const status = doc.getElementById('joke-status');
  const result = doc.getElementById('joke-result');
  assert.ok(status.textContent.includes('server problem'));
  assert.strictEqual(result.children.length, 0);
});

test('a busy check is a no-op until the first one settles', async () => {
  const doc = makeDoc();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const payloadText = JSON.stringify(sampleSingle());
  const slow = async () => { calls += 1; await gate; return { ok: true, status: 200, headers: { get: () => null }, body: streamOf([payloadText]), text: async () => payloadText }; };
  const handle = ui.attachJokeUi({ document: doc, fetch: slow, jokeApi: logic });
  const first = handle.onCheck();
  await handle.onCheck();
  release();
  await first;
  assert.strictEqual(calls, 1);
});

test('a check with fetch unavailable reports honestly', async () => {
  const doc = makeDoc();
  const handle = ui.attachJokeUi({ document: doc, window: {}, fetch: null, jokeApi: logic });
  await handle.onCheck();
  const status = doc.getElementById('joke-status');
  assert.ok(status.textContent.includes('fetch is unavailable'));
});

test('a check with the logic module unavailable reports honestly', async () => {
  const doc = makeDoc();
  const handle = ui.attachJokeUi({ document: doc, fetch: () => Promise.resolve({}), jokeApi: null });
  await handle.onCheck();
  const status = doc.getElementById('joke-status');
  assert.ok(status.textContent.includes('unavailable in this environment'));
});

test('onClear empties the result and resets the status', async () => {
  const doc = makeDoc();
  const payloadText = JSON.stringify(sampleSingle());
  const fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => null }, body: streamOf([payloadText]), text: async () => payloadText });
  const handle = ui.attachJokeUi({ document: doc, fetch: fetchImpl, jokeApi: logic });
  await handle.onCheck();
  handle.onClear();
  const status = doc.getElementById('joke-status');
  const result = doc.getElementById('joke-result');
  assert.ok(status.textContent.includes('Cleared. Tap Check'));
  assert.strictEqual(result.children.length, 0);
});

test('attachJokeUi does not touch localStorage at boot', () => {
  const doc = makeDoc();
  let storageTouched = false;
  const env = {
    document: doc,
    fetch: () => Promise.resolve({}),
    jokeApi: logic
  };
  Object.defineProperty(env, 'localStorage', {
    get() { storageTouched = true; return {}; },
    configurable: true
  });
  ui.attachJokeUi(env);
  assert.strictEqual(storageTouched, false);
});

test('the module boots against a real window and document (vm-safe, no timers required)', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'joke-ui.js'), 'utf8');
  const doc = makeDoc();
  const windowShim = {};
  const factory = new Function('document', 'window', 'globalThis', source);
  factory(doc, windowShim, undefined);
  const card = doc.getElementById('joke-card');
  assert.ok(card, 'joke-card was injected at boot');
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

function sampleSingle() {
  return {
    error: false,
    category: 'Programming',
    type: 'single',
    joke: 'A programmer puts two glasses on his bedside table before going to sleep: a full one, in case he gets thirsty, and an empty one, in case he does not.',
    id: 7
  };
}

function sampleTwopart() {
  return {
    error: false,
    category: 'Miscellaneous',
    type: 'twopart',
    setup: 'Why do programmers prefer dark mode?',
    delivery: 'Because light attracts bugs.',
    id: 42
  };
}
