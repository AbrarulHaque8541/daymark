const { test } = require('node:test');
const assert = require('node:assert/strict');
const ff = require('../feature-flags-logic.js');
const arch = require('../auto-archive-logic.js');

const NOW = Date.UTC(2026, 10, 23, 12, 0, 0);
function task(id, title, comp, upd, repeat) {
  const t = { id: id, title: title, updatedAt: typeof upd === 'string' ? upd : new Date(upd).toISOString() };
  if (comp === true) t.completed = true;
  if (repeat) t.repeat = repeat;
  return t;
}

test('auto-archive is the 6th feature flag, kind feature', () => {
  assert.equal(ff.FLAG_IDS[5], 'auto-archive');
  const entry = ff.FEATURE_FLAGS.filter((f) => f.id === 'auto-archive')[0];
  assert.equal(entry.kind, 'feature');
});

test('constants pin', () => {
  assert.equal(arch.FLAG_ID, 'auto-archive');
  assert.equal(arch.TASKS_STORAGE_KEY, 'daymark.tasks.v1');
  assert.deepEqual(arch.THRESHOLD_DAYS, [7, 30, 90]);
  assert.equal(arch.DEFAULT_THRESHOLD_DAYS, 30);
  assert.equal(arch.MAX_CANDIDATES, 50);
  assert.equal(arch.MAX_LABEL_CHARS, 80);
});

test('normalizeThresholdDays accepts only the offered choices', () => {
  for (const d of arch.THRESHOLD_DAYS) assert.deepEqual(arch.normalizeThresholdDays(d), { ok: true, reason: '', days: d });
  assert.equal(arch.normalizeThresholdDays(45).ok, false);
  assert.equal(arch.normalizeThresholdDays(45).reason, 'threshold-out-of-range');
  assert.equal(arch.normalizeThresholdDays(1.5).reason, 'threshold-unreadable');
  assert.equal(arch.normalizeThresholdDays('30').reason, 'threshold-unreadable');
  assert.equal(arch.normalizeThresholdDays(NaN).reason, 'threshold-unreadable');
});

test('flagIsOn is strict, opt-in only', () => {
  assert.equal(arch.flagIsOn(null), false);
  assert.equal(arch.flagIsOn({ ok: false, flags: { 'auto-archive': true } }), false);
  assert.equal(arch.flagIsOn({ ok: true, flags: {} }), false);
  assert.equal(arch.flagIsOn({ ok: true, flags: { 'auto-archive': 'yes' } }), false);
  assert.equal(arch.flagIsOn({ ok: true, flags: { 'auto-archive': true } }), true);
});

test('instantMs rejects garbage and non-ISO strings', () => {
  assert.equal(arch.instantMs('bad'), null);
  assert.equal(arch.instantMs('icon-setup.exe'), null);
  assert.equal(arch.instantMs('2026-11-23 12:00:00'), null);
  assert.equal(arch.instantMs(new Date(NOW).toISOString()), NOW);
});

test('pickArchiveCandidates fails closed on unreadable inputs, empty list is ok', () => {
  assert.equal(arch.pickArchiveCandidates('x', NOW, 30).reason, 'tasks-unreadable');
  assert.equal(arch.pickArchiveCandidates([null], NaN, 30).reason, 'clock-unreadable');
  assert.equal(arch.pickArchiveCandidates([null], -5, 30).reason, 'clock-unreadable');
  assert.equal(arch.pickArchiveCandidates([null], NOW, 45).reason, 'threshold-out-of-range');
  assert.deepEqual(arch.pickArchiveCandidates([], NOW, 30), { ok: true, reason: '', thresholdDays: 30, items: [], skipped: { 'not-completed': 0, 'repeating': 0, 'recent-or-unreadable': 0, 'unreadable-record': 0 }, totalCount: 0, truncated: false });
});

test('boundary: exactly threshold days old is a candidate', () => {
  const done = new Date(NOW - 30 * arch.DAY_MS).toISOString();
  const pick = arch.pickArchiveCandidates([task('one', 'Boundary pass', true, done)], NOW, 30);
  assert.equal(pick.ok, true);
  assert.equal(pick.items.length, 1);
  assert.equal(pick.items[0].ageDays, 30);
});

