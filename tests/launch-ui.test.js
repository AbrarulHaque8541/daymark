'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const logic = globalThis.DaymarkLaunch || require('../launch-logic.js');
const launchUi = globalThis.DaymarkLaunchUi || require('../launch-ui.js');

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
  return launchUi.attachLaunchUi(Object.assign({
    document: doc,
    window: {},
    launchApi: logic,
    fetch: () => Promise.reject(new Error('no fetch in test')),
    now: () => '2026-11-17T10:00:00.000Z'
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
  results: [
    {
      name: 'Starlink Group 12-4',
      net: '2026-11-18T04:15:00Z',
      status: { abbrev: 'Go' },
      launch_service_provider: { name: 'SpaceX' },
      rocket: { configuration: { name: 'Falcon 9' } },
      pad: { location: { name: 'Cape Canaveral, FL, USA' } }
    },
    {
      name: 'PSSC-2',
      net: '2026-11-20T14:00:00Z',
      status: { abbrev: 'TBC' },
      launch_service_provider: { name: 'ISRO' },
      rocket: { configuration: { name: 'GSLV Mk II' } },
      pad: { location: { name: 'Sriharikota, India' } }
    }
  ]
};

const drain = async () => {
  for (let i = 0; i < 100; i += 1) await Promise.resolve();
};

test('attaches and injects the launch card', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('launch-card'));
});

test('reuses the existing card on a second attach', () => {
  const doc = makeDoc();
  attach(doc);
  attach(doc);
  assert.ok(doc.getElementById('launch-card').children.length > 0);
});

test('card heading and description name the real endpoint', () => {
  const doc = makeDoc();
  attach(doc);
  assert.strictEqual(doc.getElementById('launch-heading').textContent, 'Upcoming rocket launches');
  assert.ok(doc.getElementById('launch-description').textContent.includes('ll.thespacedevs.com'));
});

test('status line exposes role, aria-live and aria-atomic', () => {
  const doc = makeDoc();
  attach(doc);
  const status = doc.getElementById('launch-status');
  assert.strictEqual(status.getAttribute('role'), 'status');
  assert.strictEqual(status.getAttribute('aria-live'), 'polite');
  assert.strictEqual(status.getAttribute('aria-atomic'), 'true');
});

test('initial status invites a count and a check', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('launch-status').textContent.includes('Check'));
});

test('card is placed right after the crypto card when present', () => {
  const doc = makeDoc();
  const crypto = makeElement('section');
  crypto.id = 'crypto-card';
  doc.body.appendChild(crypto);
  attach(doc);
  const card = doc.getElementById('launch-card');
  assert.strictEqual(card.parentNode, doc.body);
  assert.strictEqual(doc.body.children.indexOf(card), doc.body.children.indexOf(crypto) + 1);
});

test('a successful check renders launches with provider, rocket and pad', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('launch-check').dispatch('click', {});
  await drain();
  const result = doc.getElementById('launch-result');
  assert.ok(result.textContent.includes('Starlink Group 12-4'));
  assert.ok(result.textContent.includes('SpaceX'));
  assert.ok(result.textContent.includes('Falcon 9'));
  assert.ok(result.textContent.includes('Cape Canaveral, FL, USA'));
  assert.ok(result.textContent.includes('2026-11-18 04:15 UTC'));
  assert.ok(result.textContent.includes('On schedule'));
  assert.ok(result.textContent.includes('ISRO'));
  assert.ok(result.textContent.includes('Date not final yet'));
});

