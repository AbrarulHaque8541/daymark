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
    clear: doc.registry['daylight-clear'],
    copy: doc.registry['daylight-copy']
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
  assert.ok(els.input && els.button && els.form && els.status && els.result && els.clear && els.copy);
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

test('attach reuses existing markup instead of duplicating the card', () => {
  const { env, doc } = fakeEnv({});
  ui.attachDaylightUi(env);
  const before = doc.created.length;
  ui.attachDaylightUi(env);
  assert.equal(doc.created.length, before, 'a second attach must not create another card');
});

test('the injected card slots in after the air card when present', () => {
  const { env, doc } = fakeEnv({});
  const air = fakeElement('aside', doc);
  air.id = 'air-card';
  doc.body.appendChild(air);
  ui.attachDaylightUi(env);
  const els = elementsOf(doc);
  assert.equal(els.card.parentNode, doc.body);
  assert.ok(doc.body.children.indexOf(els.card) === doc.body.children.indexOf(air) + 1,
    'daylight card must follow the air card');
});

test('the injected card falls back to the weather card when no air card exists', () => {
  const { env, doc } = fakeEnv({});
  const weather = fakeElement('aside', doc);
  weather.id = 'weather-card';
  doc.body.appendChild(weather);
  ui.attachDaylightUi(env);
  const els = elementsOf(doc);
  assert.ok(doc.body.children.indexOf(els.card) === doc.body.children.indexOf(weather) + 1,
    'daylight card must follow the weather card');
});

test('form submission prevents navigation and renders the result once', async () => {
  const fetchImpl = okFetch(ROUTES);
  const { env, doc } = fakeEnv({ fetch: fetchImpl });
  ui.attachDaylightUi(env);
  const els = elementsOf(doc);
  els.input.value = 'Kanyakumari';
  const submit = els.form.listeners.find((listener) => listener.type === 'submit');
  assert.ok(submit, 'daylight form should handle native submit events');
  let prevented = false;
  await submit.handler({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'native form navigation should be prevented');
  assert.equal(fetchImpl.seen.length, 2);
  assert.equal(els.result.textContent,
    'Kanyakumari, India · Today sunrise 06:14, sunset 17:52 (11 h 38 min), UV max 9.5 (Very high)'
    + ' · +1d sunrise 06:14, sunset 17:52 (11 h 38 min), UV max 9.8 (Very high)'
    + ' · +2d sunrise 06:15, sunset 17:52 (11 h 37 min), UV max 11.2 (Extreme)'
    + ' · local time (Asia/Kolkata)');
  assert.equal(els.status.textContent,
    'Updated · 2026-11-12 05:00 UTC · not saved on this device');
  assert.equal(els.button.disabled, false);
});

test('a concurrent submit cannot duplicate the request', async () => {
  const fetchImpl = okFetch(ROUTES);
  const { env, doc } = fakeEnv({ fetch: fetchImpl });
  const handle = ui.attachDaylightUi(env);
  const els = elementsOf(doc);
  els.input.value = 'Kanyakumari';
  // Fire both checks without awaiting the first one: only a genuinely
  // concurrent second call proves the busy guard rejects it in flight.
  const first = handle.onCheck();
  const second = handle.onCheck();
  await Promise.all([first, second]);
  assert.equal(fetchImpl.seen.length, 2, 'the busy guard must prevent a duplicate check');
  assert.equal(els.button.disabled, false);
});

test('Enter on the place field prevents default and checks once', async () => {
  const fetchImpl = okFetch(ROUTES);
  const { env, doc } = fakeEnv({ fetch: fetchImpl });
  ui.attachDaylightUi(env);
  const els = elementsOf(doc);
  els.input.value = 'Kanyakumari';
  const enter = els.input.listeners.find((listener) => listener.type === 'keydown');
  assert.ok(enter, 'place input should handle Enter');
  const enterEvent = {
    key: 'Enter',
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }
  };
  enter.handler(enterEvent);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(enterEvent.defaultPrevented, true);
  assert.equal(fetchImpl.seen.length, 2);
  assert.ok(els.result.textContent.indexOf('Kanyakumari, India') === 0);
});

