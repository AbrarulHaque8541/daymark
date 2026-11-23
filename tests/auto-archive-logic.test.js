'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const archiver = require('../auto-archive-logic.js');
const logic = require('../task-logic.js');

function task(overrides) {
  return Object.assign({
    id: 't1',
    title: 'Write the report',
    dueDate: null,
    priority: 'medium',
    completed: true,
    createdAt: '2026-11-01T09:00:00Z',
    updatedAt: '2026-11-01T09:00:00Z'
  }, overrides || {});
}

const NOW_MS = Date.parse('2026-11-21T04:30:00Z');

test('constants are capped, pinned and fail-closed by design', () => {
  assert.equal(archiver.FLAG_ID, 'auto-archive');
  assert.equal(archiver.TASKS_STORAGE_KEY, 'daymark.tasks.v1');
  assert.equal(archiver.DAY_MS, 86400000);
  assert.deepEqual(archiver.THRESHOLD_DAYS, [7, 30, 90]);
  assert.equal(archiver.DEFAULT_THRESHOLD_DAYS, 30);
  assert.equal(archiver.MAX_CANDIDATES, 50);
});

test('normalizeThresholdDays accepts only the offered whole-day choices', () => {
  for (const value of archiver.THRESHOLD_DAYS) {
    const norm = archiver.normalizeThresholdDays(value);
    assert.equal(norm.ok, true, 'value ' + value);
    assert.equal(norm.days, value);
  }
  for (const bad of ['30', '30.5', null, undefined, Number.NaN, Infinity, -30, 7.5, true, [30], { v: 30 }]) {
    assert.equal(archiver.normalizeThresholdDays(bad).ok, false, 'value ' + String(bad));
  }
  assert.equal(archiver.normalizeThresholdDays(8).reason, 'threshold-out-of-range');
  assert.equal(archiver.normalizeThresholdDays('30').reason, 'threshold-unreadable');
});

test('flagIsOn reads only a successful, explicitly-on flag read', () => {
  assert.equal(archiver.flagIsOn({ ok: true, flags: { 'auto-archive': true } }), true);
  assert.equal(archiver.flagIsOn({ ok: true, flags: { 'auto-archive': false } }), false);
  assert.equal(archiver.flagIsOn({ ok: false, flags: { 'auto-archive': true } }), false);
  assert.equal(archiver.flagIsOn(null), false);
  assert.equal(archiver.flagIsOn(undefined), false);
  assert.equal(archiver.flagIsOn({ ok: true }), false);
});

test('pickArchiveCandidates lists only old, finished, non-repeating tasks', () => {
  const tasks = [
    task({ id: 'old1', updatedAt: '2026-11-01T00:00:00Z' }),
    task({ id: 'open', completed: false }),
    task({ id: 'repeat', repeat: 'weekly' }),
    task({ id: 'recent', updatedAt: '2026-11-20T00:00:00Z' }),
    task({ id: 'unknownage', updatedAt: undefined }),
    task({ id: 'future', updatedAt: '2026-11-25T00:00:00Z' })
  ];
  const pick = archiver.pickArchiveCandidates(tasks, NOW_MS, 7);
  assert.equal(pick.ok, true);
  assert.deepEqual(pick.items.map((item) => item.id), ['old1']);
  assert.equal(pick.items[0].completedOn, '2026-11-01T00:00:00Z');
  assert.equal(pick.items[0].ageDays, 20);
  assert.equal(pick.skipped['not-completed'], 1);
  assert.equal(pick.skipped['repeating'], 1);
  assert.equal(pick.skipped['recent-or-unreadable'], 3);
  assert.equal(pick.truncated, false);
});

