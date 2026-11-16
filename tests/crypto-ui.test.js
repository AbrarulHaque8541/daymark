'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const logic = globalThis.DaymarkCrypto || require('../crypto-logic.js');
const cryptoUi = globalThis.DaymarkCryptoUi || require('../crypto-ui.js');

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
    selected: false,
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
  return cryptoUi.attachCryptoUi(Object.assign({
    document: doc,
    window: {},
    cryptoApi: logic,
    fetch: () => Promise.reject(new Error('no fetch in test')),
    now: () => '2026-11-16T12:00:00.000Z'
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

const payload = { data: { currency: 'BTC', rates: { INR: '7341205.51' } } };

const drain = async () => {
  for (let i = 0; i < 500; i += 1) await Promise.resolve();
};

test('attaches and injects the crypto card', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('crypto-card'));
});

test('reuses the existing card on a second attach', () => {
  const doc = makeDoc();
  attach(doc);
  attach(doc);
  assert.ok(doc.getElementById('crypto-card').children.length > 0);
});

test('card heading and description are set', () => {
  const doc = makeDoc();
  attach(doc);
  assert.strictEqual(doc.getElementById('crypto-heading').textContent, 'Crypto glance');
  assert.ok(doc.getElementById('crypto-description').textContent.includes('api.coinbase.com'));
  assert.ok(doc.getElementById('crypto-description').textContent.includes('Nothing is saved'));
});

test('status line exposes role, aria-live and aria-atomic', () => {
  const doc = makeDoc();
  attach(doc);
  const status = doc.getElementById('crypto-status');
  assert.strictEqual(status.getAttribute('role'), 'status');
  assert.strictEqual(status.getAttribute('aria-live'), 'polite');
  assert.strictEqual(status.getAttribute('aria-atomic'), 'true');
});

test('initial status invites a check', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('crypto-status').textContent.includes('tap Check'));
});

test('coin and fiat selects are populated with the logic catalogs', () => {
  const doc = makeDoc();
  attach(doc);
  const coinSelect = doc.getElementById('crypto-coin');
  const fiatSelect = doc.getElementById('crypto-fiat');
  const coinValues = coinSelect.children.map((option) => option.value);
  const fiatValues = fiatSelect.children.map((option) => option.value);
  assert.deepStrictEqual(coinValues, logic.COINS);
  assert.deepStrictEqual(fiatValues, logic.FIATS);
  assert.strictEqual(coinSelect.children[0].selected, true);
  assert.strictEqual(fiatSelect.children[0].selected, true);
});

test('card is placed right after the onthisday card when present', () => {
  const doc = makeDoc();
  const onthisday = makeElement('section');
  onthisday.id = 'onthisday-card';
  doc.body.appendChild(onthisday);
  attach(doc);
  const card = doc.getElementById('crypto-card');
  assert.strictEqual(card.parentNode, doc.body);
  assert.strictEqual(doc.body.children.indexOf(card), doc.body.children.indexOf(onthisday) + 1);
});

test('card falls back after the releases card when onthisday is absent', () => {
  const doc = makeDoc();
  const releases = makeElement('section');
  releases.id = 'releases-card';
  doc.body.appendChild(releases);
  attach(doc);
  const card = doc.getElementById('crypto-card');
  assert.strictEqual(doc.body.children.indexOf(card), doc.body.children.indexOf(releases) + 1);
});

test('a successful check renders the rate line and the source note', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('crypto-check').dispatch('click', {});
  await drain();
  const result = doc.getElementById('crypto-result');
  assert.ok(result.textContent.includes('1 BTC = 7,341,205.51 INR'));
  assert.ok(result.textContent.includes('Coinbase public rates'));
});

test('status reports the update time and that nothing is saved', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('crypto-check').dispatch('click', {});
  await drain();
  const status = doc.getElementById('crypto-status').textContent;
  assert.ok(status.includes('Updated'));
  assert.ok(status.includes('not saved on this device'));
});

test('a rate limit explains the limit in plain words', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 429, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('crypto-check').dispatch('click', {});
  await drain();
  assert.ok(doc.getElementById('crypto-status').textContent.includes('limited'));
});

test('a failed check clears any previous result', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 500, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('crypto-result').textContent = 'stale';
  doc.getElementById('crypto-check').dispatch('click', {});
  await drain();
  assert.strictEqual(doc.getElementById('crypto-result').textContent, '');
  assert.strictEqual(doc.getElementById('crypto-result').children.length, 0);
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
  doc.getElementById('crypto-check').dispatch('click', {});
  doc.getElementById('crypto-check').dispatch('click', {});
  await drain();
  assert.strictEqual(calls, 1);
});

test('clear empties the result and resets the status line', () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('crypto-result').textContent = 'old';
  doc.getElementById('crypto-clear').dispatch('click', {});
  assert.strictEqual(doc.getElementById('crypto-result').textContent, '');
  assert.ok(doc.getElementById('crypto-status').textContent.includes('Cleared'));
});

test('form submit is prevented and runs the check', async () => {
  const doc = makeDoc();
  let prevented = false;
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('crypto-form').dispatch('submit', { preventDefault: () => { prevented = true; } });
  await drain();
  assert.strictEqual(prevented, true);
  assert.ok(doc.getElementById('crypto-result').textContent.includes('1 BTC'));
});

test('missing fetch degrades with an honest message', () => {
  const doc = makeDoc();
  attach(doc, { fetch: null });
  doc.getElementById('crypto-check').dispatch('click', {});
  assert.ok(doc.getElementById('crypto-status').textContent.includes('fetch is unavailable'));
});

test('missing crypto API degrades with an honest message', async () => {
  const doc = makeDoc();
  const savedApi = globalThis.DaymarkCrypto;
  delete globalThis.DaymarkCrypto;
  try {
    attach(doc, { cryptoApi: null });
    doc.getElementById('crypto-check').dispatch('click', {});
    await drain();
  } finally {
    if (savedApi) globalThis.DaymarkCrypto = savedApi;
  }
  assert.ok(doc.getElementById('crypto-status').textContent.includes('unavailable'));
});

test('the card reads nothing from localStorage at boot', () => {
  const doc = makeDoc();
  let storageTouched = false;
  const env = {
    document: doc,
    window: {},
    cryptoApi: logic,
    fetch: () => Promise.reject(new Error('no fetch in test'))
  };
  env.window.localStorage = {
    getItem: () => { storageTouched = true; return null; },
    setItem: () => { storageTouched = true; }
  };
  cryptoUi.attachCryptoUi(env);
  assert.strictEqual(storageTouched, false);
});

test('index.html wires both crypto modules with defer tags', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('<script src="crypto-logic.js" defer></script>'));
  assert.ok(indexHtml.includes('<script src="crypto-ui.js" defer></script>'));
});