test('an empty place is rejected before any network call', async () => {
  const fetchImpl = okFetch(ROUTES);
  const { env, doc } = fakeEnv({ fetch: fetchImpl });
  const handle = ui.attachDaylightUi(env);
  const els = elementsOf(doc);
  els.input.value = '   ';
  await handle.onCheck();
  assert.equal(fetchImpl.seen.length, 0);
  assert.equal(els.status.textContent, 'Type a place name first.');
});

test('a failed check reports the error plainly and renders nothing', async () => {
  const failing = () => Promise.reject(new Error('offline'));
  const { env, doc } = fakeEnv({ fetch: failing });
  const handle = ui.attachDaylightUi(env);
  const els = elementsOf(doc);
  els.input.value = 'Kanyakumari';
  await handle.onCheck();
  assert.equal(els.status.textContent, 'Could not check: offline');
  assert.equal(els.result.textContent, '');
  assert.equal(els.button.disabled, false);
});

test('missing fetch support is reported instead of throwing', async () => {
  const { env, doc } = fakeEnv({});
  const handle = ui.attachDaylightUi(env);
  const els = elementsOf(doc);
  els.input.value = 'Kanyakumari';
  await handle.onCheck();
  assert.ok(els.status.textContent.indexOf('fetch is unavailable') !== -1);
});

test('a missing daylight module degrades honestly', async () => {
  const { env, doc } = fakeEnv({});
  const hadGlobal = Object.prototype.hasOwnProperty.call(globalThis, 'DaymarkDaylight');
  const savedGlobal = globalThis.DaymarkDaylight;
  delete env.daylightApi;
  if (hadGlobal) delete globalThis.DaymarkDaylight;
  try {
    const handle = ui.attachDaylightUi(env);
    const els = elementsOf(doc);
    await handle.onCheck();
    assert.equal(els.status.textContent, 'Daylight planning is unavailable.');
  } finally {
    if (hadGlobal) globalThis.DaymarkDaylight = savedGlobal;
  }
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

test('copy writes the current summary when clipboard is available', async () => {
  const { env, doc } = fakeEnv({});
  env.window = {
    navigator: {
      clipboard: {
        writeText: async (text) => { env._copied = text; }
      }
    }
  };
  const handle = ui.attachDaylightUi(env);
  const els = elementsOf(doc);
  els.result.textContent = 'Kanyakumari, India · Today sunrise 06:14';
  await handle.onCopy();
  assert.equal(env._copied, 'Kanyakumari, India · Today sunrise 06:14');
  assert.equal(els.status.textContent, 'Copied the daylight summary to the clipboard.');
  assert.equal(els.copy.disabled, false);
});

test('copy reports when there is nothing to copy', async () => {
  const { env, doc } = fakeEnv({});
  const handle = ui.attachDaylightUi(env);
  const els = elementsOf(doc);
  els.result.textContent = '   ';
  await handle.onCopy();
  assert.equal(els.status.textContent, 'Nothing to copy yet. Check a place first.');
});

test('copy degrades when clipboard is unavailable', async () => {
  const { env, doc } = fakeEnv({});
  env.window = { navigator: {} };
  const handle = ui.attachDaylightUi(env);
  const els = elementsOf(doc);
  els.result.textContent = 'summary';
  await handle.onCopy();
  assert.equal(els.status.textContent, 'Clipboard is unavailable in this browser.');
});

test('the module registers its tests and stays inert when loaded without a DOM', () => {
  const required = fs.readFileSync(path.join(__dirname, 'REQUIRED_NODE_TEST_FILES.txt'), 'utf8');
  assert.ok(required.indexOf('tests/daylight-logic.test.js') !== -1, 'logic test must be registered');
  assert.ok(required.indexOf('tests/daylight-ui.test.js') !== -1, 'ui test must be registered');
  const source = fs.readFileSync(require.resolve('../daylight-ui.js'), 'utf8');
  const context = {};
  context.globalThis = context;
  assert.doesNotThrow(() => vm.runInNewContext(source, context));
});

test('the module exposes its API', () => {
  assert.equal(typeof ui.attachDaylightUi, 'function');
  assert.equal(typeof ui.ensureCard, 'function');
  assert.equal(typeof globalThis.DaymarkDaylightUi, 'object');
});
