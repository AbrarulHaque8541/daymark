'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const logic = globalThis.DaymarkTrending || require('../trending-logic.js');
const trendingUi = globalThis.DaymarkTrendingUi || require('../trending-ui.js');

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
    hidden: false,
    value: '',
    href: '',
    classList: {
      set: new Set(),
      add(name) { this.set.add(name); },
      remove(name) { this.set.delete(name); },
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
  return trendingUi.attachTrendingUi(Object.assign({
    document: doc,
    window: {},
    trendingApi: logic,
    fetch: () => Promise.reject(new Error('no fetch in test')),
    now: () => '2026-11-20T10:00:00.000Z'
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
  mostread: {
    date: '2026-11-18',
    articles: [
      {
        titles: { normalized: 'Grand Theft Auto VI' },
        views: 519632,
        content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Grand_Theft_Auto_VI' } }
      },
      {
        titles: { normalized: 'Deaths in 2026' },
        views: 90000,
        content_urls: null
      }
    ]
  }
};

const drain = async () => {
  for (let i = 0; i < 100; i += 1) await Promise.resolve();
};

test('attaches and injects the trending card', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('trending-card'));
});

test('reuses the existing card on a second attach', () => {
  const doc = makeDoc();
  attach(doc);
  attach(doc);
  assert.ok(doc.getElementById('trending-card').children.length > 0);
});

test('card heading and description name the real endpoint', () => {
  const doc = makeDoc();
  attach(doc);
  assert.strictEqual(doc.getElementById('trending-heading').textContent, 'Trending on Wikipedia');
  assert.ok(doc.getElementById('trending-description').textContent.includes('api.wikimedia.org'));
});

test('status line exposes role, aria-live and aria-atomic', () => {
  const doc = makeDoc();
  attach(doc);
  const status = doc.getElementById('trending-status');
  assert.strictEqual(status.getAttribute('role'), 'status');
  assert.strictEqual(status.getAttribute('aria-live'), 'polite');
  assert.strictEqual(status.getAttribute('aria-atomic'), 'true');
});

test('initial status invites a date or today', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('trending-status').textContent.includes('today'));
});

test('card is placed right after the potd card when present', () => {
  const doc = makeDoc();
  const potd = makeElement('section');
  potd.id = 'potd-card';
  doc.body.appendChild(potd);
  attach(doc);
  const card = doc.getElementById('trending-card');
  assert.strictEqual(card.parentNode, doc.body);
  assert.strictEqual(doc.body.children.indexOf(card), doc.body.children.indexOf(potd) + 1);
});

test('card falls back to earlier anchors when no potd card exists', () => {
  const doc = makeDoc();
  const wiki = makeElement('section');
  wiki.id = 'wiki-card';
  const rank = item.children.find(c => c.className === 'feed-item-rank');
  assert.ok(rank);
  assert.strictEqual(rank.textContent, '1');
  assert.strictEqual(rank.getAttribute('aria-hidden'), 'true');
  const link = item.children.find(c => c.tagName === 'a');
  assert.ok(link);
  assert.strictEqual(link.href, 'https://en.wikipedia.org/wiki/Grand_Theft_Auto_VI');
  assert.strictEqual(link.getAttribute('rel'), 'noopener noreferrer');
  assert.strictEqual(link.getAttribute('target'), '_blank');
  assert.ok(link.getAttribute('aria-label').includes('Grand Theft Auto VI'));
  assert.ok(doc.getElementById('trending-copy'));
  assert.strictEqual(doc.getElementById('trending-copy').hidden, false);
});

test('status reports the view-count date, update time and that nothing is saved', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('trending-check').dispatch('click', {});
  await drain();
  const status = doc.getElementById('trending-status').textContent;
  assert.ok(status.includes('Updated'));
  assert.ok(status.includes('view counts 2026-11-18'));
  assert.ok(status.includes('not saved on this device'));
});

test('a malformed date is blocked with guidance and no network call', async () => {
  const doc = makeDoc();
  let called = 0;
  attach(doc, { fetch: async () => { called += 1; return okResponse(JSON.stringify(payload)); } });
  doc.getElementById('trending-date').value = 'someday';
  doc.getElementById('trending-check').dispatch('click', {});
  await drain();
  assert.strictEqual(called, 0);
  assert.ok(doc.getElementById('trending-status').textContent.includes('month/day'));
});

test('403 explains the rate limit in plain words', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 403, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('trending-check').dispatch('click', {});
  await drain();
  assert.ok(doc.getElementById('trending-status').textContent.includes('rate-limited'));
});

test('a failed check clears any previous result', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('trending-result').textContent = 'stale';
  doc.getElementById('trending-check').dispatch('click', {});
  await drain();
  assert.strictEqual(doc.getElementById('trending-result').textContent, '');
  assert.strictEqual(doc.getElementById('trending-result').children.length, 0);
});

test('clear empties the input and the result', () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('trending-date').value = '11-20';
  doc.getElementById('trending-result').textContent = 'old';
  doc.getElementById('trending-clear').dispatch('click', {});
  assert.strictEqual(doc.getElementById('trending-date').value, '');
  assert.strictEqual(doc.getElementById('trending-result').textContent, '');
});

test('form submit is prevented and runs the check', async () => {
  const doc = makeDoc();
  let prevented = false;
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('trending-form').dispatch('submit', { preventDefault: () => { prevented = true; } });
  await drain();
  assert.strictEqual(prevented, true);
  assert.ok(doc.getElementById('trending-result').textContent.includes('Grand Theft Auto VI'));
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
  const first = doc.getElementById('trending-check').dispatch('click', {});
  const second = doc.getElementById('trending-check').dispatch('click', {});
  await Promise.all([first, second]);
  await drain();
  assert.strictEqual(seen, 1);
});

