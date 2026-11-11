'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const airApi = require('../air-quality-logic.js');
const ui = require('../air-quality-ui.js');

const GEO_BODY = JSON.stringify({
  results: [{ name: 'Delhi', country: 'India', latitude: 28.6139, longitude: 77.209 }]
});
const AIR_BODY = JSON.stringify({
  current: { european_aqi: 35, us_aqi: 62, pm2_5: 18.4, pm10: 41.2, ozone: 55.1, nitrogen_dioxide: 22.7 }
});

function fakeElement(tag) {
  return {
    tagName: tag,
    id: '',
    disabled: false,
    value: '',
    textContent: '',
    listeners: [],
    addEventListener(type, handler) { this.listeners.push({ type, handler }); },
    dispatchEvent(event) {
      for (const listener of this.listeners) {
        if (listener.type === event.type) listener.handler(event);
      }
      return !event.defaultPrevented;
    }
  };
}

function fakeEnv(options) {
  const opts = options || {};
  const elements = {
    'air-place': Object.assign(fakeElement('input'), { id: 'air-place', value: opts.place || '' }),
    'air-refresh': Object.assign(fakeElement('button'), { id: 'air-refresh' }),
    'air-form': Object.assign(fakeElement('form'), { id: 'air-form' }),
    'air-status': Object.assign(fakeElement('p'), { id: 'air-status' }),
    'air-result': Object.assign(fakeElement('div'), { id: 'air-result' }),
    'air-clear': Object.assign(fakeElement('button'), { id: 'air-clear' })
  };
  const env = {
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; }
    },
    window: {},
    airApi,
    fetch: opts.fetch,
    now: () => '2026-11-11T05:00:00.000Z'
  };
  return { env, elements };
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
  { prefix: airApi.AIR_QUALITY_ENDPOINT, body: AIR_BODY }
];

test('attach with no result prompts the user to check a place', () => {
  const { env, elements } = fakeEnv({});
  const handle = ui.attachAirQualityUi(env);
  assert.equal(elements['air-result'].textContent, '');
  assert.equal(elements['air-status'].textContent, 'Type a place name and tap Check.');
  assert.equal(typeof handle.onCheck, 'function');
  assert.equal(typeof handle.onClear, 'function');
});

