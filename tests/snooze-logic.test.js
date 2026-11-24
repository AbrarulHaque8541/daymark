'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const snooze = require('../snooze-logic.js');

const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);
const GOOD_URL = 'https://example.com/long-article?section=2';
const WAKE = '2026-11-25T09:30';

function storageWith(seed) {
  const data = new Map();
  for (const key of Object.keys(seed || {})) data.set(key, seed[key]);
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    snapshot: data
  };
}

test('normalizeUrl accepts http and https addresses and keeps them exact', () => {
  assert.equal(snooze.normalizeUrl(GOOD_URL).ok, true);
  assert.equal(snooze.normalizeUrl(GOOD_URL).url, GOOD_URL);
  assert.equal(snooze.normalizeUrl('http://example.com/x').ok, true);
});

test('normalizeUrl rejects non-web schemes, relative text, spaces and control space', () => {
  for (const bad of ['example.com/x', '//example.com', 'ftp://example.com', 'index.html', 'https:// example.com', 'bad url']) {
    assert.equal(snooze.normalizeUrl(bad).ok, false, bad);
    assert.equal(snooze.normalizeUrl(bad).reason, 'invalid-url');
  }
  assert.equal(snooze.normalizeUrl('https://x/' + 'a'.repeat(400)).reason, 'url-too-long');
  assert.equal(snooze.normalizeUrl(null).ok, false);
});

test('parseWakeAt reads the datetime-local shape and returns UTC metadata', () => {
  const parsed = snooze.parseWakeAt(WAKE);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.wakeAtMs, Date.UTC(2026, 10, 25, 9, 30, 0));
  assert.match(parsed.wakeAtIso, /2026-11-25T09:30:00.000Z/);
});

test('parseWakeAt fails closed on wrong shape, non-digits and impossible dates', () => {
  for (const bad of ['', '2026-11-25 09:00', '2026-11-25T09', '25-11-2026T09:00', 'xxxx-xx-xxTxx:xx', '2026-13-45T99:99', '2026-11-25T09:00Z']) {
    assert.equal(snooze.parseWakeAt(bad).ok, false, bad);
    assert.equal(snooze.parseWakeAt(bad).reason, 'wake-unreadable');
  }
  assert.equal(snooze.parseWakeAt('2026-02-30T09:00').reason, 'wake-unreadable');
});

test('createSnooze stores url, wake, squashed note and an id; empty note is allowed', () => {
  const made = snooze.createSnooze(GOOD_URL, WAKE, '  catch   up reading ', NOW, []);
  assert.equal(made.ok, true);
  assert.equal(made.snooze.url, GOOD_URL);
  assert.equal(made.snooze.wakeAtMs, Date.UTC(2026, 10, 25, 9, 30, 0));
  assert.equal(made.snooze.note, 'catch up reading');
  assert.match(made.snooze.id, /^snooze-/);
  const silent = snooze.createSnooze(GOOD_URL, WAKE, undefined, NOW, []);
  assert.equal(silent.ok, true);
  assert.equal(silent.snooze.note, '');
});

test('createSnooze truncates an over-long note and says so', () => {
  const made = snooze.createSnooze(GOOD_URL, WAKE, 'p'.repeat(snooze.NOTE_MAX + 40), NOW, []);
  assert.equal(made.ok, true);
  assert.equal(made.snooze.note.length, snooze.NOTE_MAX);
});

test('createSnooze rejects a wake time at or before now', () => {
  const equal = '2026-11-24T12:00';
  assert.equal(snooze.createSnooze(GOOD_URL, equal, '', NOW, []).reason, 'wake-in-past');
  const past = '2026-11-01T09:00';
  assert.equal(snooze.createSnooze(GOOD_URL, past, '', NOW, []).reason, 'wake-in-past');
});

test('createSnooze rejects duplicates of a still-waiting page but allows after it came due', () => {
  const first = snooze.createSnooze(GOOD_URL, '2026-11-25T09:00', '', NOW, []);
  assert.equal(snooze.createSnooze(GOOD_URL, '2026-11-26T09:00', '', NOW, first.snoozes).reason, 'duplicate');
  const afterDue = first.snoozes;
  assert.equal(snooze.createSnooze(GOOD_URL, '2026-11-26T09:00', '', Date.UTC(2026, 10, 27, 9, 0, 0), afterDue).ok, true);
});

test('createSnooze refuses the 31st entry with a plain reason', () => {
  const list = [];
  let stamp = NOW;
  for (let i = 0; i < snooze.MAX_SNOOZES; i += 1) {
    const made = snooze.createSnooze('https://example.com/p' + String(i), '2027-01-01T09:00', '', stamp, list);
    assert.equal(made.ok, true);
    list.push(made.snooze);
    stamp += 1;
  }
  const overflow = snooze.createSnooze('https://example.com/overflow', '2027-01-01T09:00', '', stamp, list);
  assert.equal(overflow.ok, false);
  assert.equal(overflow.reason, 'limit-reached');
});

