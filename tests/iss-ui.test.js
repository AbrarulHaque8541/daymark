'use strict';
// Tests for iss-ui.js with a small fake DOM: card creation, wiring,
// rendering, plain-word failures, the busy guard and the clear control.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ui = globalThis.DaymarkIssUi || require('../iss-ui.js');
const logicApi = globalThis.DaymarkIss || require('../iss-logic.js');

function asciiBytes(text) {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 255;
  return bytes;
}
function streamOf(chunk) {
  let consumed = false;
  return {
    getReader() {
      return {
        read() {
          if (consumed) return Promise.resolve({ done: true, value: undefined });
          consumed = true;
          return Promise.resolve({ done: false, value: asciiBytes(chunk) });
        },
        cancel() { return Promise.resolve(); }
      };
    }
  };
}
function okResponse(text) {
  return { ok: true, status: 200, headers: { get() { return null; } }, body: streamOf(text) };
}
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
function fixturePayload() {
  return {
    name: 'iss',
    latitude: 19.654382,
    longitude: -63.532708,
    altitude: 421.2187,
    velocity: 27597.318,
    visibility: 'daylight',
    timestamp: 1732000000
  };
}
function fixtureResponse(payload) {
  return okResponse(JSON.stringify(payload || fixturePayload()));
}
function environment(doc, fetchImpl) {
  return {
    document: doc,
    window: {},
    issApi: logicApi,
    now: () => '2026-11-23T04:30:00.000Z',
    fetch: fetchImpl
  };
}

