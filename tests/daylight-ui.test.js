'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const daylightApi = require('../daylight-logic.js');
const ui = require('../daylight-ui.js');

const GEO_BODY = JSON.stringify({
  results: [{ name: 'Kanyakumari', country: 'India', latitude: 8.0883, longitude: 77.5385 }]
});
const DAYLIGHT_BODY = JSON.stringify({
  latitude: 8.0883,
  longitude: 77.5385,
  timezone: 'Asia/Kolkata',
  daily: {
    sunrise: ['2026-11-12T06:14', '2026-11-13T06:14', '2026-11-14T06:15'],
    sunset: ['2026-11-12T17:52', '2026-11-13T17:52', '2026-11-14T17:52'],
    uv_index_max: [9.5, 9.8, 11.2]
  }
});

function fakeElement(tag, doc) {
  const el = {
    tagName: tag,
    className: '',
    disabled: false,
    value: '',
    textContent: '',
    children: [],
    listeners: [],
    parentNode: null,
    appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
    insertBefore(child, ref) { child.parentNode = el; el.children.push(child); return child; },
    setAttribute(name, value) { el.attrs = el.attrs || {}; el.attrs[name] = String(value); },
    removeAttribute(name) { if (el.attrs) delete el.attrs[name]; },
    getAttribute(name) { return el.attrs ? el.attrs[name] : null; },
    classList: {
      _set: new Set(),
      add(name) { this._set.add(name); },
      remove(name) { this._set.delete(name); },
      contains(name) { return this._set.has(name); },
      toggle(name, force) {
        const on = force === undefined ? !this._set.has(name) : force;
        if (on) this._set.add(name); else this._set.delete(name);
        return on;
      }
    },
    addEventListener(type, handler) { el.listeners.push({ type, handler }); },
    dispatchEvent(event) {
      for (const listener of el.listeners) {
        if (listener.type === event.type) listener.handler(event);
      }
      return !event.defaultPrevented;
    }
  };
  Object.defineProperty(el, 'id', {
    get() { return el._id || ''; },
    set(v) { el._id = v; if (doc) doc.registry[v] = el; }
  });
  return el;
}

function fakeDoc() {
  const doc = {
    readyState: 'complete',
    registry: {},
    created: [],
    body: null,
    getElementById(id) { return doc.registry[id] || null; },
    createElement(tag) { const el = fakeElement(tag, doc); doc.created.push(el); return el; }
  };
  doc.body = fakeElement('body', doc);
  return doc;
}

function fakeEnv(options) {
  const opts = options || {};
  const doc = fakeDoc();
  const env = {
    document: doc,
    window: {},
    daylightApi,
    fetch: opts.fetch,
    now: () => '2026-11-12T05:00:00.000Z'
  };
  return { env, doc };
}

function elementsOf(doc) {
  return {
    card: doc.registry['daylight-card'],
    input: doc.registry['daylight-place'],
    button: doc.registry['daylight-refresh'],
    form: doc.registry['daylight-form'],
    status: doc.registry['daylight-status'],
    result: doc.registry['daylight-result'],
    clear: doc.registry['daylight-clear']
  };
}

function streamResponse(body) {
  const bytes = new TextEncoder().encode(body);
  let offset = 0;
  const reader = {
    async read() {
      if (offset >= bytes.length) return { done: true, value: undefined };
      const chunk = bytes.slice(offset, offset + 1024);
      offset += chunk.length;
      return { done: false, value: chunk };
    },
    cancel() { return Promise.resolve(); },
    releaseLock() {}
  };
  return {
    ok: true,
    status: 200,
    headers: { get() { return null; } },
    body: { getReader() { return reader; }, cancel() { return reader.cancel(); } },
    text() { throw new Error('bounded response reader must not call response.text()'); }
  };
}

function okFetch(routes) {
  const seen = [];
  const impl = (url) => {
    seen.push(url);
    const route = routes.find((r) => url.indexOf(r.prefix) === 0);
    if (!route) return Promise.reject(new Error('unexpected url'));
    return Promise.resolve(streamResponse(route.body));
  };
  impl.seen = seen;
  return impl;
}

const GEO_PREFIX = 'https://geocoding-api.open-meteo.com';
const ROUTES = [
  { prefix: GEO_PREFIX, body: GEO_BODY },
  { prefix: daylightApi.DAYLIGHT_ENDPOINT, body: DAYLIGHT_BODY }
];

test('attach injects the card once with the expected structure and privacy disclosure', () => {
  const { env, doc } = fakeEnv({});
  const handle = ui.attachDaylightUi(env);
  const els = elementsOf(doc);
  assert.ok(els.card, 'card must be created');
  assert.equal(els.card.className, 'briefing-card');
  assert.equal(els.card.getAttribute('aria-labelledby'), 'daylight-heading');
  assert.ok(els.input && els.button && els.form && els.status && els.result && els.clear);
  assert.equal(els.form.getAttribute('novalidate'), 'novalidate');
  assert.equal(els.status.textContent, 'Type a place name and tap Check.');
  assert.equal(els.result.textContent, '');
  assert.ok(doc.created.indexOf(els.card) !== -1, 'card was created by the module');
  assert.ok(els.card.parentNode !== null, 'card must be attached to the document');
  const description = doc.registry['daylight-description'];
  assert.ok(description, 'privacy disclosure element must exist');
  const disclosure = description.textContent || '';
  assert.ok(disclosure.indexOf('Open-Meteo Geocoding') !== -1, 'must name geocoding recipient');
  assert.ok(disclosure.indexOf('Open-Meteo Forecast') !== -1, 'must name forecast recipient');
  assert.ok(disclosure.indexOf('only after you tap Check') !== -1, 'must state send is only after Check');
  assert.ok(disclosure.indexOf('No place or result is saved') !== -1, 'must reaffirm nothing is persisted');
  assert.equal(els.input.getAttribute('aria-describedby'), 'daylight-description', 'input must be described by the disclosure');
  assert.equal(typeof handle.onCheck, 'function');
  assert.equal(typeof handle.onClear, 'function');
});

test('a successful check adds a brief is-success flash and title', async () => {
  const fetchImpl = okFetch(ROUTES);
  const { env, doc } = fakeEnv({ fetch: fetchImpl });
  const handle = ui.attachDaylightUi(env);
  const els = elementsOf(doc);
  els.input.value = 'Kanyakumari';
  await handle.onCheck();
  assert.ok(els.status.classList.contains('is-success'), 'success class should be present after check');
  assert.equal(els.status.getAttribute('title'), 'Daylight and UV updated');
  assert.ok(els.status.textContent.includes('Updated'));
});

test('clear empties the view and says so without touching storage', () => {
  const { env, doc } = fakeEnv({});
  const handle = ui.attachDaylightUi(env);
  const els = elementsOf(doc);
  els.input.value = 'Kanyakumari';
  els.result.textContent = 'stale result';
  handle.onClear();
  assert.equal(els.input.value, '');
  assert.equal(els.result.textContent, '');
  assert.equal(els.status.textContent, 'Cleared. Type a place name and tap Check.');
});

test('the module exposes its API', () => {
  assert.equal(typeof ui.attachDaylightUi, 'function');
  assert.equal(typeof ui.ensureCard, 'function');
  assert.equal(typeof globalThis.DaymarkDaylightUi, 'object');
});
