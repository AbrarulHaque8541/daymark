((root) => {
  'use strict';

  // Shared focus-timer logic for the Daymark web prototype. Mirrors the
  // repeat-logic.js module style: pure functions, no DOM, no storage, so it can
  // be unit-tested directly and loaded in the browser as window.DaymarkFocus.
  //
  // A session is a plain JSON-safe object with millisecond timestamps so it can
  // be persisted and restored across page reloads without Date parsing drift:
  //   { id, taskId, kind, durationMinutes, state, accumulatedMs,
  //     startedAtMs, createdAtMs, updatedAtMs, endedAtMs, finalElapsedMs, completed }
  // state is one of 'running' | 'paused' | 'done'.

  const KINDS = ['focus', 'short-break', 'long-break'];
  const PRESET_MINUTES = { focus: 25, 'short-break': 5, 'long-break': 15 };
  const STATES = ['running', 'paused', 'done'];
  const MIN_MINUTES = 1;
  const MAX_MINUTES = 120;
  const MAX_LOG_ENTRIES = 200;

  function isKind(value) {
    return KINDS.includes(value);
  }

  function isValidDurationMinutes(kind, minutes) {
    if (!isKind(kind)) return false;
    if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return false;
    if (!Number.isInteger(minutes)) return false;
    return minutes >= MIN_MINUTES && minutes <= MAX_MINUTES;
  }

  function presetMinutes(kind) {
    return isKind(kind) ? PRESET_MINUTES[kind] : null;
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function createSession(options, now) {
    const opts = options || {};
    if (!isFiniteNumber(now)) throw new TypeError('createSession requires a finite now (ms).');
    const kind = isKind(opts.kind) ? opts.kind : 'focus';
    const durationMinutes = isValidDurationMinutes(kind, opts.durationMinutes)
      ? opts.durationMinutes
      : presetMinutes(kind);
    const taskId = typeof opts.taskId === 'string' && opts.taskId.trim().length > 0 ? opts.taskId : null;
    return {
      id: typeof opts.id === 'string' && opts.id ? opts.id : `focus-${now}-${Math.random().toString(36).slice(2, 10)}`,
      taskId,
      kind,
      durationMinutes,
      state: 'running',
      accumulatedMs: 0,
      startedAtMs: now,
      createdAtMs: now,
      updatedAtMs: now,
      endedAtMs: null,
      finalElapsedMs: null,
      completed: false
    };
  }

  function durationMs(session) {
    return session.durationMinutes * 60 * 1000;
  }

  function elapsedMs(session, now) {
    if (!session) return 0;
    if (session.state === 'done') return session.finalElapsedMs == null ? 0 : session.finalElapsedMs;
    if (session.state === 'paused') return session.accumulatedMs;
    const started = isFiniteNumber(session.startedAtMs) ? session.startedAtMs : now;
    return session.accumulatedMs + Math.max(0, now - started);
  }

  function remainingMs(session, now) {
    if (!session) return 0;
    return Math.max(0, durationMs(session) - elapsedMs(session, now));
  }

  function progressRatio(session, now) {
    if (!session) return 0;
    const total = durationMs(session);
    if (total <= 0) return 1;
    const ratio = elapsedMs(session, now) / total;
    return Math.min(1, Math.max(0, ratio));
  }

  function pause(session, now) {
    if (!session || session.state !== 'running' || !isFiniteNumber(now)) return session;
    session.accumulatedMs = elapsedMs(session, now);
    session.state = 'paused';
    session.startedAtMs = null;
    session.updatedAtMs = now;
    return session;
  }

  function resume(session, now) {
    if (!session || session.state !== 'paused' || !isFiniteNumber(now)) return session;
    session.state = 'running';
    session.startedAtMs = now;
    session.updatedAtMs = now;
    return session;
  }

  // finish transitions a running/paused session to done. For natural expiry
  // while running, endedAtMs is the wall-clock end of the current active segment
  // plus the remaining active budget; paused wall-clock gaps are excluded. A late
  // tick still records that exact expiry rather than its callback time. Manual
  // stops use now.
  function finish(session, now, completed) {
    if (!session || session.state === 'done' || !isFiniteNumber(now)) return session;
    const total = durationMs(session);
    const spent = Math.min(elapsedMs(session, now), total);
    const natural = spent >= total;
    const naturalEndMs = natural && session.state === 'running' && isFiniteNumber(session.startedAtMs)
      ? session.startedAtMs + Math.max(0, total - session.accumulatedMs)
      : now;
    session.finalElapsedMs = spent;
    session.completed = natural ? true : Boolean(completed);
    session.endedAtMs = natural ? naturalEndMs : now;
    session.state = 'done';
    session.startedAtMs = null;
    session.updatedAtMs = now;
    return session;
  }

  // tick returns { session, finished } and auto-completes a running session whose
  // remaining budget reached zero.
  function tick(session, now) {
    if (!session || !isFiniteNumber(now)) return { session, finished: false };
    if (session.state === 'running' && remainingMs(session, now) <= 0) {
      finish(session, now, true);
      return { session, finished: true };
    }
    return { session, finished: false };
  }

  function isValidSession(value) {
    return Boolean(value && typeof value === 'object'
      && typeof value.id === 'string' && value.id.length > 0
      && isKind(value.kind)
      && isValidDurationMinutes(value.kind, value.durationMinutes)
      && STATES.includes(value.state)
      && isFiniteNumber(value.accumulatedMs) && value.accumulatedMs >= 0
      && isFiniteNumber(value.createdAtMs)
      && isFiniteNumber(value.updatedAtMs)
      && (value.taskId === null || (typeof value.taskId === 'string' && value.taskId.length > 0))
      && (value.state !== 'running' || isFiniteNumber(value.startedAtMs))
      && (value.state === 'paused' ? value.startedAtMs === null : true)
      && (value.state === 'done'
        ? (isFiniteNumber(value.endedAtMs) && isFiniteNumber(value.finalElapsedMs)
          && typeof value.completed === 'boolean' && value.startedAtMs === null)
        : (value.endedAtMs === null && value.finalElapsedMs === null && value.completed === false)));
  }

  function serialize(session) {
    if (!isValidSession(session)) return null;
    return {
      id: session.id,
      taskId: session.taskId,
      kind: session.kind,
      durationMinutes: session.durationMinutes,
      state: session.state,
      accumulatedMs: session.accumulatedMs,
      startedAtMs: session.startedAtMs,
      createdAtMs: session.createdAtMs,
      updatedAtMs: session.updatedAtMs,
      endedAtMs: session.endedAtMs,
      finalElapsedMs: session.finalElapsedMs,
      completed: session.completed
    };
  }

  // restoreSession revives a persisted active (running/paused) session. A running
  // session keeps counting across a reload using wall-clock time, which is the
  // honest behavior for a browser tab timer; finished sessions are never restored
  // as active. Returns null for anything invalid instead of guessing.
  function restoreSession(value, now) {
    if (!isValidSession(value) || value.state === 'done') return null;
    if (!isFiniteNumber(now)) return null;
    const session = serialize(value);
    if (session.state === 'running' && elapsedMs(session, now) >= durationMs(session)) {
      // The budget ran out while the page was closed: complete it exactly at the
      // moment it expired rather than showing a negative clock.
      finish(session, now, true);
      return null;
    }
    return session;
  }

  function makeLogEntry(session) {
    if (!session || session.state !== 'done' || !isFiniteNumber(session.endedAtMs)) return null;
    return {
      id: session.id,
      taskId: session.taskId,
      kind: session.kind,
      durationMinutes: session.durationMinutes,
      startedAt: new Date(session.createdAtMs).toISOString(),
      endedAt: new Date(session.endedAtMs).toISOString(),
      elapsedMs: session.finalElapsedMs,
      completed: session.completed
    };
  }

  function isValidLogEntry(value) {
    return Boolean(value && typeof value === 'object'
      && typeof value.id === 'string' && value.id.length > 0
      && isKind(value.kind)
      && isValidDurationMinutes(value.kind, value.durationMinutes)
      && (value.taskId === null || typeof value.taskId === 'string')
      && typeof value.startedAt === 'string' && !Number.isNaN(Date.parse(value.startedAt))
      && typeof value.endedAt === 'string' && !Number.isNaN(Date.parse(value.endedAt))
      && isFiniteNumber(value.elapsedMs) && value.elapsedMs >= 0
      && typeof value.completed === 'boolean');
  }

  function validateFocusLog(value) {
    if (!Array.isArray(value)) return { entries: [], rejectedCount: 1 };
    const seen = new Set();
    const entries = [];
    let rejectedCount = 0;
    for (const item of value) {
      if (!isValidLogEntry(item) || seen.has(item.id)) {
        rejectedCount += 1;
        continue;
      }
      seen.add(item.id);
      entries.push(item);
    }
    return { entries, rejectedCount };
  }

  // appendLogEntry keeps the log bounded by dropping the oldest entries.
  function appendLogEntry(entries, entry) {
    if (!Array.isArray(entries) || !isValidLogEntry(entry)) return Array.isArray(entries) ? entries : [];
    return entries.concat([entry]).slice(-MAX_LOG_ENTRIES);
  }

  function localDateStringFromMs(ms) {
    const date = new Date(ms);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // focusMinutesOn totals completed+partial focus time whose session started on
  // the given local date (YYYY-MM-DD).
  function focusMinutesOn(entries, dateString) {
    if (!Array.isArray(entries) || typeof dateString !== 'string') return 0;
    let totalMs = 0;
    for (const entry of entries) {
      if (!isValidLogEntry(entry) || entry.kind !== 'focus') continue;
      if (localDateStringFromMs(Date.parse(entry.startedAt)) !== dateString) continue;
      totalMs += entry.elapsedMs;
    }
    return Math.round(totalMs / 60000);
  }

  // formatClock renders a countdown as M:SS (or H:MM:SS past one hour). It
  // rounds up so a fresh 25 minute session shows 25:00, not 24:59.
  function formatClock(ms) {
    const safe = Math.max(0, isFiniteNumber(ms) ? ms : 0);
    const totalSeconds = Math.ceil(safe / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  const api = {
    KINDS,
    PRESET_MINUTES,
    MIN_MINUTES,
    MAX_MINUTES,
    MAX_LOG_ENTRIES,
    isKind,
    isValidDurationMinutes,
    presetMinutes,
    createSession,
    elapsedMs,
    remainingMs,
    progressRatio,
    pause,
    resume,
    finish,
    tick,
    isValidSession,
    serialize,
    restoreSession,
    makeLogEntry,
    isValidLogEntry,
    validateFocusLog,
    appendLogEntry,
    focusMinutesOn,
    formatClock
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkFocus = api;
})(globalThis);
