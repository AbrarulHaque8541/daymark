'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const logic = require('../task-logic.js');
const repeat = require('../repeat-logic.js');
const focus = require('../focus-logic.js');
const taskMutation = require('../task-mutation-logic.js');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const FOCUS_KEY = 'daymark.focus.v1';

function makeLockManager() {
  const tails = new Map();
  return {
    request(name, options, callback) {
      const previous = tails.get(name) || Promise.resolve();
      const tail = previous.then(() => callback({ name, mode: options && options.mode || 'exclusive' }))
        .finally(() => { if (tails.get(name) === tail) tails.delete(name); });
      tails.set(name, tail);
      return tail;
    }
  };
}

function frozenDate(nowMs) {
  return class extends Date {
    constructor(...args) {
      if (args.length === 0) super(nowMs);
      else super(...args);
    }
    static now() {
      return nowMs;
    }
  };
}

function bootApp(options) {
  const opts = options || {};
  const savedFocus = opts.savedFocus || null;
  const now = opts.now === undefined ? null : opts.now;
  const elements = new Map();
  const storedValues = new Map();
  const docListeners = new Map();
  const intervals = new Map();
  let nextIntervalId = 1;
  const lockManager = opts.lockManager || makeLockManager();
  if (savedFocus !== null) storedValues.set(FOCUS_KEY, savedFocus);

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
        dispatch: (type, event) => {
          const data = event || {};
          const listener = listeners.get(type);
          if (listener) return listener(Object.assign({ preventDefault() {}, currentTarget: elements.get(selector), target: elements.get(selector) }, data));
          return undefined;
        },
        setAttribute: (name, value) => attributes.set(name, String(value)),
        getAttribute: (name) => attributes.has(name) ? attributes.get(name) : null,
        removeAttribute: (name) => attributes.delete(name),
        querySelector: (childSelector) => element(selector + ' ' + childSelector),
        focus() {},
        showModal() { this.open = true; },
        close() { this.open = false; },
        click() { this.clicked = true; },
        remove() { this.removed = true; }
      });
    }
    return elements.get(selector);
  }

  const localStorage = {
    getItem(key) { return storedValues.has(key) ? storedValues.get(key) : null; },
    setItem(key, value) { storedValues.set(key, String(value)); },
    removeItem(key) { storedValues.delete(key); }
  };
  const presetButtons = ['focus', 'short-break', 'long-break'].map((preset) => {
    const button = element('.focus-preset[data-focus-preset="' + preset + '"]');
    button.dataset.focusPreset = preset;
    return button;
  });
  const documentStub = {
    hidden: opts.hidden === true,
    querySelector: element,
    querySelectorAll: (selector) => (selector === '.focus-preset' ? presetButtons : []),
    createElement: () => element('#download-link'),
    body: { appendChild() {} },
    addEventListener(type, listener) {
      const list = docListeners.get(type) || [];
      list.push(listener);
      docListeners.set(type, list);
    }
  };
  const windowStub = {
    DaymarkLogic: logic,
    DaymarkRepeat: repeat,
    DaymarkFocus: focus,
    DaymarkTaskMutation: taskMutation,
    navigator: { locks: lockManager },
    addEventListener() {}
  };
  const context = {
    Date: now === null ? Date : frozenDate(now),
    Intl,
    Math,
    console: { warn() {} },
    document: documentStub,
    localStorage,
    window: windowStub,
    clearTimeout() {},
    clearInterval(id) { intervals.delete(id); },
    setTimeout(callback, delay) { return 1; },
    setInterval(callback, delay) {
      const id = nextIntervalId++;
      intervals.set(id, { id, callback, delay });
      return id;
    }
  };
  const contextNames = Object.keys(context);
  new Function(...contextNames, APP_SOURCE + '\n')(...contextNames.map((name) => context[name]));

  return {
    elements,
    storedValues,
    docListeners,
    activeIntervals: () => Array.from(intervals.values()),
    intervalsWithDelay(delay) {
      return Array.from(intervals.values()).filter((timer) => timer.delay === delay);
    },
    setVisibility(isHidden) {
      documentStub.hidden = isHidden;
      for (const listener of docListeners.get('visibilitychange') || []) listener({});
    }
  };
}

