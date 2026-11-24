'use strict';
// Tests for space-news-ui.js with a small fake DOM: card creation, wiring,
// rendering, plain-word failures, the busy guard and the clear control.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ui = globalThis.DaymarkSpaceNewsUi || require('../space-news-ui.js');
const logicApi = globalThis.DaymarkSpaceNews || require('../space-news-logic.js');

function makeElement(tagName) {
  const element = {
    tagName: tagName,
    children: [],
    listeners: {},
    attrs: {},
    href: '',
    parentNode: null,
    disabled: false,
    value: '',
    className: '',
    textContent: '',
    classList: {
      _set: {},
      add(token) { this._set[token] = true; },
      remove(token) { delete this._set[token]; },
      toggle(token, force) {
        const next = force === undefined ? !this._set[token] : Boolean(force);
        if (next) this._set[token] = true; else delete this._set[token];
        return next;
      },
      contains(token) { return Boolean(this._set[token]); }
    },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name] === undefined ? null : this.attrs[name]; },
    removeAttribute(name) { delete this.attrs[name]; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    insertBefore(node, ref) {
      const at = this.children.indexOf(ref);
      if (at < 0) this.children.push(node); else this.children.splice(at, 0, node);
      node.parentNode = this;
      return node;
    },
    removeChild(child) {
      const at = this.children.indexOf(child);
      if (at >= 0) this.children.splice(at, 1);
      child.parentNode = null;
      return child;
    },
    get firstChild() { return this.children[0] || null; },
    addEventListener(name, handler) { (this.listeners[name] = this.listeners[name] || []).push(handler); },
    emit(name, event) {
      (this.listeners[name] || []).forEach((handler) => handler(event || { preventDefault() {} }));
    }
  };
  return element;
}
function findBy(node, id) {
  if (node.id === id) return node;
  for (let index = 0; index < node.children.length; index += 1) {
    const found = findBy(node.children[index], id);
    if (found) return found;
  }
  return null;
}
function makeDoc() {
  const body = makeElement('body');
  return {
    body: body,
    readyState: 'complete',
    createElement: (tag) => makeElement(tag),
    createTextNode: (text) => ({ textContent: String(text) }),
    getElementById: (id) => findBy(body, id),
    addEventListener() {}
  };
}
function articleFixture() {
  return {
    id: 41,
    title: 'Falcon 9 launches a rideshare mission',
    url: 'https://example.com/news/a',
    news_site: 'Spaceflight Now',
    published_at: '2026-11-23T09:30:00Z',
    summary: 'First stage landing succeeded.'
  };
}
function listFixture(count) {
  const raw = [];
  for (let i = 0; i < count; i += 1) {
    const item = articleFixture();
    item.id = 90 + i;
    item.url = 'https://example.com/news/a' + i;
    item.title = 'Story ' + i;
    raw.push(item);
  }
  return { results: raw };
}
function environment(doc, fetchImpl, snapshot) {
  return {
    document: doc,
    window: {},
    spaceNewsApi: {
      fetchSpaceNews: typeof fetchImpl === 'function'
        ? () => Promise.reject(new Error('fetch should be used'))
        : null,
      classifySpaceNewsError: logicApi.classifySpaceNewsError,
      fetchSpaceNewsReal: logicApi.fetchSpaceNews
    },
    now: () => '2026-11-24T04:30:00.000Z',
    fetch: fetchImpl
  };
}
function envWithApi(doc, api, fetchImpl) {
  return {
    document: doc,
    window: {},
    spaceNewsApi: api,
    now: () => '2026-11-24T04:30:00.000Z',
    fetch: fetchImpl
  };
}
const goodApi = {
  fetchSpaceNews: (fetchImpl, opts) => logicApi.fetchSpaceNews(fetchImpl, opts),
  classifySpaceNewsError: logicApi.classifySpaceNewsError
};
function okResponse(text) {
  let consumed = false;
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 255;
  return {
    ok: true,
    status: 200,
    headers: { get() { return null; } },
    body: {
      getReader() {
        return {
          read() {
            if (consumed) return Promise.resolve({ done: true, value: undefined });
            consumed = true;
            return Promise.resolve({ done: false, value: bytes });
          },
          cancel() { return Promise.resolve(); }
        };
      }
    }
  };
}
const fixtureFetch = (url) => {
  if (url === logicApi.buildArticlesUrl(5)) return Promise.resolve(okResponse(JSON.stringify(listFixture(2))));
  return Promise.reject(new Error('unexpected url'));
};

