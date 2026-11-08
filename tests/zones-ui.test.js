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
    'zones-form': Object.assign(fakeElement('form'), { id: 'zones-form' }),
    'zones-status': Object.assign(fakeElement('p'), { id: 'zones-status' }),
    'zones-list': Object.assign(fakeElement('div'), { id: 'zones-list' })
  };
  const storageData = {};
  if (opts.stored !== undefined) storageData[ui.STORAGE_KEY] = opts.stored;
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { storageData[key] = String(value); },
    removeItem(key) { delete storageData[key]; }
  };
  const env = {
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; },
      createElement(tag) { return fakeElement(tag); }
    },
    window: {},
    localStorage: storage,
    zonesApi: opts.zonesApi,
    now: () => FROZEN_NOW
  };
  return { env, elements, storageData };
}

function rowTexts(listEl) {
  return listEl.children.map((row) => row.children.map((child) => child.textContent));
}

test('attach renders the default zone and an honest overlap row with no cache', () => {
  const { env, elements } = fakeEnv({});
  const handle = ui.attachZonesUi(env);
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][0], 'UTC+05:30 · Sun 08 Nov');
  assert.equal(rows[0][1], 'India · Kolkata — 17:30');
  assert.equal(rows[0][2], 'Remove');
  assert.equal(rows[1][0], 'Best shared window');
  assert.ok(rows[1][1].length > 0, 'the overlap row always explains the best window');
  assert.equal(elements['zones-status'].textContent,
    'Pick time zones to compare. Everything is computed offline.');
  assert.equal(typeof handle.onRefresh, 'function');
});

test('attach restores a saved zone list with a cached note', () => {
  const stored = JSON.stringify(makeCache(['Asia/Kolkata', 'Europe/London']));
  const { env, elements } = fakeEnv({ stored });
  ui.attachZonesUi(env);
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][1], 'UK · London — 12:00');
  assert.ok(elements['zones-status'].textContent.startsWith('Cached · updated 2026-11-08 08:30 UTC'));
});

test('a corrupt cache is ignored instead of crashing', () => {
  const { env, elements } = fakeEnv({ stored: '{not json' });
  ui.attachZonesUi(env);
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][1], 'India · Kolkata — 17:30');
  assert.equal(elements['zones-status'].textContent,
    'Pick time zones to compare. Everything is computed offline.');
});

test('add appends the picked zone, renders it, and persists the list', async () => {
  const { env, elements, storageData } = fakeEnv({ pick: 'Europe/London' });
  const handle = ui.attachZonesUi(env);
  await handle.onAdd();
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][1], 'UK · London — 12:00');
  assert.ok(elements['zones-status'].textContent.startsWith('Added UK · London'));
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.ok(zonesApi.validateZonesCache(saved));
  assert.deepEqual(saved.zones, ['Asia/Kolkata', 'Europe/London']);
});

test('adding a zone that is already on the card is rejected honestly', async () => {
  const { env, elements, storageData } = fakeEnv({ pick: 'Asia/Kolkata' });
  const handle = ui.attachZonesUi(env);
  await handle.onAdd();
  assert.equal(elements['zones-status'].textContent, 'That time zone is already on the card.');
  assert.equal(storageData[ui.STORAGE_KEY], undefined);
});

test('the card caps how many zones it keeps', async () => {
  const stored = JSON.stringify(makeCache([
    'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
    'Europe/London', 'Europe/Berlin'
  ]));
  const { env, elements } = fakeEnv({ stored, pick: 'Pacific/Auckland' });
  const handle = ui.attachZonesUi(env);
  await handle.onAdd();
  assert.equal(elements['zones-status'].textContent,
    'Up to ' + zonesApi.MAX_ZONES + ' zones fit on the card. Remove one first.');
});

test('the last zone cannot be removed', async () => {
  const { env, elements } = fakeEnv({});
  const handle = ui.attachZonesUi(env);
  await handle.onRemove('Asia/Kolkata');
  assert.equal(elements['zones-status'].textContent, 'Keep at least one time zone on the card.');
  assert.equal(rowTexts(elements['zones-list']).length, 2);
});

test('remove drops a zone, persists the list, and rerenders', async () => {
  const stored = JSON.stringify(makeCache(['Asia/Kolkata', 'Europe/London']));
  const { env, elements, storageData } = fakeEnv({ stored });
  const handle = ui.attachZonesUi(env);
  await handle.onRemove('Europe/London');
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 2);
  assert.ok(elements['zones-status'].textContent.startsWith('Removed UK · London'));
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.deepEqual(saved.zones, ['Asia/Kolkata']);
});

test('the per-row remove button is wired', async () => {
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
  assert.equal(elements['zones-status'].textContent, 'Updated · 2026-11-08 12:00 UTC');
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
  assert.equal(elements['zones-status'].textContent, 'World clock cleared on this device.');
});

test('form submission is prevented and adds the picked zone', async () => {
  const { env, elements } = fakeEnv({ pick: 'Asia/Tokyo' });
  ui.attachZonesUi(env);
  const submit = elements['zones-form'].listeners.find((listener) => listener.type === 'submit');
  assert.ok(submit, 'the zones form handles native submit events');
  let prevented = false;
  await submit.handler({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'native form navigation is prevented');
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][1], 'Japan · Tokyo — 21:00');
});

test('the add button click listener is registered', async () => {
  const { env, elements } = fakeEnv({ pick: 'Asia/Tokyo' });
  ui.attachZonesUi(env);
  const click = elements['zones-add'].listeners.find((l) => l.type === 'click');
  assert.ok(click, 'the add button has a click listener');
  await click.handler();
  assert.equal(rowTexts(elements['zones-list']).length, 3);
});

test('a missing zones module is reported instead of crashing', () => {
  const { env, elements } = fakeEnv({ zonesApi: null });
  const handle = ui.attachZonesUi(env);
  assert.equal(elements['zones-status'].textContent, 'World clock is unavailable.');
  assert.equal(elements['zones-list'].children.length, 0);
  handle.onAdd();
  handle.onRefresh();
  assert.equal(elements['zones-status'].textContent, 'World clock is unavailable.');
});

test('the module exposes its API and stays inert under Node', () => {
  assert.equal(typeof ui.attachZonesUi, 'function');
  assert.equal(ui.STORAGE_KEY, 'daymark.zones.v1');
  assert.equal(ui.DEFAULT_ZONE, 'Asia/Kolkata');
  assert.equal(typeof globalThis.DaymarkZonesUi, 'object');
});