test('readSnoozes is ok-but-empty on missing key and fail-closed on garbage', () => {
  const empty = snooze.readSnoozes(storageWith({}));
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.snoozes, []);
  const bad = snooze.readSnoozes(storageWith({ [snooze.STORAGE_KEY]: '{not json' }));
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'malformed-saved-state');
  assert.equal(snooze.readSnoozes(storageWith({ [snooze.STORAGE_KEY]: '[1,2]' })).reason, 'malformed-saved-state');
  const entryBad = snooze.readSnoozes(storageWith({
    [snooze.STORAGE_KEY]: JSON.stringify([{ id: 'x', url: 'nope', wakeAtMs: 1 }])
  }));
  assert.equal(entryBad.reason, 'malformed-saved-state');
  assert.equal(snooze.readSnoozes(null).reason, 'storage-unavailable');
});

test('readSnoozes round-trips what writeSnoozes stored', () => {
  const store = storageWith({});
  const made = snooze.createSnooze(GOOD_URL, WAKE, 'hello', NOW, []);
  assert.equal(snooze.writeSnoozes(store, made.snoozes).ok, true);
  const read = snooze.readSnoozes(store);
  assert.equal(read.ok, true);
  assert.equal(read.snoozes.length, 1);
  assert.equal(read.snoozes[0].note, 'hello');
});

test('due and pending split on the wake time and sort deterministically', () => {
  const dueA = { id: 'due-a', url: 'https://example.com/a', wakeAtMs: Date.UTC(2026, 10, 24, 10, 0, 0), note: '', createdAtMs: NOW };
  const dueC = { id: 'due-c', url: 'https://example.com/c', wakeAtMs: Date.UTC(2026, 10, 24, 11, 0, 0), note: '', createdAtMs: NOW };
  const b = snooze.createSnooze('https://example.com/b', '2026-11-25T09:00', '', NOW, []).snooze;
  const list = [dueA, b, dueC];
  const due = snooze.dueSnoozes(list, NOW);
  const pending = snooze.pendingSnoozes(list, NOW);
  assert.deepEqual(due.map((entry) => entry.id), ['due-a', 'due-c']);
  assert.deepEqual(pending.map((entry) => entry.id), [b.id]);
});

test('removeSnooze removes only its own id and reports unknown ids honestly', () => {
  const store = storageWith({});
  const made = snooze.createSnooze(GOOD_URL, WAKE, '', NOW, []);
  snooze.writeSnoozes(store, made.snoozes);
  const gone = snooze.removeSnooze(store, made.snooze.id);
  assert.equal(gone.ok, true);
  assert.equal(snooze.readSnoozes(store).snoozes.length, 0);
  assert.equal(snooze.removeSnooze(store, made.snooze.id).reason, 'unknown-id');
  assert.equal(snooze.removeSnooze(store, 'not even an id shape').ok, false);
});

test('clearSnoozes removes the key and counts; empty clear says nothing to do', () => {
  const busy = storageWith({});
  const made = snooze.createSnooze(GOOD_URL, WAKE, '', NOW, []);
  snooze.writeSnoozes(busy, made.snoozes);
  const cleared = snooze.clearSnoozes(busy);
  assert.equal(cleared.ok, true);
  assert.equal(cleared.clearedCount, 1);
  const emptyStore = storageWith({});
  assert.deepEqual(snooze.clearSnoozes(emptyStore), { ok: true, clearedCount: 0 });
});

test('write failures are honest, not silent', () => {
  const blocked = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.equal(snooze.writeSnoozes(blocked, []).reason, 'write-failed');
  assert.equal(snooze.writeSnoozes(null, []).reason, 'storage-unavailable');
  const readBlocked = { getItem: () => { throw new Error('denied'); } };
  assert.equal(snooze.readSnoozes(readBlocked).reason, 'storage-unavailable');
});

test('describeError every known reason lands on a plain sentence plus the fallback', () => {
  for (const reason of ['flag-off', 'storage-unavailable', 'malformed-saved-state', 'invalid-url', 'url-too-long',
    'wake-unreadable', 'wake-in-past', 'limit-reached', 'duplicate', 'write-failed', 'unknown-id', 'note-unreadable', 'mystery']) {
    const message = snooze.describeError(reason);
    assert.equal(typeof message, 'string', reason);
    assert.equal(message.length > 15, true, reason);
  }
});
