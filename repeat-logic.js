((root) => {
  'use strict';

  // Shared repeat-rule logic for the Daymark web prototype. Mirrors the
  // task-logic.js module style: pure functions, no DOM, no storage, so it can
  // be unit-tested directly and loaded in the browser as window.DaymarkRepeat.
  const REPEATS = ['daily', 'weekly', 'monthly', 'weekdays', 'yearly'];

  function isRepeat(value) {
    if (value === null || value === undefined) return true;
    return REPEATS.includes(value);
  }

  function localDateOf(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function isDateOnlyString(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function parseDateOnly(value) {
    if (!isDateOnlyString(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
    return parsed;
  }

  function isWeekday(date) {
    const day = date.getDay();
    return day !== 0 && day !== 6;
  }

  // The n-th occurrence of the rule counting from the task's own due date.
  // Monthly occurrences always clamp from the ORIGINAL day of the month, so a
  // "31st" task does not degrade to the 28th forever after one short month.
  // Yearly occurrences clamp Feb 29 to Feb 28 in short years (matching
  // java.time's plusYears on the Android side). Weekday occurrences count only
  // Monday-Friday, so a Friday task's first repeat is the following Monday.
  function occurrenceAt(start, rule, steps) {
    if (rule === 'daily') {
      const date = new Date(start.getTime());
      date.setDate(date.getDate() + steps);
      return date;
    }
    if (rule === 'weekly') {
      const date = new Date(start.getTime());
      date.setDate(date.getDate() + 7 * steps);
      return date;
    }
    if (rule === 'monthly') {
      const day = start.getDate();
      const date = new Date(start.getFullYear(), start.getMonth() + steps, 1);
      const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(day, daysInMonth));
      return date;
    }
    if (rule === 'weekdays') {
      const date = new Date(start.getTime());
      let remaining = steps;
      while (remaining > 0) {
        date.setDate(date.getDate() + 1);
        if (isWeekday(date)) remaining -= 1;
      }
      return date;
    }
    if (rule === 'yearly') {
      const year = start.getFullYear() + steps;
      const daysInMonth = new Date(year, start.getMonth() + 1, 0).getDate();
      return new Date(year, start.getMonth(), Math.min(start.getDate(), daysInMonth));
    }
    return null;
  }

  // Next due date for a repeating task. Occurrences advance from the task's
  // own due date (not from today), so completing early keeps the rhythm
  // stable. Missed occurrences are skipped forward so the next occurrence is
  // never in the past. Returns null for invalid input or a missing rule.
  function nextDueDate(dueDate, repeatRule, today) {
    if (!isRepeat(repeatRule) || repeatRule === null || repeatRule === undefined) return null;
    const start = parseDateOnly(dueDate);
    if (!start) return null;
    const todayStart = parseDateOnly(today);
    let steps = 1;
    if (todayStart) {
      const todayString = localDateOf(todayStart);
      let guard = 0;
      while (localDateOf(occurrenceAt(start, repeatRule, steps)) < todayString && guard < 3660) {
        steps += 1;
        guard += 1;
      }
    }
    const occurrence = occurrenceAt(start, repeatRule, steps);
    return occurrence ? localDateOf(occurrence) : null;
  }

  const api = { REPEATS, isRepeat, nextDueDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkRepeat = api;
})(globalThis);
