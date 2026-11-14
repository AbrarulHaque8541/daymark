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
const STORAGE_KEY = 'daymark.tasks.v1';
const FOCUS_KEY = 'daymark.focus.v1';
const FOCUS_BACKUP_KEY = `${FOCUS_KEY}.backup`;
const FOCUS_PRESET_KEY = 'daymark.focus.preset.v1';

// A Date whose clock is frozen at nowMs, so tests that assert on wall-clock
// derived values (remaining time, progress) stay exact even on slow runners
// where booting the app in the VM can take over a second.
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

function createLockManager() {
  const tails = new Map();
  const history = [];
  const requests = [];
  let pending = 0;
  const idleWaiters = [];
  function notifyIdle() {
    if (pending !== 0) return;
    for (const resolve of idleWaiters.splice(0)) resolve();
  }
  return {
    history,
    requests,
    request(name, options, callback) {
      requests.push(name);
      const previous = tails.get(name) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const tail = previous.then(() => gate);
      tails.set(name, tail);
      pending += 1;
      return previous.then(() => {
        history.push(name);
        return callback({ name, mode: options && options.mode || 'exclusive' });
      }).finally(() => {
        release();
        if (tails.get(name) === tail) tails.delete(name);
      }).finally(() => {
        pending -= 1;
        notifyIdle();
      });
    },
    whenIdle() {
      const idle = pending === 0
        ? Promise.resolve()
        : new Promise((resolve) => idleWaiters.push(resolve));
      return idle.then(() => new Promise((resolve) => setImmediate(resolve)))
        .then(() => (pending === 0 ? undefined : this.whenIdle()));
    }
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function bootApp(options = {}) {
  const { savedValue = null, savedFocus = null, savedFocusBackup = null, savedPreset = null,
    failWrites = new Set(), withFocus = true, now = null } = options;
  const elements = new Map();
  const storedValues = options.storedValues || new Map();
  const timeouts = [];
  const intervals = new Map();
  const windowListeners = new Map();
  const lockManager = options.lockManager || createLockManager();
  let nextIntervalId = 1;
  if (savedValue !== null) storedValues.set(STORAGE_KEY, savedValue);
  if (savedFocus !== null) storedValues.set(FOCUS_KEY, savedFocus);
  if (savedFocusBackup !== null) storedValues.set(FOCUS_BACKUP_KEY, savedFocusBackup);
  if (savedPreset !== null) storedValues.set(FOCUS_PRESET_KEY, savedPreset);

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
        dispatch: (type, event = {}) => {
          const listener = listeners.get(type);
          if (listener) return listener({ preventDefault() {}, currentTarget: elements.get(selector), target: elements.get(selector), ...event });
          return undefined;
        },
        setAttribute: (name, value) => attributes.set(name, String(value)),
        getAttribute: (name) => attributes.has(name) ? attributes.get(name) : null,
        removeAttribute: (name) => attributes.delete(name),
        querySelector: (childSelector) => element(`${selector} ${childSelector}`),
        focus() {},
        showModal() { this.open = true; },
        close() { this.open = false; },
        click() { this.clicked = true; },
        remove() { this.removed = true; }
      });
    }
    return elements.get(selector);
  }

  const localStorage = options.localStorage || {
    getItem(key) { return storedValues.has(key) ? storedValues.get(key) : null; },
    setItem(key, value) {
      if (failWrites.has(key)) throw new Error('QuotaExceededError');
      storedValues.set(key, String(value));
    },
    removeItem(key) { storedValues.delete(key); }
  };
  const presetButtons = [
    ['focus', 'Focus · 25 min'],
    ['short-break', 'Break · 5 min'],
    ['long-break', 'Long break · 15 min']
  ].map(([preset]) => {
    const button = element(`.focus-preset[data-focus-preset="${preset}"]`);
    button.dataset.focusPreset = preset;
    return button;
  });
  const document = {
    hidden: false,
    querySelector: element,
    querySelectorAll: (selector) => (selector === '.focus-preset' ? presetButtons : []),
    createElement: () => element('#download-link'),
    body: { appendChild() {} },
    addEventListener() {}
  };
  const window = {
    DaymarkLogic: logic,
    DaymarkRepeat: repeat,
    DaymarkFocus: withFocus ? focus : null,
    DaymarkTaskMutation: taskMutation,
    navigator: { locks: lockManager },
    addEventListener(type, listener) {
      const list = windowListeners.get(type) || [];
      list.push(listener);
      windowListeners.set(type, list);
    }
  };

  vm.runInNewContext(APP_SOURCE, {
    Date: now === null ? Date : frozenDate(now),
    Intl,
    Math,
    console: { warn() {} },
    document,
    localStorage,
    window,
    clearTimeout() {},
    clearInterval(id) { intervals.delete(id); },
    setTimeout: (callback, delay) => { timeouts.push({ callback, delay }); return timeouts.length; },
    setInterval: (callback, delay) => {
      const id = nextIntervalId++;
      intervals.set(id, { id, callback, delay });
      return id;
    }
  }, { filename: 'app.js' });

  function runTimeouts(delay) {
    const ready = timeouts.filter((timer) => delay === undefined || timer.delay === delay);
    const pending = timeouts.filter((timer) => delay !== undefined && timer.delay !== delay);
    timeouts.splice(0, timeouts.length, ...pending);
    ready.forEach((timer) => timer.callback());
  }
  function dispatchStorage(event) {
    for (const listener of windowListeners.get('storage') || []) listener(event);
  }

  return { elements, storedValues, localStorage, lockManager, runTimeouts, dispatchStorage,
    activeIntervals: () => Array.from(intervals.values()) };
}
test('a persisted running focus session is revived and shows the remaining time', () => {
  const now = Date.now();
  const startedAt = now - 10 * 60 * 1000; // started 10 minutes ago
  const session = focus.createSession({ kind: 'focus', durationMinutes: 25, taskId: null }, startedAt);
  const { elements } = bootApp({ savedFocus: JSON.stringify({ session: focus.serialize(session), log: [] }), now });

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
  const { elements } = bootApp({ savedFocus: JSON.stringify({ session: null, log: [entry, breakEntry] }), now: start.getTime() });

  assert.equal(elements.get('#focus-today').textContent, '30', 'breaks are not counted as focus time');
});

