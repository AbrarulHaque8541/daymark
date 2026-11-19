'use strict';
// Tests for potd-ui.js with a small fake DOM: card creation, wiring,
// rendering, plain-word failures, the busy guard and the clear control.
const test = require('node:test');
const assert = require('node:assert');
const ui = globalThis.DaymarkPotdUi || require('../potd-ui.js');
const logicApi = globalThis.DaymarkPotd || require('../potd-logic.js');

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
    },
    get textContent() {
      if (this._text !== undefined) return this._text;
      return this.children.map((child) => child.textContent).join('');
    },
    set textContent(value) { this._text = String(value); this.children = []; }
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
function fixtureResponse() {
  return okResponse(JSON.stringify({
    image: {
      title: 'File:Harbour example.jpg',
      description: { text: 'A harbour at dusk' },
      artist: { text: 'Anne Example' },
      license: { text: 'CC BY-SA 4.0' },
      file_page: 'https://commons.wikimedia.org/wiki/File:Harbour_example.jpg',
      image: { source: 'https://upload.wikimedia.org/wikipedia/commons/harbour.jpg', width: 1200, height: 800 },
      thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/harbour.jpg', width: 320, height: 213 }
    }
  }));
}
function environment(doc, fetchImpl) {
  return {
    document: doc,
    window: {},
    potdApi: logicApi,
    now: () => '2026-11-19T03:00:00.000Z',
    fetch: fetchImpl
  };
}

