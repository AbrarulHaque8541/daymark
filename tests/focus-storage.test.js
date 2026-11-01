const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const taskLogic = require('../task-logic.js');
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
    DaymarkFocus: focus,
    DaymarkRepeat: null,
    DaymarkFeed: null,
    addEventListener() {}
  };

  element('#storage-status').classList.add('is-checking');
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

function expiredRunningSession(id, startedAtMs) {
  const session = focus.createSession({ id, kind: 'focus', durationMinutes: 1 }, startedAtMs);
  session.createdAtMs = startedAtMs;
  session.updatedAtMs = startedAtMs;
  session.startedAtMs = startedAtMs;
  return session;
}

function rawFocusPayload(session, log = []) {
  return JSON.stringify({ session, log });
}

test('restoreSessionResult exposes natural completion without reviving expired session', () => {
  const start = 1_800_000_000_000;
  const session = expiredRunningSession('expired-result', start);
  const result = focus.restoreSessionResult(session, start + 90_000);

  assert.equal(result.session, null);
  assert.ok(focus.isValidSession(result.completedSession));
  assert.equal(result.completedSession.state, 'done');
  assert.equal(result.completedSession.completed, true);
  assert.equal(result.completedSession.finalElapsedMs, 60_000);
  assert.equal(result.completedSession.endedAtMs, start + 60_000);
  assert.equal(focus.restoreSession(session, start + 90_000), null, 'legacy restore API remains compatible');
});

test('closed-tab natural expiry atomically persists session:null and one exact completion log', () => {
  const start = Date.now() - 120_000;
  const session = expiredRunningSession('focus-expired-once', start);
  const app = bootApp({ savedFocusValue: rawFocusPayload(session) });
  const saved = JSON.parse(app.storedValues.get(FOCUS_KEY));

  assert.equal(saved.session, null);
  assert.equal(saved.log.length, 1);
  assert.equal(saved.log[0].id, session.id);
  assert.equal(saved.log[0].elapsedMs, 60_000);
  assert.equal(saved.log[0].endedAt, new Date(start + 60_000).toISOString());
});

test('reload after expiry does not append the same completion twice', () => {
  const start = Date.now() - 120_000;
  const session = expiredRunningSession('focus-expired-dedup', start);
  const first = bootApp({ savedFocusValue: rawFocusPayload(session) });
  const firstSaved = first.storedValues.get(FOCUS_KEY);
  const second = bootApp({ savedFocusValue: firstSaved });
  const secondSaved = JSON.parse(second.storedValues.get(FOCUS_KEY));

  assert.equal(secondSaved.session, null);
  assert.equal(secondSaved.log.length, 1);
  assert.equal(secondSaved.log[0].id, session.id);
});

test('existing log ID is deduplicated while expired session is cleared', () => {
  const start = Date.now() - 120_000;
  const session = expiredRunningSession('focus-expired-existing-log', start);
  const finished = focus.restoreSessionResult(session, start + 90_000).completedSession;
  const existing = focus.makeLogEntry(finished);
  const app = bootApp({ savedFocusValue: rawFocusPayload(session, [existing]) });
  const saved = JSON.parse(app.storedValues.get(FOCUS_KEY));

  assert.equal(saved.session, null);
  assert.equal(saved.log.length, 1);
  assert.equal(saved.log[0].id, session.id);
});

test('quota failure preserves original focus payload and recovery backup', () => {
  const start = Date.now() - 120_000;
  const session = expiredRunningSession('focus-expired-storage-failure', start);
  const original = rawFocusPayload(session);
  const app = bootApp({ savedFocusValue: original, failFocusSave: true });

  assert.equal(app.storedValues.get(FOCUS_KEY), original, 'failed atomic write must leave primary payload intact');
  assert.equal(app.storedValues.get(FOCUS_BACKUP_KEY), original, 'raw original must also be retained in recovery backup');
  assert.match(app.elements.get('#storage-status span').textContent,
    /completed while Daymark was closed, but its history could not be saved/i);
});
