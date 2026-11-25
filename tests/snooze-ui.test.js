'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ff = require('../feature-flags-logic.js');
const logic = require('../snooze-logic.js');
const ui = require('../snooze-ui.js');

const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);
const OFF_TEXT = 'Snooze pages is switched off in Feature settings. Turn it on there first.';

function makeStorage(seed) {
  const data = Object.assign({}, seed || {});
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
    snapshot: data
  };
}

function makeDocument() {
  const byId = {};
  const doc = {
    getElementById(id) { return byId[id] || null; },
    createElement(tag) {
      const el = {
        tagName: tag,
        children: [],
        attrs: {},
        listeners: {},
        className: '',
        textContent: '',
        value: '',
        setAttribute(k, v) {
          el.attrs[k] = String(v);
          if (k === 'id') byId[String(v)] = el;
        },
        getAttribute(k) { return Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : null; },
        removeAttribute(k) { delete el.attrs[k]; },
        appendChild(child) { el.children.push(child); child.parentNode = el; },
        removeChild(child) {
          const at = el.children.indexOf(child);
          if (at === -1) throw new Error("not a child");
          el.children.splice(at, 1);
          child.parentNode = null;
          return child;
        },
        insertBefore(child, anchor) {
          const at = el.children.indexOf(anchor);
          if (at === -1) el.children.push(child); else el.children.splice(at, 0, child);
          child.parentNode = el;
        },
        addEventListener(kind, fn) { (el.listeners[kind] = el.listeners[kind] || []).push(fn); },
        get firstChild() { return el.children.length > 0 ? el.children[0] : null; },
        get textContent() {
          let out = "";
          for (const child of el.children) {
            if (typeof child.textContent === "string") out += child.textContent;
            else if (child.children) out += child.textContent || "";
          }
          return out || el._textContent || "";
        },
        set textContent(v) { el._textContent = String(v); el.children = []; },
        dispatch(kind, event) {
          event = event || {};
          for (const fn of el.listeners[kind] || []) fn(event);
        }
      };
      if (el.attrs.id) byId[el.attrs.id] = el;
      return el;
    }
  };
  doc.body = doc.createElement('body');
  const storageCard = doc.createElement('aside');
  storageCard.setAttribute('id', 'storage-card');
  doc.body.appendChild(storageCard);
  doc._byId = byId;
  return doc;
}

function attachWith(doc, storage, flagSelections) {
  const handle = ui.attachSnoozeUi({
    document: doc,
    flags: ff,
    logic: logic,
    storage: storage,
    nowMs: () => NOW
  });
  if (flagSelections) {
    for (const pair of flagSelections) ff.setFlag(storage, pair[0], pair[1]);
  }
  return handle;
}

function tap(handle, doc, id) {
  doc._byId[id].dispatch('click', { preventDefault() {} });
}

test('attach renders the card before the storage card with every control present', () => {
  const doc = makeDocument();
  const storage = makeStorage({});
  const handle = attachWith(doc, storage);
  assert.equal(handle.card.className, 'suggestion-card');
  const host = storageCardHost(doc);
  assert.equal(host[0].getAttribute('id'), 'snooze-card');
  assert.ok(doc._byId['snooze-url'], 'url input exists');
  assert.ok(doc._byId['snooze-wake'], 'wake input exists');
  assert.ok(doc._byId['snooze-note'], 'note input exists');
  for (const id of ['snooze-save', 'snooze-refresh', 'snooze-clear', 'snooze-status', 'snooze-list']) {
    assert.ok(doc.getElementById(id), id + ' exists');
  }
});

function storageCardHost(doc) {
  const out = [];
  walk(doc.body);
  return out;
  function walk(node) {
    if (!node) return;
    if (node.getAttribute && node.getAttribute('id') === 'snooze-card') out.push(node);
    for (const child of node.children || []) walk(child);
  }
}

test('attach twice does not duplicate the card', () => {
  const doc = makeDocument();
  const storage = makeStorage({});
  attachWith(doc, storage);
  const second = ui.attachSnoozeUi({ document: doc, flags: ff, logic: logic, storage: storage });
  assert.equal(second, null);
  assert.equal(looksForCards(doc).length, 1);
});

