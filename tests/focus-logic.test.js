const test = require('node:test');
const assert = require('node:assert/strict');
const focus = require('../focus-logic.js');

const T0 = 1_800_000_000_000; // fixed epoch ms for deterministic tests

test('kinds and presets are stable', () => {
  assert.deepEqual(focus.KINDS, ['focus', 'short-break', 'long-break']);
  assert.equal(focus.presetMinutes('focus'), 25);
  assert.equal(focus.presetMinutes('short-break'), 5);
  assert.equal(focus.presetMinutes('long-break'), 15);
  assert.equal(focus.presetMinutes('yearly'), null);
  assert.equal(focus.isKind('focus'), true);
  assert.equal(focus.isKind(''), false);
});

test('duration bounds are enforced', () => {
  assert.equal(focus.isValidDurationMinutes('focus', 25), true);
  assert.equal(focus.isValidDurationMinutes('focus', 1), true);
  assert.equal(focus.isValidDurationMinutes('focus', 120), true);
  assert.equal(focus.isValidDurationMinutes('focus', 0), false);
  assert.equal(focus.isValidDurationMinutes('focus', 121), false);
  assert.equal(focus.isValidDurationMinutes('focus', 25.5), false);
  assert.equal(focus.isValidDurationMinutes('nope', 25), false);
  assert.equal(focus.isValidDurationMinutes('focus', '25'), false);
});

test('createSession builds a running session with preset fallback and validation', () => {
  const session = focus.createSession({ taskId: 'task-1', kind: 'focus' }, T0);
  assert.equal(session.state, 'running');
  assert.equal(session.kind, 'focus');
  assert.equal(session.durationMinutes, 25);
  assert.equal(session.taskId, 'task-1');
  assert.equal(session.startedAtMs, T0);
  assert.equal(session.accumulatedMs, 0);
  assert.equal(focus.isValidSession(session), true);

  const custom = focus.createSession({ kind: 'short-break', durationMinutes: 10, taskId: '  ' }, T0);
  assert.equal(custom.durationMinutes, 10);
  assert.equal(custom.taskId, null, 'blank task ids normalize to null');

  const invalid = focus.createSession({ kind: 'focus', durationMinutes: 9999 }, T0);
  assert.equal(invalid.durationMinutes, 25, 'out-of-range custom duration falls back to the preset');

  assert.throws(() => focus.createSession({}, Number.NaN), TypeError);
  assert.throws(() => focus.createSession({}, 'now'), TypeError);
});

test('elapsed and remaining track wall clock while running', () => {
  const session = focus.createSession({ kind: 'focus' }, T0);
  assert.equal(focus.elapsedMs(session, T0), 0);
  assert.equal(focus.remainingMs(session, T0), 25 * 60 * 1000);
  const later = T0 + 10 * 60 * 1000;
  assert.equal(focus.elapsedMs(session, later), 10 * 60 * 1000);
  assert.equal(focus.remainingMs(session, later), 15 * 60 * 1000);
  assert.equal(focus.elapsedMs(session, T0 - 5000), 0, 'clock skew backwards never produces negative elapsed');
});

test('pause freezes accumulated time and resume continues from it', () => {
  const session = focus.createSession({ kind: 'focus' }, T0);
  const pausedAt = T0 + 5 * 60 * 1000;
  focus.pause(session, pausedAt);
  assert.equal(session.state, 'paused');
  assert.equal(session.startedAtMs, null);
  assert.equal(session.accumulatedMs, 5 * 60 * 1000);
  assert.equal(focus.elapsedMs(session, pausedAt + 60 * 60 * 1000), 5 * 60 * 1000, 'paused time does not accrue');
  assert.equal(focus.remainingMs(session, pausedAt + 60 * 60 * 1000), 20 * 60 * 1000);

  const resumedAt = pausedAt + 60 * 60 * 1000;
  focus.resume(session, resumedAt);
  assert.equal(session.state, 'running');
  assert.equal(session.startedAtMs, resumedAt);
  assert.equal(focus.elapsedMs(session, resumedAt + 2 * 60 * 1000), 7 * 60 * 1000);

  focus.pause(focus.createSession({ kind: 'focus' }, T0), T0); // no-op on fresh running? it is running, so it pauses
  const done = focus.finish(focus.createSession({ kind: 'focus' }, T0), T0, false);
  focus.pause(done, T0 + 1000); // no-op on done
  assert.equal(done.state, 'done');
  focus.resume(done, T0 + 1000); // no-op on done
  assert.equal(done.state, 'done');
});