test('an idle focus card shows the default preset clock', () => {
  const { elements } = bootApp({ savedFocus: JSON.stringify({ session: null, log: [] }) });
  assert.equal(elements.get('#focus-time').textContent, '25:00');
  assert.equal(elements.get('#focus-state-label').textContent, 'Ready');
  assert.equal(elements.get('#focus-start').hidden, false);
  assert.equal(elements.get('#focus-pause').hidden, true);
});

test('a corrupt focus payload is kept in a recovery backup and the app still boots', async () => {
  const { elements, storedValues, lockManager } = bootApp({ savedFocus: '{not valid JSON' });
  await lockManager.whenIdle();
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), '{not valid JSON');
  assert.equal(elements.get('#focus-time').textContent, '25:00', 'falls back to the idle clock');
});

test('the app still boots cleanly when the focus module is absent', () => {
  const { elements } = bootApp({ withFocus: false });
  assert.equal(elements.get('#focus-time').textContent, '—');
});


test('rejected focus-log records are backed up and the original survives later focus saves', async () => {
  const now = Date.now();
  const session = focus.createSession({ kind: 'focus', durationMinutes: 25 }, now);
  focus.finish(session, now + 60_000, false);
  const validEntry = focus.makeLogEntry(session);
  assert.equal(focus.validateFocusLog([validEntry]).rejectedCount, 0);
  const rejectedEntry = { ...validEntry, id: '' };
  const original = JSON.stringify({ session: null, log: [validEntry, rejectedEntry] });

  const { elements, storedValues, lockManager } = bootApp({ savedFocus: original });
  await lockManager.whenIdle();
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), original,
    'the complete source must be backed up when even one focus-log record is rejected');
  assert.equal(elements.get('#focus-today').textContent, '1',
    'the valid focus-log record remains usable even though the original source stays intact');

  await elements.get('#focus-start').dispatch('click');
  await lockManager.whenIdle();
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), original,
    'starting/saving a new focus session must not erase rejected originals');
  assert.notEqual(storedValues.get(FOCUS_KEY), original);

  const reloaded = bootApp({
    savedFocus: storedValues.get(FOCUS_KEY),
    savedFocusBackup: storedValues.get(FOCUS_BACKUP_KEY)
  });
  await reloaded.lockManager.whenIdle();
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), original,
    'a subsequent reload must retain the recovery backup');
});

