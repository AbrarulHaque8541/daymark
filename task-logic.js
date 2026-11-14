((root) => {
  'use strict';

  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

  function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const MAX_NOTES_CHARS = 4000;
  const MAX_SUBTASKS = 20;
  const MAX_SUBTASK_TITLE = 120;
  const REMINDER_LEADS = [0, 30, 60, 1440];
  const MAX_TAGS = 5;
  const MAX_TAG_CHARS = 24;

  function isDateOnly(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(0);
    parsed.setHours(0, 0, 0, 0);
    parsed.setFullYear(year, month - 1, day);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
  }

  function isTimeOnly(value) {
    if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
    const [hour, minute] = value.split(':').map(Number);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
      && value === `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  /**
   * Shared Java Instant-compatible contract for web and Android task records.
   * Java Instant.parse's leap-second normalization is supported only at 23:59:60.
   */
  const TASK_INSTANT_PATTERN = /^([+-]?[0-9]{4,10})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,9}))?(Z|[+-][0-9]{2}:[0-9]{2}(?::[0-9]{2})?)$/;

  // Java Instant supports signed expanded years. Keep epoch days and time-of-day
  // separate so ordering stays exact without Date's limited year range or BigInt.
  function daysFromCivil(year, month, day) {
    const adjustedYear = year - (month <= 2 ? 1 : 0);
    const era = Math.floor(adjustedYear / 400);
    const yearOfEra = adjustedYear - era * 400;
    const monthPrime = month + (month > 2 ? -3 : 9);
    const dayOfYear = Math.floor((153 * monthPrime + 2) / 5) + day - 1;
    const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4)
      - Math.floor(yearOfEra / 100) + dayOfYear;
    return era * 146097 + dayOfEra - 719468;
  }

  const MIN_INSTANT_EPOCH_DAY = daysFromCivil(-1000000000, 1, 1);
  const MAX_INSTANT_EPOCH_DAY = daysFromCivil(1000000000, 12, 31);

  function parseTaskInstant(value) {
    if (typeof value !== 'string') return null;
    const match = TASK_INSTANT_PATTERN.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const fraction = match[7] || '';
    const offset = match[8];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    if (hour > 23 || minute > 59 || (second > 59 && !(hour === 23 && minute === 59 && second === 60))) return null;
    const epochDay = daysFromCivil(year, month, day);
    if (epochDay < MIN_INSTANT_EPOCH_DAY || epochDay > MAX_INSTANT_EPOCH_DAY) return null;
    if (!isDateOnly(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)) return null;
    let secondOfDay = hour * 3600 + minute * 60 + second;
    if (second === 60) secondOfDay -= 1; // leap second normalization
    if (offset === 'Z') {
      return { epochDay, secondOfDay, fraction };
    }
    const sign = offset[0] === '-' ? -1 : 1;
    const offsetHour = Number(offset.slice(1, 3));
    const offsetMinute = Number(offset.slice(4, 6));
    const offsetSecond = offset.length >= 9 ? Number(offset.slice(7, 9)) : 0;
    if (offsetHour > 18 || offsetMinute > 59 || offsetSecond > 59
        || (offsetHour === 18 && (offsetMinute !== 0 || offsetSecond !== 0))) return null;
    const magnitude = offsetHour * 3600 + offsetMinute * 60 + offsetSecond;
    secondOfDay -= sign * magnitude;
    let adjustedDay = epochDay;
    if (secondOfDay < 0) {
      adjustedDay -= 1;
      secondOfDay += 86400;
    } else if (secondOfDay >= 86400) {
      adjustedDay += 1;
      secondOfDay -= 86400;
    }
    if (adjustedDay < MIN_INSTANT_EPOCH_DAY || adjustedDay > MAX_INSTANT_EPOCH_DAY) return null;
    return { epochDay: adjustedDay, secondOfDay, fraction };
  }

  function compareInstants(a, b) {
    const parsedA = parseTaskInstant(a);
    const parsedB = parseTaskInstant(b);
    if (!parsedA || !parsedB) return 0;
    if (parsedA.epochDay !== parsedB.epochDay) return parsedA.epochDay - parsedB.epochDay;
    if (parsedA.secondOfDay !== parsedB.secondOfDay) return parsedA.secondOfDay - parsedB.secondOfDay;
    return parsedA.fraction.localeCompare(parsedB.fraction);
  }

  function isValidTask(task) {
    return task && typeof task === 'object'
      && typeof task.id === 'string' && task.id.length > 0
      && typeof task.title === 'string' && task.title.trim().length > 0 && task.title.length <= 160
      && (task.dueDate === null || isDateOnly(task.dueDate))
      && (task.dueTime === null || task.dueTime === undefined || isTimeOnly(task.dueTime))
      && ['low', 'medium', 'high'].includes(task.priority)
      && typeof task.completed === 'boolean'
      && typeof task.createdAt === 'string' && parseTaskInstant(task.createdAt)
      && typeof task.updatedAt === 'string' && parseTaskInstant(task.updatedAt)
      && (task.notes === undefined || (typeof task.notes === 'string' && task.notes.length <= MAX_NOTES_CHARS))
      && (task.subtasks === undefined || (Array.isArray(task.subtasks) && task.subtasks.length <= MAX_SUBTASKS
          && task.subtasks.every((sub) => sub && typeof sub.title === 'string' && sub.title.length <= MAX_SUBTASK_TITLE && typeof sub.done === 'boolean')))
      && (task.tags === undefined || (Array.isArray(task.tags) && task.tags.length <= MAX_TAGS
          && task.tags.every((tag) => typeof tag === 'string' && tag.length <= MAX_TAG_CHARS)))
      && (task.reminderLead === undefined || REMINDER_LEADS.includes(task.reminderLead));
  }

  function validateStoredTasks(raw) {
    if (!Array.isArray(raw)) return { tasks: [], rejectedCount: 1 };
    const seenIds = new Set();
    const tasks = [];
    let rejectedCount = 0;
    for (const item of raw) {
      if (!isValidTask(item) || seenIds.has(item.id)) {
        rejectedCount += 1;
        continue;
      }
      seenIds.add(item.id);
      tasks.push(item);
    }
    return { tasks, rejectedCount };
  }

  function dueTimeOf(task) {
    return isTimeOnly(task.dueTime) ? task.dueTime : null;
  }

  function compareTasks(a, b) {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.dueDate === null && b.dueDate !== null) return 1;
    if (a.dueDate !== null && b.dueDate === null) return -1;
    if (a.dueDate !== b.dueDate) return (a.dueDate || '').localeCompare(b.dueDate || '');
    const timeA = dueTimeOf(a);
    const timeB = dueTimeOf(b);
    if (timeA === null && timeB !== null) return 1;
    if (timeA !== null && timeB === null) return -1;
    if (timeA !== timeB) return (timeA || '').localeCompare(timeB || '');
    return (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
      || compareInstants(a.createdAt, b.createdAt);
  }

  function getFilteredTasks(tasks, filter, query, today) {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    return tasks.filter((task) => {
      if (filter === 'completed' && !task.completed) return false;
      if (filter === 'today' && task.dueDate !== today) return false;
      if (filter === 'upcoming' && !(task.dueDate !== null && task.dueDate > today)) return false;
      if (filter === 'high' && task.priority !== 'high') return false;
      if (!normalizedQuery) return true;
      const notes = typeof task.notes === 'string' ? task.notes.toLowerCase() : '';
      const tags = Array.isArray(task.tags) ? task.tags.join(' ').toLowerCase() : '';
      return task.title.toLowerCase().includes(normalizedQuery) || notes.includes(normalizedQuery)
        || tags.includes(normalizedQuery);
    }).slice().sort(compareTasks);
  }

  function suggestionReason(task, today, formatDate) {
    if (task.dueDate && task.dueDate < today) return `Overdue · ${formatDate(task.dueDate)} · ${task.priority} priority`;
    if (task.dueDate === today) return `Due today · ${task.priority} priority`;
    if (task.dueDate) return `Due ${formatDate(task.dueDate)} · ${task.priority} priority`;
    return `No due date · ${task.priority} priority`;
  }

  function getSuggestions(tasks, today, formatDate) {
    return tasks.filter((task) => !task.completed).slice().sort((a, b) => {
      if (a.dueDate === null && b.dueDate !== null) return 1;
      if (a.dueDate !== null && b.dueDate === null) return -1;
      if (a.dueDate !== b.dueDate) return (a.dueDate || '').localeCompare(b.dueDate || '');
      const timeA = dueTimeOf(a);
      const timeB = dueTimeOf(b);
      if (timeA === null && timeB !== null) return 1;
      if (timeA !== null && timeB === null) return -1;
      if (timeA !== timeB) return (timeA || '').localeCompare(timeB || '');
      return (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
        || compareInstants(a.createdAt, b.createdAt);
    }).slice(0, 3).map((task) => ({
      id: task.id,
      title: task.title,
      reason: suggestionReason(task, today, formatDate)
    }));
  }

  const api = {
    localDateString,
    isDateOnly,
    isTimeOnly,
    isValidTask,
    validateStoredTasks,
    getFilteredTasks,
    getSuggestions,
    compareTasks,
    parseTaskInstant,
    compareInstants
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DaymarkTaskLogic = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
