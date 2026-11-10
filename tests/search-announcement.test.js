'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const logic = require('../task-logic.js');
const mutation = require('../task-mutation-logic.js');

const ROOT = path.resolve(__dirname, '..');
const INDEX_SOURCE = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const APP_SOURCE = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

function makeLockManager() {
  const tails = new Map();
  return {
    request(name, options, callback) {
      const previous = tails.get(name) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      tails.set(name, previous.then(() => gate));
      return previous.then(callback).finally(release);
    }
  };
}

function bootApp({ savedValue = null } = {}) {
  const elements = new Map();
  const storedValues = new Map();
  if (savedValue !== null) storedValues.set('daymark.tasks.v1', savedValue);

  function element(selector) {
    if (!elements.has(selector)) {
      const attributes = new Map();
      const classes = new Set();
      const listeners = new Map();
      elements.set(selector, {
        textContent: '',
        value: '',
        hidden: false,
        disabled: false,
        innerHTML: '',
        open: false,
        dataset: {},
        style: {},
        attributes,
        classList: {
          add: (name) => classes.add(name),
          remove: (name) => classes.delete(name),
          contains: (name) => classes.has(name),
          toggle: (name, force) => {
            const enabled = force === undefined ? !classes.has(name) : force;
            if (enabled) classes.add(name);
            else classes.delete(name);
            return enabled;
          }
        },
        addEventListener: (type, listener) => listeners.set(type, listener),
        dispatch: (type, event = {}) => {
          const listener = listeners.get(type);
          if (listener) {
            return listener({ preventDefault() {}, currentTarget: elements.get(selector), target: elements.get(selector), ...event });
          }
        },
        setAttribute: (name, value) => attributes.set(name, String(value)),
        getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
        removeAttribute: (name) => attributes.delete(name),
        querySelector: (childSelector) => element(selector + ' ' + childSelector),
        focus() {},
        reset() {
          if (selector !== '#add-form') return;
          ['#new-title', '#new-due-date', '#new-due-time', '#new-reminder', '#new-repeat']
            .forEach((fieldSelector) => { element(fieldSelector).value = ''; });
        },
        showModal() { this.open = true; },
        close() { this.open = false; }
      });
    }
    return elements.get(selector);
  }

  const localStorage = {
    getItem(key) { return storedValues.has(key) ? storedValues.get(key) : null; },
    setItem(key, value) { storedValues.set(key, String(value)); },
    removeItem(key) { storedValues.delete(key); }
  };
  const document = {
    hidden: false,
    querySelector: element,
    querySelectorAll: () => [],
    createElement: () => element('#download-link'),
    body: { appendChild() {} },
    addEventListener() {}
  };
  const window = {
    DaymarkLogic: logic,
    DaymarkTaskMutation: mutation,
    navigator: { locks: makeLockManager() },
    addEventListener() {}
  };

  vm.runInNewContext(APP_SOURCE, {
    Date,
    Intl,
    Math,
    console: { warn() {} },
    document,
    localStorage,
    window,
    clearTimeout() {},
    setTimeout: () => 1,
    setInterval: () => 1
  }, { filename: 'app.js' });

  return { elements, storedValues };
}

function typeSearch(app, value) {
  const input = app.elements.get('#task-search');
  input.value = value;
  input.dispatch('input');
}

test('index.html announces search results through a dedicated screen-reader status', () => {
  const match = INDEX_SOURCE.match(/<p class="sr-only" id="search-result-status" role="status" aria-live="polite"><\/p>/);
  assert.ok(match, 'a visually hidden status element must exist for search result counts');
  assert.match(INDEX_SOURCE, /id="task-search"[^>]*aria-describedby="visible-count"/,
    'the search input keeps its visible-count description');
});

test('an active query quiets the task list and announces the concise match count', () => {
  const timestamp = new Date().toISOString();
  const tasks = [
    { id: 't1', title: 'Work report', dueDate: null, priority: 'medium', completed: false, createdAt: timestamp, updatedAt: timestamp },
    { id: 't2', title: 'Buy milk', dueDate: null, priority: 'medium', completed: false, createdAt: timestamp, updatedAt: timestamp }
  ];
  const app = bootApp({ savedValue: JSON.stringify(tasks) });
  const taskList = app.elements.get('#task-list');
  assert.equal(taskList.getAttribute('aria-live'), 'polite', 'without a query the list stays a polite live region');

  typeSearch(app, 'wo');
  assert.equal(taskList.getAttribute('aria-live'), 'off',
    'a query must stop the whole list being re-announced on every keystroke');
  assert.equal(app.elements.get('#search-result-status').textContent, '1 matching task',
    'the dedicated status carries the concise count');

  typeSearch(app, 'zz');
  assert.equal(app.elements.get('#search-result-status').textContent, '0 matching tasks');
  assert.equal(app.elements.get('#empty-state').hidden, false, 'the empty state still renders');
});

test('clearing the search restores full list announcements', () => {
  const app = bootApp({ savedValue: JSON.stringify([]) });
  const taskList = app.elements.get('#task-list');
  typeSearch(app, 'zz');
  typeSearch(app, '');
  assert.equal(taskList.getAttribute('aria-live'), 'polite',
    'task add/remove announcements must come back when the query is gone');
  assert.equal(app.elements.get('#search-result-status').textContent, '',
    'the search status goes quiet once no query is active');
});

test('adding a task during an active search restores live list announcements', async () => {
  const timestamp = new Date().toISOString();
  const seed = [{ id: 't1', title: 'Work report', dueDate: null, priority: 'medium', completed: false, createdAt: timestamp, updatedAt: timestamp }];
  const app = bootApp({ savedValue: JSON.stringify(seed) });
  const taskList = app.elements.get('#task-list');
  typeSearch(app, 'zz');

  app.elements.get('#new-title').value = 'Fresh task';
  await app.elements.get('#add-form').dispatch('submit');

  assert.equal(taskList.getAttribute('aria-live'), 'polite',
    'a task mutation resets the list to a live region so the addition is announced');
  const saved = JSON.parse(app.storedValues.get('daymark.tasks.v1'));
  assert.equal(saved.length, 2, 'the task itself was still added');
});

test('app.js wires the search announcement through the query-aware live region', () => {
  assert.match(APP_SOURCE, /taskList\.setAttribute\('aria-live', hasQuery \? 'off' : 'polite'\)/,
    'the list live region must be query-conditional');
  assert.match(APP_SOURCE, /\$\('#search-result-status'\)/,
    'the dedicated search status must be updated from the render path');
});
