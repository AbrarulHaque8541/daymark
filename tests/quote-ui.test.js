'use strict';

const test = require('node:test');
const assert = require('node:assert');

let ui;
if (typeof require === 'function') {
  ui = require('../quote-ui.js');
}
if (!ui) ui = globalThis.DaymarkQuoteUi;

function makeDoc() {
  const elements = {};
  const body = { appendChild() {}, parentNode: null };
  return {
    getElementById(id) { return elements[id] || null; },
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        id: '',
        className: '',
        textContent: '',
        attributes: {},
        children: [],
        parentNode: null,
        setAttribute(name, value) { this.attributes[name] = value; },
        getAttribute(name) { return this.attributes[name]; },
        appendChild(child) { this.children.push(child); child.parentNode = this; },
        removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); },
        addEventListener() {},
        classList: { toggle() {} }
      };
      return el;
    },
    body,
    _register(id, el) { elements[id] = el; }
  };
}

test('ensureCard creates the quote card after fact-card when present', () => {
  const doc = makeDoc();
  const fact = doc.createElement('aside');
  fact.id = 'fact-card';
  doc._register('fact-card', fact);
  fact.parentNode = { insertBefore(newNode, ref) { /* mock */ } };
  const card = ui.ensureCard(doc);
  assert.strictEqual(card.id, 'quote-card');
  assert.strictEqual(card.className, 'briefing-card');
  assert.ok(card.children.length > 0);
});

test('attachQuoteUi wires the form and status line', () => {
  const doc = makeDoc();
  const attached = ui.attachQuoteUi({ document: doc, quoteApi: null });
  assert.ok(attached);
  assert.ok(typeof attached.onCheck === 'function');
  assert.ok(typeof attached.onClear === 'function');
  assert.ok(typeof attached.detach === 'function');
});

test('busy guard prevents concurrent checks', async () => {
  const doc = makeDoc();
  let calls = 0;
  const api = {
    fetchesQuote: async () => {
      calls += 1;
      await new Promise(r => setTimeout(r, 10));
      return { text: 'Test', author: 'A', mode: 'today', truncated: false, link: 'https://zenquotes.io' };
    },
    classifiesError: () => null
  };
  const attached = ui.attachQuoteUi({ document: doc, quoteApi: api, fetch: async () => ({}) });
  const p1 = attached.onCheck();
  const p2 = attached.onCheck();
  await Promise.all([p1, p2]);
  assert.strictEqual(calls, 1);
});
