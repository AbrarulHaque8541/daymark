'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const logic = globalThis.DaymarkDictionary || require('../dictionary-logic.js');
const dictionaryUi = globalThis.DaymarkDictionaryUi || require('../dictionary-ui.js');

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
  return dictionaryUi.attachDictionaryUi(Object.assign({
    document: doc,
    window: {},
    dictionaryApi: logic,
    fetch: () => Promise.reject(new Error('no fetch in test')),
    now: () => '2026-11-14T05:00:00.000Z'
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
            return { done: false, value: new TextEncoder().encode(value) };
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
  body: streamOf([bodyText])
});

const payload = [
  {
    word: 'serendipity',
    phonetic: 'ser-en-dip-i-ty',
    meanings: [
      { partOfSpeech: 'noun', definitions: [{ definition: 'Happy chance.', example: 'A lucky find.' }] }
    ]
  }
];

const drain = async () => {
  for (let i = 0; i < 500; i += 1) await Promise.resolve();
};

test('attaches and injects the dictionary card', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('dictionary-card'));
});

test('reuses the existing card on a second attach', () => {
  const doc = makeDoc();
  attach(doc);
  attach(doc);
  assert.ok(doc.getElementById('dictionary-card').children.length > 0);
});

test('card heading and description are set', () => {
  const doc = makeDoc();
  attach(doc);
  assert.strictEqual(doc.getElementById('dictionary-heading').textContent, 'Dictionary lookup');
  assert.ok(doc.getElementById('dictionary-description').textContent.includes('api.dictionaryapi.dev'));
});

test('status line exposes role, aria-live and aria-atomic', () => {
  const doc = makeDoc();
  attach(doc);
  const status = doc.getElementById('dictionary-status');
  assert.strictEqual(status.getAttribute('role'), 'status');
  assert.strictEqual(status.getAttribute('aria-live'), 'polite');
  assert.strictEqual(status.getAttribute('aria-atomic'), 'true');
});

test('initial status invites a word', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('dictionary-status').textContent.includes('Type a word'));
});

test('card is placed right after the releases card when present', () => {
  const doc = makeDoc();
  const releases = makeElement('section');
  releases.id = 'releases-card';
  doc.body.appendChild(releases);
  attach(doc);
  const card = doc.getElementById('dictionary-card');
  assert.strictEqual(card.parentNode, doc.body);
  assert.strictEqual(doc.body.children.indexOf(card), doc.body.children.indexOf(releases) + 1);
});

test('empty input is blocked with guidance', () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('dictionary-lookup').dispatch('click', {});
  assert.ok(doc.getElementById('dictionary-status').textContent.includes('Type a word'));
});

test('a successful lookup renders the word, phonetics and definitions', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('dictionary-word').value = 'serendipity';
  doc.getElementById('dictionary-lookup').dispatch('click', {});
  await drain();
  const result = doc.getElementById('dictionary-result');
  assert.ok(result.textContent.includes('serendipity'));
  assert.ok(result.textContent.includes('Happy chance.'));
  assert.ok(result.textContent.includes('e.g. A lucky find.'));
});

test('status reports the update time and that nothing is saved', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('dictionary-word').value = 'serendipity';
  doc.getElementById('dictionary-lookup').dispatch('click', {});
  await drain();
  const status = doc.getElementById('dictionary-status').textContent;
  assert.ok(status.includes('Updated'));
  assert.ok(status.includes('not saved on this device'));
});

test('404 explains that no definition was found', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('dictionary-word').value = 'zzzzzzzq';
  doc.getElementById('dictionary-lookup').dispatch('click', {});
  await drain();
  assert.ok(doc.getElementById('dictionary-status').textContent.includes('No definition found'));
});

test('a failed lookup clears any previous result', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('dictionary-result').textContent = 'stale';
  doc.getElementById('dictionary-word').value = 'zzzzzzzq';
  doc.getElementById('dictionary-lookup').dispatch('click', {});
  await drain();
  assert.strictEqual(doc.getElementById('dictionary-result').textContent, '');
  assert.strictEqual(doc.getElementById('dictionary-result').children.length, 0);
});

test('a second tap while busy does not start a second request', async () => {
  const doc = makeDoc();
  let calls = 0;
  attach(doc, {
    fetch: async () => {
      calls += 1;
      await drain();
      return okResponse(JSON.stringify(payload));
    }
  });
  doc.getElementById('dictionary-word').value = 'serendipity';
  doc.getElementById('dictionary-lookup').dispatch('click', {});
  doc.getElementById('dictionary-lookup').dispatch('click', {});
  await drain();
  assert.strictEqual(calls, 1);
});

test('clear empties the input and the result', () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('dictionary-word').value = 'serendipity';
  doc.getElementById('dictionary-result').textContent = 'old';
  doc.getElementById('dictionary-clear').dispatch('click', {});
  assert.strictEqual(doc.getElementById('dictionary-word').value, '');
  assert.strictEqual(doc.getElementById('dictionary-result').textContent, '');
});

test('form submit is prevented and runs the lookup', async () => {
  const doc = makeDoc();
  let prevented = false;
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('dictionary-word').value = 'serendipity';
  doc.getElementById('dictionary-form').dispatch('submit', { preventDefault: () => { prevented = true; } });
  await drain();
  assert.strictEqual(prevented, true);
  assert.ok(doc.getElementById('dictionary-result').textContent.includes('serendipity'));
});

test('the Enter key triggers a lookup', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('dictionary-word').value = 'serendipity';
  doc.getElementById('dictionary-word').dispatch('keydown', { key: 'Enter', preventDefault: () => {} });
  await drain();
  assert.ok(doc.getElementById('dictionary-result').textContent.includes('serendipity'));
});

test('missing fetch degrades with an honest message', () => {
  const doc = makeDoc();
  attach(doc, { fetch: null });
  doc.getElementById('dictionary-word').value = 'serendipity';
  doc.getElementById('dictionary-lookup').dispatch('click', {});
  assert.ok(doc.getElementById('dictionary-status').textContent.includes('fetch is unavailable'));
});

test('missing dictionary API degrades with an honest message', async () => {
  const doc = makeDoc();
  const savedApi = globalThis.DaymarkDictionary;
  delete globalThis.DaymarkDictionary;
  try {
    attach(doc, { dictionaryApi: null });
    doc.getElementById('dictionary-word').value = 'serendipity';
    doc.getElementById('dictionary-lookup').dispatch('click', {});
    await drain();
  } finally {
    if (savedApi) globalThis.DaymarkDictionary = savedApi;
  }
  assert.ok(doc.getElementById('dictionary-status').textContent.includes('unavailable'));
});

test('index.html wires both dictionary modules with defer tags', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('<script src="dictionary-logic.js" defer></script>'));
  assert.ok(indexHtml.includes('<script src="dictionary-ui.js" defer></script>'));
});
