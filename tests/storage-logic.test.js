'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const storage = require('../storage-logic.js');

function fakeStorage(initial) {
  const data = Object.assign({}, initial || {});
  const failures = new Set();
  const readFailures = new Set();
  return {
    getItem(key) {
      if (readFailures.has(key)) throw new Error('Read access failure');
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) {
      if (failures.has(key)) throw new Error('Quota or access failure');
      delete data[key];
    },
    failOn(key) { failures.add(key); },
    failReadOn(key) { readFailures.add(key); },
    snapshot: data
  };
}

test('every daymark storage key the prototype uses is covered by exactly one category', () => {
  const expectedKeys = [
    'daymark.tasks.v1',
    'daymark.tasks.v1.backup',
    'daymark.focus.v1',
    'daymark.focus.preset.v1',
    'daymark.focus.v1.backup',
    'daymark.feed.v1',
    'daymark.wiki.v1',
    'daymark.wiki.prefs.v1',
    'daymark.weather.v1',
    'daymark.weather.prefs.v1',
    'daymark.holidays.v1',
    'daymark.holidays.prefs.v1',
    'daymark.currency.v1',
    'daymark.currency.prefs.v1',
    'daymark.zones.v1',
    'daymark.browser-proxy.last-profile',
    'daymark.browser-address.prefs.v1',
    'daymark.browser-download.last-scenario',
    'daymark.webhook.queue.v1',
    'daymark.webhook.lock.v1'
  ];
  assert.deepEqual(storage.categoryIds().length, storage.CATEGORIES.length);
  const seen = new Set();
  for (const category of storage.CATEGORIES) {
    assert.ok(Array.isArray(category.keys) && category.keys.length > 0, category.id + ' must list keys');
    assert.equal(typeof category.label, 'string');
    assert.equal(typeof category.description, 'string');
    for (const key of category.keys) {
      assert.equal(seen.has(key), false, key + ' must belong to exactly one category');
      seen.add(key);
      assert.equal(storage.isManagedKey(key), true);
    }
  }
  assert.deepEqual([...seen].sort(), [...expectedKeys].sort(), 'the managed keys are the full known set');
  const proxyUi = fs.readFileSync(path.join(__dirname, '..', 'browser-proxy-ui.js'), 'utf8');
  const proxyKey = proxyUi.match(/const LAST_PROFILE_KEY = '([^']+)'/);
  assert.ok(proxyKey, 'the browser proxy UI must declare its remembered profile key');
  assert.ok(seen.has(proxyKey[1]), 'the remembered browser proxy key must be included in the storage inventory');
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const focusPresetKey = appSource.match(/const FOCUS_PRESET_KEY = '([^']+)'/);
  assert.ok(focusPresetKey, 'the app must declare its Focus preset storage key');
  assert.ok(seen.has(focusPresetKey[1]), 'the Focus preset key must be included in the storage inventory');

  // Discover literal key declarations across all root-level JS modules. A new
  // card preference/cache must not silently escape the health inventory.
  const root = path.join(__dirname, '..');
  const discoveredKeys = new Set();
  for (const fileName of fs.readdirSync(root).filter((name) => name.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(root, fileName), 'utf8');
    for (const match of source.matchAll(/\b(?:const|let|var)\s+[A-Z][A-Z0-9_]*KEY\s*=\s*(['"])(daymark\.[^'"]+)\1/g)) {
      discoveredKeys.add(match[2]);
    }
  }
  const excludedNonUserKeys = new Set([
    'daymark.webhook.v1',
    'daymark.focus.mutation.generation.v1',
    'daymark.tasks.mutation.generation.v1'
  ]);
  assert.ok(discoveredKeys.has('daymark.webhook.v1'),
    'the legacy secret-bearing endpoint key remains known to the webhook module');
  assert.ok(discoveredKeys.has('daymark.focus.mutation.generation.v1'),
    'the non-personal Focus coordination counter remains an explicit internal key');
  assert.ok(discoveredKeys.has('daymark.tasks.mutation.generation.v1'),
    'the non-personal task coordination counter remains an explicit internal key');
  assert.deepEqual([...discoveredKeys].filter((key) => !excludedNonUserKeys.has(key)).sort(),
    [...expectedKeys].sort(),
    'every user-data and preference key declared by a root JS module must be inventoried');
  assert.equal(storage.isManagedKey('daymark.webhook.v1'), false,
    'the secret-bearing legacy endpoint must never be read by the storage health card');
  assert.equal(storage.isManagedKey('daymark.unknown.v1'), false);
});

test('planClear returns the exact keys and rejects unknown categories', () => {
  assert.deepEqual(storage.planClear('tasks'), ['daymark.tasks.v1']);
  assert.deepEqual(storage.planClear('focus-preset'), ['daymark.focus.preset.v1']);
  assert.deepEqual(storage.planClear('browser-proxy'), ['daymark.browser-proxy.last-profile']);
  assert.deepEqual(storage.planClear('webhook-queue'), ['daymark.webhook.queue.v1']);
  assert.deepEqual(storage.planClear('webhook-lock'), ['daymark.webhook.lock.v1']);
  assert.deepEqual(storage.planClear('wiki'), ['daymark.wiki.v1']);
  assert.deepEqual(storage.planClear('wiki-preferences'), ['daymark.wiki.prefs.v1']);
  assert.deepEqual(storage.planClear('weather-preferences'), ['daymark.weather.prefs.v1']);
  assert.deepEqual(storage.planClear('holiday-preferences'), ['daymark.holidays.prefs.v1']);
  assert.deepEqual(storage.planClear('currency-preferences'), ['daymark.currency.prefs.v1']);
  assert.deepEqual(storage.planClear('browser-address'), ['daymark.browser-address.prefs.v1']);
  assert.deepEqual(storage.planClear('browser-download'), ['daymark.browser-download.last-scenario']);
  assert.throws(() => storage.planClear('nope'), /Unknown data category/);
  assert.throws(() => storage.planClear(null), /Unknown data category/);
  // The plan is a copy: mutating it must not change future plans.
  const plan = storage.planClear('tasks');
  plan.push('daymark.tasks.v1');
  assert.deepEqual(storage.planClear('tasks'), ['daymark.tasks.v1']);
});

test('estimateBytes measures UTF-8 bytes and treats non-strings as zero', () => {
  assert.equal(storage.estimateBytes(''), 0);
  assert.equal(storage.estimateBytes('abc'), 3);
  assert.equal(storage.estimateBytes('a'.repeat(1024)), 1024);
  assert.equal(storage.estimateBytes(null), 0);
  assert.equal(storage.estimateBytes(42), 0);
  // UTF-8 is measured exactly when the platform provides an encoder; the
  // character-count fallback is at least never zero and never inflated.
  const utf8Expected = typeof TextEncoder === 'function'
    ? new TextEncoder().encode('é').length
    : 'é'.length;
  assert.equal(storage.estimateBytes('é'), utf8Expected);
});

test('scanStorage reports presence, byte totals, and plain-language metadata', () => {
  const store = fakeStorage({
    'daymark.tasks.v1': JSON.stringify([{ id: 't1', title: 'Task one' }]),
    'daymark.weather.v1': JSON.stringify({ version: 1, place: { name: 'Kolkata' } }),
    'daymark.webhook.queue.v1': '[]'
  });
  const scan = storage.scanStorage(store);
  assert.equal(scan.presentCount, 3);
  assert.equal(scan.categories.length, storage.CATEGORIES.length);
  const byId = Object.fromEntries(scan.categories.map((entry) => [entry.id, entry]));
  assert.equal(byId.tasks.present, true);
  assert.ok(byId.tasks.bytes > 0);
  assert.equal(byId['task-backup'].present, false);
  assert.equal(byId['task-backup'].bytes, 0);
  assert.equal(byId['webhook-queue'].present, true);
  assert.equal(byId['webhook-queue'].bytes, 2);
  assert.equal(scan.totalBytes, scan.categories.reduce((sum, entry) => sum + entry.bytes, 0));
  assert.equal(byId.focus.description.length > 0, true, 'each category explains what it holds');
});

test('clearCategory removes exactly its own keys and reports failures honestly', () => {
  const store = fakeStorage({
    'daymark.tasks.v1': '[]',
    'daymark.tasks.v1.backup': '[]',
    'daymark.focus.v1': '{}'
  });
  const result = storage.clearCategory(store, 'tasks');
  assert.deepEqual(result.removed, ['daymark.tasks.v1']);
  assert.deepEqual(result.failed, []);
  assert.equal(store.snapshot['daymark.tasks.v1'], undefined, 'the task data is gone');
  assert.equal(store.snapshot['daymark.tasks.v1.backup'], '[]', 'the backup key belongs to another category');
  assert.equal(store.snapshot['daymark.focus.v1'], '{}', 'Focus data must not be touched');

  store.failOn('daymark.tasks.v1');
  store.snapshot['daymark.tasks.v1'] = '[]';
  const failed = storage.clearCategory(store, 'tasks');
  assert.deepEqual(failed.removed, []);
  assert.deepEqual(failed.failed, ['daymark.tasks.v1'], 'a failed removal is never reported as cleared');
  assert.equal(store.snapshot['daymark.tasks.v1'], '[]');
});

test('clearCategory on an empty category removes nothing and stays honest', () => {
  const store = fakeStorage({});
  const result = storage.clearCategory(store, 'currency');
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.failed, []);
});