test('multiple corrupt focus payloads are bundled instead of overwriting earlier recovery data', async () => {
  const earlier = '{older corrupt focus payload';
  const current = '{new corrupt focus payload';
  const { elements, storedValues, lockManager } = bootApp({
    savedFocus: current,
    savedFocusBackup: earlier
  });
  await lockManager.whenIdle();

  const bundle = JSON.parse(storedValues.get(FOCUS_BACKUP_KEY));
  assert.equal(bundle.format, 'daymark-focus-recovery-bundle-v1');
  assert.deepEqual(bundle.payloads, [earlier, current]);

  await elements.get('#focus-start').dispatch('click');
  await lockManager.whenIdle();
  assert.deepEqual(JSON.parse(storedValues.get(FOCUS_BACKUP_KEY)).payloads, [earlier, current],
    'a later valid focus save must preserve all original recovery payloads');
});

test('failed focus-backup writes leave the only original primary untouched until retry succeeds', async () => {
  const original = '{unreadable focus state';
  const failWrites = new Set([FOCUS_BACKUP_KEY]);
  const { elements, storedValues, lockManager } = bootApp({ savedFocus: original, failWrites });
  await lockManager.whenIdle();

  assert.equal(storedValues.get(FOCUS_KEY), original);
  assert.equal(storedValues.has(FOCUS_BACKUP_KEY), false);

  await elements.get('#focus-start').dispatch('click');
  await lockManager.whenIdle();
  assert.equal(storedValues.get(FOCUS_KEY), original,
    'a focus save must not replace the only original when backup creation still fails');

  failWrites.delete(FOCUS_BACKUP_KEY);
  await elements.get('#focus-pause').dispatch('click');
  await lockManager.whenIdle();
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), original,
    'the retry must create the backup before replacing primary focus state');
  assert.notEqual(storedValues.get(FOCUS_KEY), original);
});


test('a malformed focus-recovery envelope is preserved when another source is backed up', async () => {
  const earlier = JSON.stringify({
    format: 'daymark-focus-recovery-bundle-v1',
    payloads: [null, 7]
  });
  const current = '{new unreadable focus source';
  const { storedValues, lockManager } = bootApp({
    savedFocus: current,
    savedFocusBackup: earlier
  });
  await lockManager.whenIdle();

  const bundle = JSON.parse(storedValues.get(FOCUS_BACKUP_KEY));
  assert.equal(bundle.format, 'daymark-focus-recovery-bundle-v1');
  assert.deepEqual(bundle.payloads, [earlier, current],
    'a malformed existing envelope must remain byte-for-byte available inside the new bundle');
});


test('focus recovery backup can be exported without changing its original bytes', async () => {
  const original = '{unreadable focus recovery + bytes\\nनमस्ते';
  const { elements, storedValues, lockManager } = bootApp({ savedFocus: original });
  await lockManager.whenIdle();
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), original,
    'the corrupt focus source must remain intact after recovery backup creation');

  const action = elements.get('#toast-action');
  assert.equal(action.hidden, false, 'focus recovery should expose a manual export action');
  assert.equal(action.textContent, 'Export recovery');

  action.dispatch('click');
  assert.match(elements.get('#toast').textContent,
    /Recovery backup prepared\. Tap Download now to save the file\./);
  assert.equal(action.textContent, 'Download now');

  action.dispatch('click');
  const link = elements.get('#download-link');
  assert.equal(link.clicked, true, 'the second user gesture starts the download');
  assert.equal(link.download, 'daymark-recovery-backup.txt');
  assert.equal(link.href, 'data:text/plain;charset=utf-8,' + encodeURIComponent(original));
  assert.equal(storedValues.get(FOCUS_BACKUP_KEY), original,
    'export must never clear or rewrite the retained focus recovery source');
});

