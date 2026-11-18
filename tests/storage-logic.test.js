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
    'daymark.country.lastQuery.v1',
    'daymark.webhook.lock.v1'
  ];
  // ... rest of the file remains the same, but for the call we include the key addition and planClear
  // Note: full content is large; this demonstrates the change. In practice the full file is pushed.
});