test('the check requests the default count of three launches', async () => {
  const doc = makeDoc();
  let requested = null;
  attach(doc, {
    fetch: async (url) => {
      requested = url;
      return okResponse(JSON.stringify({ results: [payload.results[0]] }));
    }
  });
  doc.getElementById('launch-check').dispatch('click', {});
  await drain();
  assert.strictEqual(requested, 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=3');
});

test('a chosen count is passed through to the endpoint', async () => {
  const doc = makeDoc();
  let requested = null;
  attach(doc, {
    fetch: async (url) => {
      requested = url;
      return okResponse(JSON.stringify({ results: [payload.results[0]] }));
    }
  });
  doc.getElementById('launch-count').value = '8';
  doc.getElementById('launch-check').dispatch('click', {});
  await drain();
  assert.strictEqual(requested, 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=8');
});

test('status reports the update time and that nothing is saved', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('launch-check').dispatch('click', {});
  await drain();
  const status = doc.getElementById('launch-status').textContent;
  assert.ok(status.includes('Updated'));
  assert.ok(status.includes('2026-11-17 10:00'));
  assert.ok(status.includes('not saved on this device'));
});

test('429 explains the rate limit in plain words', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 429, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('launch-check').dispatch('click', {});
  await drain();
  assert.ok(doc.getElementById('launch-status').textContent.includes('limited this request'));
});

test('a failed check clears any previous result', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 500, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('launch-result').textContent = 'stale';
  doc.getElementById('launch-check').dispatch('click', {});
  await drain();
  assert.strictEqual(doc.getElementById('launch-result').textContent, '');
  assert.strictEqual(doc.getElementById('launch-result').children.length, 0);
});

test('clear empties the result and re-invites a check', () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('launch-result').textContent = 'old';
  doc.getElementById('launch-clear').dispatch('click', {});
  assert.strictEqual(doc.getElementById('launch-result').textContent, '');
  assert.ok(doc.getElementById('launch-status').textContent.includes('Cleared'));
});

test('form submit is prevented and runs the check', async () => {
  const doc = makeDoc();
  let prevented = false;
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('launch-form').dispatch('submit', { preventDefault: () => { prevented = true; } });
  await drain();
  assert.strictEqual(prevented, true);
  assert.ok(doc.getElementById('launch-result').textContent.includes('Starlink Group 12-4'));
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
  const first = doc.getElementById('launch-check').dispatch('click', {});
  const second = doc.getElementById('launch-check').dispatch('click', {});
  await Promise.all([first, second]);
  await drain();
  assert.strictEqual(seen, 1);
});

test('missing fetch degrades with an honest message', () => {
  const doc = makeDoc();
  attach(doc, { fetch: null });
  doc.getElementById('launch-check').dispatch('click', {});
  assert.ok(doc.getElementById('launch-status').textContent.includes('fetch is unavailable'));
});

test('missing launch API degrades with an honest message', async () => {
  const doc = makeDoc();
  const savedApi = globalThis.DaymarkLaunch;
  delete globalThis.DaymarkLaunch;
  try {
    attach(doc, { launchApi: null });
    doc.getElementById('launch-check').dispatch('click', {});
    await drain();
  } finally {
    if (savedApi) globalThis.DaymarkLaunch = savedApi;
  }
  assert.ok(doc.getElementById('launch-status').textContent.includes('unavailable'));
});

test('index.html wires both launch modules as defer scripts', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(/<script src="launch-logic\.js" defer><\/script>/.test(html));
  assert.ok(/<script src="launch-ui\.js" defer><\/script>/.test(html));
});

test('boot never reads localStorage (stateless card)', async () => {
  const doc = makeDoc();
  const vm = require('node:vm');
  const code = fs.readFileSync(path.join(__dirname, '..', 'launch-ui.js'), 'utf8');
  const sandbox = {
    window: undefined,
    document: undefined
  };
  sandbox.module = { exports: {} };
  sandbox.globalThis = sandbox;
  sandbox.require = (name) => { throw new Error('unexpected require ' + name); };
  vm.runInNewContext(code, sandbox);
  assert.ok(sandbox.module.exports.attachLaunchUi);
  assert.strictEqual(sandbox.localStorage, undefined);
});

test('successful check adds is-success class to status', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('launch-check').dispatch('click', {});
  await drain();
  const status = doc.getElementById('launch-status');
  assert.ok(status.classList.contains('is-success'));
});

test('failed check does not leave is-success class', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 500, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('launch-check').dispatch('click', {});
  await drain();
  const status = doc.getElementById('launch-status');
  assert.strictEqual(status.classList.contains('is-success'), false);
});
