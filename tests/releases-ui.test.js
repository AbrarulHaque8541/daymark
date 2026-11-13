'use strict';

const test = require('node:test');
const assert = require('node:assert');

const logic = globalThis.DaymarkReleases || require('../releases-logic.js');
const releasesUi = globalThis.DaymarkReleasesUi || require('../releases-ui.js');

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
      registerTree(child);
      return child;
    },
    insertBefore(node, ref) {
      node.parentNode = element;
      const index = ref ? element.children.indexOf(ref) : element.children.length;
      element.children.splice(index < 0 ? element.children.length : index, 0, node);
      registerTree(node);
      return node;
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
  currentDoc = doc;
  return doc;
}

function attach(doc, overrides) {
  return releasesUi.attachReleasesUi(Object.assign({
    document: doc,
    window: {},
    releasesApi: logic,
    fetch: () => Promise.reject(new Error('no fetch in test')),
    now: () => '2026-11-13T10:00:00.000Z'
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
  tag_name: 'v1.2.3',
  name: 'Daymark 1.2.3',
  html_url: 'https://github.com/octocat/Hello-World/releases/tag/v1.2.3',
  body: 'Fixes and improvements.',
  prerelease: false,
  published_at: '2026-11-01T09:30:00Z'
};

const drain = async () => {
  for (let i = 0; i < 100; i += 1) await Promise.resolve();
};

test('attaches and injects the releases card', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('releases-card'));
});

test('reuses the existing card on a second attach', () => {
  const doc = makeDoc();
  attach(doc);
  attach(doc);
  assert.ok(doc.getElementById('releases-card').children.length > 0);
});

test('card heading and description are set', () => {
  const doc = makeDoc();
  attach(doc);
  assert.strictEqual(doc.getElementById('releases-heading').textContent, 'Release radar');
  assert.ok(doc.getElementById('releases-description').textContent.includes('api.github.com'));
});

test('status line exposes role and aria-live', () => {
  const doc = makeDoc();
  attach(doc);
  assert.strictEqual(doc.getElementById('releases-status').getAttribute('role'), 'status');
  assert.strictEqual(doc.getElementById('releases-status').getAttribute('aria-live'), 'polite');
});

test('initial status invites a repository name', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('releases-status').textContent.includes('owner/repo'));
});

test('card is placed right after the wiki card when present', () => {
  const doc = makeDoc();
  const wiki = makeElement('section');
  wiki.id = 'wiki-card';
  doc.body.appendChild(wiki);
  attach(doc);
  const card = doc.getElementById('releases-card');
  assert.strictEqual(card.parentNode, doc.body);
  assert.strictEqual(doc.body.children.indexOf(card), doc.body.children.indexOf(wiki) + 1);
});

test('empty input is blocked with guidance', () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('releases-check').dispatch('click', {});
  assert.ok(doc.getElementById('releases-status').textContent.includes('Type a repository'));
});

test('a successful check renders the latest release', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('releases-repo').value = 'octocat/Hello-World';
  doc.getElementById('releases-check').dispatch('click', {});
  await drain();
  assert.ok(doc.getElementById('releases-result').textContent.includes('v1.2.3'));
});

test('status reports the update time and that nothing is saved', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('releases-repo').value = 'octocat/Hello-World';
  doc.getElementById('releases-check').dispatch('click', {});
  await drain();
  const status = doc.getElementById('releases-status').textContent;
  assert.ok(status.includes('Updated'));
  assert.ok(status.includes('not saved on this device'));
});

test('403 explains the anonymous quota', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 403, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('releases-repo').value = 'octocat/Hello-World';
  doc.getElementById('releases-check').dispatch('click', {});
  await drain();
  assert.ok(doc.getElementById('releases-status').textContent.includes('60 checks per hour'));
});

test('404 explains that no release was found', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('releases-repo').value = 'ghost/nope';
  doc.getElementById('releases-check').dispatch('click', {});
  await drain();
  assert.ok(doc.getElementById('releases-status').textContent.includes('No release found'));
});

test('a failed check clears any previous result', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('releases-result').textContent = 'stale';
  doc.getElementById('releases-repo').value = 'ghost/nope';
  doc.getElementById('releases-check').dispatch('click', {});
  await drain();
  assert.strictEqual(doc.getElementById('releases-result').textContent, '');
});

test('clear empties the input and the result', () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('releases-repo').value = 'octocat/Hello-World';
  doc.getElementById('releases-result').textContent = 'old';
  doc.getElementById('releases-clear').dispatch('click', {});
  assert.strictEqual(doc.getElementById('releases-repo').value, '');
  assert.strictEqual(doc.getElementById('releases-result').textContent, '');
});

test('form submit is prevented and runs the check', async () => {
  const doc = makeDoc();
  let prevented = false;
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('releases-repo').value = 'octocat/Hello-World';
  doc.getElementById('releases-form').dispatch('submit', { preventDefault: () => { prevented = true; } });
  await drain();
  assert.strictEqual(prevented, true);
  assert.ok(doc.getElementById('releases-result').textContent.includes('v1.2.3'));
});

test('the Enter key triggers a check', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('releases-repo').value = 'octocat/Hello-World';
  doc.getElementById('releases-repo').dispatch('keydown', { key: 'Enter', preventDefault: () => {} });
  await drain();
  assert.ok(doc.getElementById('releases-result').textContent.includes('v1.2.3'));
});

test('missing fetch degrades with an honest message', () => {
  const doc = makeDoc();
  attach(doc, { fetch: null });
  doc.getElementById('releases-repo').value = 'octocat/Hello-World';
  doc.getElementById('releases-check').dispatch('click', {});
  assert.ok(doc.getElementById('releases-status').textContent.includes('fetch is unavailable'));
});

test('missing releases API degrades with an honest message', async () => {
  const doc = makeDoc();
  const savedApi = globalThis.DaymarkReleases;
  delete globalThis.DaymarkReleases;
  try {
    attach(doc, { releasesApi: null });
    doc.getElementById('releases-repo').value = 'octocat/Hello-World';
    doc.getElementById('releases-check').dispatch('click', {});
    await drain();
  } finally {
    if (savedApi) globalThis.DaymarkReleases = savedApi;
  }
  assert.ok(doc.getElementById('releases-status').textContent.includes('unavailable'));
});

test('successful check renders a safe open-release link and copy button', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('releases-repo').value = 'octocat/Hello-World';
  doc.getElementById('releases-check').dispatch('click', {});
  await drain();
  const result = doc.getElementById('releases-result');
  assert.ok(result.textContent.includes('v1.2.3'));
  const link = result.children.find(c => c.tagName === 'a');
  assert.ok(link);
  assert.strictEqual(link.href, 'https://github.com/octocat/Hello-World/releases/tag/v1.2.3');
  assert.strictEqual(link.getAttribute('rel'), 'noopener noreferrer');
  const copy = result.children.find(c => c.id === 'releases-copy-link');
  assert.ok(copy);
  assert.strictEqual(copy.textContent, 'Copy link');
});