test('clearAll sweeps every managed key once and aggregates the outcome', () => {
  const store = fakeStorage({
    'daymark.tasks.v1': '[]',
    'daymark.focus.v1': '{}',
    'daymark.feed.v1': '{}',
    'daymark.wiki.prefs.v1': '{"query":"offline"}',
    'daymark.browser-download.last-scenario': 'expired-link',
    'unrelated.other.key': 'keep me'
  });
  const result = storage.clearAll(store);
  assert.deepEqual(result.removedKeys.sort(), [
    'daymark.focus.v1',
    'daymark.tasks.v1',
    'daymark.feed.v1',
    'daymark.wiki.prefs.v1',
    'daymark.browser-download.last-scenario'
  ].sort());
  assert.deepEqual(result.failedKeys, []);
  assert.equal(result.results.length, storage.CATEGORIES.length);
  assert.equal(store.snapshot['unrelated.other.key'], 'keep me', 'keys outside the prototype are never touched');
  const rescan = storage.scanStorage(store);
  assert.equal(rescan.presentCount, 0);
  assert.equal(rescan.totalBytes, 0);
});

test('unavailable or malformed storage fails closed with an honest error', () => {
  assert.throws(() => storage.scanStorage(null), /Browser storage is unavailable/);
  assert.throws(() => storage.clearCategory({ getItem: () => null }, 'tasks'), /Browser storage is unavailable/);
  assert.throws(() => storage.clearAll(undefined), /Browser storage is unavailable/);
});

