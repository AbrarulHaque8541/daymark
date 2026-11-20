'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = require('../command-bar-ui.js');
const bar = require('../command-bar-logic.js');
const flags = require('../feature-flags-logic.js');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'command-bar-ui.js'), 'utf8');

function makeElement(tagName) {
  const el = {
    tagName: tagName,
    className: '',
    textContent: '',
    value: '',
    disabled: false,
    checked: false,
    children: [],
    listeners: {},
    attrs: {},
    parentNode: null,
    appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
    removeChild(child) {
      const index = el.children.indexOf(child);
      if (index !== -1) el.children.splice(index, 1);
      child.parentNode = null;
      return child;
    },
    addEventListener(type, handler) { (el.listeners[type] = el.listeners[type] || []).push(handler); },
    dispatch(type, ev) {
      const event = Object.assign({ type: type, target: el }, ev || {});
      for (const handler of (el.listeners[type] || []).slice()) handler(event);
    },
    setAttribute(name, value) { el.attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : null; },
    focus() { el.focused = true; },
    scrollIntoView() { el.scrolled = (el.scrolled || 0) + 1; }
  };
  Object.defineProperty(el, 'firstChild', { get() { return el.children.length ? el.children[0] : null; } });
  el.classList = {
    contains(name) { return (' ' + el.className + ' ').indexOf(' ' + name + ' ') !== -1; },
    add(name) { if (!el.classList.contains(name)) el.className = (el.className + ' ' + name).trim(); },
    remove(name) {
      const parts = el.className.split(' ').filter((piece) => piece && piece !== name);
      el.className = parts.join(' ');
    }
  };
  return el;
}

function findAll(node, out) {
  out = out || [];
  for (const child of node.children) {
    out.push(child);
    findAll(child, out);
  }
  return out;
}

function makeDoc() {
  const head = makeElement('head');
  const body = makeElement('body');
  const elements = { 'storage-card': makeElement('div') };
  const docListeners = {};
  return {
    head: head,
    body: body,
    getElementById(id) {
      if (Object.prototype.hasOwnProperty.call(elements, id)) return elements[id];
      const pool = findAll(head).concat(findAll(body));
      for (const node of pool) {
        if (node.getAttribute('id') === id) return node;
      }
      return null;
    },
    createElement(tagName) { return makeElement(tagName); },
    addEventListener(type, handler) { (docListeners[type] = docListeners[type] || []).push(handler); },
    dispatchDoc(type, ev) {
      for (const handler of (docListeners[type] || []).slice()) handler(ev);
    }
  };
}

function makeStorage(seed) {
  const data = new Map();
  for (const key of Object.keys(seed || {})) data.set(key, seed[key]);
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
}

function makeWindow() {
  const openedUrls = [];
  return {
    openedUrls: openedUrls,
    open(url, target, features) { openedUrls.push({ url: url, target: target, features: features }); }
  };
}

function flagsOnStorage() {
  const saved = { 'command-bar': true, 'search-bangs': true, 'comfort-tint': false, 'mindful-breaks': false, 'focus-mode': false };
  return makeStorage({ 'daymark.features.v1': JSON.stringify(saved) });
}

function makeEnv(doc, storage, windowObj) {
  return { document: doc, flags: flags, commandBar: bar, storage: storage, window: windowObj };
}

test('the overlay mounts as an accessible dialog and a second attach is refused', () => {
  const doc = makeDoc();
  const handle = ui.attachCommandBarUi(makeEnv(doc, flagsOnStorage(), makeWindow()));
  assert.ok(handle);
  assert.equal(handle.overlay.getAttribute('id'), 'command-bar-overlay');
  assert.equal(handle.overlay.getAttribute('role'), 'dialog');
  assert.equal(handle.overlay.getAttribute('aria-modal'), 'true');
  assert.equal(handle.input.getAttribute('role'), 'combobox');
  assert.equal(handle.statusEl.getAttribute('aria-live'), 'polite');
  assert.equal(ui.attachCommandBarUi(makeEnv(doc, flagsOnStorage(), makeWindow())), null);
});

test('with the flag off, opening is refused honestly and no keyboard path can summon it', () => {
  const doc = makeDoc();
  const windowObj = makeWindow();
  const handle = ui.attachCommandBarUi(makeEnv(doc, makeStorage({}), windowObj));
  doc.dispatchDoc('keydown', { key: 'k', ctrlKey: true });
  assert.equal(windowObj.openedUrls.length, 0);
  assert.equal(handle.overlay.classList.contains('is-open'), false);
  assert.equal(handle.statusEl.textContent.indexOf('switched off in Feature settings') !== -1, true);
});

test('Ctrl+K opens the palette, Escape (document or input) closes it', () => {
  const doc = makeDoc();
  const handle = ui.attachCommandBarUi(makeEnv(doc, flagsOnStorage(), makeWindow()));
  doc.dispatchDoc('keydown', { key: 'k', ctrlKey: true });
  assert.equal(handle.isOpen(), true);
  assert.equal(handle.overlay.classList.contains('is-open'), true);
  doc.dispatchDoc('keydown', { key: 'Escape' });
  assert.equal(handle.isOpen(), false);
  doc.dispatchDoc('keydown', { key: 'k', ctrlKey: true });
  handle.input.dispatch('keydown', { key: 'Escape' });
  assert.equal(handle.isOpen(), false);
});

test('Cmd+K toggles the palette too', () => {
  const doc = makeDoc();
  const handle = ui.attachCommandBarUi(makeEnv(doc, flagsOnStorage(), makeWindow()));
  doc.dispatchDoc('keydown', { key: 'k', metaKey: true });
  assert.equal(handle.isOpen(), true);
  doc.dispatchDoc('keydown', { key: 'k', metaKey: true });
  assert.equal(handle.isOpen(), false);
});

