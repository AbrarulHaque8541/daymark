'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
const closeTabStart = rendererSource.indexOf('function closeTab(id) {');
const closeTabEnd = rendererSource.indexOf('\n\nfunction navigate(', closeTabStart);
assert.notEqual(closeTabStart, -1, 'renderer tab close handler should exist');
assert.notEqual(closeTabEnd, -1, 'renderer tab close handler should end before navigate');
const closeTabSource = rendererSource.slice(closeTabStart, closeTabEnd);

function makeCloseTabHarness(tabIds, activeId, replacementId) {
  const tabs = tabIds.map((id) => ({ id, view: { remove() {} } }));
  const tabElements = new Map();
  const selects = new Map();
  let focusedId = null;
  const addTabElement = (id) => {
    const key = String(id);
    tabElements.set(key, { remove: () => tabElements.delete(key) });
    selects.set(key, { focus: () => { focusedId = id; } });
  };
  tabIds.forEach(addTabElement);
  const context = {
    tabs,
    activeTabId: activeId,
    document: {
      querySelector(selector) {
        const match = selector.match(/data-tab-id="([^"]+)"/);
        if (!match) return null;
        const key = match[1];
        return selector.endsWith('.tab-select')
          ? selects.get(key) || null
          : tabElements.get(key) || null;
      },
    },
    activateTab(id) { context.activeTabId = id; },
    createTab() {
      tabs.push({ id: replacementId, view: { remove() {} } });
      addTabElement(replacementId);
      context.activeTabId = replacementId;
    },
  };
  const closeTab = vm.runInNewContext(`${closeTabSource}; closeTab;`, context);
  return {
    closeTab,
    get activeId() { return context.activeTabId; },
    get focusedId() { return focusedId; },
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

test('closing an active tab focuses the selected surviving tab', () => {
  const state = makeCloseTabHarness([1, 2, 3], 1, 4);

  state.closeTab(1);

  assert.equal(state.activeId, 2);
  assert.equal(state.focusedId, 2);
});

test('closing the last tab focuses the replacement tab', () => {
  const state = makeCloseTabHarness([1], 1, 2);

  state.closeTab(1);

  assert.equal(state.activeId, 2);
  assert.equal(state.focusedId, 2);
});

test('tab close button and Ctrl+W share the tab close handler', () => {
  assert.match(rendererSource, /el\.querySelector\('\.tab-close'\)\.addEventListener\('click', \(e\) => \{\s*e\.stopPropagation\(\);\s*closeTab\(id\);/);
  assert.match(rendererSource, /else if \(mod && e\.key === 'w'\) \{\s*e\.preventDefault\(\);\s*const tab = activeTab\(\);\s*if \(tab\) closeTab\(tab\.id\);/);
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
