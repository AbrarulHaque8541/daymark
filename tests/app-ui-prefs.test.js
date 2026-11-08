const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const UI_PREFS_KEY = 'daymark.ui-prefs.v1';

function createBoot(savedPrefs, storageThrows = false) {
  const stored = new Map();
  if (savedPrefs !== undefined && savedPrefs !== null) stored.set(UI_PREFS_KEY, savedPrefs);
  const elements = new Map();
  const listeners = new Map();
  function element(selector) {
    if (!elements.has(selector)) {
      const el = {
        textContent: '',
        value: '',
        hidden: false,
        innerHTML: '',
        dataset: {},
        classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
        setAttribute() {},
        removeAttribute() {},
        addEventListener(type, fn) {
          const key = selector + ':' + type;
          if (!listeners.has(key)) listeners.set(key, []);
          listeners.get(key).push(fn);
        },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        closest() { return null; },
        focus() {},
      };
      elements.set(selector, el);
    }
    return elements.get(selector);
  }
  const document = {
    querySelector: element,
    querySelectorAll: (sel) => {
      if (sel === '.filter-button') {
        return ['all', 'today', 'upcoming', 'overdue', 'completed'].map((f) => {
          const btn = element(`button[data-filter="${f}"]`);
          btn.dataset.filter = f;
          return btn;
        });
      }
      return [];
    },
    addEventListener() {},
    hidden: false,
    body: element('body'),
  };
  const localStorage = storageThrows ? {
    getItem() { throw new Error('storage blocked'); },
    setItem() { throw new Error('storage blocked'); },
    removeItem() {},
  } : {
    getItem(key) { return stored.has(key) ? stored.get(key) : null; },
    setItem(key, value) { stored.set(key, String(value)); },
    removeItem(key) { stored.delete(key); },
  };
  const context = {
    document,
    localStorage,
    console,
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    Date,
    JSON,
    window: {},
  };
  context.window = context;
  context.window.addEventListener = () => {};
  context.window.removeEventListener = () => {};
  const realLogic = require(path.join(__dirname, "..", "task-logic.js"));
  context.DaymarkLogic = realLogic;
  const realFocus = require(path.join(__dirname, "..", "focus-logic.js"));
  context.DaymarkFocus = realFocus;
  context.DaymarkFeed = {};
  vm.createContext(context);
  vm.runInContext(APP_SOURCE, context);
  return { context, stored, elements, listeners };
}

test('restores valid filter and sort from localStorage on boot', () => {
  const saved = JSON.stringify({ filter: 'overdue', sort: 'title' });
  const { elements } = createBoot(saved);
  const sortBtn = elements.get('#sort-toggle');
  assert.equal(sortBtn.textContent, 'Sort: A–Z');
  const emptyTitle = elements.get('#empty-title');
  assert.equal(emptyTitle.textContent, 'Nothing overdue');
});

test('ignores invalid prefs and keeps defaults', () => {
  const saved = JSON.stringify({ filter: 'bogus', sort: 'random' });
  const { elements } = createBoot(saved);
  const sortBtn = elements.get('#sort-toggle');
  assert.equal(sortBtn.textContent, 'Sort: Smart');
  const emptyTitle = elements.get('#empty-title');
  assert.equal(emptyTitle.textContent, 'A clear start');
});

test('persists filter and sort when user changes them', () => {
  const { stored, elements, listeners } = createBoot(null);
  // Trigger sort toggle
  const sortHandlers = listeners.get('#sort-toggle:click') || [];
  assert.equal(sortHandlers.length, 1);
  sortHandlers[0]({ currentTarget: elements.get('#sort-toggle') });
  // Trigger a filter button
  const filterBtn = elements.get('button[data-filter="today"]');
  const filterHandlers = listeners.get('button[data-filter="today"]:click') || [];
  // The forEach attaches to each, so the listener is on that element
  assert.ok(filterHandlers.length >= 1);
  filterHandlers[0]({ currentTarget: filterBtn });
  const saved = stored.get(UI_PREFS_KEY);
  assert.ok(saved, 'prefs were written');
  const parsed = JSON.parse(saved);
  assert.equal(parsed.sort, 'title');
  assert.equal(parsed.filter, 'today');
});

test('survives storage read failure without crashing and uses defaults', () => {
  const { elements } = createBoot(null, true);
  const sortBtn = elements.get('#sort-toggle');
  assert.equal(sortBtn.textContent, 'Sort: Smart');
  const emptyTitle = elements.get('#empty-title');
  assert.equal(emptyTitle.textContent, 'A clear start');
});
