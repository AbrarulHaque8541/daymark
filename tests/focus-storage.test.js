const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const taskLogic = require('../task-logic.js');
const focus = require('../focus-logic.js');
const focusMutation = require('../focus-mutation-logic.js');
const taskMutation = require('../task-mutation-logic.js');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const TASK_KEY = 'daymark.tasks.v1';
const FOCUS_KEY = 'daymark.focus.v1';
const FOCUS_BACKUP_KEY = 'daymark.focus.v1.backup';

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

function bootApp({ savedFocusValue, failFocusSave = false, beforeGetItem }) {
  const elements = new Map();
  const listeners = new Map();
  const windowListeners = new Map();
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
      if (typeof beforeGetItem === 'function') beforeGetItem(key, storedValues);
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
    DaymarkTaskMutation: taskMutation,
    DaymarkFocus: focus,
    DaymarkFocusMutation: focusMutation,
    DaymarkRepeat: null,
    DaymarkFeed: null,
    navigator: { locks: makeLockManager() },
    addEventListener(type, handler) {
      const handlers = windowListeners.get(type) || [];
      handlers.push(handler);
      windowListeners.set(type, handlers);
    },
    dispatchEvent(event) {
      (windowListeners.get(event.type) || []).forEach((handler) => handler(event));
      return true;
    }
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
    setInterval: () => 1,
    clearInterval() {}
  }, { filename: 'app.js' });

  return {
    elements,
    storedValues,
    trigger(selector, type) {
      return (listeners.get(`${selector}:${type}`) || [])
        .map((handler) => handler({ currentTarget: element(selector) }));
    },
    dispatchWindowEvent(type, properties = {}) {
      window.dispatchEvent(Object.assign({ type }, properties));
    },
    settle() { return new Promise((resolve) => setImmediate(resolve)); }
  };
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

