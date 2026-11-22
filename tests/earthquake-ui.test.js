'use strict';

const test = require('node:test');
const assert = require('node:assert');

let logic;
let quakesUi;
if (typeof require === 'function') {
  logic = require('../earthquake-logic.js');
  quakesUi = require('../earthquake-ui.js');
}
if (!logic) logic = globalThis.DaymarkEarthquakes;
if (!quakesUi) quakesUi = globalThis.DaymarkEarthquakesUi;

function makeElement(tag) {
  const element = {
    tagName: String(tag).toLowerCase(),
    children: [],
    attributes: {},
    listeners: {},
    parentNode: null,
    id: '',
    className: '',
    textContent: '',
    disabled: false,
    href: '',
    classList: {
      set: new Set(),
      toggle(name, force) {
        const on = force === undefined ? !this.set.has(name) : force;
        if (on) this.set.add(name); else this.set.delete(name);
      },
      add(name) { this.set.add(name); },
      remove(name) { this.set.delete(name); },
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
      const handlers = (element.listeners[type] || []).map(h => h(event));
      return Promise.all(handlers.map(outcome => outcome && typeof outcome.then === 'function' ? outcome : undefined));
    }
  };
  return element;
}

let currentDoc = null;
function registerTree(node) {
  if (!node || typeof node !== 'object') return;
  if (node.id && currentDoc) currentDoc[node.id] = node;
  (node.children || []).forEach(registerTree);
}

function makeDoc() {
  const doc = {
    body: makeElement('body'),
    readyState: 'complete'
  };
  doc.createElement = (tag) => makeElement(tag);
  doc.getElementById = (id) => doc[id] || null;
  doc.createTextNode = (text) => ({ textContent: text, nodeType: 3 });
  doc.addEventListener = () => {};
  currentDoc = doc;
  return doc;
}

function attach(doc, overrides) {
  return quakesUi.attachEarthquakeUi(Object.assign({
    document: doc,
    window: {},
    earthquakesApi: logic,
    fetch: null,
    now: () => '2026-11-22T04:00:00.000Z'
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
  body: streamOf([bodyText]),
  text: async () => bodyText
});

function feature(mag, place, time, url, tsunami) {
  return {
    type: 'Feature',
    properties: { mag: mag, place: place, time: time, url: url, tsunami: tsunami },
    id: place || 'quake'
  };
}

const payload = {
  type: 'FeatureCollection',
  features: [
    feature(5.7, '200 km S of Somewhere', Date.parse('2026-11-21T18:30:00Z'), 'https://earthquake.usgs.gov/earthquakes/eventpage/big'),
    feature(4.2, 'Remote area', Date.parse('2026-11-21T09:10:00Z'), null, 0)
  ]
};

test('attaches and injects the earthquake card', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('earthquake-card'));
});

test('reuses the existing card on a second attach', () => {
  const doc = makeDoc();
  attach(doc);
  const first = doc.getElementById('earthquake-card');
  attach(doc);
  assert.strictEqual(doc.getElementById('earthquake-card'), first);
});

test('card heading and description name the public USGS feed', () => {
  const doc = makeDoc();
  attach(doc);
  assert.strictEqual(doc.getElementById('earthquake-heading').textContent, 'Earthquake glance');
  assert.ok(doc.getElementById('earthquake-description').textContent.includes('earthquake.usgs.gov'));
});

test('status line exposes role, aria-live and aria-atomic', () => {
  const doc = makeDoc();
  attach(doc);
  const status = doc.getElementById('earthquake-status');
  assert.strictEqual(status.getAttribute('role'), 'status');
  assert.strictEqual(status.getAttribute('aria-live'), 'polite');
  assert.strictEqual(status.getAttribute('aria-atomic'), 'true');
});

test('card is placed right after the country card when present', () => {
  const doc = makeDoc();
  const country = makeElement('section');
  country.id = 'country-card';
  doc.body.appendChild(country);
  attach(doc);
  const card = doc.getElementById('earthquake-card');
  assert.strictEqual(card.parentNode, doc.body);
  assert.strictEqual(doc.body.children.indexOf(card), doc.body.children.indexOf(country) + 1);
});

test('card falls back to launch card placement', () => {
  const doc = makeDoc();
  const launch = makeElement('section');
  launch.id = 'launch-card';
  doc.body.appendChild(launch);
  attach(doc);
  const card = doc.getElementById('earthquake-card');
  assert.strictEqual(doc.body.children.indexOf(card), doc.body.children.indexOf(launch) + 1);
});

