const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const LOGIC_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'task-logic.js'), 'utf8');
const STORAGE_KEY = 'daymark.tasks.v1';
const BACKUP_KEY = `${STORAGE_KEY}.backup`;

function bootApp({ savedValue, failBackup = false }) {
  const elements = new Map();
  const classSets = new Map();
  const storedValues = new Map([[STORAGE_KEY, savedValue]]);

  function element(selector) {
    if (!elements.has(selector)) {
      const attributes = new Map();
      const classes = new Set();
      classSets.set(selector, classes);
      elements.set(selector, {
        textContent: '',
        value: '',
        hidden: false,
        disabled: false,
        attributes,
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
        setAttribute: (name, value) => attributes.set(name, value),
        getAttribute: (name) => attributes.get(name) || null,
        dataset: {},
        addEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; }
      });
    }
    return elements.get(selector);
  }

  const document = {
    querySelector: element,
    querySelectorAll: () => [],
    getElementById: (id) => element(`#${id}`),
    addEventListener() {},
    body: { appendChild() {} }
  };

  element('#storage-status').classList.add('is-checking');

  vm.runInNewContext(APP_SOURCE, {
    Date,
    Intl,
    document,
    localStorage: {
      getItem: (key) => storedValues.get(key) || null,
      setItem: (key, value) => {
        if (failBackup && key === BACKUP_KEY) throw new Error('quota');
        storedValues.set(key, value);
      },
      removeItem: (key) => storedValues.delete(key)
    },
    window: {},
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1
  }, { filename: 'app.js' });

  return { elements, storedValues, classSets };
}

test('corrupt saved data is copied to a browser backup and reported as preserved', () => {
  const { elements, storedValues } = bootApp({ savedValue: '{broken' });
  assert.equal(elements.get('#storage-status').classList.contains('is-warning'), true);
  assert.equal(storedValues.get(BACKUP_KEY), '{broken');
});

test('simultaneous reminders are summarized in one toast instead of overwriting each other', () => {
  const now = new Date();
  const fireTime = new Date(now.getTime() - 60_000);
  const dueDate = logic.localDateString(fireTime);
  const dueTime = `${String(fireTime.getHours()).padStart(2, '0')}:${String(fireTime.getMinutes()).padStart(2, '0')}`;
  const timestamp = now.toISOString();
  const tasks = ['First reminder', 'Second reminder'].map((title, index) => ({
    id: `reminder-${index}`,
    title,
    dueDate,
    dueTime,
    priority: 'medium',
    completed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    reminderLeadMinutes: 0
  }));
  const { elements, storedValues } = bootApp({ savedValue: JSON.stringify(tasks) });

  const toast = elements.get('#toast').textContent;
  assert.match(toast, /First reminder/);
  assert.match(toast, /Second reminder/);
  const savedTasks = JSON.parse(storedValues.get(STORAGE_KEY));
  assert.equal(savedTasks.filter((task) => typeof task.reminderShownFire === 'string').length, 2);
});


test('initial loading indicators clear only when the real app render and storage check finish', () => {
  const { classSets, elements } = bootApp({ savedValue: null });

  assert.equal(classSets.get('#task-list').has('is-ready'), true,
    'render marks the task list ready');
  assert.equal(classSets.get('#storage-status').has('is-checking'), false,
    'storage status update clears its checking indicator');
  assert.equal(elements.get('#storage-status').getAttribute('aria-busy'), 'false',
    'storage status clears aria-busy when resolved');
  assert.equal(elements.get('#task-list').getAttribute('aria-busy'), 'false',
    'task list clears aria-busy after first render');

  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.equal(indexSource.includes('}, 120);'), false,
    'index must not hide loading indicators after an arbitrary timeout');
  assert.equal(indexSource.includes('aria-busy="true"'), true,
    'index starts storage status and task list as aria-busy');
});
