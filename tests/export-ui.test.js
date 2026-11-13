'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const exporter = require('../export-logic.js');
const logic = require('../task-logic.js');
const ui = require('../export-ui.js');
const fs = require('node:fs');
const path = require('node:path');

function fakeElement(tag) {
  return {
    tagName: tag,
    id: '',
    className: '',
    value: '',
    textContent: '',
    href: '',
    download: '',
    clicked: false,
    removed: false,
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    closest(selector) {
      return selector === '#' + this.id && this.id ? this : null;
    },
    click() { this.clicked = true; },
    remove() { this.removed = true; }
  };
}

function fakeEnv(options) {
  const opts = options || {};
  const listeners = [];
  const elements = {
    'export-format': Object.assign(fakeElement('select'), { id: 'export-format', value: opts.format || 'json' }),
    'export-tasks': Object.assign(fakeElement('button'), { id: 'export-tasks' })
  };
  const created = [];
  const doc = {
    readyState: 'complete',
    body: {
      children: [],
      appendChild(el) { this.children.push(el); return el; }
    },
    getElementById(id) { return elements[id] || null; },
    createElement(tag) {
      const el = fakeElement(tag);
      created.push(el);
      return el;
    },
    addEventListener(type, handler, capture) { listeners.push({ type, handler, capture }); },
    removeEventListener(type, handler, capture) {
      const index = listeners.findIndex((l) => l.type === type && l.handler === handler && l.capture === capture);
      if (index !== -1) listeners.splice(index, 1);
    }
  };
  const storageData = {};
  if (opts.stored !== undefined) storageData[ui.STORAGE_KEY] = opts.stored;
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { storageData[key] = String(value); }
  };
  const env = {
    document: doc,
    window: { localStorage: storage },
    localStorage: storage,
    exportApi: exporter,
    logic,
    now: () => '2026-11-02T12:00:00.000Z'
  };
  return { env, doc, listeners, elements, created, storageData };
}

function clickEvent(target) {
  const event = {
    target,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; }
  };
  return event;
}

const sampleTasks = [
  { id: 't1', title: 'Alpha', dueDate: '2026-11-05', dueTime: null, priority: 'high', completed: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', notes: '', repeat: null, tags: [], subtasks: [] },
  { id: 't2', title: 'Beta', dueDate: null, dueTime: null, priority: 'low', completed: true, createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z', notes: '', repeat: null, tags: [], subtasks: [] }
];

test('registers a capture-phase click listener on the document', () => {
  const { env, listeners } = fakeEnv({ format: 'markdown' });
  const handle = ui.attachExportUi(env);
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].type, 'click');
  assert.equal(listeners[0].capture, true);
  handle.detach();
  assert.equal(listeners.length, 0);
});

test('json format is left for the built-in backup handler', () => {
  const { env, elements, created } = fakeEnv({ format: 'json', stored: JSON.stringify(sampleTasks) });
  const handle = ui.attachExportUi(env);
  const event = clickEvent(elements['export-tasks']);
  handle.onClick(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.propagationStopped, false);
  assert.equal(created.filter((el) => el.tagName === 'a').length, 0, 'no download is triggered');
});

test('markdown selection intercepts the click and downloads a .md file', () => {
  const { env, elements, created } = fakeEnv({ format: 'markdown', stored: JSON.stringify(sampleTasks) });
  const handle = ui.attachExportUi(env);
  const event = clickEvent(elements['export-tasks']);
  handle.onClick(event);
  assert.equal(event.defaultPrevented, true, 'app.js backup handler must not also run');
  assert.equal(event.propagationStopped, true);
  const link = created.find((el) => el.tagName === 'a');
  assert.ok(link, 'a download link is created');
  assert.equal(link.download, 'daymark-tasks-2026-11-02.md');
  assert.ok(link.href.startsWith('data:text/markdown;charset=utf-8,'));
  assert.equal(link.clicked, true);
  assert.equal(link.removed, true);
  const payload = decodeURIComponent(link.href.split(',')[1]);
  assert.equal(payload, exporter.render('markdown', sampleTasks, { generatedAt: '2026-11-02T12:00:00.000Z' }));
  const status = created.find((el) => el.id === 'export-status');
  assert.ok(status, 'an sr-only status element announces the result');
  assert.equal(status.attributes.role, 'status');
  assert.ok(status.textContent.includes('2 tasks as MARKDOWN'));
});

