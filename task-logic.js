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
      if (!tag) continue;
      if (tag.length > MAX_TAG_CHARS) throw new Error(`Tags can be at most ${MAX_TAG_CHARS} characters.`);
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
      && (task.tags === undefined || task.tags === null || isValidTags(task.tags)));
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
      || a.createdAt.localeCompare(b.createdAt);
  }

  function getFilteredTasks(tasks, filter, query, today) {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    return tasks.filter((task) => {
      if (filter === 'completed' && !task.completed) return false;
      if (filter === 'today' && task.dueDate !== today) return false;
      if (filter === 'upcoming' && !(task.dueDate !== null && task.dueDate > today)) return false;
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
        || a.createdAt.localeCompare(b.createdAt);
    }).slice(0, 3).map((task) => ({ task, reason: suggestionReason(task, today, formatDate) }));
  }


  // Detect duplicate JSON object member names before JSON.parse can silently
  // keep the last value. Invalid JSON remains the caller's parse error; excessive
  // nesting is rejected here so hostile inputs cannot exhaust the call stack.
  function hasDuplicateJsonKeys(raw) {
    if (typeof raw !== 'string') return false;
    let index = 0;
    let duplicate = false;
    let tooDeep = false;
    const literalPattern = /(?:true|false|null)/y;
    const numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    const whitespace = () => {
      while (index < raw.length) {
        const character = raw[index];
        if (character !== ' ' && character !== '\t' && character !== '\r' && character !== '\n') break;
        index += 1;
      }
    };
    const readString = () => {
      const start = index;
      index += 1;
      while (index < raw.length) {
        const character = raw[index];
        if (character === '\\') {
          if (index + 1 >= raw.length) throw new Error('incomplete JSON escape');
          index += 2;
          continue;
        }
        if (character === '"') {
          index += 1;
          return JSON.parse(raw.slice(start, index));
        }
        if (character.charCodeAt(0) < 0x20) throw new Error('invalid JSON string');
        index += 1;
      }
      throw new Error('unterminated JSON string');
    };
    const readValue = (depth) => {
      if (depth > 128) {
        tooDeep = true;
        throw new Error('JSON nesting limit exceeded');
      }
      whitespace();
      const character = raw[index];
      if (character === '"') {
        readString();
        return;
      }
      if (character === '{') {
        index += 1;
        whitespace();
        if (raw[index] === '}') {
          index += 1;
          return;
        }
        const keys = new Set();
        for (;;) {
          whitespace();
          if (raw[index] !== '"') throw new Error('invalid JSON object key');
          const key = readString();
          if (keys.has(key)) duplicate = true;
          keys.add(key);
          whitespace();
          if (raw[index] !== ':') throw new Error('missing JSON object colon');
          index += 1;
          readValue(depth + 1);
          whitespace();
          if (raw[index] === '}') {
            index += 1;
            return;
          }
          if (raw[index] !== ',') throw new Error('invalid JSON object separator');
          index += 1;
        }
      }
      if (character === '[') {
        index += 1;
        whitespace();
        if (raw[index] === ']') {
          index += 1;
          return;
        }
        for (;;) {
          readValue(depth + 1);
          whitespace();
          if (raw[index] === ']') {
            index += 1;
            return;
          }
          if (raw[index] !== ',') throw new Error('invalid JSON array separator');
          index += 1;
        }
      }
      literalPattern.lastIndex = index;
      if (literalPattern.exec(raw)) {
        index = literalPattern.lastIndex;
        return;
      }
      numberPattern.lastIndex = index;
      if (numberPattern.exec(raw)) {
        index = numberPattern.lastIndex;
        return;
      }
      throw new Error('invalid JSON value');
    };
    try {
      readValue(0);
      whitespace();
      return index === raw.length && (duplicate || tooDeep);
    } catch (error) {
      return tooDeep;
    }
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
    validateStoredTasks,
    hasDuplicateJsonKeys,
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
  root.DaymarkLogic = api;
})(globalThis);
