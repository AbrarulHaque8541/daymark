'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
const activeTabStart = rendererSource.indexOf('function activeTab() {');
const activeTabEnd = rendererSource.indexOf('\n\nfunction isActive(', activeTabStart);
const closeTabStart = rendererSource.indexOf('function closeTab(id) {');
const closeTabEnd = rendererSource.indexOf('\n\nfunction navigate(', closeTabStart);
assert.notEqual(activeTabStart, -1, 'renderer activeTab helper should exist');
assert.notEqual(activeTabEnd, -1, 'renderer activeTab helper should end before isActive');
assert.notEqual(closeTabStart, -1, 'renderer tab close handler should exist');
assert.notEqual(closeTabEnd, -1, 'renderer tab close handler should end before navigate');
const activeTabSource = rendererSource.slice(activeTabStart, activeTabEnd);
const closeTabSource = rendererSource.slice(closeTabStart, closeTabEnd);

const closeClickStart = rendererSource.indexOf("el.querySelector('.tab-close').addEventListener('click', (e) => {");
const closeClickEndMarker = '\n  });';
const closeClickEnd = rendererSource.indexOf(closeClickEndMarker, closeClickStart);
assert.notEqual(closeClickStart, -1, 'renderer tab close button handler should exist');
assert.notEqual(closeClickEnd, -1, 'renderer tab close button handler should end');
const closeClickSource = rendererSource.slice(closeClickStart, closeClickEnd + closeClickEndMarker.length);

const keydownStart = rendererSource.indexOf("window.addEventListener('keydown', (e) => {");
const keydownEnd = rendererSource.indexOf('\n\n// new tab button', keydownStart);
assert.notEqual(keydownStart, -1, 'renderer keyboard handler should exist');
assert.notEqual(keydownEnd, -1, 'renderer keyboard handler should end before new-tab button setup');
const keydownSource = rendererSource.slice(keydownStart, keydownEnd);

function makeCloseTabHarness(tabIds, activeId, replacementId) {
  const tabs = tabIds.map((id) => ({ id, view: { remove() {} } }));
  const tabElements = new Map();
  const selects = new Map();
  const closeButtons = new Map();
  const body = {};
  const context = {
    tabs,
    activeTabId: activeId,
    document: {
      body,
      activeElement: body,
      querySelector(selector) {
        const match = selector.match(/data-tab-id="([^"]+)"/);
        if (!match) return null;
        const key = match[1];
        return selector.endsWith('.tab-select')
          ? selects.get(key) || null
          : tabElements.get(key) || null;
      },
    },
    window: {
      addEventListener(type, handler) {
        assert.equal(type, 'keydown');
        context.keydownHandler = handler;
      },
    },
    activateTab(id) { context.activeTabId = id; },
  };
  const vmContext = vm.createContext(context);

  const addTabElement = (id) => {
    const key = String(id);
    const select = { focus: () => { context.document.activeElement = select; } };
    const closeButton = {
      listeners: new Map(),
      focus() { context.document.activeElement = closeButton; },
      addEventListener(type, handler) { this.listeners.set(type, handler); },
      dispatchClick(event) { this.listeners.get('click')(event); },
    };
    const element = {
      querySelector(selector) {
        if (selector === '.tab-select') return select;
        if (selector === '.tab-close') return closeButton;
        return null;
      },
      remove() {
        if (context.document.activeElement === select || context.document.activeElement === closeButton) {
          context.document.activeElement = body;
        }
        tabElements.delete(key);
        selects.delete(key);
        closeButtons.delete(key);
      },
    };
    tabElements.set(key, element);
    selects.set(key, select);
    closeButtons.set(key, closeButton);

    context.closeBindingElement = element;
    context.closeBindingId = id;
    vm.runInContext(`(() => {
      const el = closeBindingElement;
      const id = closeBindingId;
      ${closeClickSource}
    })()`, vmContext);
  };

  tabIds.forEach(addTabElement);
  context.createTab = () => {
    tabs.push({ id: replacementId, view: { remove() {} } });
    addTabElement(replacementId);
    context.activeTabId = replacementId;
  };
  vm.runInContext(`${activeTabSource}\n${closeTabSource}`, vmContext);
  vm.runInContext(keydownSource, vmContext);

  return {
    clickClose(id) {
      let propagationStopped = false;
      const closeButton = closeButtons.get(String(id));
      closeButton.focus();
      closeButton.dispatchClick({
        stopPropagation() { propagationStopped = true; },
      });
      return propagationStopped;
    },
    dispatchCtrlW() {
      const event = {
        key: 'w',
        ctrlKey: true,
        metaKey: false,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
      };
      context.keydownHandler(event);
      return event;
    },
    get activeId() { return context.activeTabId; },
    get activeElement() { return context.document.activeElement; },
    get body() { return body; },
    selectFor(id) { return selects.get(String(id)); },
  };
}

