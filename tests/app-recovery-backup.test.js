const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const logic = require('../task-logic.js');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const STORAGE_KEY = 'daymark.tasks.v1';
const BACKUP_KEY = `${STORAGE_KEY}.backup`;

function bootApp(storedValues, failWrites = new Set()) {
  const elements = new Map();

  function element(selector) {
    if (!elements.has(selector)) {
      const classes = new Set();
      const listeners = new Map();
      const item = {
        value: '',
        textContent: '',
        innerHTML: '',
        hidden: false,
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
        addEventListener: (type, listener) => listeners.set(type, listener),
        dispatch: (type, event = {}) => {
          const listener = listeners.get(type);
          if (listener) listener({
            preventDefault() {},
            currentTarget: item,
            target: item,
            ...event
          });
        },
        reset() {},
        setAttribute() {},
        removeAttribute() {},
        querySelector: (child) => element(`${selector} ${child}`),
        focus() {},
        showModal() { this.open = true; },
        close() { this.open = false; }
      };
      elements.set(selector, item);
    }
    return elements.get(selector);
  }

  const localStorage = {
    getItem: (key) => storedValues.has(key) ? storedValues.get(key) : null,
    setItem: (key, value) => {
      if (failWrites.has(key)) throw new Error('QuotaExceededError');
      storedValues.set(key, String(value));
    },
    removeItem: (key) => storedValues.delete(key)
  };
  const document = {
    hidden: false,
    querySelector: element,
    querySelectorAll: () => [],
    addEventListener() {}
  };
  const window = {
    DaymarkLogic: logic,
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

  return { elements };
}

function validTask(id, title) {
  const timestamp = new Date().toISOString();
  return {
    id, title, dueDate: null, priority: 'medium', completed: false,
    createdAt: timestamp, updatedAt: timestamp
  };
}

test('partially rejected saved tasks survive a subsequent edit and page reload', () => {
  const original = JSON.stringify([
    validTask('valid-1', 'Keep valid task'),
    validTask('invalid-1', 'x'.repeat(170))
  ]);
  const storedValues = new Map([[STORAGE_KEY, original]]);
  const first = bootApp(storedValues);

  assert.equal(storedValues.get(BACKUP_KEY), original,
    'the full original payload is backed up when validation rejects a record');

  first.elements.get('#new-title').value = 'New task';
  first.elements.get('#add-form').dispatch('submit');
  assert.equal(first.elements.get('#storage-status span').textContent,
    'Saved on this device; ignored originals remain in a recovery backup');
  assert.equal(storedValues.get(BACKUP_KEY), original,
    'saving valid tasks must not delete the backup containing rejected records');

  const saved = JSON.parse(storedValues.get(STORAGE_KEY));
  assert.deepEqual(saved.map((task) => task.title), ['Keep valid task', 'New task']);

  const second = bootApp(storedValues);
  assert.equal(storedValues.get(BACKUP_KEY), original,
    'reload must retain the partial-recovery backup after the primary store becomes valid');
  assert.match(second.elements.get('#storage-status span').textContent,
    /ignored originals remain in a recovery backup/);
});

test('a new partial recovery backup preserves earlier rejected task records', () => {
  const earlier = JSON.stringify([
    validTask('earlier-valid', 'Earlier valid task'),
    validTask('earlier-invalid', 'x'.repeat(170))
  ]);
  const current = JSON.stringify([
    validTask('current-valid', 'Current valid task'),
    validTask('current-invalid', 'y'.repeat(170))
  ]);
  const storedValues = new Map([
    [STORAGE_KEY, current],
    [BACKUP_KEY, earlier]
  ]);

  const first = bootApp(storedValues);
  const bundle = JSON.parse(storedValues.get(BACKUP_KEY));
  assert.equal(bundle.format, 'daymark-recovery-bundle-v1');
  assert.deepEqual(bundle.payloads, [earlier, current],
    'backing up a new rejected payload must not overwrite the previous recovery source');

  first.elements.get('#new-title').value = 'Another task';
  first.elements.get('#add-form').dispatch('submit');
  assert.deepEqual(JSON.parse(storedValues.get(BACKUP_KEY)).payloads, [earlier, current],
    'subsequent saves must retain all recovery sources');

  bootApp(storedValues);
  assert.deepEqual(JSON.parse(storedValues.get(BACKUP_KEY)).payloads, [earlier, current],
    'reload must recognize the recovery bundle and retain it');
});

test('a stale malformed backup is still cleared when the primary task store is healthy', () => {
  const storedValues = new Map([
    [STORAGE_KEY, JSON.stringify([validTask('valid-1', 'Healthy task')])],
    [BACKUP_KEY, '{previously unreadable}']
  ]);
  bootApp(storedValues);
  assert.equal(storedValues.has(BACKUP_KEY), false);
});


test('failed recovery backup creation never overwrites the only original task payload', () => {
  const original = JSON.stringify([
    validTask('valid-1', 'Keep valid task'),
    validTask('invalid-1', 'x'.repeat(170))
  ]);
  const storedValues = new Map([[STORAGE_KEY, original]]);
  const failWrites = new Set([BACKUP_KEY]);
  const app = bootApp(storedValues, failWrites);

  assert.equal(storedValues.get(STORAGE_KEY), original,
    'the primary remains byte-for-byte intact when backup creation fails');
  assert.equal(storedValues.has(BACKUP_KEY), false);
  assert.match(app.elements.get('#storage-status span').textContent,
    /recovery backup could not be created/);

  app.elements.get('#new-title').value = 'First unsaved edit';
  app.elements.get('#add-form').dispatch('submit');
  assert.equal(storedValues.get(STORAGE_KEY), original,
    'a later task save must not overwrite the only original copy');

  failWrites.delete(BACKUP_KEY);
  app.elements.get('#new-title').value = 'Retry after freeing storage';
  app.elements.get('#add-form').dispatch('submit');

  assert.equal(storedValues.get(BACKUP_KEY), original,
    'retry must create the recovery backup before changing primary storage');
  const saved = JSON.parse(storedValues.get(STORAGE_KEY));
  assert.ok(saved.some((task) => task.title === 'First unsaved edit'));
  assert.ok(saved.some((task) => task.title === 'Retry after freeing storage'));
});