test('csv and ics selections produce the matching file names and payloads', () => {
  for (const format of ['csv', 'ics']) {
    const { env, elements, created } = fakeEnv({ format, stored: JSON.stringify(sampleTasks) });
    const handle = ui.attachExportUi(env);
    handle.onClick(clickEvent(elements['export-tasks']));
    const link = created.find((el) => el.tagName === 'a');
    assert.equal(link.download, `daymark-tasks-2026-11-02.${format === 'ics' ? 'ics' : 'csv'}`);
    const payload = decodeURIComponent(link.href.split(',')[1]);
    assert.equal(payload, exporter.render(format, sampleTasks, { generatedAt: '2026-11-02T12:00:00.000Z' }));
  }
});

test('clicks elsewhere are ignored', () => {
  const { env, elements, created } = fakeEnv({ format: 'csv', stored: JSON.stringify(sampleTasks) });
  const handle = ui.attachExportUi(env);
  const other = fakeElement('button');
  other.id = 'sort-toggle';
  const event = clickEvent(other);
  handle.onClick(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(created.filter((el) => el.tagName === 'a').length, 0);
  assert.equal(elements['export-tasks'].clicked, false);
});

test('missing storage exports an empty but valid document', () => {
  const { env, elements, created } = fakeEnv({ format: 'ics' });
  const handle = ui.attachExportUi(env);
  handle.onClick(clickEvent(elements['export-tasks']));
  const link = created.find((el) => el.tagName === 'a');
  const payload = decodeURIComponent(link.href.split(',')[1]);
  assert.equal(payload, exporter.render('ics', [], { generatedAt: '2026-11-02T12:00:00.000Z' }));
  assert.ok(payload.includes('END:VCALENDAR'));
});

test('empty or non-array task storage is not exported as an empty backup', () => {
  for (const stored of ['', 'null', '{"tasks":[]}']) {
    const { env, elements, created, storageData } = fakeEnv({ format: 'markdown', stored });
    const handle = ui.attachExportUi(env);
    handle.onClick(clickEvent(elements['export-tasks']));
    assert.equal(created.filter((el) => el.tagName === 'a').length, 0,
      'unknown top-level task state must never produce an empty-looking export');
    assert.equal(storageData[ui.STORAGE_KEY], stored, 'the original task value remains untouched');
    const status = created.find((el) => el.id === 'export-status');
    assert.match(status.textContent, /Export failed:/);
  }
});

test('malformed stored tasks are reported and skipped, valid ones still export', () => {
  const broken = sampleTasks.concat([{ id: 't1', title: 'duplicate id' }, { nope: true }]);
  const { env, elements, created } = fakeEnv({ format: 'markdown', stored: JSON.stringify(broken) });
  const handle = ui.attachExportUi(env);
  handle.onClick(clickEvent(elements['export-tasks']));
  const link = created.find((el) => el.tagName === 'a');
  const payload = decodeURIComponent(link.href.split(',')[1]);
  assert.equal(payload, exporter.render('markdown', sampleTasks, { generatedAt: '2026-11-02T12:00:00.000Z' }));
  const status = created.find((el) => el.id === 'export-status');
  assert.ok(status.textContent.includes('2 malformed tasks skipped'));
});

test('a render failure is announced instead of throwing', () => {
  const badStorage = JSON.stringify([{ id: 'x', title: 'ok', priority: 'wrong', completed: false, createdAt: '2026-01-01T00:00:00.000Z', tags: [] }]);
  const { env, elements, created } = fakeEnv({ format: 'csv', stored: badStorage });
  // task-logic.validateStoredTasks drops the invalid record, so force a
  // failure by making the export API reject everything.
  env.exportApi = { isFormat: () => true, render: () => { throw new Error('boom'); } };
  const handle = ui.attachExportUi(env);
  handle.onClick(clickEvent(elements['export-tasks']));
  const status = created.find((el) => el.id === 'export-status');
  assert.ok(status.textContent.includes('Export failed: boom'));
  assert.equal(created.filter((el) => el.tagName === 'a').length, 0);
});

test('auto-boot stays inert under Node (no window) and the module exposes its API', () => {
  assert.equal(typeof ui.attachExportUi, 'function');
  assert.equal(ui.STORAGE_KEY, 'daymark.tasks.v1');
  assert.equal(typeof globalThis.DaymarkExportUi, 'object');
});


test('blocked storage getter leaves open-format export attached but fails closed without an empty backup', () => {
  const { env, elements, created } = fakeEnv({ format: 'markdown', stored: JSON.stringify(sampleTasks) });
  delete env.localStorage;
  let reads = 0;
  Object.defineProperty(env.window, 'localStorage', {
    configurable: true,
    get() {
      reads += 1;
      throw new Error('storage access blocked');
    }
  });
  const handle = ui.attachExportUi(env);
  assert.equal(reads, 1, 'storage acquisition is attempted once and caught');
  handle.onClick(clickEvent(elements['export-tasks']));
  assert.equal(created.filter((el) => el.tagName === 'a').length, 0,
    'an unreadable task store must never produce an empty-looking export');
  const status = created.find((el) => el.id === 'export-status');
  assert.match(status.textContent, /Export failed: browser storage is unavailable; no data was exported/);
});

test('export auto-boot does not eagerly evaluate window.localStorage', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'export-ui.js'), 'utf8');
  assert.doesNotMatch(source, /localStorage:\s*window\.localStorage/,
    'boot must pass window and let attachExportUi guard the storage getter');
});

