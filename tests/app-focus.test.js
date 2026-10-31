const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const logic = require('../task-logic.js');
const repeat = require('../repeat-logic.js');
const focus = require('../focus-logic.js');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const STORAGE_KEY = 'daymark.tasks.v1';
const FOCUS_KEY = 'daymark.focus.v1';
const FOCUS_BACKUP_KEY = `${FOCUS_KEY}.backup`;

function bootApp({ savedValue = null, savedFocus = null, withFocus = true } = {}) {
  const elements = new Map();
  const storedValues = new Map();
  if (savedValue !== null) storedValues.set(STORAGE_KEY, savedValue);
  if (savedFocus !== null) storedValues.set(FOCUS_KEY, savedFocus);

  function element(selector) {
    if (!elements.has(selector)) {
      const attributes = new Map();
      const classes = new Set();
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
          toggle: (name, force) => {
            const enabled = force === undefined ? !classes.has(name) : force;
            if (enabled) classes.add(name);
            else classes.delete(name);
            return enabled;
          }
        },
        addEventListener() {},
        setAttribute: (name, value) => attributes.set(name, value),
        removeAttribute: (name) => attributes.delete(name),
        querySelector: (childSelector) => element(`${selector} ${childSelector}`),
        focus() {},
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
    DaymarkLogic: logic,
    DaymarkRepeat: repeat,
    addEventListener() {}
  };
  if (withFocus) window.DaymarkFocus = focus;

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

test('a persisted running focus session is revived and shows the remaining time', () => {
  const startedAt = Date.now() - 10 * 60 * 1000; // started 10 minutes ago
  const session = focus.createSession({ kind: 'focus', durationMinutes: 25, taskId: null }, startedAt);
  const { elements } = bootApp({ savedFocus: JSON.stringify({ session: focus.serialize(session), log: [] }) });

  assert.equal(elements.get('#focus-time').textContent, '15:00');
  assert.equal(elements.get('#focus-state-label').textContent, 'Focusing');
  assert.equal(elements.get('#focus-start').hidden, true);
  assert.equal(elements.get('#focus-pause').hidden, false);
  assert.equal(elements.get('#focus-pause').textContent, 'Pause');
  assert.equal(elements.get('#focus-stop').hidden, false);
  assert.equal(elements.get('#focus-progress-fill').style.width, '40%');
});

test('a paused session restores as paused with frozen time', () => {
  const startedAt = Date.now() - 20 * 60 * 1000;
  const session = focus.createSession({ kind: 'focus', durationMinutes: 25 }, startedAt);
  focus.pause(session, startedAt + 5 * 60 * 1000);
  const { elements } = bootApp({ savedFocus: JSON.stringify({ session: focus.serialize(session), log: [] }) });

  assert.equal(elements.get('#focus-time').textContent, '20:00');
  assert.equal(elements.get('#focus-state-label').textContent, 'Paused');
  assert.equal(elements.get('#focus-pause').textContent, 'Resume');
});

test('focus minutes from the log are totalled for today', () => {
  // Anchor the entries at 10:00 local today so the test is stable at any hour.
  const start = new Date();
  start.setHours(10, 0, 0, 0);
  const entry = {
    id: 'log-1',
    taskId: null,
    kind: 'focus',
    durationMinutes: 25,
    startedAt: start.toISOString(),
    endedAt: new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
    elapsedMs: 30 * 60 * 1000,
    completed: true
  };
  const breakEntry = { ...entry, id: 'log-2', kind: 'short-break', elapsedMs: 5 * 60 * 1000 };
  const { elements } = bootApp({ savedFocus: JSON.stringify({ session: null, log: [entry, breakEntry] }) });

  assert.equal(elements.get('#focus-today').textContent, '30', 'breaks are not counted as focus time');
});

test('an idle focus card shows the default preset clock', () => {
  const { elements } = bootApp({ savedFocus: JSON.stringify({ session: null, log: [] }) });
  assert.equal(elements.get('#focus-time').textContent, '25:00');
  assert.equal(elements.get('#focus-state-label').textContent, 'Ready');
  assert.equal(elements.get('#focus-start').hidden, false);
  assert.equal(elements.get('#focus-pause').hidden, true);
});

test('a corrupt focus payload is kept in a recovery backup and the app still boots', () => {
  const { elements, storedValues } = bootApp({ savedFocus: '{not valid JSON' });
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), '{not valid JSON');
  assert.equal(elements.get('#focus-time').textContent, '25:00', 'falls back to the idle clock');
});

test('the app still boots cleanly when the focus module is absent', () => {
  const { elements } = bootApp({ withFocus: false });
  assert.equal(elements.get('#focus-time').textContent, '—');
});