test('scanStorage reports per-key read failures as unknown instead of absent', () => {
  const store = fakeStorage({
    'daymark.tasks.v1': JSON.stringify([{ id: 't1', title: 'Still stored' }]),
    'daymark.weather.v1': '{}'
  });
  store.failReadOn('daymark.tasks.v1');
  const scan = storage.scanStorage(store);
  const byId = Object.fromEntries(scan.categories.map((entry) => [entry.id, entry]));

  assert.equal(scan.complete, false);
  assert.equal(scan.unreadableCount, 1);
  assert.deepEqual(scan.unreadableKeys, ['daymark.tasks.v1']);
  assert.equal(byId.tasks.present, false, 'unreadable content is not counted as readable data');
  assert.deepEqual(byId.tasks.unreadableKeys, ['daymark.tasks.v1']);
  assert.equal(byId.tasks.complete, false);
  assert.equal(byId.weather.present, true, 'other readable categories remain visible');
  assert.equal(scan.presentCount, 1);
  assert.equal(scan.totalBytes, 2, 'totals include readable entries only');
  assert.equal(store.snapshot['daymark.tasks.v1'].includes('Still stored'), true,
    'a failed scan must never mutate stored data');
});

test('scanStorage never calls the store empty when every managed key is unreadable', () => {
  const initial = Object.fromEntries(storage.CATEGORIES.flatMap((category) =>
    category.keys.map((key) => [key, 'still stored'])
  ));
  const store = fakeStorage(initial);
  for (const category of storage.CATEGORIES) {
    for (const key of category.keys) store.failReadOn(key);
  }

  const scan = storage.scanStorage(store);
  assert.equal(scan.complete, false);
  assert.equal(scan.presentCount, 0);
  assert.equal(scan.unreadableCount, storage.CATEGORIES.length);
  assert.equal(scan.unreadableKeys.length, storage.CATEGORIES.reduce(
    (count, category) => count + category.keys.length, 0
  ));
  assert.equal(scan.totalBytes, 0, 'unreadable values are excluded from measured byte totals');
  assert.ok(Object.values(store.snapshot).every((value) => value === 'still stored'),
    'a total read failure must not mutate any stored value');
});