function completedLogEntry(id, startedAtMs) {
  const session = focus.createSession({
    id,
    kind: 'focus',
    durationMinutes: 25
  }, startedAtMs);
  focus.finish(session, startedAtMs + 30_000, false);
  return focus.makeLogEntry(session);
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

test('closed-tab natural expiry atomically persists session:null and one exact completion log', async () => {
  const start = Date.now() - 120_000;
  const session = expiredRunningSession('focus-expired-once', start);
  const app = bootApp({ savedFocusValue: rawFocusPayload(session) });
  await app.settle();
  const saved = JSON.parse(app.storedValues.get(FOCUS_KEY));

  assert.equal(saved.session, null);
  assert.equal(saved.log.length, 1);
  assert.equal(saved.log[0].id, session.id);
  assert.equal(saved.log[0].elapsedMs, 60_000);
  assert.equal(saved.log[0].endedAt, new Date(start + 60_000).toISOString());
});

test('reload after expiry does not append the same completion twice', async () => {
  const start = Date.now() - 120_000;
  const session = expiredRunningSession('focus-expired-dedup', start);
  const first = bootApp({ savedFocusValue: rawFocusPayload(session) });
  await first.settle();
  const firstSaved = first.storedValues.get(FOCUS_KEY);
  const second = bootApp({ savedFocusValue: firstSaved });
  await second.settle();
  const secondSaved = JSON.parse(second.storedValues.get(FOCUS_KEY));

  assert.equal(secondSaved.session, null);
  assert.equal(secondSaved.log.length, 1);
  assert.equal(secondSaved.log[0].id, session.id);
});

test('existing log ID is deduplicated while expired session is cleared', async () => {
  const start = Date.now() - 120_000;
  const session = expiredRunningSession('focus-expired-existing-log', start);
  const finished = focus.restoreSessionResult(session, start + 90_000).completedSession;
  const existing = focus.makeLogEntry(finished);
  const app = bootApp({ savedFocusValue: rawFocusPayload(session, [existing]) });
  await app.settle();
  const saved = JSON.parse(app.storedValues.get(FOCUS_KEY));

  assert.equal(saved.session, null);
  assert.equal(saved.log.length, 1);
  assert.equal(saved.log[0].id, session.id);
});

test('the app adopts a merged Focus log before the next same-tab save', async () => {
  const startedAt = Date.now() - 30_000;
  const session = focus.createSession({
    id: 'focus-merge-adoption-session',
    kind: 'focus',
    durationMinutes: 25
  }, startedAt);
  const baseLog = completedLogEntry('focus-merge-base-log', startedAt - 60_000);
  const remoteLog = completedLogEntry('focus-merge-remote-log', startedAt - 30_000);
  const app = bootApp({ savedFocusValue: rawFocusPayload(session, [baseLog]) });
  await app.settle();

  // A second tab commits an unrelated log entry after this tab loaded its base.
  // No storage event is delivered yet, so this tab must merge the remote entry.
  app.storedValues.set(FOCUS_KEY, rawFocusPayload(session, [baseLog, remoteLog]));
  await app.trigger('#focus-stop', 'click')[0];

  const afterMerge = JSON.parse(app.storedValues.get(FOCUS_KEY));
  assert.equal(afterMerge.session, null);
  assert.deepEqual(afterMerge.log.map((entry) => entry.id), [
    baseLog.id, remoteLog.id, session.id
  ]);

  // The next same-tab write must use the merged in-memory snapshot. Without
  // adoption, it writes the stale local log and silently drops remoteLog.
  await app.trigger('#focus-start', 'click')[0];
  const afterNextSave = JSON.parse(app.storedValues.get(FOCUS_KEY));
  assert.ok(afterNextSave.session, 'the new Focus session was persisted');
  assert.ok(afterNextSave.log.some((entry) => entry.id === remoteLog.id),
    'the remote tab log survives the next same-tab write');
  assert.ok(afterNextSave.log.some((entry) => entry.id === session.id),
    'the locally completed session remains in the merged history');
});

test('a conflicting remote Focus session does not replace this tab in-memory state', async () => {
  const startedAt = Date.now() - 10_000;
  const localSession = focus.createSession({
    id: 'focus-session-conflict',
    kind: 'focus',
    durationMinutes: 25
  }, startedAt);
  const remoteSession = JSON.parse(JSON.stringify(localSession));
  focus.pause(remoteSession, startedAt + 5_000);
  const app = bootApp({ savedFocusValue: rawFocusPayload(localSession) });
  await app.settle();

  // Another tab pauses the same session. This tab independently stops it.
  app.storedValues.set(FOCUS_KEY, rawFocusPayload(remoteSession));
  await app.trigger('#focus-stop', 'click')[0];
  await app.settle();

  const saved = JSON.parse(app.storedValues.get(FOCUS_KEY));
  assert.equal(saved.session.state, 'paused',
    'the conflicting remote snapshot remains the durable value');
  assert.equal(app.elements.get('#focus-state-label').textContent, 'Ready',
    'the local stop is retained in memory rather than silently replaced by the remote pause');
  assert.match(app.elements.get('#storage-status span').textContent,
    /kept its in-memory changes/i);
});

test('paused session remains paused and does not create a completion log', () => {
  const start = Date.now() - 60_000;
  const session = focus.createSession({ id: 'focus-paused-restore', kind: 'focus', durationMinutes: 1 }, start);
  focus.pause(session, start + 30_000);
  const original = rawFocusPayload(session);
  const app = bootApp({ savedFocusValue: original });
  const saved = JSON.parse(app.storedValues.get(FOCUS_KEY));

  assert.equal(saved.session.state, 'paused');
  assert.equal(saved.session.accumulatedMs, 30_000);
  assert.equal(saved.log.length, 0);
  assert.equal(app.storedValues.get(FOCUS_KEY), original, 'restoring a paused session should not rewrite it');
});

test('unexpired running session remains active across reload', () => {
  const start = Date.now() - 30_000;
  const session = expiredRunningSession('focus-running-restore', start);
  const original = rawFocusPayload(session);
  const app = bootApp({ savedFocusValue: original });
  const saved = JSON.parse(app.storedValues.get(FOCUS_KEY));

  assert.equal(saved.session.state, 'running');
  assert.equal(saved.session.startedAtMs, start);
  assert.equal(saved.log.length, 0);
  assert.equal(app.storedValues.get(FOCUS_KEY), original, 'an unexpired running session should remain unchanged');
});

test('same-tab Focus preset or backup clear rebases a pending session write', async () => {
  for (const categoryId of ['focus-preset', 'focus-backup']) {
    const session = focus.createSession({
      id: `focus-pending-${categoryId}`,
      kind: 'focus',
      durationMinutes: 25
    }, Date.now());
    const original = rawFocusPayload(session);
    const app = bootApp({ savedFocusValue: original });

    const pendingPause = app.trigger('#focus-pause', 'click')[0];
    app.dispatchWindowEvent('daymark:focus-storage-cleared', { detail: { categoryId } });
    await pendingPause;
    await app.settle();

    const saved = JSON.parse(app.storedValues.get(FOCUS_KEY));
    assert.equal(saved.session.state, 'running',
      `clearing ${categoryId} must not leave a paused in-memory session after its write is rejected`);
    assert.equal(app.elements.get('#focus-state-label').textContent, 'Focusing');
    assert.equal(app.elements.get('#focus-pause').textContent, 'Pause');
  }
});

test('same-tab explicit Focus-backup clear is not undone by corrupt-primary recovery', async () => {
  const original = '{"session":';
  const app = bootApp({ savedFocusValue: original });
  await app.settle();

  assert.equal(typeof app.storedValues.get(FOCUS_BACKUP_KEY), 'string',
    'startup recovery should first preserve the corrupt primary bytes');
  app.storedValues.delete(FOCUS_BACKUP_KEY);
  app.storedValues.set(focusMutation.FOCUS_GENERATION_KEY, '1');
  app.dispatchWindowEvent('daymark:focus-storage-cleared', {
    detail: { categoryId: 'focus-backup' }
  });
  await app.settle();

  assert.equal(app.storedValues.has(FOCUS_BACKUP_KEY), false,
    'an explicit backup clear must not immediately recreate the backup from the still-corrupt primary');
  assert.equal(app.storedValues.get(FOCUS_KEY), original,
    'the corrupt primary bytes remain untouched');
});

test('cross-tab explicit Focus-backup clear cancels pending backup recreation', async () => {
  const original = '{"session":';
  const app = bootApp({ savedFocusValue: original });
  await app.settle();

  assert.equal(typeof app.storedValues.get(FOCUS_BACKUP_KEY), 'string',
    'startup recovery should first preserve the corrupt primary bytes');
  app.storedValues.delete(FOCUS_BACKUP_KEY);
  app.storedValues.set(focusMutation.FOCUS_GENERATION_KEY, '1');
  app.dispatchWindowEvent('storage', { key: focusMutation.FOCUS_GENERATION_KEY });
  app.dispatchWindowEvent('storage', { key: FOCUS_BACKUP_KEY, newValue: null });
  await app.settle();

  assert.equal(app.storedValues.has(FOCUS_BACKUP_KEY), false,
    'the cross-tab backup-removal event must cancel the pending backup recreation');
  assert.equal(app.storedValues.get(FOCUS_KEY), original,
    'the corrupt primary bytes remain untouched');
});

test('cross-tab Focus generation event rebases the whole domain before a queued write resumes', async () => {
  const session = focus.createSession({
    id: 'focus-pending-cross-tab-generation',
    kind: 'focus',
    durationMinutes: 25
  }, Date.now());
  const original = rawFocusPayload(session);
  const app = bootApp({ savedFocusValue: original });

  const pendingPause = app.trigger('#focus-pause', 'click')[0];
  app.storedValues.set(focusMutation.FOCUS_GENERATION_KEY, '1');
  app.dispatchWindowEvent('storage', { key: focusMutation.FOCUS_GENERATION_KEY });
  await pendingPause;
  await app.settle();

  const saved = JSON.parse(app.storedValues.get(FOCUS_KEY));
  assert.equal(saved.session.state, 'running',
    'a generation change in another tab must rebase the session before the stale pause write can leave it in memory');
  assert.equal(app.elements.get('#focus-state-label').textContent, 'Focusing');
  assert.equal(app.elements.get('#focus-pause').textContent, 'Pause');
});

test('a stale Focus completion cannot recreate history after clear before its storage event arrives', async () => {
  const session = focus.createSession({
    id: 'focus-cleared-before-storage-event',
    kind: 'focus',
    durationMinutes: 25
  }, Date.now());
  const original = rawFocusPayload(session);
  const app = bootApp({ savedFocusValue: original });
  await app.settle();

  // Simulate another tab completing Clear Focus under the shared lock. Its
  // storage events are deliberately not dispatched yet, so this tab still
  // holds the pre-clear session snapshot when the user presses Stop.
  app.storedValues.set(focusMutation.FOCUS_GENERATION_KEY, '1');
  app.storedValues.delete(FOCUS_KEY);

  const stopped = await app.trigger('#focus-stop', 'click')[0];
  await app.settle();

  assert.equal(stopped, false, 'the stale completion is rejected instead of reported as saved');
  assert.equal(app.storedValues.has(FOCUS_KEY), false,
    'the stale tab must not recreate a Focus log after the clear');
  assert.equal(app.storedValues.get(focusMutation.FOCUS_GENERATION_KEY), '1',
    'the clear generation remains authoritative');
  assert.equal(app.elements.get('#focus-state-label').textContent, 'Ready',
    'the stale in-memory session is rebased to the cleared state');
  assert.match(app.elements.get('#storage-status span').textContent,
    /changed or was cleared in another tab/i);
});

test('Focus load rejects a snapshot when the clear generation changes during its primary read', async () => {
  const session = focus.createSession({
    id: 'focus-clear-during-load',
    kind: 'focus',
    durationMinutes: 25
  }, Date.now());
  let clearedDuringRead = false;
  const app = bootApp({
    savedFocusValue: rawFocusPayload(session),
    beforeGetItem(key, values) {
      if (key !== FOCUS_KEY || clearedDuringRead) return;
      clearedDuringRead = true;
      values.set(focusMutation.FOCUS_GENERATION_KEY, '1');
      values.delete(FOCUS_KEY);
    }
  });
  await app.settle();

  assert.equal(clearedDuringRead, true);
  assert.equal(app.storedValues.has(FOCUS_KEY), false,
    'a torn Focus read must not recreate the key');
  assert.equal(app.elements.get('#focus-state-label').textContent, 'Ready',
    'a snapshot spanning a clear must not be rendered as current');
  assert.match(app.elements.get('#storage-status span').textContent,
    /changed while it was being loaded/i);
});

test('a stale recovery-backup queue cannot recreate a backup cleared before its storage event', async () => {
  let clearedDuringBackupRead = false;
  const app = bootApp({
    savedFocusValue: '{"session":',
    beforeGetItem(key, values) {
      if (key !== FOCUS_BACKUP_KEY || clearedDuringBackupRead) return;
      clearedDuringBackupRead = true;
      values.set(focusMutation.FOCUS_GENERATION_KEY, '1');
      values.delete(FOCUS_BACKUP_KEY);
    }
  });
  await app.settle();

  assert.equal(clearedDuringBackupRead, true);
  assert.equal(app.storedValues.has(FOCUS_BACKUP_KEY), false,
    'a backup clear that wins during load must not be undone by stale backup maintenance');
  assert.match(app.elements.get('#storage-status span').textContent,
    /changed or was cleared in another tab/i);
});

test('quota failure preserves original focus payload and recovery backup', async () => {
  const start = Date.now() - 120_000;
  const session = expiredRunningSession('focus-expired-storage-failure', start);
  const original = rawFocusPayload(session);
  const app = bootApp({ savedFocusValue: original, failFocusSave: true });
  await app.settle();

  assert.equal(app.storedValues.get(FOCUS_KEY), original, 'failed atomic write must leave primary payload intact');
  assert.equal(app.storedValues.get(FOCUS_BACKUP_KEY), original, 'raw original must also be retained in recovery backup');
  assert.match(app.elements.get('#storage-status span').textContent,
    /completed while Daymark was closed, but its history could not be saved/i);
});