function looksForCards(doc) {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (node.getAttribute && node.getAttribute('id') === 'snooze-card') out.push(node);
    for (const child of node.children || []) walk(child);
  };
  walk(doc.body);
  return out;
}

test('attach without engines or document refuses honestly rather than half-wiring', () => {
  assert.equal(ui.attachSnoozeUi(null), null);
  assert.equal(ui.attachSnoozeUi({ flags: ff, logic: logic }), null);
  assert.equal(ui.attachSnoozeUi({ document: makeDocument(), flags: ff }), null);
  assert.equal(ui.attachSnoozeUi({ document: makeDocument(), logic: logic }), null);
});

test('a missing engine paragraph: attach is rejected when logic lacks readSnoozes', () => {
  const doc = makeDocument();
  const result = ui.attachSnoozeUi({ document: doc, flags: ff, logic: {}, storage: makeStorage({}) });
  assert.equal(result, null);
});

test('flag off at attach states exactly where the switch lives', () => {
  const doc = makeDocument();
  const storage = makeStorage({});
  const handle = attachWith(doc, storage);
  assert.match(handle.statusEl.textContent, /switched off in Feature settings/);
});

test('flag on at attach leaves status quiet, cards render alone', () => {
  const doc = makeDocument();
  const storage = makeStorage({ [ff.STORAGE_KEY]: JSON.stringify(Object.assign(ff.defaults(), { 'snooze-pages': true })) });
  const handle = attachWith(doc, storage);
  assert.equal(handle !== null, true);
  assert.equal(handle.statusEl.textContent, '');
});

test('save with the flag off never writes and says where to opt in', () => {
  const doc = makeDocument();
  const storage = makeStorage({});
  const handle = attachWith(doc, storage);
  saveForm(handle, 'https://example.com/a');
  tap(handle, doc, 'snooze-save');
  assert.match(handle.statusEl.textContent, /Feature settings/);
  assert.equal(storage.snapshot[logic.STORAGE_KEY], undefined);
});

function saveForm(handle, url, wake, note) {
  handle.urlInput.value = url;
  handle.wakeInput.value = wake || '2026-11-25T09:30';
  handle.noteInput.value = note || '';
}

test('save with the flag on parks the page and renders the waiting row', () => {
  const doc = makeDocument();
  const storage = makeStorage({});
  const handle = attachWith(doc, storage, [['snooze-pages', true]]);
  saveForm(handle, 'https://example.com/article', '2026-11-25T09:30', 'finish the piece');
  tap(handle, doc, 'snooze-save');
  assert.match(handle.statusEl.textContent, /Saved on this device/);
  assert.match(handle.statusEl.textContent, /2026-11-25 09:30 UTC/);
  assert.match(handle.listEl.textContent, /waits until 2026-11-25 09:30 UTC/);
  assert.match(handle.listEl.textContent, /finish the piece/);
});

test('save keeps only the most recent snooze row honest and clears the form inputs', () => {
  const doc = makeDocument();
  const storage = makeStorage({});
  const handle = attachWith(doc, storage, [['snooze-pages', true]]);
  saveForm(handle, 'https://example.com/first-attempt', '2026-11-25T09:30', 'will be replaced');
  tap(handle, doc, 'snooze-save');
  assert.equal(handle.urlInput.value, '');
  assert.equal(handle.wakeInput.value, '');
  assert.equal(handle.noteInput.value, '');
});

test('save failures land on plain-language reasons and write nothing', () => {
  const doc = makeDocument();
  const storage = makeStorage({});
  const handle = attachWith(doc, storage, [['snooze-pages', true]]);
  saveForm(handle, 'not-a-url', '2026-11-25T09:30');
  tap(handle, doc, 'snooze-save');
  assert.match(handle.statusEl.textContent, /full web address/);
  saveForm(handle, 'https://example.com/x', 'mangled');
  tap(handle, doc, 'snooze-save');
  assert.match(handle.statusEl.textContent, /wake date and time/);
  saveForm(handle, 'https://example.com/x', '2026-11-01T09:00');
  tap(handle, doc, 'snooze-save');
  assert.match(handle.statusEl.textContent, /still in the future/);
  assert.equal(storage.snapshot[logic.STORAGE_KEY], undefined);
});

