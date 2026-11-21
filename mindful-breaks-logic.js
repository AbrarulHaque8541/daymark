((root) => {
  'use strict';
  const FLAG_ID = 'mindful-breaks';
  const MIN_INTERVAL_MINUTES = 10;
  const MAX_INTERVAL_MINUTES = 120;
  const DEFAULT_INTERVAL_MINUTES = 30;
  const MINUTE_MS = 60000;
  const BREAK_SUGGESTIONS = [
    'stand up and stretch your back',
    'look out of a window for a bit',
    'drink some water slowly',
    'roll your shoulders and loosen your neck',
    'walk to another room and come back',
    'close your eyes and take five slow breaths'
  ];
  function normalizeIntervalMinutes(value) {
    if (typeof value !== 'number' || !isFinite(value) || Math.floor(value) !== value) {
      return { ok: false, reason: 'interval-unreadable', minutes: null };
    }
    if (value < MIN_INTERVAL_MINUTES || value > MAX_INTERVAL_MINUTES) {
      return { ok: false, reason: 'interval-out-of-range', minutes: null };
    }
    return { ok: true, reason: null, minutes: value };
  }
  function suggestionForCycle(seed) {
    if (typeof seed !== 'number' || !isFinite(seed) || seed < 0 || Math.floor(seed) !== seed) {
      return { ok: false, reason: 'seed-unreadable', suggestion: null };
    }
    const index = seed % BREAK_SUGGESTIONS.length;
    return { ok: true, reason: null, suggestion: BREAK_SUGGESTIONS[index] };
  }
  function evaluateBreak(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      return { ok: false, reason: 'request-unreadable', state: null, suggestion: null, minutesElapsed: null, minutesRemaining: null };
    }
    const startedAtMs = request.startedAtMs;
    const nowMs = request.nowMs;
    const norm = normalizeIntervalMinutes(request.intervalMinutes);
    if (!norm.ok) return { ok: false, reason: norm.reason, state: null, suggestion: null, minutesElapsed: null, minutesRemaining: null };
    if (typeof startedAtMs !== 'number' || !isFinite(startedAtMs) || startedAtMs < 0) {
      return { ok: false, reason: 'started-at-unreadable', state: null, suggestion: null, minutesElapsed: null, minutesRemaining: null };
    }
    if (typeof nowMs !== 'number' || !isFinite(nowMs) || nowMs < 0) {
      return { ok: false, reason: 'clock-unreadable', state: null, suggestion: null, minutesElapsed: null, minutesRemaining: null };
    }
    if (nowMs < startedAtMs) {
      return { ok: false, reason: 'clock-moved-backwards', state: null, suggestion: null, minutesElapsed: null, minutesRemaining: null };
    }
    const elapsedMinutes = Math.floor((nowMs - startedAtMs) / MINUTE_MS);
    const remaining = norm.minutes - elapsedMinutes;
    if (remaining <= 0) {
      const pick = suggestionForCycle(Math.floor(nowMs / (norm.minutes * MINUTE_MS)));
      if (!pick.ok) return { ok: false, reason: pick.reason, state: null, suggestion: null, minutesElapsed: elapsedMinutes, minutesRemaining: 0 };
      return { ok: true, reason: null, state: 'break-due', suggestion: pick.suggestion, minutesElapsed: elapsedMinutes, minutesRemaining: 0 };
    }
    return { ok: true, reason: null, state: 'waiting', suggestion: null, minutesElapsed: elapsedMinutes, minutesRemaining: remaining };
  }
  function describePlan(intervalMinutes) {
    const norm = normalizeIntervalMinutes(intervalMinutes);
    if (!norm.ok) return { ok: false, reason: norm.reason, lines: [] };
    const lines = [
      'The nudge runs only while this page stays open.',
      norm.minutes + ' minutes on the page before a nudge.',
      'Nothing is saved: the timer restarts if you reload.',
      'No background timers, no notifications, no storage.',
      'Press Check now whenever you want an honest status.'
    ];
    return { ok: true, reason: null, lines: lines };
  }
  const api = {
    FLAG_ID: FLAG_ID,
    MIN_INTERVAL_MINUTES: MIN_INTERVAL_MINUTES,
    MAX_INTERVAL_MINUTES: MAX_INTERVAL_MINUTES,
    DEFAULT_INTERVAL_MINUTES: DEFAULT_INTERVAL_MINUTES,
    MINUTE_MS: MINUTE_MS,
    BREAK_SUGGESTIONS: BREAK_SUGGESTIONS,
    normalizeIntervalMinutes: normalizeIntervalMinutes,
    suggestionForCycle: suggestionForCycle,
    evaluateBreak: evaluateBreak,
    describePlan: describePlan
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkMindfulBreaks = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
