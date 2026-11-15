'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const logic = globalThis.DaymarkOnThisDay || require('../onthisday-logic.js');
const onThisDayUi = globalThis.DaymarkOnThisDayUi || require('../onthisday-ui.js');

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
  return onThisDayUi.attachOnThisDayUi(Object.assign({
    document: doc,
    window: {},
    onThisDayApi: logic,
    fetch: () => Promise.reject(new Error('no fetch in test')),
    now: () => '2026-11-15T10:00:00.000Z'
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

const payload = {
  selected: [
    {
      year: 1926,
      text: 'NBC opened with a radio show.',
      pages: [{ content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/NBC' } } }]
    },
    { year: 1943, text: 'The Pentagon was completed.', pages: [] }
  ]
};

const drain = async () => {
  for (let i = 0; i < 100; i += 1) await Promise.resolve();
};

test('attaches and injects the on-this-day card', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('onthisday-card'));
});

test('reuses the existing card on a second attach', () => {
  const doc = makeDoc();
  attach(doc);
  attach(doc);
  assert.ok(doc.getElementById('onthisday-card').children.length > 0);
});

test('card heading and description name the real endpoint', () => {
  const doc = makeDoc();
  attach(doc);
  assert.strictEqual(doc.getElementById('onthisday-heading').textContent, 'On this day in history');
  assert.ok(doc.getElementById('onthisday-description').textContent.includes('api.wikimedia.org'));
});

test('status line exposes role, aria-live and aria-atomic', () => {
  const doc = makeDoc();
  attach(doc);
  const status = doc.getElementById('onthisday-status');
  assert.strictEqual(status.getAttribute('role'), 'status');
  assert.strictEqual(status.getAttribute('aria-live'), 'polite');
  assert.strictEqual(status.getAttribute('aria-atomic'), 'true');
});

test('initial status invites a date or today', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('onthisday-status').textContent.includes('today'));
});

test('card is placed right after the wiki card when present', () => {
  const doc = makeDoc();
  const wiki = makeElement('section');
  wiki.id = 'wiki-card';
  doc.body.appendChild(wiki);
  attach(doc);
  const card = doc.getElementById('onthisday-card');
  assert.strictEqual(card.parentNode, doc.body);
  assert.strictEqual(doc.body.children.indexOf(card), doc.body.children.indexOf(wiki) + 1);
});

test('an empty date checks today (from the injected now)', async () => {
  const doc = makeDoc();
  let requested = null;
  attach(doc, {
    fetch: async (url) => {
      requested = url;
      return okResponse(JSON.stringify(payload));
    }
  });
  doc.getElementById('onthisday-check').dispatch('click', {});
  await drain();
  assert.strictEqual(requested, 'https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/11/15');
});

test('a successful check renders events with an accessible link', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('onthisday-date').value = '11-15';
  doc.getElementById('onthisday-check').dispatch('click', {});
  await drain();
  const result = doc.getElementById('onthisday-result');
  assert.ok(result.textContent.includes('1926'));
  assert.ok(result.textContent.includes('NBC opened with a radio show.'));
  const list = result.children.find(c => c.tagName === 'ul');
  assert.ok(list);
  const item = list.children[0];
  const link = item.children.find(c => c.tagName === 'a');
  assert.ok(link);
  assert.strictEqual(link.href, 'https://en.wikipedia.org/wiki/NBC');
  assert.strictEqual(link.getAttribute('rel'), 'noopener noreferrer');
  assert.strictEqual(link.getAttribute('target'), '_blank');
  assert.ok(link.getAttribute('aria-label').includes('15/11'));
});

test('status reports the update time and that nothing is saved', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('onthisday-check').dispatch('click', {});
  await drain();
  const status = doc.getElementById('onthisday-status').textContent;
  assert.ok(status.includes('Updated'));
  assert.ok(status.includes('not saved on this device'));
});