test('a successful check renders the strongest quake first with an accessible link', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('earthquake-check').dispatch('click', {});
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  const result = doc.getElementById('earthquake-result');
  assert.ok(result.textContent.includes('M5.7 strong'), 'result was: ' + result.textContent);
  assert.ok(result.textContent.includes('200 km S of Somewhere'));
  const link = result.children.find(c => c.tagName === 'a');
  assert.ok(link);
  assert.strictEqual(link.href, 'https://earthquake.usgs.gov/earthquakes/eventpage/big');
  assert.strictEqual(link.getAttribute('rel'), 'noopener noreferrer');
  assert.strictEqual(link.getAttribute('target'), '_blank');
  assert.ok(link.getAttribute('aria-label').includes('USGS page'));
});

test('an empty feed says so honestly', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify({ features: [] })) });
  doc.getElementById('earthquake-check').dispatch('click', {});
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.ok(doc.getElementById('earthquake-result').textContent.includes('No significant earthquakes'));
});

test('status reports the update time, that nothing is saved, and hidden entries', async () => {
  const doc = makeDoc();
  const features = [];
  for (let i = 0; i < 10; i += 1) features.push(feature(4 + i, 'quake' + i, 1000 + i));
  attach(doc, { fetch: async () => okResponse(JSON.stringify({ features: features })) });
  doc.getElementById('earthquake-check').dispatch('click', {});
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  const status = doc.getElementById('earthquake-status').textContent;
  assert.ok(status.includes('Updated'));
  assert.ok(status.includes('nothing saved on this device'));
  assert.ok(status.includes('2 more entries not shown'));
});

test('403 explains the limited request', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 403, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('earthquake-check').dispatch('click', {});
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.ok(doc.getElementById('earthquake-status').textContent.includes('limited this request'));
});

test('404 explains that the feed was not found', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('earthquake-check').dispatch('click', {});
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.ok(doc.getElementById('earthquake-status').textContent.includes('was not found'));
});

test('a failed check clears any previous result', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('earthquake-result').textContent = 'stale';
  doc.getElementById('earthquake-check').dispatch('click', {});
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.strictEqual(doc.getElementById('earthquake-result').textContent, '');
  assert.strictEqual(doc.getElementById('earthquake-result').children.length, 0);
});

test('clear empties the result', async () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('earthquake-result').textContent = 'old';
  await doc.getElementById('earthquake-clear').dispatch('click', {});
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.strictEqual(doc.getElementById('earthquake-result').textContent, '');
  assert.ok(doc.getElementById('earthquake-status').textContent.includes('Cleared'));
});

test('form submit is prevented and runs the check', async () => {
  const doc = makeDoc();
  let prevented = false;
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('earthquake-form').dispatch('submit', { preventDefault: () => { prevented = true; } });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.strictEqual(prevented, true);
  assert.ok(doc.getElementById('earthquake-result').textContent.includes('M5.7'));
});

test('concurrent checks collapse into one request', async () => {
  const doc = makeDoc();
  let calls = 0;
  attach(doc, { fetch: async () => { calls += 1; return okResponse(JSON.stringify(payload)); } });
  const first = doc.getElementById('earthquake-check').dispatch('click', {});
  const second = doc.getElementById('earthquake-check').dispatch('click', {});
  await first;
  await second;
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.strictEqual(calls, 1, 'the busy guard must skip duplicate requests');
});

test('missing fetch degrades with an honest message', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: null });
  await doc.getElementById('earthquake-check').dispatch('click', {});
  assert.ok(doc.getElementById('earthquake-status').textContent.includes('fetch is unavailable'));
});

test('missing earthquakes API degrades with an honest message', async () => {
  const doc = makeDoc();
  attach(doc, { earthquakesApi: null, fetch: null });
  await doc.getElementById('earthquake-check').dispatch('click', {});
  assert.ok(doc.getElementById('earthquake-status').textContent.includes('unavailable'));
});

test('successful check briefly marks status as success', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('earthquake-check').dispatch('click', {});
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  const status = doc.getElementById('earthquake-status');
  assert.ok(status.classList.contains('is-success'), 'status should flash is-success after update');
  assert.strictEqual(status.getAttribute('title'), 'Earthquakes updated');
});
