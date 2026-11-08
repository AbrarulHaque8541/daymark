'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zonesApi = require('../zones-logic.js');
const ui = require('../zones-ui.js');

const FROZEN_NOW = '2026-11-08T12:00:00.000Z';


function fakeElement(tag) {
  const el = {
    tagName: tag,
    id: '',
    disabled: false,
    value: '',
    textContent: '',
    children: [],
    listeners: [],
    classList: {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      toggle(c, force) {
        if (force === true) this.classes.add(c);
        else if (force === false) this.classes.delete(c);
        else this.classes.has(c) ? this.classes.delete(c) : this.classes.add(c);
        return this.classes.has(c);
      },
      contains(c) { return this.classes.has(c); }
    },
    addEventListener(type, handler) { this.listeners.push({ type, handler }); },
    setAttribute(name, value) { this[name] = value; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this, name) ? this[name] : undefined; },
    removeAttribute(name) { delete this[name]; },
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      return child;
    },
    get firstChild() { return this.children[0] || null; }
  };
  return el;
}


function makeCache(zones, updatedAt) {
  return { version: 1, zones, updatedAt: updatedAt || '2026-11-08T08:30:00.000Z' };
}

function fakeEnv(options) {
  const opts = options || {};
  const elements = {
    'zones-pick': Object.assign(fakeElement('select'), { id: 'zones-pick', value: opts.pick || 'Asia/Kolkata' }),
    'zones-add': Object.assign(fakeElement('button'), { id: 'zones-add', type: 'submit' }),
    'zones-refresh': Object.assign(fakeElement('button'), { id: 'zones-refresh', type: 'button' }),
    'zones-clear': Object.assign(fakeElement('button'), { id: 'zones-clear', type: 'button' }),
    'zones-copy': Object.assign(fakeElement('button'), { id: 'zones-copy', type: 'button' }),
    'zones-share': Object.assign(fakeElement('button'), { id: 'zones-share', type: 'button' }),
    'zones-form': Object.assign(fakeElement('form'), { id: 'zones-form' }),
    'zones-status': Object.assign(fakeElement('p'), { id: 'zones-status' }),
    'zones-list': Object.assign(fakeElement('div'), { id: 'zones-list' })
  };
  const storageData = opts.storageData || {};
  if (opts.stored) storageData[ui.STORAGE_KEY] = opts.stored;
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { storageData[key] = value; },
    removeItem(key) { delete storageData[key]; }
  };
  const doc = {
    getElementById(id) { return elements[id] || null; },
    createElement(tag) { return fakeElement(tag); }
  };
  return {
    env: {
      document: doc,
      localStorage: storage,
      zonesApi: opts.zonesApi !== undefined ? opts.zonesApi : zonesApi,
      now: () => opts.now || FROZEN_NOW,
      navigator: opts.navigator
    },
    elements,
    storageData
  };
}

function rowTexts(listEl) {
  return listEl.children.map((row) => row.children.map((child) => child.textContent));
}

test('attach renders the default zone and an honest overlap row with no cache', () => {
  const { env, elements } = fakeEnv();
  ui.attachZonesUi(env);
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][1], 'India · Kolkata — 17:30');
  assert.equal(rows[1][0], 'Best shared window');
  assert.ok(rows[1][1].indexOf('awake') !== -1);
});

test('attach restores a saved zone list with a cached note', () => {
  const stored = JSON.stringify(makeCache(['Europe/London', 'America/New_York']));
  const { env, elements } = fakeEnv({ stored });
  ui.attachZonesUi(env);
  assert.ok(elements['zones-status'].textContent.indexOf('Restored 2 zones') !== -1);
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 3);
  assert.equal(rows[0][1], 'UK · London — 12:00');
  assert.equal(rows[1][1], 'US East · New York — 07:00');
});

test('a corrupt cache fails closed and starts from the default zone', () => {
  const { env, elements } = fakeEnv({ stored: '{not json' });
  ui.attachZonesUi(env);
  assert.ok(elements['zones-status'].textContent.indexOf('Started with') !== -1);
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][1], 'India · Kolkata — 17:30');
});

test('adding a zone persists it and announces the add', async () => {
  const { env, elements, storageData } = fakeEnv();
  const handle = ui.attachZonesUi(env);
  elements['zones-pick'].value = 'Europe/Berlin';
  await handle.onAdd();
  assert.ok(elements['zones-status'].textContent.indexOf('Added Germany · Berlin') !== -1);
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.deepEqual(saved.zones, ['Asia/Kolkata', 'Europe/Berlin']);
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 3);
});

test('duplicate and unsupported adds are rejected', async () => {
  const { env, elements } = fakeEnv();
  const handle = ui.attachZonesUi(env);
  elements['zones-pick'].value = 'Asia/Kolkata';
  await handle.onAdd();
  assert.equal(elements['zones-status'].textContent, 'That time zone is already on the card.');
  elements['zones-pick'].value = 'Mars/Olympus';
  await handle.onAdd();
  assert.equal(elements['zones-status'].textContent, 'Choose a supported time zone first.');
});

