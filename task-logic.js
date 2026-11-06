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
  const MIN_ESTIMATED_MINUTES = 1;
  const MAX_ESTIMATED_MINUTES = 480;

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

  function isReminderLead(value) {
    return value === null || REMINDER_LEADS.includes(value);
  }

  function isValidSubtasks(subtasks) {
    if (!Array.isArray(subtasks) || subtasks.length > MAX_SUBTASKS) return false;
    const ids = new Set();
    return subtasks.every((subtask) => Boolean(subtask && typeof subtask === 'object'
      && typeof subtask.id === 'string' && subtask.id.trim().length > 0 && !ids.has(subtask.id) && ids.add(subtask.id)
      && typeof subtask.title === 'string' && subtask.title.trim().length > 0
      && subtask.title.trim().length <= MAX_SUBTASK_TITLE
      && typeof subtask.done === 'boolean'));
  }


  function isValidEstimatedMinutes(value) {
    return value === undefined || value === null
      || (typeof value === 'number' && Number.isInteger(value)
          && value >= MIN_ESTIMATED_MINUTES && value <= MAX_ESTIMATED_MINUTES);
  }

  function isTag(value) {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,23}$/.test(value);
  }

  function isValidTags(tags) {
    if (!Array.isArray(tags) || tags.length > MAX_TAGS) return false;
    const seen = new Set();
    return tags.every((tag) => isTag(tag) && !seen.has(tag) && seen.add(tag));
  }

  function normalizeTags(tags) {
    if (!Array.isArray(tags)) return [];
    const normalized = [];
    for (const raw of tags) {
      if (typeof raw !== 'string') throw new Error('Tags are malformed.');
      const tag = raw.trim().toLowerCase().replace(/ /g, '-');
      if (!isTag(tag)) throw new Error('Tags can use letters, numbers, hyphens, and underscores.');
      if (!normalized.includes(tag)) normalized.push(tag);
    }
    if (normalized.length > MAX_TAGS) throw new Error(`A task can have at most ${MAX_TAGS} tags.`);
    return normalized;
  }

  function isValidTask(task) {
    return Boolean(task && typeof task === 'object'
      && typeof task.id === 'string' && task.id.length > 0
      && typeof task.title === 'string' && task.title.trim().length > 0
      && task.title.trim().length <= 160
      && (task.dueDate === null || isDateOnly(task.dueDate))
      && ['low', 'medium', 'high'].includes(task.priority)
      && typeof task.completed === 'boolean'
      && typeof task.createdAt === 'string' && !Number.isNaN(Date.parse(task.createdAt))
      && typeof task.updatedAt === 'string' && !Number.isNaN(Date.parse(task.updatedAt))
      && (task.notes === undefined || (typeof task.notes === 'string' && task.notes.length <= MAX_NOTES_CHARS))
      && (task.dueTime === undefined || task.dueTime === null
        || (isTimeOnly(task.dueTime) && task.dueDate !== null && isDateOnly(task.dueDate)))
      && (task.reminderLeadMinutes === undefined || isReminderLead(task.reminderLeadMinutes))
      && (task.reminderShownFire === undefined || task.reminderShownFire === null
        || (typeof task.reminderShownFire === 'string' && !Number.isNaN(Date.parse(task.reminderShownFire))))
      && (task.subtasks === undefined || isValidSubtasks(task.subtasks))
      && (task.tags === undefined || task.tags === null || isValidTags(task.tags))
      && isValidEstimatedMinutes(task.estimatedMinutes));
  }

  function validateStoredTasks(value) {
    if (!Array.isArray(value)) return { tasks: [], rejectedCount: 1 };
    const seenIds = new Set();
    const tasks = [];
    let rejectedCount = 0;
    for (const task of value) {
      if (!isValidTask(task) || seenIds.has(task.id)) {
        rejectedCount += 1;
        continue;
      }
      seenIds.add(task.id);
      tasks.push(task);
    }
    return { tasks, rejectedCount };
  }

  function dueTimeOf(task) {
    return typeof task.dueTime === 'string' ? task.dueTime : null;
  }

  function compareTasks(a, b) {
    if (a.dueDate === null && b.dueDate !== null) return 1;
    if (a.dueDate !== null && b.dueDate === null) return -1;
    if (a.dueDate !== b.dueDate) return (a.dueDate || '').localeCompare(b.dueDate || '');
    const timeA = dueTimeOf(a);
    const timeB = dueTimeOf(b);
    if (timeA === null && timeB !== null) return 1;
    if (timeA !== null && timeB === null) return -1;
    if (timeA !== timeB) return (timeA || '').localeCompare(timeB || '');
    return (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
      || a.createdAt.localeCompare(b.createdAt);
  }

  function getFilteredTasks(tasks, filter, query, today) {
    const normalizedQuery = (query || '').trim().toLowerCase();
    return tasks.filter((task) => {
      if (filter === 'completed') return task.completed;
      if (task.completed) return false;
      if (filter === 'today') return task.dueDate === today;
      if (filter === 'overdue') return task.dueDate && task.dueDate < today;
      if (filter === 'upcoming') return task.dueDate && task.dueDate > today;
      if (filter === 'undated') return !task.dueDate;
      return true;
    }).filter((task) => {
      if (!normalizedQuery) return true;
      const haystack = `${task.title} ${task.notes || ''} ${(task.tags || []).join(' ')}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    }).slice().sort(compareTasks);
  }

  function suggestionReason(task, today, formatDate) {
    const estimate = (typeof task.estimatedMinutes === 'number') ? ` · ~${task.estimatedMinutes}m` : '';
    if (task.dueDate && task.dueDate < today) return `Overdue · ${formatDate(task.dueDate)} · ${task.priority} priority${estimate}`;
    if (task.dueDate === today) return `Due today · ${task.priority} priority${estimate}`;
    if (task.dueDate) return `Due ${formatDate(task.dueDate)} · ${task.priority} priority${estimate}`;
    return `No due date · ${task.priority} priority${estimate}`;
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
        || a.createdAt.localeCompare(b.createdAt);
    }).slice(0, 3).map((task) => ({ task, reason: suggestionReason(task, today, formatDate) }));
  }

  const api = {
    localDateString,
    isDateOnly,
    isTimeOnly,
    isReminderLead,
    isValidSubtasks,
    isValidTags,
    normalizeTags,
    isTag,
    isValidTask,
    isValidEstimatedMinutes,
    validateStoredTasks,
    getFilteredTasks,
    getSuggestions,
    MAX_NOTES_CHARS,
    MAX_SUBTASKS,
    MAX_SUBTASK_TITLE,
    REMINDER_LEADS,
    MAX_TAGS,
    MAX_TAG_CHARS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DaymarkTaskLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