test('a malformed date is blocked with guidance and no network call', async () => {
  const doc = makeDoc();
  let called = 0;
  attach(doc, { fetch: async () => { called += 1; return okResponse(JSON.stringify(payload)); } });
  doc.getElementById('onthisday-date').value = 'someday';
  doc.getElementById('onthisday-check').dispatch('click', {});
  await drain();
  assert.strictEqual(called, 0);
  assert.ok(doc.getElementById('onthisday-status').textContent.includes('month/day'));
});

test('403 explains the rate limit in plain words', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 403, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('onthisday-check').dispatch('click', {});
  await drain();
  assert.ok(doc.getElementById('onthisday-status').textContent.includes('rate-limited'));
});

test('a failed check clears any previous result', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('onthisday-result').textContent = 'stale';
  doc.getElementById('onthisday-check').dispatch('click', {});
  await drain();
  assert.strictEqual(doc.getElementById('onthisday-result').textContent, '');
  assert.strictEqual(doc.getElementById('onthisday-result').children.length, 0);
});

test('clear empties the input and the result', () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('onthisday-date').value = '11-15';
  doc.getElementById('onthisday-result').textContent = 'old';
  doc.getElementById('onthisday-clear').dispatch('click', {});
  assert.strictEqual(doc.getElementById('onthisday-date').value, '');
  assert.strictEqual(doc.getElementById('onthisday-result').textContent, '');
});

test('form submit is prevented and runs the check', async () => {
  const doc = makeDoc();
  let prevented = false;
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('onthisday-form').dispatch('submit', { preventDefault: () => { prevented = true; } });
  await drain();
  assert.strictEqual(prevented, true);
  assert.ok(doc.getElementById('onthisday-result').textContent.includes('1926'));
});

test('concurrent submits are guarded by the busy flag', async () => {
  const doc = makeDoc();
  let seen = 0;
  attach(doc, {
    fetch: async () => {
      seen += 1;
      await Promise.resolve();
      return okResponse(JSON.stringify(payload));
    }
  });
  const first = doc.getElementById('onthisday-check').dispatch('click', {});
  const second = doc.getElementById('onthisday-check').dispatch('click', {});
  await Promise.all([first, second]);
  await drain();
  assert.strictEqual(seen, 1);
});

test('missing fetch degrades with an honest message', () => {
  const doc = makeDoc();
  attach(doc, { fetch: null });
  doc.getElementById('onthisday-check').dispatch('click', {});
  assert.ok(doc.getElementById('onthisday-status').textContent.includes('fetch is unavailable'));
});

test('missing on-this-day API degrades with an honest message', async () => {
  const doc = makeDoc();
  const savedApi = globalThis.DaymarkOnThisDay;
  delete globalThis.DaymarkOnThisDay;
  try {
    attach(doc, { onThisDayApi: null });
    doc.getElementById('onthisday-check').dispatch('click', {});
    await drain();
  } finally {
    if (savedApi) globalThis.DaymarkOnThisDay = savedApi;
  }
  assert.ok(doc.getElementById('onthisday-status').textContent.includes('unavailable'));
});

test('index.html wires both on-this-day modules as defer scripts', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(/<script src="onthisday-logic\.js" defer><\/script>/.test(html));
  assert.ok(/<script src="onthisday-ui\.js" defer><\/script>/.test(html));
});

test('boot never reads localStorage (stateless card)', async () => {
  const doc = makeDoc();
  const vm = require('node:vm');
  const code = fs.readFileSync(path.join(__dirname, '..', 'onthisday-ui.js'), 'utf8');
  const sandbox = {
    window: undefined,
    document: undefined
  };
  sandbox.module = { exports: {} };
  sandbox.globalThis = sandbox;
  sandbox.require = (name) => { throw new Error('unexpected require ' + name); };
  vm.runInNewContext(code, sandbox);
  assert.ok(sandbox.module.exports.attachOnThisDayUi);
  assert.strictEqual(sandbox.localStorage, undefined);
});