test('duplicate-key task storage fails closed for open-format export', () => {
  const ambiguous = '[{"id":"t1","title":"Original","title":"Overwritten","dueDate":null,"priority":"medium","completed":false,"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}]';
  const { env, elements, created } = fakeEnv({ format: 'markdown', stored: ambiguous });
  const handle = ui.attachExportUi(env);
  const event = clickEvent(elements['export-tasks']);
  handle.onClick(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
  assert.equal(created.some((el) => el.tagName === 'a'), false,
    'no download is produced from ambiguous task bytes');
  const status = created.find((el) => el.id === 'export-status');
  assert.match(status.textContent, /duplicate JSON keys/);
});

test('index loads task mutation and export logic before their UI consumers', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\s+src=["']([^"']+)["'][^>]*>/g)].map((match) => match[1]);
  const at = (name) => scripts.indexOf(name);
  assert.ok(at('task-logic.js') >= 0, 'task logic is loaded');
  assert.ok(at('task-mutation-logic.js') > at('task-logic.js'),
    'task mutation follows its task contract');
  assert.ok(at('task-mutation-logic.js') < at('webhook-ui.js'),
    'task mutation is available before webhook UI initialization');
  assert.ok(at('task-mutation-logic.js') < at('app.js'),
    'task mutation is available before app initialization');
  assert.ok(at('export-logic.js') > at('task-logic.js'),
    'export renderer follows task validation logic');
  assert.ok(at('export-logic.js') < at('export-ui.js'),
    'export renderer is available before export UI initialization');
  assert.ok(at('webhook-logic.js') < at('webhook-ui.js'),
    'webhook logic is available before webhook UI initialization');
  assert.ok(at('browser-intent-logic.js') < at('browser-intent-ui.js'),
    'intent planner logic is available before its UI');
});
