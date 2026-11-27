'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let ui;
let logic;
if (typeof require === 'function') {
  ui = require('../quote-ui.js');
  logic = require('../quote-logic.js');
}
if (!ui) ui = globalThis.DaymarkQuoteUi;
if (!logic) logic = globalThis.DaymarkQuote;

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

function sampleQuote() {
  return [{
    q: 'The only way to do great work is to love what you do.',
    a: 'Steve Jobs'
  }];
}

test('attachQuoteUi requires a document', () => {
  assert.throws(() => ui.attachQuoteUi({}), /requires a document/);
});

test('ensureCard builds the full quote card structure', () => {
  const doc = makeDoc();
  const card = ui.ensureCard(doc);
  assert.strictEqual(card.id, 'quote-card');
  assert.strictEqual(card.className, 'briefing-card');
  const ids = card.children.map((c) => c.id);
  assert.ok(ids.indexOf('quote-heading') !== -1);
  assert.ok(ids.indexOf('quote-description') !== -1);
  assert.ok(ids.indexOf('quote-form') !== -1);
  assert.ok(ids.indexOf('quote-status') !== -1);
  assert.ok(ids.indexOf('quote-result') !== -1);
});

test('ensureCard is idempotent', () => {
  const doc = makeDoc();
  const first = ui.ensureCard(doc);
  const second = ui.ensureCard(doc);
  assert.strictEqual(first, second);
});

test('ensureCard injects the card right after the fact card when present', () => {
  const inserted = [];
  const anchor = anchorCard('fact-card');
  const doc = makeDoc({ 'fact-card': anchor });
  anchor.parentNode.insertBefore = (child) => inserted.push(child.id);
  ui.ensureCard(doc);
  assert.strictEqual(inserted[0], 'quote-card');
});

test('a successful check renders the quote and an honest success status', async () => {
  const doc = makeDoc();
  const payloadText = JSON.stringify(sampleQuote());
  const fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => null }, body: streamOf([payloadText]), text: async () => payloadText });
  const handle = ui.attachQuoteUi({ document: doc, fetch: fetchImpl, now: () => '2026-11-27T12:00:00Z', quoteApi: logic });
  await handle.onCheck();
  const status = doc.getElementById('quote-status');
  const result = doc.getElementById('quote-result');
  assert.ok(status.textContent.indexOf('Updated · 2026-11-27 12:00 UTC') !== -1);
  assert.ok(status.textContent.indexOf('nothing saved on this device') !== -1);
  assert.ok(result.textContent.indexOf('great work') !== -1);
});

test('onClear empties the result and resets the status', async () => {
  const doc = makeDoc();
  const payloadText = JSON.stringify(sampleQuote());
  const fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => null }, body: streamOf([payloadText]), text: async () => payloadText });
  const handle = ui.attachQuoteUi({ document: doc, fetch: fetchImpl, quoteApi: logic });
  await handle.onCheck();
  handle.onClear();
  const status = doc.getElementById('quote-status');
  const result = doc.getElementById('quote-result');
  assert.ok(status.textContent.includes('Cleared. Tap Check'));
  assert.strictEqual(result.children.length, 0);
});

test('index.html wires quote-logic.js and quote-ui.js as defer scripts after the fact card', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const logicTag = '<script src="quote-logic.js" defer></script>';
  const uiTag = '<script src="quote-ui.js" defer></script>';
  const factUiTag = '<script src="fact-ui.js" defer></script>';
  assert.ok(indexHtml.includes(logicTag), 'quote-logic.js defer tag present');
  assert.ok(indexHtml.includes(uiTag), 'quote-ui.js defer tag present');
  assert.ok(indexHtml.indexOf(logicTag) < indexHtml.indexOf(uiTag));
  assert.ok(indexHtml.indexOf(factUiTag) !== -1 && indexHtml.indexOf(factUiTag) < indexHtml.indexOf(logicTag));
});