test('a duplicate pending page is refused with its own sentence', () => {
  const doc = makeDocument();
  const storage = makeStorage({});
  const handle = attachWith(doc, storage, [['snooze-pages', true]]);
  saveForm(handle, 'https://example.com/twice', '2026-11-25T09:30');
  tap(handle, doc, 'snooze-save');
  saveForm(handle, 'https://example.com/twice', '2026-11-26T09:30');
  tap(handle, doc, 'snooze-save');
  assert.match(handle.statusEl.textContent, /already waiting/);
  const read = logic.readSnoozes(storage);
  assert.equal(read.snoozes.length, 1);
});

test('a read failure (malformed saved state) is explained before anything is written', () => {
  const doc = makeDocument();
  const storage = makeStorage({ [logic.STORAGE_KEY]: 'not json at all' });
  const handle = attachWith(doc, storage, [['snooze-pages', true]]);
  saveForm(handle, 'https://example.com/after-bad', '2026-11-25T09:30');
  tap(handle, doc, 'snooze-save');
  assert.match(handle.statusEl.textContent, /unreadable/);
  assert.equal(storage.snapshot[logic.STORAGE_KEY], 'not json at all');
});

test('check dues moves a past wake time to the due list with an open link', () => {
  const doc = makeDocument();
  const storage = makeStorage({});
  const handle = attachWith(doc, storage, [['snooze-pages', true]]);
  const made = { id: 'snooze-due-now-1', url: 'https://example.com/due-now', wakeAtMs: Date.UTC(2026, 10, 24, 10, 0, 0), note: '', createdAtMs: NOW };
  logic.writeSnoozes(storage, [made]);
  handle.renderList();
  assert.match(handle.listEl.textContent, /due since 2026-11-24 10:00 UTC/);
  const link = handle.listEl.children[0].children[0];
  assert.equal(link.getAttribute('href'), 'https://example.com/due-now');
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
});

test('check dues with the flag off reminds where the switch lives', () => {
  const doc = makeDocument();
  const storage = makeStorage({});
  const handle = attachWith(doc, storage);
  tap(handle, doc, 'snooze-refresh');
  assert.match(handle.statusEl.textContent, /Feature settings/);
});

test('clear all removes the saved list and reports the count; empty clear is honest', () => {
  const doc = makeDocument();
  const storage = makeStorage({});
  const handle = attachWith(doc, storage, [['snooze-pages', true]]);
  saveForm(handle, 'https://example.com/bye', '2026-11-25T09:30');
  tap(handle, doc, 'snooze-save');
  tap(handle, doc, 'snooze-clear');
  assert.match(handle.statusEl.textContent, /Cleared 1 parked page/);
  assert.equal(storage.snapshot[logic.STORAGE_KEY], undefined);
  tap(handle, doc, 'snooze-clear');
  assert.match(handle.statusEl.textContent, /Nothing is parked/);
});

test('each rendered row carries its own remove button and remove updates the card', () => {
  const doc = makeDocument();
  const storage = makeStorage({});
  const handle = attachWith(doc, storage, [['snooze-pages', true]]);
  saveForm(handle, 'https://example.com/keep', '2026-11-25T09:30');
  tap(handle, doc, 'snooze-save');
  saveForm(handle, 'https://example.com/drop', '2026-11-26T09:30');
  tap(handle, doc, 'snooze-save');
  const buttons = [];
  const walk = (node) => {
    if (!node) return;
    if (node.getAttribute && node.getAttribute('data-remove-id')) buttons.push(node);
    for (const child of node.children || []) walk(child);
  };
  walk(handle.listEl);
  assert.equal(buttons.length, 2);
  buttons[0].dispatch('click', { preventDefault() {} });
  assert.match(handle.statusEl.textContent, /Removed/);
  assert.equal(logic.readSnoozes(storage).snoozes.length, 1);
});

test('a wrong-element tap on the list is ignored without touching storage', () => {
  const doc = makeDocument();
  const storage = makeStorage({});
  const handle = attachWith(doc, storage, [['snooze-pages', true]]);
  saveForm(handle, 'https://example.com/safe', '2026-11-25T09:30');
  tap(handle, doc, 'snooze-save');
  handle.listEl.dispatch('click', { target: handle.listEl, preventDefault() {} });
  assert.equal(logic.readSnoozes(storage).snoozes.length, 1);
});
