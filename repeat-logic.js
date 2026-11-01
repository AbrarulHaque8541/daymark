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
    const parsed = new Date(0);
    parsed.setHours(0, 0, 0, 0);
    parsed.setFullYear(year, month - 1, day);
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
  function dateInMonth(year, month, day) {
    const date = new Date(0);
    date.setHours(0, 0, 0, 0);
    date.setFullYear(year, month, day);
    return date;
  }

  function daysInMonth(year, month) {
    return dateInMonth(year, month + 1, 0).getDate();
  }

  // Ordinal based on UTC calendar components avoids 23/25-hour local days at DST.
  function dayOrdinal(date) {
    const utc = new Date(0);
    utc.setUTCHours(0, 0, 0, 0);
    utc.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.floor(utc.getTime() / 86400000);
  }

  function nextWeekday(date) {
    const next = new Date(date.getTime());
    do { next.setDate(next.getDate() + 1); } while (!isWeekday(next));
    return next;
  }

  function occurrenceAt(start, rule, steps, anchorDay) {
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
      const target = dateInMonth(start.getFullYear(), start.getMonth() + steps, 1);
      const day = Math.min(anchorDay || start.getDate(), daysInMonth(target.getFullYear(), target.getMonth()));
      return dateInMonth(target.getFullYear(), target.getMonth(), day);
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
      const day = Math.min(anchorDay || start.getDate(), daysInMonth(year, start.getMonth()));
      return dateInMonth(year, start.getMonth(), day);
    }
    return null;
  }

  // Completion schedules the first recurrence strictly AFTER today. Arithmetic
  // jumps directly to the relevant day/week/month/year instead of iterating a
  // fixed 10-year guard; weekday rules need at most one week of stepping.
  function nextDueDate(dueDate, repeatRule, today, repeatDayOfMonth) {
    if (!isRepeat(repeatRule) || repeatRule === null || repeatRule === undefined) return null;
    const start = parseDateOnly(dueDate);
    if (!start) return null;
    const todayStart = parseDateOnly(today);
    const todayString = todayStart ? localDateOf(todayStart) : null;

    let anchorDay = start.getDate();
    if (repeatRule === 'monthly' || repeatRule === 'yearly') {
      if (repeatDayOfMonth !== undefined && repeatDayOfMonth !== null) {
        if (!Number.isInteger(repeatDayOfMonth) || repeatDayOfMonth < 1 || repeatDayOfMonth > 31) return null;
        anchorDay = repeatDayOfMonth;
      }
    }

    if (repeatRule === 'daily' || repeatRule === 'weekly') {
      let steps = 1;
      if (todayStart) {
        const difference = dayOrdinal(todayStart) - dayOrdinal(start);
        steps = repeatRule === 'daily'
          ? Math.max(1, difference + 1)
          : Math.max(1, Math.floor(difference / 7) + 1);
      }
      return localDateOf(occurrenceAt(start, repeatRule, steps, anchorDay));
    }

    if (repeatRule === 'weekdays') {
      const firstAfterStart = nextWeekday(start);
      if (!todayStart) return localDateOf(firstAfterStart);
      const firstAfterToday = nextWeekday(todayStart);
      return localDateOf(firstAfterToday) > localDateOf(firstAfterStart)
        ? localDateOf(firstAfterToday)
        : localDateOf(firstAfterStart);
    }

    if (repeatRule === 'monthly') {
      let steps = 1;
      if (todayStart) {
        const monthDifference = (todayStart.getFullYear() - start.getFullYear()) * 12
          + todayStart.getMonth() - start.getMonth();
        steps = Math.max(1, monthDifference);
        if (steps === monthDifference
            && localDateOf(occurrenceAt(start, repeatRule, steps, anchorDay)) <= todayString) steps += 1;
      }
      return localDateOf(occurrenceAt(start, repeatRule, steps, anchorDay));
    }

    if (repeatRule === 'yearly') {
      let steps = 1;
      if (todayStart) {
        const yearDifference = todayStart.getFullYear() - start.getFullYear();
        steps = Math.max(1, yearDifference);
        if (steps === yearDifference
            && localDateOf(occurrenceAt(start, repeatRule, steps, anchorDay)) <= todayString) steps += 1;
      }
      return localDateOf(occurrenceAt(start, repeatRule, steps, anchorDay));
    }
    return null;
  }

  const api = { REPEATS, isRepeat, nextDueDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkRepeat = api;
})(globalThis);