test('tick auto-completes exactly when the budget runs out', () => {
  const session = focus.createSession({ kind: 'short-break' }, T0); // 5 min
  const before = focus.tick(session, T0 + 4 * 60 * 1000 + 59 * 1000);
  assert.equal(before.finished, false);
  assert.equal(session.state, 'running');
  const at = focus.tick(session, T0 + 5 * 60 * 1000);
  assert.equal(at.finished, true);
  assert.equal(session.state, 'done');
  assert.equal(session.completed, true);
  assert.equal(session.finalElapsedMs, 5 * 60 * 1000);
  assert.equal(session.endedAtMs, T0 + 5 * 60 * 1000, 'natural completion ends at the exact expiry moment');
  assert.equal(focus.remainingMs(session, T0 + 9 * 60 * 1000), 0);
  assert.equal(focus.elapsedMs(session, T0 + 9 * 60 * 1000), 5 * 60 * 1000, 'done sessions stop accruing');
});

test('tick completion records exact wall-clock expiry after pauses, even when the tick is late', () => {
  const session = focus.createSession({ kind: 'focus' }, T0); // 25 min active budget
  focus.pause(session, T0 + 10 * 60 * 1000);
  focus.resume(session, T0 + 70 * 60 * 1000); // 1 h pause
  const exactExpiry = T0 + 85 * 60 * 1000; // 10 min before pause + 15 min after resume
  const { finished } = focus.tick(session, T0 + 92 * 60 * 1000); // callback arrives 7 min late
  assert.equal(finished, true);
  assert.equal(session.finalElapsedMs, 25 * 60 * 1000, 'paused wall-clock time is not counted as focused time');
  assert.equal(session.endedAtMs, exactExpiry, 'expiry uses resumedAt + remaining active budget, not createdAt + total active time');
  const entry = focus.makeLogEntry(session);
  assert.equal(entry.elapsedMs, 25 * 60 * 1000);
  assert.equal(entry.endedAt, new Date(exactExpiry).toISOString(), 'persisted log uses the correct wall-clock end');
});

test('finish with manual stop records a partial, incomplete session', () => {
  const session = focus.createSession({ kind: 'focus' }, T0);
  focus.finish(session, T0 + 7 * 60 * 1000, false);
  assert.equal(session.state, 'done');
  assert.equal(session.completed, false);
  assert.equal(session.finalElapsedMs, 7 * 60 * 1000);
  assert.equal(session.endedAtMs, T0 + 7 * 60 * 1000);
  assert.equal(focus.isValidSession(session), true);
});

test('serialize and restoreSession round-trip an active session', () => {
  const session = focus.createSession({ kind: 'long-break', taskId: 't9' }, T0);
  focus.pause(session, T0 + 60 * 1000);
  const restored = focus.restoreSession(JSON.parse(JSON.stringify(focus.serialize(session))), T0 + 90 * 60 * 1000);
  assert.ok(restored);
  assert.equal(restored.state, 'paused');
  assert.equal(restored.taskId, 't9');
  assert.equal(focus.elapsedMs(restored, T0 + 90 * 60 * 1000), 60 * 1000);
});

test('restoreSession revives a running session and keeps counting across reload', () => {
  const session = focus.createSession({ kind: 'focus' }, T0);
  const json = JSON.parse(JSON.stringify(session));
  const restored = focus.restoreSession(json, T0 + 12 * 60 * 1000);
  assert.ok(restored);
  assert.equal(restored.state, 'running');
  assert.equal(focus.remainingMs(restored, T0 + 12 * 60 * 1000), 13 * 60 * 1000);
});

test('restoreSession rejects invalid, finished, or expired sessions', () => {
  assert.equal(focus.restoreSession(null, T0), null);
  assert.equal(focus.restoreSession({ state: 'running' }, T0), null);
  assert.equal(focus.restoreSession('focus', T0), null);
  assert.equal(focus.restoreSession(focus.createSession({ kind: 'focus' }, T0), Number.NaN), null);

  const done = focus.finish(focus.createSession({ kind: 'focus' }, T0), T0 + 60 * 1000, false);
  assert.equal(focus.restoreSession(done, T0 + 120 * 1000), null, 'finished sessions are never restored as active');

  const expired = focus.createSession({ kind: 'short-break' }, T0); // 5 min
  assert.equal(focus.restoreSession(expired, T0 + 6 * 60 * 1000), null, 'a session that expired while closed is not revived');

  const pausedThenExpired = focus.createSession({ kind: 'short-break' }, T0);
  focus.pause(pausedThenExpired, T0 + 2 * 60 * 1000);
  focus.resume(pausedThenExpired, T0 + 62 * 60 * 1000);
  assert.equal(focus.restoreSession(pausedThenExpired, T0 + 66 * 60 * 1000), null,
    'a resumed session that expired during the latest active segment is not revived');
});

test('isValidSession rejects malformed shapes', () => {
  const good = focus.createSession({ kind: 'focus' }, T0);
  assert.equal(focus.isValidSession(good), true);
  assert.equal(focus.isValidSession({ ...good, state: 'flying' }), false);
  assert.equal(focus.isValidSession({ ...good, kind: 'yearly' }), false);
  assert.equal(focus.isValidSession({ ...good, durationMinutes: 500 }), false);
  assert.equal(focus.isValidSession({ ...good, startedAtMs: null }), false, 'running requires a start timestamp');
  const paused = focus.pause(focus.createSession({ kind: 'focus' }, T0), T0 + 1000);
  assert.equal(focus.isValidSession(paused), true);
  assert.equal(focus.isValidSession({ ...paused, startedAtMs: T0 }), false, 'paused must not carry a start timestamp');
  assert.equal(focus.isValidSession({ ...good, accumulatedMs: -1 }), false);
  assert.equal(focus.serialize({ nope: true }), null);
});

