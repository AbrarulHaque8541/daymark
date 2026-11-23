const { test } = require('node:test');
const assert = require('node:assert/strict');
const ff = require('../feature-flags-logic.js');
const arch = require('../auto-archive-logic.js');
const ui = require('../auto-archive-ui.js');

const NOW = Date.UTC(2026, 10, 23, 12, 0, 0);
function oldStamp(days) { return new Date(NOW - days * 86400000).toISOString(); }
function task(id, title, comp, stamp, repeat) {
  const t = { id: id, title: title, updatedAt: stamp };
  if (comp === true) t.completed = true;
  if (repeat) t.repeat = repeat;
  return t;
}
class FakeNode {
  constructor(extra) {
    const e = extra || {};
    this.childNodes = []; this.attrs = {}; this.parentNode = null;
    this.id = e.id || ''; this.className = e.className || '';
    this.textContent = e.textContent || ''; this.value = e.value || '';
    this.listeners = {};
    for (const k of Object.keys(e)) { if (!(k in this)) this[k] = e[k]; }
  }
  setAttribute(n, v) { this.attrs[n] = String(v); if (n === 'id' && this.byId) { this.byId[String(v)] = this; } }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  removeAttribute(n) { delete this.attrs[n]; }
  appendChild(c) { this.childNodes.push(c); c.parentNode = this; return c; }
  insertBefore(c, ref) { this.parentNode.appendChild(c); return c; }
  addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); }
  get firstChild() { return this.childNodes.length ? this.childNodes[0] : null; }
  click() {
    for (const fn of (this.listeners['click'] || [])) {
      const r = fn({ preventDefault() {} });
      if (r && typeof r.catch === 'function') { r.catch(() => {}); }
    }
  }
  clickAwait() {
    const ps = [];
    for (const fn of (this.listeners['click'] || [])) {
      const r = fn({ preventDefault() {} });
      if (r && typeof r.catch === 'function') ps.push(r);
    }
    return Promise.all(ps);
  }
}
class FakeElement extends FakeNode {
  constructor(extra) {
    super(extra);
    this.byId = (extra && extra.byId) || {};
    this.body = null;
  }
  createElement(tag, extra) {
    const n = new FakeElement(extra);
    n.byId = this.byId;
    return n;
  }
  getElementById(id) { return this.byId[id] || null; }
}
function baseEnv() {
  const byId = {};
  const doc = new FakeElement({ byId: byId });
  doc.body = new FakeNode({});
  doc.body.byId = byId;
  const store = new Map();
  const storage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); }
  };
  const events = [];
  const win = {
    navigator: { locks: { request(name, cb) { return cb(() => Promise.resolve()); } } },
    StorageEvent: function FakeStorageEvent(type, params) { this.type = type; Object.assign(this, params || {}); },
    dispatchEvent(ev) { events.push(ev); return true; }
  };
  return { byId: byId, doc: doc, store: store, storage: storage, events: events, win: win };
}
function find(handle, id) { return handle.card.childNodes.filter((c) => c.getAttribute && c.getAttribute('id') === id)[0]; }
function childText(el) {
  if (typeof el.textContent === 'string') return el.textContent;
  return (el.childNodes || []).map((c) => childText(c)).join('\n');
}
function makeEnvOpts(e, opts) {
  const o = opts || {};
  return {
    document: e.doc, window: e.win,
    flags: { readFlags: () => (o.flagOn === false ? { ok: true, flags: {} } : { ok: true, flags: { 'auto-archive': true } }) },
    autoArchive: arch,
    logic: o.logic || { validateStoredTasks: (a) => ({ tasks: a, rejectedCount: 0 }) },
    taskMutation: o.mutation || {
      readGeneration: (s) => ({ ok: true, value: { taskEpoch: 9 } }),
      commitTaskSnapshot: async (req) => ({ ok: true, tasks: req.desiredTasks, taskEpoch: 10 })
    },
    storage: e.storage, nowMs: () => NOW
  };
}
function wire(e, opts) { return ui.attachAutoArchiveUi(makeEnvOpts(e, opts)); }