test('attachPotdUi injects one briefing card after the onthisday card', () => {
  const doc = makeDoc();
  const anchor = makeElement('aside');
  anchor.id = 'onthisday-card';
  doc.body.appendChild(anchor);
  ui.attachPotdUi(environment(doc, () => Promise.resolve(fixtureResponse())));
  const card = doc.getElementById('potd-card');
  assert.ok(card, 'expected the potd card to exist');
  const at = doc.body.children.indexOf(card);
  assert.strictEqual(at, doc.body.children.indexOf(anchor) + 1);
  assert.strictEqual(doc.getElementById('potd-heading').textContent, 'Picture of the day');
});
test('attachPotdUi reuses an existing card and returns its controls', () => {
  const doc = makeDoc();
  const first = ui.attachPotdUi(environment(doc, () => Promise.resolve(fixtureResponse())));
  const second = ui.attachPotdUi(environment(doc, () => Promise.resolve(fixtureResponse())));
  assert.strictEqual(typeof first.onCheck, 'function');
  assert.strictEqual(typeof first.onClear, 'function');
  assert.strictEqual(typeof first.detach, 'function');
  assert.strictEqual(typeof second.onCheck, 'function');
  assert.strictEqual(typeof second.onClear, 'function');
});
test('the card opens with a plain-word status line', () => {
  const doc = makeDoc();
  ui.attachPotdUi(environment(doc, () => Promise.resolve(fixtureResponse())));
  assert.strictEqual(
    doc.getElementById('potd-status').textContent,
    'Leave the date empty for today, or type month/day, and tap Check.'
  );
});
test('Check with an empty field fetches today and renders the credited image', async () => {
  const doc = makeDoc();
  let requestedUrl = null;
  const controls = ui.attachPotdUi(environment(doc, (url) => {
    requestedUrl = url;
    return Promise.resolve(fixtureResponse());
  }));
  await controls.onCheck();
  assert.ok(requestedUrl.indexOf('/11/19') !== -1, 'expected the today path');
  const result = doc.getElementById('potd-result');
  const image = result.children[0];
  assert.strictEqual(image.tagName, 'img');
  assert.strictEqual(image.attrs.src, 'https://upload.wikimedia.org/wikipedia/commons/thumb/harbour.jpg');
  assert.strictEqual(image.attrs.loading, 'lazy');
  assert.strictEqual(image.attrs.referrerpolicy, 'no-referrer');
  assert.ok(image.attrs.alt.indexOf('Harbour example.jpg') !== -1, 'expected the title in the alt text');
});
test('the rendered card credits the photographer, license and file page', async () => {
  const doc = makeDoc();
  const controls = ui.attachPotdUi(environment(doc, () => Promise.resolve(fixtureResponse())));
  await controls.onCheck();
  const result = doc.getElementById('potd-result');
  const caption = result.children[1].textContent;
  assert.ok(caption.indexOf('Harbour example.jpg') !== -1, 'expected the title');
  assert.ok(caption.indexOf('Photo: Anne Example') !== -1, 'expected the photographer credit');
  assert.ok(caption.indexOf('License: CC BY-SA 4.0') !== -1, 'expected the license');
  const link = result.children[3];
  assert.strictEqual(link.tagName, 'a');
  assert.strictEqual(link.textContent, 'File page');
  assert.strictEqual(link.attrs.rel, 'noopener noreferrer');
  assert.strictEqual(link.href, 'https://commons.wikimedia.org/wiki/File:Harbour_example.jpg');
});
test('a successful check reports that nothing was saved on the device', async () => {
  const doc = makeDoc();
  const controls = ui.attachPotdUi(environment(doc, () => Promise.resolve(fixtureResponse())));
  await controls.onCheck();
  const statusEl = doc.getElementById('potd-status');
  assert.ok(statusEl.textContent.indexOf('not saved on this device') !== -1);
  assert.ok(statusEl.classList.contains('is-success'), 'success flash class is set on status');
});
test('a 403 answer surfaces the friendly rate-limit wording', async () => {
  const doc = makeDoc();
  const controls = ui.attachPotdUi(environment(doc, () => Promise.resolve({ ok: false, status: 403 })));
  await controls.onCheck();
  assert.strictEqual(
    doc.getElementById('potd-status').textContent,
    'Wikimedia limited this request (the free feed is rate-limited). Try again in a moment.'
  );
  assert.strictEqual(doc.getElementById('potd-result').children.length, 0);
});
test('a nonsensical typed date is refused without any network call', async () => {
  const doc = makeDoc();
  let calls = 0;
  const controls = ui.attachPotdUi(environment(doc, () => { calls += 1; return Promise.resolve(fixtureResponse()); }));
  doc.getElementById('potd-date').value = '99-99';
  await controls.onCheck();
  assert.strictEqual(calls, 0);
  assert.ok(doc.getElementById('potd-status').textContent.indexOf('month/day') !== -1);
});
test('a typed date is honored as the request path', async () => {
  const doc = makeDoc();
  let requestedUrl = null;
  const controls = ui.attachPotdUi(environment(doc, (url) => {
    requestedUrl = url;
    return Promise.resolve(fixtureResponse());
  }));
  doc.getElementById('potd-date').value = '08-05';
  await controls.onCheck();
  assert.ok(requestedUrl.indexOf('/08/05') !== -1, 'expected 08/05 in the request path');
});
test('Clear empties the view and never touches storage', () => {
  const doc = makeDoc();
  const controls = ui.attachPotdUi(environment(doc, () => Promise.resolve(fixtureResponse())));
  doc.getElementById('potd-date').value = '11-19';
  doc.getElementById('potd-result').appendChild(doc.createTextNode('stale'));
  controls.onClear();
  assert.strictEqual(doc.getElementById('potd-result').children.length, 0);
  assert.strictEqual(doc.getElementById('potd-date').value, '');
  assert.strictEqual(
    doc.getElementById('potd-status').textContent,
    'Cleared. Leave the date empty for today, or type month/day, and tap Check.'
  );
});
test('the busy guard ignores a second Check while one is in flight', async () => {
  const doc = makeDoc();
  const resolvers = [];
  const controls = ui.attachPotdUi(environment(doc, () => new Promise((resolve) => { resolvers.push(resolve); })));
  const first = controls.onCheck();
  await Promise.resolve();
  await Promise.resolve();
  const second = controls.onCheck();
  assert.strictEqual(resolvers.length, 1, 'expected only one in-flight request');
  assert.strictEqual(doc.getElementById('potd-check').disabled, true);
  resolvers[0](fixtureResponse());
  await first;
  await second;
  assert.strictEqual(doc.getElementById('potd-check').disabled, false);
});
test('without fetch the card explains the limitation instead of failing', async () => {
  const doc = makeDoc();
  const controls = ui.attachPotdUi(environment(doc, null));
  await controls.onCheck();
  assert.strictEqual(
    doc.getElementById('potd-status').textContent,
    'Could not check: fetch is unavailable in this browser.'
  );
});
test('pressing Enter in the date field triggers the check', async () => {
  const doc = makeDoc();
  let requestedUrl = null;
  const controls = ui.attachPotdUi(environment(doc, (url) => {
    requestedUrl = url;
    return Promise.resolve(fixtureResponse());
  }));
  doc.getElementById('potd-date').emit('keydown', { key: 'Enter', preventDefault() {} });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(requestedUrl, 'expected the Enter key to start a check');
  assert.ok(requestedUrl.indexOf('/11/19') !== -1);
});