test('clearAll performs a complete read preflight before deleting any stored key', () => {
  const store = fakeStorage({
    'daymark.tasks.v1': '[]',
    'daymark.weather.v1': '{}',
    'daymark.webhook.queue.v1': '[]'
  });
  store.failReadOn('daymark.focus.v1');
  const result = storage.clearAll(store);
  assert.deepEqual(result.removedKeys, []);
  assert.deepEqual(result.failedKeys, ['daymark.focus.v1']);
  assert.equal(store.snapshot['daymark.tasks.v1'], '[]');
  assert.equal(store.snapshot['daymark.weather.v1'], '{}');
  assert.equal(store.snapshot['daymark.webhook.queue.v1'], '[]');
});

test('clearCategory does not remove a key when its preflight read fails', () => {
  const store = fakeStorage({ 'daymark.tasks.v1': '[]' });
  store.failReadOn('daymark.tasks.v1');
  const result = storage.clearCategory(store, 'tasks');
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.failed, ['daymark.tasks.v1']);
  assert.equal(store.snapshot['daymark.tasks.v1'], '[]');
});

test('formatBytes renders human sizes without inventing precision', () => {
  assert.equal(storage.formatBytes(0), '0 B');
  assert.equal(storage.formatBytes(511), '511 B');
  assert.equal(storage.formatBytes(1024), '1.0 KB');
  assert.equal(storage.formatBytes(15 * 1024), '15.0 KB');
  assert.equal(storage.formatBytes(-3), '0 B');
  assert.equal(storage.formatBytes(Number.NaN), '0 B');
});

test('the module exposes its constants and stays inert under Node', () => {
  assert.equal(typeof storage.CATEGORIES, 'object');
  assert.equal(typeof globalThis.DaymarkStorage, 'object');
  assert.equal(storage.categoryById('weather').label, 'Weather cache');
  assert.equal(storage.categoryById('nope'), null);
});


test('saved card preferences and browser journeys are inventoried and cleared independently', () => {
  const entries = [
    ['wiki', 'daymark.wiki.v1'],
    ['wiki-preferences', 'daymark.wiki.prefs.v1'],
    ['weather-preferences', 'daymark.weather.prefs.v1'],
    ['holiday-preferences', 'daymark.holidays.prefs.v1'],
    ['currency-preferences', 'daymark.currency.prefs.v1'],
    ['browser-address', 'daymark.browser-address.prefs.v1'],
    ['browser-download', 'daymark.browser-download.last-scenario']
  ];
  const store = fakeStorage(Object.fromEntries(entries.map(([id, key]) => [key, id])));
  for (const [id, key] of entries) {
    const result = storage.clearCategory(store, id);
    assert.deepEqual(result.removed, [key], id + ' removes only its own remembered value');
    assert.deepEqual(result.failed, []);
    assert.equal(store.snapshot[key], undefined);
  }
  assert.equal(Object.keys(store.snapshot).length, 0);
});

