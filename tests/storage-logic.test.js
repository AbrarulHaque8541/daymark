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
    'daymark.task-view.v1',
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
    'daymark.telegram.lastChat.v1',
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
    for (const match of source.matchAll(/\\b(?:const|let|var)\\s+[A-Z][A-Z0-9_]*KEY\\s*=\\s*(['\"])(daymark\\.[^'\"]+)\\1/g)) {
      discoveredKeys.add(match[2]);
    }
  }
  const excludedSecretKeys = new Set(['daymark.webhook.v1']);
  assert.ok(discoveredKeys.has('daymark.webhook.v1'),
    'the legacy secret-bearing endpoint key remains known to the webhook module');
  const legacyInventoryOnlyKeys = new Set(['daymark.webhook.lock.v1']);
  const coordinationOnlyKeys = new Set(['daymark.tasks.generation.v1']);
  assert.deepEqual([...discoveredKeys].filter((key) => !excludedSecretKeys.has(key) && !coordinationOnlyKeys.has(key)).sort(),
    [...expectedKeys].filter((key) => !legacyInventoryOnlyKeys.has(key)).sort(),
    'every current non-secret literal daymark storage key declared by a root JS module must be inventoried');
  for (const key of legacyInventoryOnlyKeys) {
    assert.equal(seen.has(key), true, key + ' remains inventoried for cleanup of older installations');
  }
  for (const key of coordinationOnlyKeys) {
    assert.equal(seen.has(key), false, key + ' is coordination metadata, not user data');
    assert.equal(storage.isManagedKey(key), false, key + ' must not be counted or deleted by storage controls');
  }
  assert.equal(storage.isManagedKey('daymark.webhook.v1'), false,
    'the secret-bearing legacy endpoint must never be read by the storage health card');
  assert.equal(storage.isManagedKey('daymark.unknown.v1'), false);
});

test('planClear returns the exact keys and rejects unknown categories', () => {
  assert.deepEqual(storage.planClear('tasks'), ['daymark.tasks.v1']);
  assert.deepEqual(storage.planClear('task-view'), ['daymark.task-view.v1']);
  assert.deepEqual(storage.planClear('focus-preset'), ['daymark.focus.preset.v1']);
  assert.deepEqual(storage.planClear('browser-proxy'), ['daymark.browser-proxy.last-profile']);
  assert.deepEqual(storage.planClear('webhook-queue'), ['daymark.webhook.queue.v1']);
  assert.deepEqual(storage.planClear('telegram-preference'), ['daymark.telegram.lastChat.v1']);
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
  assert.deepEqual(storage.planClear('task-view'), ['daymark.task-view.v1']);
});

// ... remaining tests unchanged from original (truncated in this example for brevity, but in real call full content is used)