test('the card refuses a seventh zone', async () => {
  const stored = JSON.stringify(makeCache(zonesApi.ZONE_CATALOG.slice(0, 6).map((zone) => zone.id)));
  const { env, elements } = fakeEnv({ stored, pick: 'Africa/Lagos' });
  const handle = ui.attachZonesUi(env);
  await handle.onAdd();
  assert.ok(elements['zones-status'].textContent.indexOf('Up to 6 zones') !== -1);
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 7);
});

test('removing a zone is announced and the last zone is protected', async () => {
  const stored = JSON.stringify(makeCache(['Asia/Kolkata', 'Europe/London']));
  const { env, elements } = fakeEnv({ stored });
  ui.attachZonesUi(env);
  const firstRow = elements['zones-list'].children[0];
  const removeBtn = firstRow.children.find((child) => child.tagName === 'button');
  assert.ok(removeBtn, 'each zone row has a remove button');
  assert.equal(removeBtn.getAttribute('aria-label'), 'Remove India · Kolkata');
  await removeBtn.listeners[0].handler();
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][1], 'UK · London — 12:00');
});

test('refresh recomputes every clock from the current time', async () => {
  const stored = JSON.stringify(makeCache(['Asia/Kolkata', 'Europe/London']));
  const { env, elements, storageData } = fakeEnv({ stored });
  const handle = ui.attachZonesUi(env);
  await handle.onRefresh();
  assert.ok(elements['zones-status'].textContent.startsWith('Updated · 2026-11-08 12:00 UTC'));
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.equal(saved.updatedAt, FROZEN_NOW);
  assert.equal(rowTexts(elements['zones-list']).length, 3);
});

test('clear removes the saved list and resets to the default zone', async () => {
  const stored = JSON.stringify(makeCache(['Europe/London']));
  const { env, elements, storageData } = fakeEnv({ stored });
  const handle = ui.attachZonesUi(env);
  await handle.onClear();
  assert.equal(storageData[ui.STORAGE_KEY], undefined);
  assert.equal(elements['zones-pick'].value, 'Asia/Kolkata');
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][1], 'India · Kolkata — 17:30');
});

test('form submission is prevented and adds the picked zone', async () => {
  const { env, elements } = fakeEnv({ pick: 'Asia/Tokyo' });
  ui.attachZonesUi(env);
  const form = elements['zones-form'];
  const submit = form.listeners.find((listener) => listener.type === 'submit');
  assert.ok(submit);
  let prevented = false;
  await submit.handler({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.ok(elements['zones-status'].textContent.indexOf('Added Japan · Tokyo') !== -1);
});

test('the add button click listener is registered', () => {
  const { env, elements } = fakeEnv();
  ui.attachZonesUi(env);
  const clicks = elements['zones-add'].listeners.filter((listener) => listener.type === 'click');
  assert.equal(clicks.length, 1);
});

test('a missing zones module is reported instead of crashing', () => {
  const { env, elements } = fakeEnv({ zonesApi: null });
  ui.attachZonesUi(env);
  assert.equal(elements['zones-status'].textContent, 'World clock is unavailable.');
  assert.equal(elements['zones-list'].children.length, 0);
});

test('the module exposes its API and stays inert under Node', () => {
  assert.equal(typeof ui.attachZonesUi, 'function');
  assert.equal(ui.STORAGE_KEY, 'daymark.zones.v1');
});

test('copy overlap writes a multi-line summary to an injected clipboard and reports status', async () => {
  const stored = JSON.stringify(makeCache(['Asia/Kolkata', 'Europe/London']));
  let written = null;
  const navigator = { clipboard: { writeText: async (text) => { written = text; } } };
  const { env, elements } = fakeEnv({ stored, navigator });
  const handle = ui.attachZonesUi(env);
  await handle.onCopy();
  assert.ok(written && written.indexOf('Daymark world clock') !== -1);
  assert.ok(written.indexOf('Best shared window') !== -1);
  assert.equal(elements['zones-status'].textContent, 'Copied world clock and overlap to clipboard.');
});

test('copy reports nothing when the zones module is missing', async () => {
  const { env, elements } = fakeEnv({ zonesApi: null });
  const handle = ui.attachZonesUi(env);
  await handle.onCopy();
  assert.equal(elements['zones-status'].textContent, 'Nothing to copy yet.');
});

test('share overlap calls navigator.share with the summary and reports status', async () => {
  const stored = JSON.stringify(makeCache(['Asia/Kolkata']));
  let shared = null;
  const navigator = { share: async (data) => { shared = data; } };
  const { env, elements } = fakeEnv({ stored, navigator });
  const handle = ui.attachZonesUi(env);
  await handle.onShare();
  assert.ok(shared && shared.text && shared.text.indexOf('Daymark world clock') !== -1);
  assert.equal(elements['zones-status'].textContent, 'Shared world clock and overlap.');
});

test('share reports unavailable when navigator.share is missing', async () => {
  const stored = JSON.stringify(makeCache(['Asia/Kolkata']));
  const { env, elements } = fakeEnv({ stored, navigator: {} });
  const handle = ui.attachZonesUi(env);
  await handle.onShare();
  assert.equal(elements['zones-status'].textContent, 'Sharing is not available in this environment.');
});

test('share reports nothing when the zones module is missing', async () => {
  const { env, elements } = fakeEnv({ zonesApi: null });
  const handle = ui.attachZonesUi(env);
  await handle.onShare();
  assert.equal(elements['zones-status'].textContent, 'Nothing to share yet.');
});
