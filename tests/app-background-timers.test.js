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
const TASKS_KEY = 'daymark.tasks.v1';
const TASK_VIEW_KEY = 'daymark.task-view.v1';
const SEARCH_RENDER_DELAY_MS = 120;

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
  const timeouts = new Map();
  const storageWrites = [];
  const windowListeners = new Map();
  let nextIntervalId = 1;
  let nextTimeoutId = 1;
  const lockManager = opts.lockManager || makeLockManager();
  if (savedFocus !== null) storedValues.set(FOCUS_KEY, savedFocus);
  if (opts.savedTasks !== undefined) storedValues.set(TASKS_KEY, JSON.stringify(opts.savedTasks));

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
    setItem(key, value) {
      const stored = String(value);
      storageWrites.push({ key, value: stored });
      storedValues.set(key, stored);
    },
    removeItem(key) { storedValues.delete(key); }
  };
  const presetButtons = ['focus', 'short-break', 'long-break'].map((preset) => {
    const button = element('.focus-preset[data-focus-preset="' + preset + '"]');
    button.dataset.focusPreset = preset;
    return button;
  });
  const filterButtons = ['all', 'today', 'upcoming', 'overdue', 'completed', 'high'].map((filter) => {
    const button = element('.filter-button[data-filter="' + filter + '"]');
    button.dataset.filter = filter;
    return button;
  });
  const documentStub = {
    hidden: opts.hidden === true,
    querySelector: element,
    querySelectorAll: (selector) => {
      if (selector === '.focus-preset') return presetButtons;
      if (selector === '.filter-button') return filterButtons;
      return [];
    },
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
    DaymarkFeed: opts.withFeed ? { validateFeedCache: () => false } : null,
    navigator: { locks: lockManager },
    addEventListener(type, listener) {
      const list = windowListeners.get(type) || [];
      list.push(listener);
      windowListeners.set(type, list);
    }
  };
  const context = {
    Date: now === null ? Date : frozenDate(now),
    Intl,
    Math,
    console: { warn() {} },
    document: documentStub,
    localStorage,
    window: windowStub,
    clearTimeout(id) { timeouts.delete(id); },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(callback, delay) {
      const id = nextTimeoutId++;
      timeouts.set(id, { id, callback, delay });
      return id;
    },
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
    storageWrites,
    docListeners,
    activeIntervals: () => Array.from(intervals.values()),
    timeoutsWithDelay(delay) {
      return Array.from(timeouts.values()).filter((timer) => timer.delay === delay);
    },
    runTimeoutsWithDelay(delay) {
      const due = Array.from(timeouts.values()).filter((timer) => timer.delay === delay);
      for (const timer of due) {
        if (!timeouts.has(timer.id)) continue;
        timeouts.delete(timer.id);
        timer.callback();
      }
      return due.length;
    },
    dispatchWindow(type, event) {
      for (const listener of windowListeners.get(type) || []) listener(event || {});
    },
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


function countInnerHTMLWrites(target) {
  let value = target.innerHTML;
  let writes = 0;
  Object.defineProperty(target, 'innerHTML', {
    configurable: true,
    get() { return value; },
    set(next) { writes += 1; value = String(next); }
  });
  return () => writes;
}

function makeTask(id, title) {
  const timestamp = '2026-11-20T12:00:00.000Z';
  return {
    id,
    title,
    dueDate: null,
    priority: 'medium',
    completed: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

test('rapid search input coalesces persistence and rerenders only the task view', () => {
  const app = bootApp({ savedTasks: [makeTask('task-1', 'Needle task')], withFeed: true });
  const taskListWrites = countInnerHTMLWrites(app.elements.get('#task-list'));
  const focusTaskWrites = countInnerHTMLWrites(app.elements.get('#focus-task'));
  const feedListWrites = countInnerHTMLWrites(app.elements.get('#feed-list'));
  const suggestionWrites = countInnerHTMLWrites(app.elements.get('#suggestion-list'));
  const search = app.elements.get('#task-search');
  const preferenceWritesBefore = app.storageWrites.filter((write) => write.key === TASK_VIEW_KEY).length;

  for (const query of ['N', 'Need', 'Needle']) {
    search.value = query;
    search.dispatch('input');
  }

  assert.equal(app.timeoutsWithDelay(SEARCH_RENDER_DELAY_MS).length, 1, 'only the latest input owns a scheduled flush');
  assert.equal(taskListWrites(), 0, 'typing does not rebuild the list on each input event');
  assert.equal(focusTaskWrites(), 0, 'search does not rewrite the independent Focus task selector');
  assert.equal(feedListWrites(), 0, 'search does not rewrite the cached feed card');
  assert.equal(suggestionWrites(), 0, 'search does not recompute task-only suggestions');
  assert.equal(app.storageWrites.filter((write) => write.key === TASK_VIEW_KEY).length, preferenceWritesBefore, 'search preferences are not written per keystroke');

  assert.equal(app.runTimeoutsWithDelay(SEARCH_RENDER_DELAY_MS), 1);
  assert.equal(taskListWrites(), 1, 'the final query renders once after the typing burst');
  assert.equal(app.elements.get('#visible-count').textContent, '1 matching task');
  assert.equal(app.elements.get('#search-result-status').textContent, '1 matching task');
  assert.equal(JSON.parse(app.storedValues.get(TASK_VIEW_KEY)).query, 'Needle');
  assert.equal(app.storageWrites.filter((write) => write.key === TASK_VIEW_KEY).length, preferenceWritesBefore + 1);
  assert.equal(focusTaskWrites(), 0);
  assert.equal(feedListWrites(), 0);
  assert.equal(suggestionWrites(), 0);

  app.elements.get('#sort-toggle').dispatch('click');
  assert.equal(taskListWrites(), 2, 'sort still updates the task list');
  assert.equal(focusTaskWrites(), 0, 'sort remains task-view-only');
  assert.equal(feedListWrites(), 0, 'sort remains task-view-only');
  assert.equal(suggestionWrites(), 0, 'sort does not recompute task-only suggestions');

  app.elements.get('.filter-button[data-filter="today"]').dispatch('click');
  assert.equal(taskListWrites(), 3, 'filter still updates the task list');
  assert.equal(focusTaskWrites(), 0, 'filter remains task-view-only');
  assert.equal(feedListWrites(), 0, 'filter remains task-view-only');
  assert.equal(suggestionWrites(), 0, 'filter does not recompute task-only suggestions');

  app.elements.get('#reset-view').dispatch('click');
  assert.equal(taskListWrites(), 4, 'reset restores the task view');
  assert.equal(focusTaskWrites(), 0, 'reset remains task-view-only');
  assert.equal(feedListWrites(), 0, 'reset remains task-view-only');

  search.value = 'Needle';
  search.dispatch('input');
  app.elements.get('#clear-search').dispatch('click');
  assert.equal(app.timeoutsWithDelay(SEARCH_RENDER_DELAY_MS).length, 0, 'clear cancels pending search work');
  assert.equal(JSON.parse(app.storedValues.get(TASK_VIEW_KEY)).query, '');
  assert.equal(taskListWrites(), 5, 'clear immediately restores the full task view');
  assert.equal(focusTaskWrites(), 0);
  assert.equal(feedListWrites(), 0);

  const remoteTask = makeTask('task-2', 'Remote follow-up');
  app.storedValues.set(TASKS_KEY, JSON.stringify([makeTask('task-1', 'Needle task'), remoteTask]));
  app.dispatchWindow('storage', { key: TASKS_KEY });
  assert.match(app.elements.get('#focus-task').innerHTML, /Remote follow-up/, 'a task-state update still refreshes Focus choices');
  assert.ok(focusTaskWrites() > 0);
  assert.ok(feedListWrites() > 0, 'the full state render preserves existing feed refresh behavior');
  assert.ok(suggestionWrites() > 0, 'task changes still recompute task-only suggestions');
});

test('search blur flushes immediately and pagehide persists without a late render', () => {
  const app = bootApp();
  const search = app.elements.get('#task-search');
  const taskListWrites = countInnerHTMLWrites(app.elements.get('#task-list'));

  search.value = 'blur query';
  search.dispatch('input');
  assert.equal(taskListWrites(), 0);
  search.dispatch('blur');
  assert.equal(app.timeoutsWithDelay(SEARCH_RENDER_DELAY_MS).length, 0, 'blur cancels the scheduled callback');
  assert.equal(taskListWrites(), 1, 'blur immediately renders the final query');
  assert.equal(JSON.parse(app.storedValues.get(TASK_VIEW_KEY)).query, 'blur query');

  search.value = 'pagehide query';
  search.dispatch('input');
  app.dispatchWindow('pagehide');
  assert.equal(app.timeoutsWithDelay(SEARCH_RENDER_DELAY_MS).length, 0);
  assert.equal(JSON.parse(app.storedValues.get(TASK_VIEW_KEY)).query, 'pagehide query');
  assert.equal(taskListWrites(), 1, 'pagehide flushes persistence but avoids a redundant hidden-page render');

  search.value = 'background query';
  search.dispatch('input');
  app.setVisibility(true);
  assert.equal(app.timeoutsWithDelay(SEARCH_RENDER_DELAY_MS).length, 0, 'backgrounding cancels the pending timer');
  assert.equal(JSON.parse(app.storedValues.get(TASK_VIEW_KEY)).query, 'background query');
  assert.equal(taskListWrites(), 2, 'backgrounding applies the latest query before the page is suspended');
});

test('a back-forward-cache restore reconciles the view after pagehide skips hidden rendering', () => {
  const app = bootApp();
  const search = app.elements.get('#task-search');
  const taskListWrites = countInnerHTMLWrites(app.elements.get('#task-list'));

  search.value = 'restored query';
  search.dispatch('input');
  app.dispatchWindow('pagehide');
  assert.equal(taskListWrites(), 0, 'pagehide persists without rendering while hidden');
  assert.equal(JSON.parse(app.storedValues.get(TASK_VIEW_KEY)).query, 'restored query');

  app.dispatchWindow('pageshow', { persisted: true });
  assert.equal(taskListWrites(), 1, 'bfcache restore reapplies the saved in-memory query to the view');
  assert.equal(app.elements.get('#visible-count').textContent, '0 matching tasks');
  assert.equal(app.elements.get('#empty-state').hidden, false);
});

test('tag-chip search persists the query even when no debounce is pending', async () => {
  const task = Object.assign(makeTask('task-1', 'Tagged task'), { tags: ['work'] });
  const app = bootApp({ savedTasks: [task] });
  const row = { dataset: { taskId: task.id } };
  const button = {
    dataset: { action: 'tag', tag: 'work' },
    closest(selector) { return selector === '[data-task-id]' ? row : null; }
  };
  const target = {
    closest(selector) {
      if (selector === 'button[data-action]') return button;
      if (selector === '[data-task-id]') return row;
      return null;
    }
  };

  await app.elements.get('#task-list').dispatch('click', { target });

  assert.equal(JSON.parse(app.storedValues.get(TASK_VIEW_KEY)).query, 'work');
  assert.equal(app.elements.get('#task-search').value, 'work');
  assert.equal(app.timeoutsWithDelay(SEARCH_RENDER_DELAY_MS).length, 0);
});