test('a toggle command runs from the palette and flips the saved flag', () => {
  const doc = makeDoc();
  const base = { 'command-bar': true, 'search-bangs': false, 'comfort-tint': false, 'mindful-breaks': false, 'focus-mode': false };
  const storage = makeStorage({ 'daymark.features.v1': JSON.stringify(base) });
  const handle = ui.attachCommandBarUi(makeEnv(doc, storage, makeWindow()));
  handle.open();
  handle.input.value = 'toggle the command bar';
  handle.input.dispatch('input', {});
  handle.input.dispatch('keydown', { key: 'Enter' });
  assert.equal(JSON.parse(storage.getItem('daymark.features.v1'))['command-bar'], false);
  assert.match(handle.statusEl.textContent, /now off/);
});

test('!d opens DuckDuckGo in a new tab with noopener', () => {
  const doc = makeDoc();
  const windowObj = makeWindow();
  const handle = ui.attachCommandBarUi(makeEnv(doc, flagsOnStorage(), windowObj));
  handle.open();
  handle.input.value = '!d daymark repo';
  handle.input.dispatch('input', {});
  handle.input.dispatch('keydown', { key: 'Enter' });
  assert.deepEqual(windowObj.openedUrls, [
    { url: 'https://duckduckgo.com/?q=daymark+repo', target: '_blank', features: 'noopener' }
  ]);
});

test('open example.com promotes the domain to https', () => {
  const doc = makeDoc();
  const windowObj = makeWindow();
  const handle = ui.attachCommandBarUi(makeEnv(doc, flagsOnStorage(), windowObj));
  handle.open();
  handle.input.value = 'open example.com';
  handle.input.dispatch('input', {});
  handle.input.dispatch('keydown', { key: 'Enter' });
  assert.deepEqual(windowObj.openedUrls, [
    { url: 'https://example.com', target: '_blank', features: 'noopener' }
  ]);
});

test('go-to commands scroll the card into view and close the palette', () => {
  const doc = makeDoc();
  const handle = ui.attachCommandBarUi(makeEnv(doc, flagsOnStorage(), makeWindow()));
  handle.open();
  const gotoCommand = bar.buildCommands().filter((c) => c.id === 'goto:storage-card')[0];
  handle.run(gotoCommand);
  assert.equal(doc.getElementById('storage-card').scrolled, 1);
  assert.equal(handle.isOpen(), false);
  assert.match(handle.statusEl.textContent, /Jumped to Go to Local data/);
});

test('with !bangs switched off, a search command opens nothing', () => {
  const doc = makeDoc();
  const saved = { 'command-bar': true, 'search-bangs': false, 'comfort-tint': false, 'mindful-breaks': false, 'focus-mode': false };
  const storage = makeStorage({ 'daymark.features.v1': JSON.stringify(saved) });
  const windowObj = makeWindow();
  const handle = ui.attachCommandBarUi(makeEnv(doc, storage, windowObj));
  const searchCommand = { kind: 'search', engine: bar.BANG_ENGINES[1], query: 'daymark' };
  handle.run(searchCommand);
  assert.equal(windowObj.openedUrls.length, 0);
  assert.match(handle.statusEl.textContent, /switched off in Feature settings/);
});

test('index.html gains each new script exactly once, in the pinned order', () => {
  for (const name of ['feature-flags-logic.js', 'feature-flags-ui.js', 'command-bar-logic.js', 'command-bar-ui.js']) {
    const tag = '<script src="' + name + '" defer></script>';
    assert.equal(indexHtml.split(tag).length - 1, 1, name + ' must appear exactly once');
  }
  const pos = (name) => indexHtml.indexOf('<script src="' + name + '" defer></script>');
  assert.ok(pos('storage-logic.js') < pos('feature-flags-logic.js'));
  assert.ok(pos('feature-flags-logic.js') < pos('feature-flags-ui.js'));
  assert.ok(pos('feature-flags-ui.js') < pos('command-bar-logic.js'));
  assert.ok(pos('command-bar-logic.js') < pos('command-bar-ui.js'));
});

test('index.html gains no new class names from the palette or the flags card', () => {
  assert.equal(indexHtml.indexOf('command-bar-overlay'), -1, 'palette markup must stay dynamic');
  assert.equal(indexHtml.indexOf('feature-flag-row'), -1, 'flags card markup must stay dynamic');
});

test('an unknown bang names the culprit and opens nothing', () => {
  const doc = makeDoc();
  const windowObj = makeWindow();
  const handle = ui.attachCommandBarUi(makeEnv(doc, flagsOnStorage(), windowObj));
  handle.open();
  handle.input.value = '!zzz daymark';
  handle.input.dispatch('input', {});
  assert.equal(windowObj.openedUrls.length, 0);
  assert.match(handle.statusEl.textContent, /There is no !bang called "zzz"/);
});

test('palette run with nothing selected stays honest and idle', () => {
  const doc = makeDoc();
  const windowObj = makeWindow();
  const handle = ui.attachCommandBarUi(makeEnv(doc, flagsOnStorage(), windowObj));
  handle.run(null);
  assert.equal(windowObj.openedUrls.length, 0);
  assert.match(handle.statusEl.textContent, /Nothing is selected/);
});

const junkNeedles = ['TO' + 'DO', 'FIX' + 'ME', 'place' + 'holder', '/' + '*', '*' + '/', 'setInt' + 'erval', 'XMLHt' + 'tpRequest', 'fe' + 'tch'];
for (const needle of junkNeedles) {
  test('command bar ui source contains no ' + needle, () => {
    assert.equal(uiSrc.indexOf(needle), -1);
  });
}