test('source pin: the UI module never touches localStorage and guards its timer', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'iss-ui.js'), 'utf8');
  assert.strictEqual(source.indexOf('localStorage'), -1, 'the card must be stateless with no storage key');
  assert.ok(source.indexOf('typeof setTimeout') !== -1, 'the success flash timer must stay guarded');
  assert.ok(source.indexOf('attachIssUi(env)') !== -1, 'expected the injectable attach entry point');
});
test('source pin: index.html wires both module scripts with defer', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(index.indexOf('<script src="iss-logic.js" defer></script>') !== -1, 'expected the logic script tag');
  assert.ok(index.indexOf('<script src="iss-ui.js" defer></script>') !== -1, 'expected the ui script tag');
});
test('attachIssUi injects one briefing card after the earthquake card', () => {
  const doc = makeDoc();
  const anchor = makeElement('aside');
  anchor.id = 'earthquake-card';
  doc.body.appendChild(anchor);
  ui.attachIssUi(environment(doc, () => Promise.resolve(fixtureResponse())));
  const card = doc.getElementById('iss-card');
  assert.ok(card, 'expected the iss card to exist');
  const at = doc.body.children.indexOf(card);
  assert.strictEqual(at, doc.body.children.indexOf(anchor) + 1);
  assert.strictEqual(doc.getElementById('iss-heading').textContent, 'Space station, live');
});
test('attachIssUi falls back to the static holiday card anchor', () => {
  const doc = makeDoc();
  const anchor = makeElement('aside');
  anchor.id = 'holiday-card';
  doc.body.appendChild(anchor);
  ui.attachIssUi(environment(doc, () => Promise.resolve(fixtureResponse())));
  const card = doc.getElementById('iss-card');
  assert.strictEqual(doc.body.children.indexOf(card), doc.body.children.indexOf(anchor) + 1);
});
test('attachIssUi reuses an existing card and returns its controls', () => {
  const doc = makeDoc();
  const first = ui.attachIssUi(environment(doc, () => Promise.resolve(fixtureResponse())));
  const second = ui.attachIssUi(environment(doc, () => Promise.resolve(fixtureResponse())));
  assert.strictEqual(typeof first.onCheck, 'function');
  assert.strictEqual(typeof first.onClear, 'function');
  assert.strictEqual(typeof first.detach, 'function');
  assert.strictEqual(typeof second.onCheck, 'function');
  assert.strictEqual(typeof second.onClear, 'function');
});
test('the card opens with a plain-word status line', () => {
  const doc = makeDoc();
  ui.attachIssUi(environment(doc, () => Promise.resolve(fixtureResponse())));
  assert.strictEqual(
    doc.getElementById('iss-status').textContent,
    'Tap Check for the current space-station position.'
  );
});
test('Check fetches one position and renders the honest summary and map link', async () => {
  const doc = makeDoc();
  let requestedUrl = null;
  const controls = ui.attachIssUi(environment(doc, (url) => {
    requestedUrl = url;
    return Promise.resolve(fixtureResponse());
  }));
  await controls.onCheck();
  assert.strictEqual(requestedUrl, logicApi.ISS_ENDPOINT);
  const result = doc.getElementById('iss-result');
  const summary = result.children[0].textContent;
  assert.ok(summary.indexOf('Latitude 19.6544° N') !== -1, 'expected the latitude label');
  assert.ok(summary.indexOf('Longitude 63.5327° W') !== -1, 'expected the longitude label');
  assert.ok(summary.indexOf('Altitude 421.2 km') !== -1, 'expected the altitude');
  assert.ok(summary.indexOf('Speed 27597 km/h') !== -1, 'expected the speed');
  assert.ok(summary.indexOf('in sunlight') !== -1, 'expected the lighting phrase');
  assert.ok(summary.indexOf('Checked 2026-11-23 04:30 UTC') !== -1, 'expected the checked stamp');
  const link = result.children[2];
  assert.strictEqual(link.tagName, 'a');
  assert.strictEqual(link.textContent, 'Open map');
  assert.strictEqual(link.attrs.rel, 'noopener noreferrer');
  assert.strictEqual(link.attrs.target, '_blank');
  assert.ok(link.href.indexOf('https://www.openstreetmap.org/') === 0, 'map link must stay HTTPS');
});
test('an eclipsed sighting is reported without pretending the shadow is sunlight', async () => {
  const doc = makeDoc();
  const payload = fixturePayload();
  payload.visibility = 'eclipsed';
  const controls = ui.attachIssUi(environment(doc, () => Promise.resolve(fixtureResponse(payload))));
  await controls.onCheck();
  assert.ok(doc.getElementById('iss-result').children[0].textContent.indexOf('in Earth shadow') !== -1);
});
test('a successful check reports that nothing was saved on the device', async () => {
  const doc = makeDoc();
  const controls = ui.attachIssUi(environment(doc, () => Promise.resolve(fixtureResponse())));
  await controls.onCheck();
  assert.ok(doc.getElementById('iss-status').textContent.indexOf('not saved on this device') !== -1);
});
test('a 503 answer surfaces the friendly server wording and empties the view', async () => {
  const doc = makeDoc();
  const controls = ui.attachIssUi(environment(doc, () => Promise.resolve({ ok: false, status: 503 })));
  await controls.onCheck();
  assert.strictEqual(
    doc.getElementById('iss-status').textContent,
    'The space-station feed had a server problem (HTTP 503). Try again in a moment.'
  );
  assert.strictEqual(doc.getElementById('iss-result').children.length, 0);
});
test('Clear empties the view and never touches storage', () => {
  const doc = makeDoc();
  const controls = ui.attachIssUi(environment(doc, () => Promise.resolve(fixtureResponse())));
  doc.getElementById('iss-result').appendChild(doc.createTextNode('stale'));
  controls.onClear();
  assert.strictEqual(doc.getElementById('iss-result').children.length, 0);
  assert.strictEqual(
    doc.getElementById('iss-status').textContent,
    'Cleared. Tap Check when you want the next station fix.'
  );
});
test('the busy guard ignores a second Check while one is in flight', async () => {
  const doc = makeDoc();
  const resolvers = [];
  const controls = ui.attachIssUi(environment(doc, () => new Promise((resolve) => { resolvers.push(resolve); })));
  const first = controls.onCheck();
  await Promise.resolve();
  await Promise.resolve();
  const second = controls.onCheck();
  assert.strictEqual(resolvers.length, 1, 'expected only one in-flight request');
  assert.strictEqual(doc.getElementById('iss-check').disabled, true);
  resolvers[0](fixtureResponse());
  await first;
  await second;
  assert.strictEqual(doc.getElementById('iss-check').disabled, false);
});
test('without fetch the card explains the limitation instead of failing', async () => {
  const doc = makeDoc();
  const controls = ui.attachIssUi(environment(doc, null));
  await controls.onCheck();
  assert.strictEqual(
    doc.getElementById('iss-status').textContent,
    'Could not check: fetch is unavailable in this browser.'
  );
});
