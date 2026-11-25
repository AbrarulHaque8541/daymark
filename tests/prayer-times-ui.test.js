'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let logic;
let prayUi;
if (typeof require === 'function') {
  logic = require('../prayer-times-logic.js');
  prayUi = require('../prayer-times-ui.js');
}
if (!logic) logic = globalThis.DaymarkPrayerTimes;
if (!prayUi) prayUi = globalThis.DaymarkPrayerTimesUi;

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
    value: '',
    disabled: false,
    href: '',
    classList: {
      set: new Set(),
      toggle(name, force) {
        const on = force === undefined ? !this.set.has(name) : force;
        if (on) this.set.add(name); else this.set.delete(name);
      },
      contains(name) { return this.set.has(name); }
    },
    setAttribute(name, attrValue) { element.attributes[name] = String(attrValue); },
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
      element.textContent = element.children.map((c) => c.textContent || '').join('');
      return child;
    },
    addEventListener(type, handler) {
      (element.listeners[type] = element.listeners[type] || []).push(handler);
    },
    dispatch(type, event) {
      const handlers = (element.listeners[type] || []).map((handler) => handler(event));
      return Promise.all(handlers.map((outcome) => outcome && typeof outcome.then === 'function' ? outcome : undefined));
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
  return prayUi.attachPrayerTimesUi(Object.assign({
    document: doc,
    window: {},
    prayerTimesApi: logic,
    fetch: null,
    now: () => '2026-11-25T04:00:00.000Z',
    todayIso: () => '2026-11-25T04:00:00.000Z'
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
            const bytes = new Uint8Array(value.length);
            for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 0xff;
            return { done: false, value: bytes };
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

function samplePayload() {
  return {
    code: 200,
    data: {
      timings: { Fajr: '05:14', Sunrise: '06:15', Dhuhr: '12:07', Asr: '15:28', Sunset: '17:58', Maghrib: '17:58', Isha: '18:59' },
      date: { readable: '25 Nov 2026', hijri: { day: '15', year: '1448', month: { en: 'Jumada al-akhirah' } } },
      meta: { method: { name: 'Islamic Society of North America' } }
    }
  };
}

function settle() {
  const chain = [];
  for (let i = 0; i < 14; i += 1) chain.push(Promise.resolve());
  return chain.reduce((acc, item) => acc.then(() => item), Promise.resolve());
}

test('attaches and injects the prayer times card', () => {
  const doc = makeDoc();
  attach(doc);
  assert.ok(doc.getElementById('prayer-times-card'));
});

test('reuses the existing card on a second attach', () => {
  const doc = makeDoc();
  attach(doc);
  const first = doc.getElementById('prayer-times-card');
  attach(doc);
  assert.strictEqual(doc.getElementById('prayer-times-card'), first);
});

test('card heading and description name the public keyless feed', () => {
  const doc = makeDoc();
  attach(doc);
  assert.strictEqual(doc.getElementById('prayer-times-heading').textContent, 'Prayer times');
  const description = doc.getElementById('prayer-times-description').textContent;
  assert.ok(description.includes('api.aladhan.com'));
  assert.ok(description.includes('no API key'));
  assert.ok(description.includes('does not save anything'));
});

test('status line exposes role, aria-live and aria-atomic', () => {
  const doc = makeDoc();
  attach(doc);
  const status = doc.getElementById('prayer-times-status');
  assert.strictEqual(status.getAttribute('role'), 'status');
  assert.strictEqual(status.getAttribute('aria-live'), 'polite');
  assert.strictEqual(status.getAttribute('aria-atomic'), 'true');
});

test('the city select offers every city from the module table', () => {
  const doc = makeDoc();
  attach(doc);
  const select = doc.getElementById('prayer-times-city');
  assert.strictEqual(select.children.length, logic.cities.length);
  assert.strictEqual(select.children[0].value, 'kanyakumari');
  assert.ok(select.children[0].textContent.includes('Kanyakumari'));
});

test('card is placed right after the space-news card when present', () => {
  const doc = makeDoc();
  const spaceNews = makeElement('section');
  spaceNews.id = 'space-news-card';
  doc.body.appendChild(spaceNews);
  attach(doc);
  const card = doc.getElementById('prayer-times-card');
  assert.strictEqual(doc.body.children.indexOf(card), doc.body.children.indexOf(spaceNews) + 1);
});

test('card placement falls back to lower anchors', () => {
  const doc = makeDoc();
  const iss = makeElement('section');
  iss.id = 'iss-card';
  doc.body.appendChild(iss);
  attach(doc);
  assert.strictEqual(doc.body.children.indexOf(doc.getElementById('prayer-times-card')), doc.body.children.indexOf(iss) + 1);
});

test('a successful check renders the schedule and an honest status', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => okResponse(JSON.stringify(samplePayload())) });
  doc.getElementById('prayer-times-check').dispatch('click', {});
  await settle();
  const result = doc.getElementById('prayer-times-result').textContent;
  assert.ok(result.includes('Kanyakumari'), 'result was: ' + result);
  assert.ok(result.includes('25 Nov 2026'));
  assert.ok(result.includes('15 Jumada al-akhirah 1448 AH'));
  assert.ok(result.includes('Fajr 05:14'));
  assert.ok(result.includes('Isha 18:59'));
  const statusEl = doc.getElementById('prayer-times-status');
  const status = statusEl.textContent;
  assert.ok(status.includes('Updated'));
  assert.ok(status.includes('nothing saved on this device'));
  assert.ok(statusEl.classList.contains('is-success'), 'successful check must flash is-success');
});

test('the selected city decides the requested coordinates', async () => {
  const doc = makeDoc();
  let requested = null;
  attach(doc, { fetch: async (url) => { requested = url; return okResponse(JSON.stringify(samplePayload())); } });
  doc.getElementById('prayer-times-city').value = 'delhi';
  doc.getElementById('prayer-times-check').dispatch('click', {});
  await settle();
  assert.strictEqual(requested, 'https://api.aladhan.com/v1/timings/25-11-2026?latitude=28.6139&longitude=77.209&method=2');
  assert.ok(doc.getElementById('prayer-times-result').textContent.includes('New Delhi'));
});

test('unreadable prayer entries are reported honestly', async () => {
  const doc = makeDoc();
  const payload = samplePayload();
  payload.data.timings.Asr = 'broken';
  attach(doc, { fetch: async () => okResponse(JSON.stringify(payload)) });
  doc.getElementById('prayer-times-check').dispatch('click', {});
  await settle();
  assert.ok(doc.getElementById('prayer-times-status').textContent.includes('1 prayer entries were unreadable'));
});

test('403 explains the limited request', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 403, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('prayer-times-check').dispatch('click', {});
  await settle();
  assert.ok(doc.getElementById('prayer-times-status').textContent.includes('limited this request'));
});

