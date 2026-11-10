/*
 * Daymark open-format task export (Markdown / CSV / iCalendar).
 *
 * Pure offline logic shared by the web prototype and mirrored by the Android
 * host (TaskOpenExport.java). Task timestamps use the shared task-logic instant
 * validator/comparator; the export fixture pins byte-for-byte output parity.
 *
 * Everything here is offline: no network, no storage, no DOM.
 */
((root) => {
  'use strict';

  const FORMATS = ['markdown', 'csv', 'ics'];
  const MAX_EXPORT_CHARS = 2000000; // UTF-16 code units, identical to Java String.length()
  const ICS_LINE_OCTETS = 75; // RFC 5545 folding limit, counted in UTF-8 octets
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  const PRIORITIES = ['low', 'medium', 'high'];
  const REPEAT_RULES = ['daily', 'weekly', 'monthly', 'weekdays', 'yearly'];
  const CSV_HEADER = 'id,title,dueDate,dueTime,priority,completed,repeat,tags,notes,subtasks,createdAt,updatedAt,repeatDayOfMonth';
  const taskLogic = root.DaymarkLogic || (typeof module !== 'undefined' && module.exports ? require('./task-logic.js') : null);

  function isValidTaskInstant(value) {
    return Boolean(taskLogic && typeof taskLogic.isValidInstant === 'function'
      && taskLogic.isValidInstant(value));
  }

  function compareTaskInstants(left, right) {
    if (!taskLogic || typeof taskLogic.compareInstants !== 'function') {
      throw new Error('Shared task instant logic is unavailable.');
    }
    return taskLogic.compareInstants(left, right);
  }

  function isFormat(value) {
    return FORMATS.indexOf(value) !== -1;
  }

  function isDateOnly(value) {
    if (typeof value !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parts = value.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  }

  function isTimeOnly(value) {
    if (typeof value !== 'string') return false;
    if (!/^\d{2}:\d{2}$/.test(value)) return false;
    const parts = value.split(':');
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  }

  function normalizeRepeatMetadata(task, dueDate) {
    const repeat = task.repeat === undefined || task.repeat === null || task.repeat === ''
      ? null : task.repeat;
    const hasAnchor = task.repeatDayOfMonth !== undefined && task.repeatDayOfMonth !== null;
    if (repeat === null) {
      if (hasAnchor) throw new Error('Export repeatDayOfMonth requires a monthly or yearly repeat rule.');
      return { repeat: null, repeatDayOfMonth: null };
    }
    if (!REPEAT_RULES.includes(repeat) || dueDate === null) {
      throw new Error('Export repeat rule must be supported and requires a valid due date.');
    }
    if (repeat === 'monthly' || repeat === 'yearly') {
      const anchor = hasAnchor ? task.repeatDayOfMonth : Number(dueDate.slice(8));
      if (!Number.isInteger(anchor) || anchor < 1 || anchor > 31) {
        throw new Error('Export repeatDayOfMonth must be an integer from 1 to 31.');
      }
      if (repeat === 'yearly') {
        const [year, month, day] = dueDate.split('-').map(Number);
        const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        if (day !== anchor && !(month === 2 && day === 28 && anchor === 29 && !leapYear)) {
          throw new Error('Export yearly repeatDayOfMonth must match the due date, except a clamped February 29.');
        }
      }
      return { repeat, repeatDayOfMonth: anchor };
    }
    if (hasAnchor) throw new Error('Export repeatDayOfMonth is only valid for monthly or yearly rules.');
    return { repeat, repeatDayOfMonth: null };
  }

  function hasLoneSurrogate(value) {
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
        if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
        i += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        return true;
      }
    }
    return false;
  }

  function requireCleanText(value, field) {
    if (typeof value !== 'string') {
      throw new Error('Export field "' + field + '" must be a string.');
    }
    if (hasLoneSurrogate(value)) {
      throw new Error('Export field "' + field + '" contains a lone surrogate.');
    }
  }

  function normalizeTask(task) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      throw new Error('Export requires plain task objects.');
    }
    requireCleanText(task.id, 'id');
    if (task.id.length === 0) throw new Error('Export task id must not be empty.');
    requireCleanText(task.title, 'title');
    if (task.title.trim().length === 0) throw new Error('Export task title must not be blank.');
    const dueDate = task.dueDate === undefined || task.dueDate === null ? null : task.dueDate;
    if (dueDate !== null) {
      if (!isDateOnly(dueDate)) throw new Error('Export task dueDate "' + dueDate + '" is not a YYYY-MM-DD date.');
    }
    const dueTime = task.dueTime === undefined || task.dueTime === null || task.dueTime === '' ? null : task.dueTime;
    if (dueTime !== null && !isTimeOnly(dueTime)) {
      throw new Error('Export task dueTime "' + dueTime + '" is not an HH:mm time.');
    }
    if (PRIORITIES.indexOf(task.priority) === -1) {
      throw new Error('Export task priority "' + task.priority + '" must be low, medium or high.');
    }
    if (typeof task.completed !== 'boolean') {
      throw new Error('Export task completed flag must be a boolean.');
    }
    requireCleanText(task.createdAt, 'createdAt');
    if (!isValidTaskInstant(task.createdAt)) {
      throw new Error('Export task createdAt "' + task.createdAt + '" is not a parseable instant.');
    }
    requireCleanText(task.updatedAt === undefined || task.updatedAt === null ? task.createdAt : task.updatedAt, 'updatedAt');
    const updatedAt = task.updatedAt === undefined || task.updatedAt === null ? task.createdAt : task.updatedAt;
    if (!isValidTaskInstant(updatedAt)) {
      throw new Error('Export task updatedAt "' + updatedAt + '" is not a parseable instant.');
    }
    if (task.reminderShownFire !== undefined && task.reminderShownFire !== null
        && !isValidTaskInstant(task.reminderShownFire)) {
      throw new Error('Export task reminderShownFire is not a valid task instant.');
    }
    const notes = typeof task.notes === 'string' ? task.notes : '';
    requireCleanText(notes, 'notes');
    const repeatMetadata = normalizeRepeatMetadata(task, dueDate);
    const rawTags = task.tags === undefined || task.tags === null ? [] : task.tags;
    if (!Array.isArray(rawTags)) throw new Error('Export task tags must be an array.');
    const tags = rawTags.map((tag) => {
      requireCleanText(tag, 'tags');
      return tag;
    });
    const rawSubtasks = task.subtasks === undefined || task.subtasks === null ? [] : task.subtasks;
    if (!Array.isArray(rawSubtasks)) throw new Error('Export task subtasks must be an array.');
    const subtasks = rawSubtasks.map((sub) => {
      if (!sub || typeof sub !== 'object') throw new Error('Export subtasks must be objects.');
      requireCleanText(sub.id, 'subtasks.id');
      requireCleanText(sub.title, 'subtasks.title');
      if (typeof sub.done !== 'boolean') throw new Error('Export subtask done flag must be a boolean.');
      return { id: sub.id, title: sub.title, done: sub.done };
    });
    return {
      id: task.id,
      title: task.title,
      dueDate,
      dueTime,
      priority: task.priority,
      completed: task.completed,
      createdAt: task.createdAt,
      updatedAt,
      notes,
      repeat: repeatMetadata.repeat,
      repeatDayOfMonth: repeatMetadata.repeatDayOfMonth,
      tags,
      subtasks
    };
  }

  function validateExportTasks(tasks) {
    if (!Array.isArray(tasks)) throw new Error('Export requires an array of tasks.');
    return tasks.map(normalizeTask);
  }

  function compareTasks(a, b) {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.dueDate === null && b.dueDate !== null) return 1;
    if (a.dueDate !== null && b.dueDate === null) return -1;
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    if (a.dueTime === null && b.dueTime !== null) return 1;
    if (a.dueTime !== null && b.dueTime === null) return -1;
    if (a.dueTime !== b.dueTime) return a.dueTime < b.dueTime ? -1 : 1;
    const rankA = PRIORITY_RANK[a.priority];
    const rankB = PRIORITY_RANK[b.priority];
    if (rankA !== rankB) return rankA - rankB;
    const createdOrder = compareTaskInstants(a.createdAt, b.createdAt);
    if (createdOrder !== 0) return createdOrder;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  }

  function sortTasks(tasks) {
    return validateExportTasks(tasks).slice().sort(compareTasks);
  }

  function enforceCap(text) {
    if (text.length > MAX_EXPORT_CHARS) {
      throw new Error('Export output exceeds the safe size limit of ' + MAX_EXPORT_CHARS + ' characters.');
    }
    return text;
  }

  function requireGeneratedAt(meta) {
    const generatedAt = meta && typeof meta.generatedAt === 'string' ? meta.generatedAt : null;
    if (generatedAt === null || Number.isNaN(Date.parse(generatedAt))) {
      throw new Error('Export meta.generatedAt must be a parseable ISO instant.');
    }
    return generatedAt;
  }

  function mdEscape(text) {
    return text.replace(/\\/g, '\\\\').replace(/\*/g, '\\*');
  }

  function toMarkdown(tasks, meta) {
    const generatedAt = requireGeneratedAt(meta);
    const sorted = sortTasks(tasks);
    const blocks = sorted.map((task) => {
      const box = task.completed ? '[x]' : '[ ]';
      const parts = [];
      if (task.dueDate) {
        parts.push('due ' + task.dueDate + (task.dueTime ? ' ' + task.dueTime : ''));
      }
      parts.push(task.priority + ' priority');
      if (task.repeat) parts.push('repeats ' + task.repeat);
      if (task.repeatDayOfMonth !== null) {
        const dueDay = Number(task.dueDate.slice(8));
        if (task.repeatDayOfMonth !== dueDay) parts.push('repeat day ' + task.repeatDayOfMonth);
      }
      for (const tag of task.tags) parts.push('#' + tag);
      const lines = ['- ' + box + ' **' + mdEscape(task.title) + '** · ' + parts.join(' · ')];
      if (task.notes) {
        for (const noteLine of task.notes.split('\n')) lines.push('  ' + noteLine);
      }
      for (const sub of task.subtasks) {
        lines.push('  - ' + (sub.done ? '[x]' : '[ ]') + ' ' + mdEscape(sub.title));
      }
      return lines.join('\n');
    });
    let out = '# Daymark tasks\n_Exported ' + generatedAt + ' · ' + sorted.length +
      ' task' + (sorted.length === 1 ? '' : 's') + '_\n';
    if (blocks.length > 0) out += '\n' + blocks.join('\n\n') + '\n';
    return enforceCap(out);
  }

  function csvQuote(value) {
    if (/[",\r\n]/.test(value)) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  // Matches JSON.stringify escaping for the subset of characters that can
  // appear here (validated input, no lone surrogates).
  function jsonStringEscape(value) {
    let out = '"';
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code === 0x22) out += '\\"';
      else if (code === 0x5c) out += '\\\\';
      else if (code === 0x08) out += '\\b';
      else if (code === 0x09) out += '\\t';
      else if (code === 0x0a) out += '\\n';
      else if (code === 0x0c) out += '\\f';
      else if (code === 0x0d) out += '\\r';
      else if (code < 0x20) {
        out += '\\u';
        const hex = code.toString(16);
        for (let p = hex.length; p < 4; p += 1) out += '0';
        out += hex;
      } else {
        out += value.charAt(i);
      }
    }
    return out + '"';
  }

  function subtasksJson(subtasks) {
    return '[' + subtasks.map((sub) =>
      '{"id":' + jsonStringEscape(sub.id) +
      ',"title":' + jsonStringEscape(sub.title) +
      ',"done":' + (sub.done ? 'true' : 'false') + '}'
    ).join(',') + ']';
  }

  function toCsv(tasks, meta) {
    requireGeneratedAt(meta); // metadata is required even though CSV ignores it
    const rows = [CSV_HEADER];
    for (const task of sortTasks(tasks)) {
      rows.push([
        task.id,
        task.title,
        task.dueDate === null ? '' : task.dueDate,
        task.dueTime === null ? '' : task.dueTime,
        task.priority,
        task.completed ? 'true' : 'false',
        task.repeat === null ? '' : task.repeat,
        task.tags.join(' '),
        task.notes,
        subtasksJson(task.subtasks),
        task.createdAt,
        task.updatedAt,
        task.repeatDayOfMonth === null ? '' : String(task.repeatDayOfMonth)
      ].map(csvQuote).join(','));
    }
    return enforceCap(rows.join('\r\n') + '\r\n');
  }

  function icsEscapeText(text) {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n/g, '\\n')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\n');
  }

  function icsDateStamp(generatedAt) {
    const ms = Date.parse(generatedAt);
    if (Number.isNaN(ms)) throw new Error('generatedAt must be a parseable ISO instant.');
    const d = new Date(ms);
    const pad2 = (n) => String(n).padStart(2, '0');
    const year = String(d.getUTCFullYear()).padStart(4, '0');
    return year + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) +
      'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z';
  }

  function utf8Octets(codePoint) {
    if (codePoint <= 0x7f) return 1;
    if (codePoint <= 0x7ff) return 2;
    if (codePoint <= 0xffff) return 3;
    return 4;
  }

  // RFC 5545 line folding: physical lines of at most 75 UTF-8 octets,
  // continuation lines start with a single space that counts toward the limit.
  // Iterates code points so a surrogate pair is never split.
  function foldLine(line) {
    const lines = [];
    let current = '';
    let count = 0;
    for (const ch of line) {
      const len = utf8Octets(ch.codePointAt(0));
      if (count + len > ICS_LINE_OCTETS) {
        lines.push(current);
        current = ' ';
        count = 1;
      }
      current += ch;
      count += len;
    }
    lines.push(current);
    return lines;
  }

  function icsDescription(task) {
    const lines = [];
    if (task.notes) {
      for (const noteLine of task.notes.split('\n')) lines.push(noteLine);
    }
    lines.push('Priority: ' + task.priority);
    if (task.repeat) lines.push('Repeats: ' + task.repeat);
    if (task.tags.length > 0) lines.push('Tags: ' + task.tags.map((t) => '#' + t).join(' '));
    if (task.subtasks.length > 0) {
      let doneCount = 0;
      for (const sub of task.subtasks) if (sub.done) doneCount += 1;
      lines.push('Checklist: ' + doneCount + '/' + task.subtasks.length + ' done');
      for (const sub of task.subtasks) {
        lines.push('- ' + (sub.done ? '[x] ' : '[ ] ') + sub.title);
      }
    }
    return lines.join('\n');
  }

  function toIcs(tasks, meta) {
    const generatedAt = requireGeneratedAt(meta);
    const stamp = icsDateStamp(generatedAt);
    const sorted = sortTasks(tasks);
    const logical = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Daymark//Task Export//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];
    for (const task of sorted) {
      logical.push('BEGIN:VEVENT');
      logical.push('UID:' + icsEscapeText(task.id) + '@daymark.export');
      logical.push('DTSTAMP:' + stamp);
      logical.push('SUMMARY:' + icsEscapeText(task.title));
      if (task.dueDate) {
        const day = task.dueDate.replace(/-/g, '');
        if (task.dueTime) {
          logical.push('DTSTART:' + day + 'T' + task.dueTime.replace(':', '') + '00');
        } else {
          logical.push('DTSTART;VALUE=DATE:' + day);
        }
      }
      logical.push('DESCRIPTION:' + icsEscapeText(icsDescription(task)));
      logical.push('STATUS:CONFIRMED');
      if (task.completed) logical.push('X-DAYMARK-COMPLETED:TRUE');
      logical.push('END:VEVENT');
    }
    logical.push('END:VCALENDAR');
    const physical = [];
    for (const line of logical) {
      for (const folded of foldLine(line)) physical.push(folded);
    }
    return enforceCap(physical.join('\r\n') + '\r\n');
  }

  function render(format, tasks, meta) {
    if (format === 'markdown') return toMarkdown(tasks, meta);
    if (format === 'csv') return toCsv(tasks, meta);
    if (format === 'ics') return toIcs(tasks, meta);
    throw new Error('Unsupported export format "' + format + '". Expected one of: ' + FORMATS.join(', ') + '.');
  }

  function extension(format) {
    if (format === 'markdown') return 'md';
    if (format === 'csv') return 'csv';
    if (format === 'ics') return 'ics';
    throw new Error('Unsupported export format "' + format + '".');
  }

  function mimeType(format) {
    if (format === 'markdown') return 'text/markdown;charset=utf-8';
    if (format === 'csv') return 'text/csv;charset=utf-8';
    if (format === 'ics') return 'text/calendar;charset=utf-8';
    throw new Error('Unsupported export format "' + format + '".');
  }

  function fileName(format, dateStr) {
    const stamp = typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : 'undated';
    return 'daymark-tasks-' + stamp + '.' + extension(format);
  }

  const api = {
    FORMATS,
    MAX_EXPORT_CHARS,
    ICS_LINE_OCTETS,
    CSV_HEADER,
    isFormat,
    isDateOnly,
    isTimeOnly,
    validateExportTasks,
    sortTasks,
    compareTasks,
    toMarkdown,
    toCsv,
    toIcs,
    render,
    extension,
    mimeType,
    fileName,
    // exposed for unit tests and host parity checks
    mdEscape,
    csvQuote,
    icsEscapeText,
    icsDateStamp,
    foldLine,
    utf8Octets,
    subtasksJson,
    jsonStringEscape,
    enforceCap
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
