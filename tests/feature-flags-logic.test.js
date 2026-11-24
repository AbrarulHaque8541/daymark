'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const flags = require('../feature-flags-logic.js');

function makeStorage(seed) {
  const data = new Map();
  for (const key of Object.keys(seed || {})) data.set(key, seed[key]);
  let reads = 0;
  let writes = 0;
  return {
    reads: () => reads,
    writes: () => writes,
    getItem(key) { reads += 1; return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { writes += 1; data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
}

test('registry exposes five current flag ids', () => {
  assert.deepEqual(flags.FLAG_IDS, ['command-bar', 'search-bangs', 'comfort-tint', 'mindful-breaks', 'focus-mode', 'auto-archive', 'snooze-pages']);
  assert.equal(flags.FEATURE_FLAGS.length, 7);
});

test('every flag defaults to off', () => {
  const read = flags.readFlags(makeStorage({}));
  assert.equal(read.ok, false);
  assert.equal(read.reason, 'no-saved-state');
  for (const id of flags.FLAG_IDS) assert.equal(read.flags[id], false);
});

test('a saved state round-trips through readFlags', () => {
  const saved = { 'command-bar': true, 'search-bangs': true, 'comfort-tint': false, 'mindful-breaks': false, 'focus-mode': false, 'auto-archive': false, 'snooze-pages': false };
  const read = flags.readFlags(makeStorage({ 'daymark.features.v1': JSON.stringify(saved) }));
  assert.equal(read.ok, true);
  assert.deepEqual(read.flags, saved);
});

test('unknown keys in a saved state are ignored, known ones kept', () => {
  const read = flags.readFlags(makeStorage({ 'daymark.features.v1': JSON.stringify({ 'command-bar': true, mystery: 'x', 'zen-mode': 1 }) }));
  assert.equal(read.ok, true);
  assert.equal(read.flags['command-bar'], true);
  assert.equal(read.flags['search-bangs'], false);
  assert.equal(Object.prototype.hasOwnProperty.call(read.flags, 'mystery'), false);
});

test('a saved Mindful-breaks key is honoured once the flag is live', () => {
  const read = flags.readFlags(makeStorage({ 'daymark.features.v1': JSON.stringify({ 'command-bar': true, 'mindful-breaks': true }) }));
  assert.equal(read.ok, true);
  assert.equal(read.flags['command-bar'], true);
  assert.deepEqual(Object.keys(read.flags), flags.FLAG_IDS);
  assert.equal(read.flags['mindful-breaks'], true);
});

test('malformed JSON reports malformed-saved-state', () => {
  const read = flags.readFlags(makeStorage({ 'daymark.features.v1': '{"command-bar":' }));
  assert.equal(read.ok, false);
  assert.equal(read.reason, 'malformed-saved-state');
});

test('a non-string saved value reports malformed-saved-state', () => {
  const read = flags.readFlags(makeStorage({ 'daymark.features.v1': 42 }));
  assert.equal(read.ok, false);
  assert.equal(read.reason, 'malformed-saved-state');
});

test('a parsed array or a state with no known booleans reports malformed-saved-state', () => {
  const asArray = flags.readFlags(makeStorage({ 'daymark.features.v1': '[]' }));
  assert.equal(asArray.reason, 'malformed-saved-state');
  const noBooleans = flags.readFlags(makeStorage({ 'daymark.features.v1': '{"hello":"world"}' }));
  assert.equal(noBooleans.reason, 'malformed-saved-state');
});

test('a missing storage object reports storage-unavailable without throwing', () => {
  assert.equal(flags.readFlags(null).reason, 'storage-unavailable');
  assert.equal(flags.readFlags(undefined).reason, 'storage-unavailable');
  assert.equal(flags.readFlags({}).reason, 'storage-unavailable');
});

test('a throwing getItem reports storage-unavailable', () => {
  const read = flags.readFlags({ getItem() { throw new Error('boom'); } });
  assert.equal(read.ok, false);
  assert.equal(read.reason, 'storage-unavailable');
});

test('setFlag rejects an unknown flag id and writes nothing', () => {
  const storage = makeStorage({});
  const saved = flags.setFlag(storage, 'zen-mode', true);
  assert.equal(saved.ok, false);
  assert.equal(saved.reason, 'unknown-flag');
  assert.equal(storage.writes(), 0);
});

test('setFlag accepts the live Mindful-breaks id', () => {
  const storage = makeStorage({});
  const saved = flags.setFlag(storage, 'mindful-breaks', true);
  assert.equal(saved.ok, true);
  assert.equal(saved.flags['mindful-breaks'], true);
  assert.equal(JSON.parse(storage.getItem('daymark.features.v1'))['mindful-breaks'], true);
});

test('setFlag accepts the live comfort-tint flag', () => {
  const storage = makeStorage({});
  const saved = flags.setFlag(storage, 'comfort-tint', true);
  assert.equal(saved.ok, true);
  assert.equal(saved.flags['comfort-tint'], true);
  assert.equal(JSON.parse(storage.getItem('daymark.features.v1'))['comfort-tint'], true);
});

test('setFlag accepts the live focus-mode flag', () => {
  const storage = makeStorage({});
  const saved = flags.setFlag(storage, 'focus-mode', true);
  assert.equal(saved.ok, true);
  assert.equal(saved.flags['focus-mode'], true);
  assert.equal(JSON.parse(storage.getItem('daymark.features.v1'))['focus-mode'], true);
});

test('setFlag rejects a non-boolean value and writes nothing', () => {
  const storage = makeStorage({});
  const saved = flags.setFlag(storage, 'command-bar', 'yes');
  assert.equal(saved.ok, false);
  assert.equal(saved.reason, 'invalid-value');
  assert.equal(storage.writes(), 0);
});

test('setFlag persists one JSON blob holding all current flag keys', () => {
  const base = { 'command-bar': false, 'search-bangs': false, 'comfort-tint': false, 'mindful-breaks': false, 'focus-mode': false, 'auto-archive': false, 'snooze-pages': false };
  const storage = makeStorage({ 'daymark.features.v1': JSON.stringify(base) });
  const saved = flags.setFlag(storage, 'search-bangs', true);
  assert.equal(saved.ok, true);
  assert.equal(saved.flags['search-bangs'], true);
  const parsed = JSON.parse(storage.getItem('daymark.features.v1'));
  assert.deepEqual(Object.keys(parsed).sort(), ['auto-archive', 'comfort-tint', 'command-bar', 'focus-mode', 'mindful-breaks', 'search-bangs', 'snooze-pages']);
  assert.equal(parsed['command-bar'], false);
  assert.equal(parsed['search-bangs'], true);
});

test('setFlag works on an empty storage and can switch a flag back off', () => {
  const storage = makeStorage({});
  assert.equal(flags.setFlag(storage, 'command-bar', true).ok, true);
  assert.equal(JSON.parse(storage.getItem('daymark.features.v1'))['command-bar'], true);
  assert.equal(flags.setFlag(storage, 'command-bar', false).ok, true);
  assert.equal(JSON.parse(storage.getItem('daymark.features.v1'))['command-bar'], false);
});

test('setFlag reports storage-unavailable when storage cannot write', () => {
  const saved = flags.setFlag({ getItem: () => null }, 'command-bar', true);
  assert.equal(saved.ok, false);
  assert.equal(saved.reason, 'storage-unavailable');
});