const start = rendererSource.indexOf('function isLocal(');
const end = rendererSource.indexOf('\n\nfunction activeTab()', start);
assert.notEqual(start, -1, 'renderer local-host policy should exist');
assert.notEqual(end, -1, 'renderer address helpers should end before activeTab');
const addressHelpers = rendererSource.slice(start, end);
const { isLocal, httpsUpgrade } = vm.runInNewContext(
  `(() => { ${addressHelpers}; return { isLocal, httpsUpgrade }; })()`,
  { URL },
);

test('clicking an active tab close button focuses the exact surviving tab select', () => {
  const state = makeCloseTabHarness([1, 2, 3], 1, 4);

  assert.equal(state.clickClose(1), true, 'close click should stop propagation');

  assert.equal(state.activeId, 2);
  assert.strictEqual(state.activeElement, state.selectFor(2));
  assert.notStrictEqual(state.activeElement, state.body);
});

test('clicking an inactive tab close button keeps the active tab selected and focuses its exact select', () => {
  const state = makeCloseTabHarness([1, 2, 3], 2, 4);

  assert.equal(state.clickClose(1), true, 'close click should stop propagation');

  assert.equal(state.activeId, 2);
  assert.strictEqual(state.activeElement, state.selectFor(2));
  assert.notStrictEqual(state.activeElement, state.body);
});

test('Ctrl+W focuses the exact surviving active tab select', () => {
  const state = makeCloseTabHarness([1, 2, 3], 2, 4);

  const event = state.dispatchCtrlW();

  assert.equal(event.defaultPrevented, true);
  assert.equal(state.activeId, 3);
  assert.strictEqual(state.activeElement, state.selectFor(3));
  assert.notStrictEqual(state.activeElement, state.body);
});

test('closing the last tab through its close button focuses the replacement tab select', () => {
  const state = makeCloseTabHarness([1], 1, 2);

  state.clickClose(1);

  assert.equal(state.activeId, 2);
  assert.strictEqual(state.activeElement, state.selectFor(2));
  assert.notStrictEqual(state.activeElement, state.body);
});

test('renderer recognizes bracketed IPv6 loopback as local', () => {
  assert.equal(isLocal('[::1]'), true);
  assert.equal(httpsUpgrade('http://[::1]:3000/dev'), 'http://[::1]:3000/dev');
});

test('renderer preserves localhost exceptions and upgrades remote HTTP', () => {
  assert.equal(httpsUpgrade('http://localhost:3000/dev'), 'http://localhost:3000/dev');
  assert.equal(httpsUpgrade('http://127.0.0.1:8080/'), 'http://127.0.0.1:8080/');
  assert.equal(httpsUpgrade('http://example.com/path'), 'https://example.com/path');
  assert.equal(httpsUpgrade('example.com'), 'https://example.com/');
});

test('desktop browser shell exposes accessible controls and compact styling', () => {
  const rendererDir = path.join(__dirname, '..', 'renderer');
  const markup = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');
  const styles = fs.readFileSync(path.join(rendererDir, 'style.css'), 'utf8');

  assert.match(markup, /id="tabs" role="group" aria-label="Open tabs"/);
  assert.match(markup, /id="toolbar" role="group" aria-label="Browser navigation"/);
  assert.match(markup, /id="urlbar"[^>]*aria-label="Search or enter address"/);
  for (const id of ['btn-back', 'btn-fwd', 'btn-reload', 'btn-home', 'btn-find', 'find-prev', 'find-next', 'find-close']) {
    assert.match(markup, new RegExp(`id="${id}"[^>]*aria-label="[^"]+"`));
  }
  assert.match(markup, /id="find-count" role="status" aria-live="polite"/);
  assert.match(markup, /id="toast" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(rendererSource, /class="tab-select" type="button"/);
  assert.match(rendererSource, /class="tab-close" type="button"/);
  assert.match(rendererSource, /newTabBtn\.setAttribute\('aria-label', 'New tab'\)/);
  assert.match(rendererSource, /'Switch to ' \+ title/);
  assert.match(rendererSource, /'Close ' \+ title/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(markup, /<(?:link|script)[^>]+(?:href|src)=["']https?:\/\//i);
});
