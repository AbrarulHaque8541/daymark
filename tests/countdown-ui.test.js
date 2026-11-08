'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../countdown-ui.js');
const logic = require('../countdown-logic.js');

function fakeDoc() {
  const els = {};
  return {
    getElementById(id) { return els[id] || null; },
    createElement(tag) {
      const el = { tagName: tag, children: [], textContent: '', setAttribute() {}, addEventListener() {}, appendChild(c) { this.children.push(c); } };
      return el;
    },
    setEl(id, el) { els[id] = el; }
  };
}

function fakeStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem(k) { return data[k] ?? null; },
    setItem(k, v) { data[k] = String(v); },
    snapshot: data
  };
}

test('attachCountdownUi restores and adds items with injectable storage', () => {
  const doc = fakeDoc();
  const nameEl = { value: 'Trip' };
  const dateEl = { value: '2026-12-25' };
  const statusEl = { textContent: '' };
  const listEl = { replaceChildren() { this.children = []; }, appendChild() {}, children: [] };
  doc.setEl('countdown-name', nameEl);
  doc.setEl('countdown-date', dateEl);
  doc.setEl('countdown-status', statusEl);
  doc.setEl('countdown-list', listEl);
  doc.setEl('countdown-form', { addEventListener() {} });
  const store = fakeStorage({ [ui.STORAGE_KEY]: JSON.stringify([{ id: 'old', name: 'Old', date: '2026-11-01' }]) });
  const handle = ui.attachCountdownUi({
    document: doc,
    localStorage: store,
    countdownApi: logic,
    now: () => new Date(2026, 10, 8)
  });
  assert.equal(handle.items().length, 1);
  assert.equal(statusEl.textContent.includes('1 countdown'), true);
  handle.onAdd({ preventDefault() {} });
  assert.equal(handle.items().length, 2);
  assert.equal(store.snapshot[ui.STORAGE_KEY].includes('Trip'), true);
  handle.onClear();
  assert.equal(handle.items().length, 0);
});

test('rejects invalid date and duplicate', () => {
  const doc = fakeDoc();
  const nameEl = { value: 'X' };
  const dateEl = { value: 'bad' };
  const statusEl = { textContent: '' };
  doc.setEl('countdown-name', nameEl);
  doc.setEl('countdown-date', dateEl);
  doc.setEl('countdown-status', statusEl);
  doc.setEl('countdown-list', { replaceChildren() {}, appendChild() {} });
  const store = fakeStorage();
  const handle = ui.attachCountdownUi({ document: doc, localStorage: store, countdownApi: logic });
  handle.onAdd({ preventDefault() {} });
  assert.equal(statusEl.textContent.includes('valid date'), true);
  assert.equal(handle.items().length, 0);
});

test('module exposes STORAGE_KEY and stays inert under Node', () => {
  assert.equal(ui.STORAGE_KEY, 'daymark.countdowns.v1');
  assert.equal(typeof globalThis.DaymarkCountdownUi, 'object');
});