test('source pin: the UI module never touches localStorage and guards its timer', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'space-news-ui.js'), 'utf8');
  assert.strictEqual(source.indexOf('localStorage'), -1, 'the card must be stateless with no storage key');
  assert.ok(source.indexOf('typeof setTimeout') !== -1, 'the success flash timer must stay guarded');
  assert.ok(source.indexOf('attachSpaceNewsUi(env)') !== -1, 'expected the injectable attach entry point');
});
test('source pin: index.html wires both module scripts with defer', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(index.indexOf('<script src="space-news-logic.js" defer></script>') !== -1, 'expected the logic script tag');
  assert.ok(index.indexOf('<script src="space-news-ui.js" defer></script>') !== -1, 'expected the ui script tag');
});
test('attachSpaceNewsUi injects one briefing card after the space-station card', () => {
  const doc = makeDoc();
  const anchor = makeElement('aside');
  anchor.id = 'iss-card';
  doc.body.appendChild(anchor);
  ui.attachSpaceNewsUi(envWithApi(doc, goodApi, fixtureFetch));
  const card = doc.getElementById('space-news-card');
  assert.ok(card, 'expected the space news card to exist');
  const at = doc.body.children.indexOf(card);
  assert.strictEqual(at, doc.body.children.indexOf(anchor) + 1);
  assert.strictEqual(doc.getElementById('space-news-heading').textContent, 'Spaceflight news');
});
test('attachSpaceNewsUi falls back to the static holiday card anchor', () => {
  const doc = makeDoc();
  const anchor = makeElement('aside');
  anchor.id = 'holiday-card';
  doc.body.appendChild(anchor);
  ui.attachSpaceNewsUi(envWithApi(doc, goodApi, fixtureFetch));
  const card = doc.getElementById('space-news-card');
  assert.strictEqual(doc.body.children.indexOf(card), doc.body.children.indexOf(anchor) + 1);
});
test('attachSpaceNewsUi reuses an existing card and returns its controls', () => {
  const doc = makeDoc();
  const first = ui.attachSpaceNewsUi(envWithApi(doc, goodApi, fixtureFetch));
  const second = ui.attachSpaceNewsUi(envWithApi(doc, goodApi, fixtureFetch));
  assert.strictEqual(typeof first.onCheck, 'function');
  assert.strictEqual(typeof first.onClear, 'function');
  assert.strictEqual(typeof first.detach, 'function');
  assert.strictEqual(typeof second.onCheck, 'function');
});
test('the card opens with a plain-word status line', () => {
  const doc = makeDoc();
  ui.attachSpaceNewsUi(envWithApi(doc, goodApi, fixtureFetch));
  assert.strictEqual(
    doc.getElementById('space-news-status').textContent,
    'Tap Check for the latest spaceflight news.'
  );
});
test('Check fetches stories and renders publisher links and dates', async () => {
  const doc = makeDoc();
  let requestedUrl = null;
  const api = {
    fetchSpaceNews: (fetchImpl, opts) => {
      requestedUrl = logicApi.buildArticlesUrl(5);
      return logicApi.fetchSpaceNews(fetchImpl, opts);
    },
    classifySpaceNewsError: logicApi.classifySpaceNewsError
  };
  const controls = ui.attachSpaceNewsUi(envWithApi(doc, api, (url) => {
    return Promise.resolve(okResponse(JSON.stringify(listFixture(2))));
  }));
  await controls.onCheck();
  assert.strictEqual(requestedUrl, logicApi.buildArticlesUrl(5));
  const result = doc.getElementById('space-news-result');
  const first = result.children[0];
  const link = first.children[0];
  assert.strictEqual(link.tagName, 'a');
  assert.strictEqual(link.textContent, 'Story 0');
  assert.strictEqual(link.attrs.rel, 'noopener noreferrer');
  assert.strictEqual(link.attrs.target, '_blank');
  assert.ok(link.href.indexOf('https://example.com/news/a0') === 0, 'publisher link must stay HTTPS');
  const meta = first.children[1].textContent;
  assert.ok(meta.indexOf('Spaceflight Now') !== -1, 'expected the publisher name');
  assert.ok(meta.indexOf('2026-11-23') !== -1, 'expected the published date');
  assert.ok(meta.indexOf('First stage landing succeeded.') !== -1, 'expected the summary');
});
test('a truncated list says so instead of hiding the cut', async () => {
  const doc = makeDoc();
  const snap = logicApi.parseArticles(listFixture(11), 10);
  const api = { fetchSpaceNews: () => Promise.resolve(snap), classifySpaceNewsError: logicApi.classifySpaceNewsError };
  const controls = ui.attachSpaceNewsUi(envWithApi(doc, api, null));
  await controls.onCheck();
  const result = doc.getElementById('space-news-result');
  const note = result.children[result.children.length - 1].textContent;
  assert.ok(/more article/.test(note), 'expected the truncation note');
});
test('a successful check reports the count and that nothing was saved on the device', async () => {
  const doc = makeDoc();
  const controls = ui.attachSpaceNewsUi(envWithApi(doc, goodApi, fixtureFetch));
  await controls.onCheck();
  const text = doc.getElementById('space-news-status').textContent;
  assert.ok(text.indexOf('2 article(s)') !== -1, 'expected the article count');
  assert.ok(text.indexOf('not saved on this device') !== -1);
});
test('a 503 answer surfaces the friendly server wording and empties the view', async () => {
  const doc = makeDoc();
  const controls = ui.attachSpaceNewsUi(envWithApi(doc, goodApi, () => Promise.resolve({ ok: false, status: 503 })));
  await controls.onCheck();
  assert.strictEqual(
    doc.getElementById('space-news-status').textContent,
    'The spaceflight news feed had a server problem (HTTP 503). Try again in a moment.'
  );
  assert.strictEqual(doc.getElementById('space-news-result').children.length, 0);
});
test('Clear empties the view and never touches storage', () => {
  const doc = makeDoc();
  const controls = ui.attachSpaceNewsUi(envWithApi(doc, goodApi, fixtureFetch));
  doc.getElementById('space-news-result').appendChild(doc.createTextNode('stale'));
  controls.onClear();
  assert.strictEqual(doc.getElementById('space-news-result').children.length, 0);
  assert.strictEqual(
    doc.getElementById('space-news-status').textContent,
    'Cleared. Tap Check when you want the next stories.'
  );
});
test('the busy guard ignores a second Check while one is in flight', async () => {
  const doc = makeDoc();
  const resolvers = [];
  const api = {
    fetchSpaceNews: () => new Promise((resolve) => { resolvers.push(resolve); }),
    classifySpaceNewsError: logicApi.classifySpaceNewsError
  };
  const controls = ui.attachSpaceNewsUi(envWithApi(doc, api, null));
  const first = controls.onCheck();
  await Promise.resolve();
  await Promise.resolve();
  const second = controls.onCheck();
  assert.strictEqual(resolvers.length, 1, 'expected only one in-flight request');
  assert.strictEqual(doc.getElementById('space-news-check').disabled, true);
  resolvers[0](logicApi.parseArticles(listFixture(2), 5));
  await first;
  await second;
  assert.strictEqual(doc.getElementById('space-news-check').disabled, false);
});
test('without fetch the card explains the limitation instead of failing', async () => {
  const doc = makeDoc();
  const controls = ui.attachSpaceNewsUi(envWithApi(doc, goodApi, null));
  await controls.onCheck();
  assert.strictEqual(
    doc.getElementById('space-news-status').textContent,
    'Could not check: fetch is unavailable in this browser.'
  );
});