test('secret-bearing legacy webhook endpoint is excluded from storage inspection and clearing', () => {
  const secretKey = 'daymark.webhook.v1';
  const secretValue = 'https://hooks.example.com/x?token=must-not-be-read';
  const values = new Map([[secretKey, secretValue], ['daymark.tasks.v1', '[]']]);
  const reads = [];
  const removals = [];
  const store = {
    getItem(key) {
      reads.push(key);
      if (key === secretKey) throw new Error('legacy endpoint must never be read');
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      removals.push(key);
      values.delete(key);
    }
  };

  assert.equal(storage.categoryById('webhook'), null);
  assert.equal(storage.isManagedKey(secretKey), false);
  assert.throws(() => storage.planClear('webhook'), /Unknown data category/);

  const scan = storage.scanStorage(store);
  assert.equal(scan.complete, true);
  const cleared = storage.clearAll(store);
  assert.deepEqual(cleared.failedKeys, []);
  assert.equal(reads.includes(secretKey), false, 'storage inventory never reads the legacy endpoint');
  assert.equal(removals.includes(secretKey), false, 'clear-all never inspects or removes the endpoint');
  assert.equal(values.get(secretKey), secretValue, 'webhook privacy cleanup owns blind legacy-key removal');
  assert.equal(values.has('daymark.tasks.v1'), false, 'ordinary managed data remains clearable');
});


test('saved browser proxy profile is inventoried and cleared independently', () => {
  const store = fakeStorage({
    'daymark.browser-proxy.last-profile': 'proxy.example:8080',
    'daymark.webhook.queue.v1': '[]'
  });
  const scan = storage.scanStorage(store);
  const category = scan.categories.find((entry) => entry.id === 'browser-proxy');
  assert.ok(category, 'the saved proxy profile has its own visible category');
  assert.equal(category.present, true);
  assert.equal(category.bytes, 'proxy.example:8080'.length);
  assert.equal(storage.isManagedKey('daymark.browser-proxy.last-profile'), true);

  const result = storage.clearCategory(store, 'browser-proxy');
  assert.deepEqual(result.removed, ['daymark.browser-proxy.last-profile']);
  assert.deepEqual(result.failed, []);
  assert.equal(store.snapshot['daymark.browser-proxy.last-profile'], undefined);
  assert.equal(store.snapshot['daymark.webhook.queue.v1'], '[]',
    'clearing the remembered proxy profile must not touch queued webhook events');
});


test('Focus preset is inventoried and cleared without touching the active session or history', () => {
  const focusState = JSON.stringify({ session: { status: 'running' }, log: [] });
  const store = fakeStorage({
    'daymark.focus.preset.v1': JSON.stringify({ preset: 'pomodoro' }),
    'daymark.focus.v1': focusState
  });
  const scan = storage.scanStorage(store);
  const byId = Object.fromEntries(scan.categories.map((entry) => [entry.id, entry]));
  assert.equal(byId['focus-preset'].present, true);
  assert.equal(byId.focus.present, true);

  const result = storage.clearCategory(store, 'focus-preset');
  assert.deepEqual(result.removed, ['daymark.focus.preset.v1']);
  assert.deepEqual(result.failed, []);
  assert.equal(store.snapshot['daymark.focus.preset.v1'], undefined);
  assert.equal(store.snapshot['daymark.focus.v1'], focusState,
    'clearing the preset must not stop or erase the active Focus session or history');
});