test('log entries capture finished sessions and validate strictly', () => {
  const session = focus.createSession({ kind: 'focus', taskId: 't1' }, T0);
  assert.equal(focus.makeLogEntry(session), null, 'a running session has no log entry yet');
  focus.finish(session, T0 + 25 * 60 * 1000, true);
  const entry = focus.makeLogEntry(session);
  assert.ok(entry);
  assert.equal(entry.kind, 'focus');
  assert.equal(entry.taskId, 't1');
  assert.equal(entry.elapsedMs, 25 * 60 * 1000);
  assert.equal(entry.completed, true);
  assert.equal(entry.startedAt, new Date(T0).toISOString());
  assert.equal(focus.isValidLogEntry(entry), true);
  assert.equal(focus.isValidLogEntry({ ...entry, kind: 'yearly' }), false);
  assert.equal(focus.isValidLogEntry({ ...entry, endedAt: 'not-a-date' }), false);
});

test('validateFocusLog drops invalid and duplicate entries', () => {
  const session = focus.createSession({ kind: 'focus' }, T0);
  focus.finish(session, T0 + 25 * 60 * 1000, true);
  const entry = focus.makeLogEntry(session);
  const result = focus.validateFocusLog([entry, entry, { bad: true }, 'x', null]);
  assert.equal(result.entries.length, 1);
  assert.equal(result.rejectedCount, 4);
  assert.deepEqual(focus.validateFocusLog('nope'), { entries: [], rejectedCount: 1 });
});

test('appendLogEntry is bounded and ignores invalid entries', () => {
  const session = focus.createSession({ kind: 'focus' }, T0);
  focus.finish(session, T0 + 60 * 1000, false);
  const entry = focus.makeLogEntry(session);
  let log = [];
  for (let i = 0; i < focus.MAX_LOG_ENTRIES + 10; i += 1) {
    log = focus.appendLogEntry(log, { ...entry, id: `e-${i}` });
  }
  assert.equal(log.length, focus.MAX_LOG_ENTRIES, 'log is capped');
  assert.equal(log[0].id, 'e-10', 'oldest entries are dropped first');
  assert.deepEqual(focus.appendLogEntry(log, null), log, 'invalid entry leaves the log unchanged');
  assert.deepEqual(focus.appendLogEntry(null, entry), [], 'null log stays an empty list');
});

test('focusMinutesOn totals focus time started on a local date', () => {
  const day = new Date(T0);
  const dateString = focus.formatClock(0) && `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  const mk = (id, minutes, kind = 'focus') => ({
    id,
    taskId: null,
    kind,
    durationMinutes: 25,
    startedAt: new Date(T0).toISOString(),
    endedAt: new Date(T0 + minutes * 60 * 1000).toISOString(),
    elapsedMs: minutes * 60 * 1000,
    completed: true
  });
  const otherDay = new Date(T0 - 48 * 3600 * 1000).toISOString();
  const log = [
    mk('a', 25),
    mk('b', 10),
    mk('c', 5, 'short-break'),
    { ...mk('d', 30), startedAt: otherDay, endedAt: otherDay }
  ];
  assert.equal(focus.focusMinutesOn(log, dateString), 35, 'only focus-kind entries on that local date count');
  assert.equal(focus.focusMinutesOn(log, '1999-01-01'), 0);
  assert.equal(focus.focusMinutesOn(null, dateString), 0);
  assert.equal(focus.focusMinutesOn(log, 42), 0);
});

test('progressRatio is clamped between 0 and 1', () => {
  const session = focus.createSession({ kind: 'focus' }, T0);
  assert.equal(focus.progressRatio(session, T0), 0);
  assert.equal(focus.progressRatio(session, T0 + 12.5 * 60 * 1000), 0.5);
  assert.equal(focus.progressRatio(session, T0 + 99 * 60 * 1000), 1);
  assert.equal(focus.progressRatio(null, T0), 0);
});

test('formatClock renders ceil-rounded countdowns', () => {
  assert.equal(focus.formatClock(25 * 60 * 1000), '25:00');
  assert.equal(focus.formatClock(25 * 60 * 1000 - 1), '25:00', 'rounds up so a fresh timer never shows 24:59');
  assert.equal(focus.formatClock(15 * 60 * 1000), '15:00');
  assert.equal(focus.formatClock(61 * 1000), '01:01');
  assert.equal(focus.formatClock(0), '00:00');
  assert.equal(focus.formatClock(-5), '00:00');
  assert.equal(focus.formatClock(3600 * 1000 + 2 * 60 * 1000), '1:02:00');
  assert.equal(focus.formatClock(Number.NaN), '00:00');
});