test('a saved focus preset is restored across sessions', () => {
  const { elements } = bootApp({
    savedFocus: JSON.stringify({ session: null, log: [] }),
    savedPreset: JSON.stringify({ preset: 'long-break' })
  });
  assert.equal(elements.get('#focus-time').textContent, '15:00');
  assert.equal(elements.get('#focus-state-label').textContent, 'Ready');
});

test('an unknown saved focus preset falls back to the default clock', () => {
  const { elements } = bootApp({
    savedFocus: JSON.stringify({ session: null, log: [] }),
    savedPreset: JSON.stringify({ preset: 'nap' })
  });
  assert.equal(elements.get('#focus-time').textContent, '25:00');
});

test('a corrupt focus preset preference is ignored', () => {
  const { elements } = bootApp({
    savedFocus: JSON.stringify({ session: null, log: [] }),
    savedPreset: '{not json'
  });
  assert.equal(elements.get('#focus-time').textContent, '25:00');
});

test('choosing a focus preset persists it for the next visit', async () => {
  const { elements, storedValues, lockManager } = bootApp({
    savedFocus: JSON.stringify({ session: null, log: [] })
  });
  await elements.get('.focus-preset[data-focus-preset="short-break"]').dispatch('click');
  await lockManager.whenIdle();
  assert.equal(JSON.parse(storedValues.get(FOCUS_PRESET_KEY)).preset, 'short-break');
  assert.equal(elements.get('#focus-time').textContent, '05:00');

  const reloaded = bootApp({
    savedFocus: JSON.stringify({ session: null, log: [] }),
    savedPreset: storedValues.get(FOCUS_PRESET_KEY)
  });
  assert.equal(reloaded.elements.get('#focus-time').textContent, '05:00');
});