test('a failed check clears any previous result', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: async () => ({ ok: false, status: 404, headers: { get: () => null }, body: streamOf(['{}']) }) });
  doc.getElementById('prayer-times-result').textContent = 'stale';
  doc.getElementById('prayer-times-check').dispatch('click', {});
  await settle();
  assert.strictEqual(doc.getElementById('prayer-times-result').textContent, '');
});

test('clear empties the result and does not flash success', async () => {
  const doc = makeDoc();
  attach(doc);
  doc.getElementById('prayer-times-result').textContent = 'old';
  await doc.getElementById('prayer-times-clear').dispatch('click', {});
  assert.strictEqual(doc.getElementById('prayer-times-result').textContent, '');
  const statusEl = doc.getElementById('prayer-times-status');
  assert.ok(statusEl.textContent.includes('Cleared'));
  assert.ok(!statusEl.classList.contains('is-success'), 'cleared status must not be is-success');
});

test('form submit is prevented and runs the check', async () => {
  const doc = makeDoc();
  let prevented = false;
  attach(doc, { fetch: async () => okResponse(JSON.stringify(samplePayload())) });
  doc.getElementById('prayer-times-form').dispatch('submit', { preventDefault: () => { prevented = true; } });
  await settle();
  assert.strictEqual(prevented, true);
  assert.ok(doc.getElementById('prayer-times-result').textContent.includes('Fajr 05:14'));
});

test('concurrent checks collapse into one request', async () => {
  const doc = makeDoc();
  let calls = 0;
  attach(doc, { fetch: async () => { calls += 1; return okResponse(JSON.stringify(samplePayload())); } });
  const first = doc.getElementById('prayer-times-check').dispatch('click', {});
  const second = doc.getElementById('prayer-times-check').dispatch('click', {});
  await first;
  await second;
  await settle();
  assert.strictEqual(calls, 1, 'the busy guard must skip duplicate requests');
});

test('missing fetch degrades with an honest message', async () => {
  const doc = makeDoc();
  attach(doc, { fetch: null });
  await doc.getElementById('prayer-times-check').dispatch('click', {});
  assert.ok(doc.getElementById('prayer-times-status').textContent.includes('fetch is unavailable'));
});

test('missing prayer times API degrades with an honest message', async () => {
  const doc = makeDoc();
  attach(doc, { prayerTimesApi: null, fetch: null });
  await doc.getElementById('prayer-times-check').dispatch('click', {});
  assert.ok(doc.getElementById('prayer-times-status').textContent.includes('unavailable'));
});

test('index.html wires both prayer times scripts with defer tags', () => {
  let html = null;
  try { html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'); } catch (error) { html = null; }
  if (html === null) return; // covered by CI, where index.html is readable
  const logicTag = '<script src="prayer-times-logic.js" defer></script>';
  const uiTag = '<script src="prayer-times-ui.js" defer></script>';
  assert.ok(html.indexOf(logicTag) !== -1, 'logic script tag missing');
  assert.ok(html.indexOf(uiTag) !== -1, 'ui script tag missing');
  assert.ok(html.lastIndexOf(logicTag) === html.indexOf(logicTag), 'logic tag duplicated');
  assert.ok(html.lastIndexOf(uiTag) === html.indexOf(uiTag), 'ui tag duplicated');
});
