const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const taskLogic = require('../task-logic.js');
const storageLock = require('../storage-lock.js');
const focus = require('../focus-logic.js');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const TASK_KEY = 'daymark.tasks.v1';
const FOCUS_KEY = 'daymark.focus.v1';
const FOCUS_BACKUP_KEY = 'daymark.focus.v1.backup';

function bootApp({ savedFocusValue, failFocusSave = false }) {
  const elements = new Map();
  const listeners = new Map();
  const storedValues = new Map([[TASK_KEY, '[]'], [FOCUS_KEY, savedFocusValue]]);

  function element(selector) {
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector, {
        textContent: '',
        value: '',
        hidden: false,
        innerHTML: '',
        open: false,
        dataset: {},
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
        addEventListener(type, handler) {
          const key = `${selector}:${type}`;
          const handlers = listeners.get(key) || [];
          handlers.push(handler);
          listeners.set(key, handlers);
        },
        setAttribute() {},
        removeAttribute() {},
        querySelector: (childSelector) => element(`${selector} ${childSelector}`),
        focus() {},
        reset() {},
        showModal() { this.open = true; },
        close() { this.open = false; }
      });
    }
    return elements.get(selector);
  }

  const localStorage = {
    getItem(key) {
      return storedValues.has(key) ? storedValues.get(key) : null;
    },
    setItem(key, value) {
      if (key === FOCUS_KEY && failFocusSave) throw new Error('Quota exceeded');
      storedValues.set(key, String(value));
    },
    removeItem(key) {
      storedValues.delete(key);
    }
  };
  const document = {
    hidden: false,
    querySelector: element,
    querySelectorAll: () => [],
    addEventListener() {}
  };
  const window = {
    DaymarkLogic: taskLogic,
    DaymarkStorageLock: storageLock,
    DaymarkFocus: focus,
    DaymarkRepeat: null,
    confirm() { return true; },
    addEventListener() {}
  };

  element('#storage-status').classList.add('is-checking');

  vm.runInNewContext(APP_SOURCE, {
    console: { warn() {} },
    document,
    localStorage,
    window,
    clearTimeout() {},
    setTimeout: () => 1,
    setInterval: () => 1
  }, { filename: 'app.js' });

  return { elements, storedValues, listeners };
}

function rawFocusPayload(session, log = []) {
  return JSON.stringify({ session, log });
}

test('focus harness boots', () => {
  const session = focus.createSession({ id: 's1', kind: 'focus', durationMinutes: 25 }, Date.now());
  const app = bootApp({ savedFocusValue: rawFocusPayload(session) });
  assert.ok(app.storedValues.get(FOCUS_KEY));
});