test('Focus pause rejects repeated keyboard-equivalent activation while busy and releases the guard', async () => {
  const now = Date.now();
  const session = focus.createSession({ kind: 'focus', durationMinutes: 25, taskId: null }, now);
  const { elements, runTimeouts } = bootApp({
    savedFocus: JSON.stringify({ session: focus.serialize(session), log: [] }),
    now
  });
  const pause = elements.get('#focus-pause');

  assert.equal(pause.textContent, 'Pause');
  await pause.dispatch('click', { detail: 0 }); // Keyboard-generated clicks have detail 0.
  assert.equal(pause.textContent, 'Resume', 'the first activation pauses the session');
  assert.equal(pause.getAttribute('aria-busy'), 'true', 'busy state is exposed to assistive technology');
  assert.equal(pause.classList.contains('is-busy'), true);
  assert.equal(pause.disabled, false, 'the guard does not overwrite state-driven disabled state');
  assert.equal(pause.hidden, false, 'the guard does not overwrite state-driven visibility');

  let prevented = false;
  pause.dispatch('click', { detail: 0, preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'a repeated keyboard-equivalent activation is consumed');
  assert.equal(pause.textContent, 'Resume', 'the second activation cannot immediately resume the session');

  runTimeouts(160);
  assert.equal(pause.getAttribute('aria-busy'), null, 'aria-busy is cleared when the visual busy interval ends');
  assert.equal(pause.classList.contains('is-busy'), false);

  await pause.dispatch('click', { detail: 0 });
  assert.equal(pause.textContent, 'Pause', 'the control accepts a new activation after the guard is released');
});

test('Clear All fences Focus session, preset, and recovery writers and resets a live tab timer', async () => {
  const locks = createLockManager();
  const storedValues = new Map([
    [STORAGE_KEY, '[]'],
    [FOCUS_KEY, '{corrupt focus recovery source']
  ]);
  const localStorage = {
    getItem(key) { return storedValues.has(key) ? storedValues.get(key) : null; },
    setItem(key, value) { storedValues.set(key, String(value)); },
    removeItem(key) { storedValues.delete(key); }
  };
  const acquiredFocusFence = deferred();
  const releaseClearAll = deferred();
  const lockStart = locks.history.length;
  const clearTransaction = taskMutation.withLocksInOrder(
    locks,
    taskMutation.CLEAR_ALL_LOCK_ORDER,
    async () => {
      acquiredFocusFence.resolve();
      await releaseClearAll.promise;
      const begun = taskMutation.beginClearAll(localStorage, true);
      assert.equal(begun.ok, true);
      for (const key of [STORAGE_KEY, FOCUS_KEY, FOCUS_BACKUP_KEY, FOCUS_PRESET_KEY]) {
        localStorage.removeItem(key);
      }
      const finalized = taskMutation.finishClearAll(localStorage, true);
      assert.equal(finalized.ok, true);
      return true;
    }
  );
  await acquiredFocusFence.promise;

  const sessionTab = bootApp({ storedValues, localStorage, lockManager: locks });
  const preferenceTab = bootApp({ storedValues, localStorage, lockManager: locks });
  assert.equal(sessionTab.activeIntervals().some((timer) => timer.delay === 1000), false);
  const queuedBeforeActions = locks.requests.length;
  const startAttempt = sessionTab.elements.get('#focus-start').dispatch('click');
  const presetAttempt = preferenceTab.elements
    .get('.focus-preset[data-focus-preset="short-break"]').dispatch('click');
  assert.ok(locks.requests.length >= queuedBeforeActions + 2,
    'session and preset changes must request the shared task/Focus fence while Clear All holds it');
  assert.ok(locks.requests.includes(taskMutation.TASK_LOCK_NAME));

  releaseClearAll.resolve();
  await clearTransaction;
  await Promise.all([startAttempt, presetAttempt]);
  await locks.whenIdle();
  assert.deepEqual(locks.history.slice(lockStart, lockStart + taskMutation.CLEAR_ALL_LOCK_ORDER.length),
    taskMutation.CLEAR_ALL_LOCK_ORDER,
    'Clear All acquires task, webhook delivery, webhook queue, then Focus in the required order');
  for (const key of [STORAGE_KEY, FOCUS_KEY, FOCUS_BACKUP_KEY, FOCUS_PRESET_KEY]) {
    assert.equal(storedValues.has(key), false, `deferred writer must not recreate ${key}`);
  }

  const generationEvent = { key: taskMutation.GENERATION_KEY };
  sessionTab.dispatchStorage(generationEvent);
  preferenceTab.dispatchStorage(generationEvent);
  assert.equal(sessionTab.elements.get('#focus-state-label').textContent, 'Ready');
  assert.equal(sessionTab.elements.get('#focus-time').textContent, '25:00');
  assert.equal(sessionTab.activeIntervals().some((timer) => timer.delay === 1000), false,
    'the generation change stops the pre-clear Focus timer');
  assert.equal(preferenceTab.elements.get('#focus-state-label').textContent, 'Ready');
  assert.equal(preferenceTab.activeIntervals().some((timer) => timer.delay === 1000), false);

  await preferenceTab.elements.get('.focus-preset[data-focus-preset="long-break"]').dispatch('click');
  await locks.whenIdle();
  assert.equal(JSON.parse(storedValues.get(FOCUS_PRESET_KEY)).preset, 'long-break',
    'a new Focus action after reset may persist its own current preference');
  assert.equal(storedValues.has(FOCUS_KEY), false,
    'the post-clear action cannot restore the old session or recovery payload');
  assert.equal(preferenceTab.activeIntervals().some((timer) => timer.delay === 1000), false);
});