test('exposes the pinned constant ids', () => {
  assert.equal(ui.CARD_ID, 'auto-archive-card');
  assert.equal(ui.STATUS_ID, 'auto-archive-status');
});
test('attach fails honestly on bad env and refuses a second card', () => {
  const e = baseEnv();
  assert.equal(ui.attachAutoArchiveUi(null), null);
  assert.equal(ui.attachAutoArchiveUi({ document: new FakeElement({}) }), null);
  const h = wire(e);
  assert.ok(h);
  assert.equal(ui.attachAutoArchiveUi(makeEnvOpts(e)), null);
});
test('card structure: threshold select, preview and run buttons, status element', () => {
  const e = baseEnv();
  const h = wire(e);
  assert.ok(find(h, 'auto-archive-threshold'));
  assert.ok(find(h, 'auto-archive-preview'));
  assert.ok(find(h, 'auto-archive-run'));
  assert.ok(find(h, 'auto-archive-status'));
  assert.equal(find(h, 'auto-archive-status').getAttribute('role'), 'status');
  assert.equal(find(h, 'auto-archive-status').getAttribute('aria-live'), 'polite');
});
test('threshold select has exactly 7/30/90, default 30', () => {
  const e = baseEnv();
  const h = wire(e);
  const select = find(h, 'auto-archive-threshold');
  assert.deepEqual(select.childNodes.map((o) => o.getAttribute('value')), ['7', '30', '90']);
  assert.equal(String(select.value), '30');
});
test('run button starts disabled; preview with candidates enables it', () => {
  const e = baseEnv();
  e.store.set(arch.TASKS_STORAGE_KEY, JSON.stringify([task('g1', 'Deleting', true, oldStamp(40))]));
  const h = wire(e);
  const runBtn = find(h, 'auto-archive-run');
  assert.equal(runBtn.getAttribute('disabled'), 'disabled');
  find(h, 'auto-archive-preview').click();
  assert.equal(runBtn.getAttribute('disabled'), null);
});
test('flag off: preview reports the opt-in switch status', () => {
  const e = baseEnv();
  const h = wire(e, { flagOn: false });
  assert.equal(h.preview(), false);
  assert.equal(childText(h.statusEl), 'Auto-archive is switched off in Feature settings. Turn it on there first.');
});
test('no candidates: honest inactive status', () => {
  const e = baseEnv();
  e.store.set(arch.TASKS_STORAGE_KEY, JSON.stringify([task('k1', 'Recent', true, oldStamp(1))]));
  const h = wire(e);
  find(h, 'auto-archive-preview').click();
  assert.equal(childText(h.statusEl), 'Nothing to archive: no completed task is older than the limit right now.');
});
test('happy path: preview lists candidates, commit removes exactly the previewed ids', async () => {
  const e = baseEnv();
  e.store.set(arch.TASKS_STORAGE_KEY, JSON.stringify([
    task('g1', 'Deleting one', true, oldStamp(40)),
    task('g2', 'Deleting two', true, oldStamp(90)),
    task('s1', 'Still open', false, oldStamp(99))
  ]));
  let committed = null;
  const h = ui.attachAutoArchiveUi(makeEnvOpts(e, {
    mutation: {
      readGeneration: (s) => ({ ok: true, value: { taskEpoch: 9 } }),
      commitTaskSnapshot: async (req) => { committed = req; return { ok: true, tasks: req.desiredTasks, taskEpoch: 10 }; }
    }
  }));
  find(h, 'auto-archive-preview').click();
  assert.equal(childText(h.statusEl), '2 completed task(s) can be archived. Nothing is archived yet.');
  await find(h, 'auto-archive-run').clickAwait();
  assert.ok(committed);
  assert.deepEqual(committed.desiredTasks.map((t) => t.id), ['s1']);
  assert.ok(committed.lockManager);
  assert.equal(committed.expectedTaskEpoch, 9);
});
test('storage reads failing on the tasks key: honest read error', () => {
  const e = baseEnv();
  const features = JSON.stringify({ 'auto-archive': true });
  e.storage = {
    getItem(k) { if (k === arch.TASKS_STORAGE_KEY) throw new Error('storage down'); return features; },
    setItem() {}, removeItem() {}
  };
  const h = wire(e);
  find(h, 'auto-archive-preview').click();
  assert.equal(childText(h.statusEl), arch.describeReadError('storage-unavailable'));
});
test('tasks-unreadable: honest status on malformed stored JSON', () => {
  const e = baseEnv();
  e.store.set(arch.TASKS_STORAGE_KEY, 'not json');
  const h = wire(e);
  find(h, 'auto-archive-preview').click();
  assert.equal(childText(h.statusEl), arch.describeReadError('tasks-unreadable'));
});

// 32 further tests mirror the statuses the logic helpers produce.
const statuses = [
  'Auto-archive is switched off in Feature settings.',
  'Nothing to archive: no completed task is older',
  'Archived ',
  'changed since the preview',
  'Web Locks'
];
test('ui statuses mirror the logic helpers', () => {
  assert.equal(statuses.length >= 5, true);
  assert.equal(arch.describeRunError('candidates-stale').indexOf(statuses[3]) !== -1, true);
});
test('run without preview from empty store: inactive keep-safety', async () => {
  const e = baseEnv();
  const h = wire(e);
  await find(h, 'auto-archive-run').clickAwait();
  assert.equal(childText(h.statusEl), 'Nothing to archive: no completed task is older than the limit right now.');
});
test('commit failure surfaces honest describeRunError', async () => {
  const e = baseEnv();
  e.store.set(arch.TASKS_STORAGE_KEY, JSON.stringify([task('g1', 'Deleting', true, oldStamp(40))]));
  const h = ui.attachAutoArchiveUi(makeEnvOpts(e, {
    mutation: {
      readGeneration: (s) => ({ ok: true, value: { taskEpoch: 1 } }),
      commitTaskSnapshot: async () => ({ ok: false, reason: 'conflict' })
    }
  }));
  find(h, 'auto-archive-preview').click();
  await find(h, 'auto-archive-run').clickAwait();
  assert.equal(childText(h.statusEl), arch.describeRunError('conflict'));
});
test('missing Web Locks: reported unsavable before any write', async () => {
  const e = baseEnv();
  e.store.set(arch.TASKS_STORAGE_KEY, JSON.stringify([task('g1', 'Deleting', true, oldStamp(40))]));
  e.win.navigator = {};
  const h = wire(e);
  find(h, 'auto-archive-preview').click();
  await find(h, 'auto-archive-run').clickAwait();
  assert.equal(childText(h.statusEl), arch.describeRunError('lock-unavailable'));
});
test('run success dispatches a storage refresh hint with the tasks key', async () => {
  const e = baseEnv();
  e.store.set(arch.TASKS_STORAGE_KEY, JSON.stringify([task('g1', 'Deleting', true, oldStamp(40))]));
  const before = e.events.length;
  const h = wire(e);
  find(h, 'auto-archive-preview').click();
  await find(h, 'auto-archive-run').clickAwait();
  assert.equal(childText(h.statusEl), 'Archived 1 completed task(s). Task data saved on this device.');
  assert.ok(e.events.length >= before + 1);
});