function liveSession(nowMs) {
  const session = focus.createSession({ kind: 'focus', durationMinutes: 25, taskId: null }, nowMs);
  return JSON.stringify({ session: focus.serialize(session), log: [] });
}

test('visible page starts exactly one reminder poll and no focus poll', () => {
  const now = 1732130000000;
  const app = bootApp({ now });
  assert.equal(app.intervalsWithDelay(30000).length, 1);
  assert.equal(app.intervalsWithDelay(1000).length, 0);
  assert.equal(app.activeIntervals().length, 1);
});

test('a page opened in the background starts zero polling wake-ups', () => {
  const startedAt = 1732123456789;
  const app = bootApp({ hidden: true, now: startedAt + 60000, savedFocus: liveSession(startedAt) });
  assert.equal(app.activeIntervals().length, 0);
  assert.equal(app.elements.get('#focus-time').textContent, '24:00');
});

test('showing a background-booted page restores both polls at wall-clock time', () => {
  const startedAt = 1732123456789;
  const app = bootApp({ hidden: true, now: startedAt + 60000, savedFocus: liveSession(startedAt) });
  app.setVisibility(false);
  assert.equal(app.intervalsWithDelay(1000).length, 1);
  assert.equal(app.intervalsWithDelay(30000).length, 1);
  assert.equal(app.elements.get('#focus-time').textContent, '24:00');
});

test('hiding a running page stops both polls; showing restores once each', () => {
  const startedAt = 1732123456789;
  const now = startedAt + 60000;
  const app = bootApp({ now, savedFocus: liveSession(startedAt) });
  assert.equal(app.intervalsWithDelay(1000).length, 1);
  assert.equal(app.intervalsWithDelay(30000).length, 1);
  app.setVisibility(true);
  assert.equal(app.activeIntervals().length, 0);
  app.setVisibility(false);
  assert.equal(app.intervalsWithDelay(1000).length, 1);
  assert.equal(app.intervalsWithDelay(30000).length, 1);
  app.setVisibility(false);
  assert.equal(app.intervalsWithDelay(1000).length, 1);
  assert.equal(app.intervalsWithDelay(30000).length, 1);
});

test('visibility flapping never stacks duplicate timers', () => {
  const app = bootApp({ hidden: true, now: 1732130000000 });
  for (let i = 0; i < 6; i += 1) app.setVisibility(i % 2 === 1);
  assert.equal(app.activeIntervals().length, 0);
  app.setVisibility(false);
  assert.equal(app.intervalsWithDelay(30000).length, 1);
  assert.equal(app.intervalsWithDelay(1000).length, 0);
});

test('scheduler source stays single-sourced behind hidden guards', () => {
  const reminderAssign = APP_SOURCE.indexOf('state.reminderTimer = setInterval(checkReminders, 30000)');
  const focusAssign = APP_SOURCE.indexOf('state.focusTimer = setInterval(tickFocus, 1000)');
  assert.notEqual(reminderAssign, -1);
  assert.notEqual(focusAssign, -1);
  assert.equal(APP_SOURCE.indexOf('state.reminderTimer = setInterval'), APP_SOURCE.lastIndexOf('state.reminderTimer = setInterval'));
  assert.equal(APP_SOURCE.indexOf('state.focusTimer = setInterval'), APP_SOURCE.lastIndexOf('state.focusTimer = setInterval'));
  assert.ok(APP_SOURCE.indexOf('function ensureReminderTimer()') !== -1);
  assert.ok(APP_SOURCE.indexOf('function stopReminderTimer()') !== -1);
  assert.equal((APP_SOURCE.match(/document.hidden === true/g) || []).length, 2);
  assert.ok(reminderAssign > APP_SOURCE.indexOf('function ensureReminderTimer()'));
});