test('pickArchiveCandidates sorts oldest first and counts every skip honestly', () => {
  const tasks = [
    task({ id: 'a', updatedAt: '2026-11-10T00:00:00Z' }),
    task({ id: 'b', updatedAt: '2026-11-01T00:00:00Z' }),
    task({ id: 'c', updatedAt: '2026-11-05T00:00:00Z' })
  ];
  const pick = archiver.pickArchiveCandidates(tasks, NOW_MS, 7);
  assert.equal(pick.ok, true);
  assert.deepEqual(pick.items.map((item) => item.id), ['b', 'c', 'a']);
  assert.equal(pick.totalCount, 3);
  assert.equal(pick.skipped['not-completed'], 0);
});

test('pickArchiveCandidates de-duplicates ids and skips malformed records', () => {
  const tasks = [task(), task(), null, 'nope', { id: '', title: 'x' }];
  const pick = archiver.pickArchiveCandidates(tasks, NOW_MS, 7);
  assert.equal(pick.ok, true);
  assert.deepEqual(pick.items.map((item) => item.id), ['t1']);
  assert.equal(pick.skipped['unreadable-record'], 4);
});

test('pickArchiveCandidates caps at 50 and announces the truncation', () => {
  const tasks = [];
  for (let i = 0; i < 55; i += 1) {
    tasks.push(task({ id: 't' + i, updatedAt: '2026-11-01T00:00:00Z' }));
  }
  const pick = archiver.pickArchiveCandidates(tasks, NOW_MS, 7);
  assert.equal(pick.items.length, 50);
  assert.equal(pick.totalCount, 55);
  assert.equal(pick.truncated, true);
});

test('pickArchiveCandidates fails closed on unreadable inputs', () => {
  assert.equal(archiver.pickArchiveCandidates('nope', NOW_MS, 7).reason, 'tasks-unreadable');
  assert.equal(archiver.pickArchiveCandidates([], -1, 30).reason, 'clock-unreadable');
  assert.equal(archiver.pickArchiveCandidates([], 'now', 30).reason, 'clock-unreadable');
  assert.equal(archiver.pickArchiveCandidates([], NOW_MS, 8).reason, 'threshold-out-of-range');
  assert.equal(archiver.pickArchiveCandidates(null, NOW_MS, '30').reason, 'threshold-unreadable');
  assert.equal(archiver.pickArchiveCandidates(null, NOW_MS, 7).reason, 'tasks-unreadable');
});

test('very long titles are capped at the pinned label width', () => {
  const pick = archiver.pickArchiveCandidates([task({ title: 'x'.repeat(120) })], NOW_MS, 7);
  assert.equal(pick.items[0].title.length, 80);
  assert.equal(pick.items[0].title.charAt(79), '\u2026');
});

test('buildArchiveSnapshot removes exactly the chosen candidates and nothing else', () => {
  const tasks = [task({ id: 'keep-open', completed: false }), task(), task({ id: 'keep-old', updatedAt: '2026-11-01T00:00:00Z' })];
  const result = archiver.buildArchiveSnapshot(tasks, ['t1'], NOW_MS, 7);
  assert.equal(result.ok, true);
  assert.equal(result.removedCount, 1);
  assert.deepEqual(result.desiredTasks.map((item) => item.id), ['keep-open', 'keep-old']);
});

test('buildArchiveSnapshot never mutates the stored records', () => {
  const original = task();
  const snapshot = JSON.stringify([original]);
  archiver.buildArchiveSnapshot([original], ['t1'], NOW_MS, 7);
  assert.equal(JSON.stringify([original]), snapshot);
});