test('the busy flag disables the check button with aria-busy', async () => {
  const doc = makeDoc();
  let release;
  attach(doc, {
    fetch: () => new Promise((resolve) => { release = () => resolve(okResponse(JSON.stringify(payload))); })
  });
  const check = doc.getElementById('trending-check');
  const pending = check.dispatch('click', {});
  await drain();
  assert.strictEqual(check.disabled, true);
  assert.strictEqual(check.getAttribute('aria-busy'), 'true');
  release();
  await pending;
  await drain();
  assert.strictEqual(check.disabled, false);
  assert.strictEqual(check.getAttribute('aria-busy'), undefined);
});

test('truncated article lists say so honestly', async () => {
  const doc = makeDoc();
  const longPayload = { mostread: { date: '2026-11-18', articles: [] } };
  for (let index = 0; index < 40; index += 1) {
    longPayload.mostread.articles.push({ titles: { normalized: 'Article ' + index }, views: index });
  }
  attach(doc, { fetch: async () => okResponse(JSON.stringify(longPayload)) });
  doc.getElementById('trending-check').dispatch('click', {});
  await drain();
  const result = doc.getElementById('trending-result').textContent;
  assert.ok(result.includes('list truncated'));
  assert.ok(result.includes('top 5'));
});

test('missing fetch degrades with an honest message', () => {
  const doc = makeDoc();
  attach(doc, { fetch: null });
  doc.getElementById('trending-check').dispatch('click', {});
  assert.ok(doc.getElementById('trending-status').textContent.includes('fetch is unavailable'));
});

test('missing trending API degrades with an honest message', async () => {
  const doc = makeDoc();
  const savedApi = globalThis.DaymarkTrending;
  delete globalThis.DaymarkTrending;
  try {
    attach(doc, { trendingApi: null });
    doc.getElementById('trending-check').dispatch('click', {});
    await drain();
  } finally {
    if (savedApi) globalThis.DaymarkTrending = savedApi;
  }
  assert.ok(doc.getElementById('trending-status').textContent.includes('unavailable'));
});

test('index.html wires both trending modules as defer scripts', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.includes('<script src="trending-logic.js" defer></script>'));
  assert.ok(html.includes('<script src="trending-ui.js" defer></script>'));
});

test('boot never reads localStorage (stateless card)', async () => {
  const doc = makeDoc();
  const vm = require('node:vm');
  const code = fs.readFileSync(path.join(__dirname, '..', 'trending-ui.js'), 'utf8');
  const sandbox = {
    window: undefined,
    document: undefined
  };
  sandbox.module = { exports: {} };
  sandbox.globalThis = sandbox;
  sandbox.require = (name) => { throw new Error('unexpected require ' + name); };
  vm.runInNewContext(code, sandbox);
  assert.ok(sandbox.module.exports.attachTrendingUi);
  assert.strictEqual(sandbox.localStorage, undefined);
});

test('copy button is hidden until a result exists', () => {
  const doc = makeDoc();
  attach(doc);
  const copy = doc.getElementById('trending-copy');
  assert.ok(copy);
  assert.strictEqual(copy.hidden, true);
});

test('copy writes the list and shows success flash', async () => {
  const doc = makeDoc();
  let copied = null;
  const fakeClipboard = { writeText: async (t) => { copied = t; } };
  attach(doc, {
    fetch: async () => okResponse(JSON.stringify(payload)),
    window: { navigator: { clipboard: fakeClipboard } }
  });
  doc.getElementById('trending-check').dispatch('click', {});
  await drain();
  doc.getElementById('trending-copy').dispatch('click', {});
  await drain();
  assert.ok(copied);
  assert.ok(copied.includes('Grand Theft Auto VI'));
  assert.ok(copied.includes('519,632'));
  assert.ok(doc.getElementById('trending-status').textContent.includes('Copied'));
  assert.ok(doc.getElementById('trending-status').classList.contains('is-success'));
});

test('clear hides the copy button', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('trending-check').dispatch('click', {});
  await drain();
  assert.strictEqual(doc.getElementById('trending-copy').hidden, false);
  doc.getElementById('trending-clear').dispatch('click', {});
  assert.strictEqual(doc.getElementById('trending-copy').hidden, true);
});

test('today button clears the date field and updates status', () => {
  const doc = makeDoc();
  attach(doc);
  const input = doc.getElementById('trending-date');
  input.value = '11-20';
  const today = doc.getElementById('trending-today');
  assert.ok(today);
  assert.strictEqual(today.textContent, 'Today');
  today.dispatch('click', {});
  assert.strictEqual(input.value, '');
  assert.ok(doc.getElementById('trending-status').textContent.includes('Using today'));
});

test('checking sets loading class on result and busy on status', async () => {
  const doc = makeDoc();
  let release;
  attach(doc, {
    fetch: () => new Promise((resolve) => { release = () => resolve(okResponse(JSON.stringify(payload))); })
  });
  const check = doc.getElementById('trending-check');
  const pending = check.dispatch('click', {});
  await drain();
  const result = doc.getElementById('trending-result');
  const status = doc.getElementById('trending-status');
  assert.ok(result.classList.contains('is-loading'));
  assert.ok(status.classList.contains('is-busy'));
  assert.ok(status.textContent.includes('Checking'));
  release();
  await pending;
  await drain();
  assert.strictEqual(result.classList.contains('is-loading'), false);
  assert.strictEqual(status.classList.contains('is-busy'), false);
});