test('form submission prevents navigation and renders the result once', async () => {
  const fetchImpl = okFetch(ROUTES);
  const { env, elements } = fakeEnv({ place: 'Delhi', fetch: fetchImpl });
  ui.attachAirQualityUi(env);
  const submit = elements['air-form'].listeners.find((listener) => listener.type === 'submit');
  assert.ok(submit, 'air form should handle native submit events');
  let prevented = false;
  await submit.handler({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'native form navigation should be prevented');
  assert.equal(fetchImpl.seen.length, 2);
  assert.equal(elements['air-result'].textContent,
    'Delhi, India · European AQI 35 (Fair) · US AQI 62 (Moderate) · PM2.5 18.4 µg/m³');
  assert.equal(elements['air-status'].textContent,
    'Updated · 2026-11-11 05:00 UTC · not saved on this device');
  assert.equal(elements['air-refresh'].disabled, false);
});

test('a concurrent submit cannot duplicate the request', async () => {
  const fetchImpl = okFetch(ROUTES);
  const { env, elements } = fakeEnv({ place: 'Delhi', fetch: fetchImpl });
  const handle = ui.attachAirQualityUi(env);
  await handle.onCheck();
  await handle.onCheck();
  assert.equal(fetchImpl.seen.length, 2, 'the busy guard must prevent a duplicate check');
  assert.equal(elements['air-refresh'].disabled, false);
});

test('Enter on the place field prevents default and checks once', async () => {
  const fetchImpl = okFetch(ROUTES);
  const { env, elements } = fakeEnv({ place: 'Delhi', fetch: fetchImpl });
  ui.attachAirQualityUi(env);
  const enter = elements['air-place'].listeners.find((listener) => listener.type === 'keydown');
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
  assert.ok(elements['air-result'].textContent.indexOf('Delhi, India') === 0);
});

test('an empty place is rejected before any network call', async () => {
  const fetchImpl = okFetch(ROUTES);
  const { env, elements } = fakeEnv({ place: '   ', fetch: fetchImpl });
  const handle = ui.attachAirQualityUi(env);
  await handle.onCheck();
  assert.equal(fetchImpl.seen.length, 0);
  assert.equal(elements['air-status'].textContent, 'Type a place name first.');
});

test('a failed check reports the error plainly and renders nothing', async () => {
  const failing = () => Promise.reject(new Error('offline'));
  const { env, elements } = fakeEnv({ place: 'Delhi', fetch: failing });
  const handle = ui.attachAirQualityUi(env);
  await handle.onCheck();
  assert.equal(elements['air-status'].textContent, 'Could not check: offline');
  assert.equal(elements['air-result'].textContent, '');
  assert.equal(elements['air-refresh'].disabled, false);
});

test('missing fetch support is reported instead of throwing', async () => {
  const { env, elements } = fakeEnv({ place: 'Delhi' });
  const handle = ui.attachAirQualityUi(env);
  await handle.onCheck();
  assert.ok(elements['air-status'].textContent.indexOf('fetch is unavailable') !== -1);
});

test('a missing air-quality module degrades honestly', () => {
  const { env, elements } = fakeEnv({});
  delete env.airApi;
  ui.attachAirQualityUi(env);
  assert.equal(elements['air-status'].textContent, 'Air quality is unavailable.');
});

test('clear empties the view and says so without touching storage', () => {
  const { env, elements } = fakeEnv({ place: 'Delhi' });
  const handle = ui.attachAirQualityUi(env);
  elements['air-result'].textContent = 'stale result';
  handle.onClear();
  assert.equal(elements['air-place'].value, '');
  assert.equal(elements['air-result'].textContent, '');
  assert.equal(elements['air-status'].textContent, 'Cleared. Type a place name and tap Check.');
});

test('the markup contract pins the card and script tags in index.html', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.indexOf('id="air-card"') !== -1, 'air card must exist in index.html');
  assert.ok(html.indexOf('<script src="air-quality-logic.js" defer></script>') !== -1,
    'air-quality-logic.js script tag must exist');
  assert.ok(html.indexOf('<script src="air-quality-ui.js" defer></script>') !== -1,
    'air-quality-ui.js script tag must exist');
  assert.ok(html.indexOf('for="air-place"') !== -1, 'the place input must be labeled');
  const required = fs.readFileSync(path.join(__dirname, '..', 'REQUIRED_NODE_TEST_FILES.txt'), 'utf8');
  assert.ok(required.indexOf('tests/air-quality-logic.test.js') !== -1, 'logic test must be registered');
  assert.ok(required.indexOf('tests/air-quality-ui.test.js') !== -1, 'ui test must be registered');
});

test('auto-boot attaches without any storage access and stays inert under Node', () => {
  const source = fs.readFileSync(require.resolve('../air-quality-ui.js'), 'utf8');
  const elements = {
    'air-place': fakeElement('input'),
    'air-refresh': fakeElement('button'),
    'air-form': fakeElement('form'),
    'air-status': fakeElement('p'),
    'air-result': fakeElement('div'),
    'air-clear': fakeElement('button')
  };
  const doc = { readyState: 'complete', getElementById(id) { return elements[id] || null; } };
  const context = { window: {}, document: doc };
  context.globalThis = context;
  assert.doesNotThrow(() => vm.runInNewContext(source, context));
  assert.equal(elements['air-status'].textContent, 'Type a place name and tap Check.');
});

test('the module exposes its API', () => {
  assert.equal(typeof ui.attachAirQualityUi, 'function');
  assert.equal(typeof globalThis.DaymarkAirQualityUi, 'object');
});