test('buildArchiveSnapshot refuses stale previews and unreadable ids', () => {
  const tasks = [task()];
  assert.equal(archiver.buildArchiveSnapshot(tasks, ['nope'], NOW_MS, 7).reason, 'candidates-stale');
  assert.equal(archiver.buildArchiveSnapshot(tasks, ['t1', 't1'], NOW_MS, 7).reason, 'candidates-unreadable');
  assert.equal(archiver.buildArchiveSnapshot(tasks, [''], NOW_MS, 7).reason, 'candidates-unreadable');
  assert.equal(archiver.buildArchiveSnapshot(tasks, 't1', NOW_MS, 7).reason, 'candidates-unreadable');
  assert.equal(archiver.buildArchiveSnapshot(tasks, [], NOW_MS, 7).reason, 'candidates-unreadable');
  assert.equal(archiver.buildArchiveSnapshot('nope', ['t1'], NOW_MS, 7).reason, 'tasks-unreadable');
  assert.equal(archiver.buildArchiveSnapshot(tasks, ['t1'], -5, 30).reason, 'clock-unreadable');
  assert.equal(archiver.buildArchiveSnapshot(tasks, ['t1'], NOW_MS, 90).reason, 'candidates-stale');
  assert.equal(archiver.buildArchiveSnapshot([task({ completed: false })], ['t1'], NOW_MS, 7).reason, 'candidates-stale');
});

test('the archived snapshot still validates with the shared task logic', () => {
  const tasks = [task(), task({ id: 't2', completed: false })];
  const result = archiver.buildArchiveSnapshot(tasks, ['t1'], NOW_MS, 7);
  const validated = logic.validateStoredTasks(result.desiredTasks);
  assert.equal(validated.rejectedCount, 0);
  assert.equal(validated.tasks.length, 1);
  assert.equal(validated.tasks[0].id, 't2');
});

test('every run-error reason lands on a plain, honest sentence', () => {
  const reasons = ['flag-off', 'no-candidates', 'candidates-unreadable', 'candidates-stale', 'storage-unavailable',
    'generation-unreadable', 'cleared', 'clear-in-progress', 'task-clear-in-progress', 'conflict',
    'tasks-ambiguous', 'tasks-unreadable', 'generation-write-failed', 'task-write-failed',
    'backup-failed', 'lock-unavailable', 'lock-failed', 'clock-unreadable',
    'threshold-unreadable', 'threshold-out-of-range', 'mystery'];
  for (const reason of reasons) {
    const message = archiver.describeRunError(reason);
    assert.equal(typeof message, 'string');
    assert.equal(message.length > 20, true, reason);
    assert.equal(message.indexOf('nothing was saved') !== -1 || message.indexOf('Nothing was saved') !== -1
      || message.indexOf('nothing was saved. Exit') !== -1 || message.indexOf('could not finish') !== -1
      || message.indexOf('Try a browser') !== -1, true, reason + ' must own the outcome');
  }
});

test('every read-error reason lands on a plain sentence', () => {
  for (const reason of ['storage-unavailable', 'tasks-unreadable', 'clock-unreadable', 'threshold-unreadable', 'mystery']) {
    const message = archiver.describeReadError(reason);
    assert.equal(typeof message, 'string');
    assert.equal(message.length > 20, true, reason);
  }
  assert.match(archiver.describeReadError('tasks-unreadable'), /could not be read/);
});

test('describePlan explains the honest contract and fails closed on a bad limit', () => {
  const plan = archiver.describePlan(30);
  assert.equal(plan.ok, true);
  assert.equal(plan.lines.length, 5);
  const joined = plan.lines.join(' ');
  assert.equal(joined.indexOf('Feature settings') !== -1, true);
  assert.equal(joined.indexOf('Nothing runs by itself') !== -1, true);
  assert.equal(joined.indexOf('30 day(s) ago') !== -1, true);
  assert.equal(joined.indexOf('Repeating tasks') !== -1, true);
  assert.equal(archiver.describePlan(45).ok, false);
  assert.deepEqual(archiver.describePlan(null).lines, []);
});

test('the module exports its API and registers one root namespace', () => {
  assert.equal(typeof archiver.pickArchiveCandidates, 'function');
  assert.equal(typeof archiver.buildArchiveSnapshot, 'function');
  assert.equal(typeof archiver.describeRunError, 'function');
  assert.equal(typeof archiver.describePlan, 'function');
  assert.equal(typeof globalThis.DaymarkAutoArchive, 'object');
});