test('exclusions are counted honestly, oldest first', () => {
  const done = new Date(NOW - 40 * arch.DAY_MS).toISOString();
  const pick = arch.pickArchiveCandidates([
    task('open', 'Still open', false, done),
    task('rep', 'Renews forever', true, done, 'daily'),
    task('ng', 'Future stamp', true, '2027-01-01T00:00:00.000Z'),
    task('nong', 'Not a stamp', true, 'icon-setup.exe'),
    task('fresh', 'Just done', true, new Date(NOW - 2 * arch.DAY_MS).toISOString()),
    task('old1', 'Old done one', true, done),
    task('old2', 'Old done two', true, done)
  ], NOW, 30);
  assert.equal(pick.ok, true);
  assert.equal(pick.totalCount, 2);
  assert.deepEqual(pick.items.map((i) => i.id), ['old1', 'old2']);
  assert.equal(pick.skipped['not-completed'], 1);
  assert.equal(pick.skipped['repeating'], 1);
  assert.equal(pick.skipped['recent-or-unreadable'], 3);
  assert.equal(pick.skipped['unreadable-record'], 0);
  assert.equal(pick.truncated, false);
});

test('duplicate and unreadable records skipped and counted', () => {
  const done = new Date(NOW - 40 * arch.DAY_MS).toISOString();
  const pick = arch.pickArchiveCandidates([
    task('dup', 'One', true, done),
    null, 'junk', { id: '' },
    task('dup', 'Twin', true, done)
  ], NOW, 30);
  assert.equal(pick.skipped['unreadable-record'], 4);
  assert.equal(pick.items.length, 1);
});

test('50-candidate cap: truncated flag and oldest kept', () => {
  const tasks = [];
  for (let i = 0; i < 52; i++) tasks.push(task('t' + i, 'T' + i, true, new Date(NOW - (40 + i) * arch.DAY_MS).toISOString()));
  const pick = arch.pickArchiveCandidates(tasks, NOW, 30);
  assert.equal(pick.items.length, 50);
  assert.equal(pick.totalCount, 52);
  assert.equal(pick.truncated, true);
  assert.equal(pick.items[0].id, 't51');
});

test('labels trimmed to 80 chars with ellipsis', () => {
  const done = new Date(NOW - 40 * arch.DAY_MS).toISOString();
  const long = 'X'.repeat(200);
  const pick = arch.pickArchiveCandidates([task('long', long, true, done)], NOW, 30);
  assert.equal(pick.items[0].title.length, 80);
  assert.equal(pick.items[0].title.endsWith('\u2026'), true);
});

test('buildArchiveSnapshot removes exactly the given candidates', () => {
  const done = new Date(NOW - 40 * arch.DAY_MS).toISOString();
  const tasks = [task('gone', 'Deleting', true, done), task('stay', 'Staying', false, done)];
  const snap = arch.buildArchiveSnapshot(tasks, ['gone'], NOW, 30);
  assert.equal(snap.ok, true);
  assert.equal(snap.removedCount, 1);
  assert.deepEqual(snap.desiredTasks.map((t) => t.id), ['stay']);
});

test('buildArchiveSnapshot refuses unreadable, duplicate or stale candidates', () => {
  const done = new Date(NOW - 40 * arch.DAY_MS).toISOString();
  const tasks = [task('gone', 'Deleting', true, done)];
  assert.equal(arch.buildArchiveSnapshot(tasks, [], NOW, 30).reason, 'candidates-unreadable');
  assert.equal(arch.buildArchiveSnapshot(tasks, ['ghost'], NOW, 30).reason, 'candidates-stale');
  assert.equal(arch.buildArchiveSnapshot(tasks, ['gone', 'gone'], NOW, 30).reason, 'candidates-unreadable');
  assert.equal(arch.buildArchiveSnapshot(tasks, ['gone', 'ghost'], NOW, 30).reason, 'candidates-stale');
  assert.equal(arch.buildArchiveSnapshot(tasks, ['gone'], NOW, 30).ok, true);
});

test('describeReadError never suggests data changed', () => {
  const msg = arch.describeReadError('tasks-unreadable');
  assert.equal(msg.indexOf('Nothing was read or changed') !== -1, true);
});

test('describeRunError names honest per-reason outcomes', () => {
  assert.equal(arch.describeRunError('flag-off').indexOf('switched off') !== -1, true);
  assert.equal(arch.describeRunError('no-candidates').indexOf('nothing to archive') !== -1, true);
  assert.equal(arch.describeRunError('candidates-stale').indexOf('changed since the preview') !== -1, true);
  assert.equal(arch.describeRunError('lock-unavailable').indexOf('Web Locks') !== -1, true);
  assert.equal(arch.describeRunError('conflict').indexOf('Another tab changed') !== -1, true);
});

test('describePlan explains opt-in, manual, device-only behavior', () => {
  const plan = arch.describePlan(30);
  assert.equal(plan.ok, true);
  assert.equal(plan.lines.length, 5);
  assert.equal(arch.describePlan(45).ok, false);
  assert.equal(arch.describePlan(45).lines.length, 0);
});
