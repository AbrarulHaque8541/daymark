/*
 * Daymark open-format task import (CSV / Markdown / iCalendar).
 *
 * Counterpart of export-logic.js: parses Daymark's own open-format exports
 * back into stored tasks, accepts hand-written CSV with the same header, and
 * imports task-shaped VTODO/VEVENT components from RFC 5545 iCalendar
 * (.ics) files such as Google Calendar or Apple Calendar exports.
 * Pure, dependency-free: no network, no storage, no DOM. mergeTasks
 * validates through an injected task-logic so imported tasks must be exactly
 * as valid as stored ones. Lenient with foreign data, strict about the
 * invariants that matter (non-blank title, valid dates, safe sizes).
 */
((root) => {
  'use strict';

  const FORMATS = ['csv', 'markdown', 'ics'];
  const CSV_HEADER = 'id,title,dueDate,dueTime,priority,completed,repeat,tags,notes,subtasks,createdAt,updatedAt';
  const PRIORITIES = ['low', 'medium', 'high'];
  const REPEATS = ['daily', 'weekly', 'monthly', 'weekdays', 'yearly'];
  const MAX_IMPORT_CHARS = 2000000; // UTF-16 code units, mirrors the export cap
  const MAX_TITLE_CHARS = 160;
  const MAX_NOTES_CHARS = 4000;
  const MAX_TAGS = 5;
  const MAX_SUBTASKS = 20;
  const MAX_SUBTASK_TITLE = 120;

  function isFormat(value) {
    return FORMATS.indexOf(value) !== -1;
  }

  function isCsvFileName(name) {
    return typeof name === 'string' && /[.]csv$/i.test(name);
  }

  function isMarkdownFileName(name) {
    return typeof name === 'string' && /[.](md|markdown)$/i.test(name);
  }

  function isIcsFileName(name) {
    return typeof name === 'string' && /[.]ics$/i.test(name);
  }

  // null means "not an open-format import" and the JSON backup handler stays
  // in charge.
  function formatFromFileName(name) {
    if (isCsvFileName(name)) return 'csv';
    if (isMarkdownFileName(name)) return 'markdown';
    if (isIcsFileName(name)) return 'ics';
    return null;
  }

  function isDateOnly(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parts = value.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  }

  function isTimeOnly(value) {
    if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
    const parts = value.split(':');
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  }

  function isTag(value) {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,23}$/.test(value);
  }

  function requireString(text) {
    if (typeof text !== 'string') throw new Error('Import input must be a string.');
    if (text.length > MAX_IMPORT_CHARS) {
      throw new Error('Import exceeds the safe size limit of ' + MAX_IMPORT_CHARS + ' characters.');
    }
    return text;
  }

  // Minimal RFC 4180-style parser: quoted fields, "" escapes, CR, LF and
  // CRLF row ends. Blank rows are dropped. Throws on an unterminated quote.
  function parseCsv(text) {
    requireString(text);
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    function pushField() { row.push(field); field = ''; }
    function pushRow() {
      pushField();
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    }
    while (i < text.length) {
      const ch = text.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i += 1; continue;
        }
        field += ch; i += 1; continue;
      }
      if (ch === '"') { inQuotes = true; i += 1; continue; }
      if (ch === ',') { pushField(); i += 1; continue; }
      if (ch === '\r') { if (text.charAt(i + 1) === '\n') i += 1; pushRow(); i += 1; continue; }
      if (ch === '\n') { pushRow(); i += 1; continue; }
      field += ch; i += 1;
    }
    if (inQuotes) throw new Error('CSV input ends with an unterminated quoted field.');
    pushRow();
    return rows;
  }

  // Undoes export-logic mdEscape: backslash-escaped backslash or asterisk.
  function mdUnescape(text) {
    let out = '';
    for (let i = 0; i < text.length; i += 1) {
      if (text.charAt(i) === '\\' && (text.charAt(i + 1) === '\\' || text.charAt(i + 1) === '*')) {
        out += text.charAt(i + 1);
        i += 1;
        continue;
      }
      out += text.charAt(i);
    }
    return out;
  }

  function cleanTags(candidates) {
    const tags = [];
    for (const raw of candidates) {
      if (typeof raw !== 'string') continue;
      const tag = raw.trim().toLowerCase().replace(/ /g, '-');
      if (tag && isTag(tag) && tags.indexOf(tag) === -1) tags.push(tag);
      if (tags.length >= MAX_TAGS) break;
    }
    return tags;
  }

  function cleanSubtasks(raw, makeId) {
    if (!Array.isArray(raw)) return null;
    const subtasks = [];
    for (const sub of raw) {
      if (!sub || typeof sub !== 'object') continue;
      if (typeof sub.title !== 'string') continue;
      const title = sub.title.trim().slice(0, MAX_SUBTASK_TITLE);
      if (!title) continue;
      const id = typeof sub.id === 'string' && sub.id.trim() ? sub.id.trim() : makeId();
      subtasks.push({ id, title, done: sub.done === true });
      if (subtasks.length >= MAX_SUBTASKS) break;
    }
    return subtasks;
  }

  // Builds one stored-shape task from raw candidate fields. Returns null for
  // a row without a usable title; everything else is normalized leniently:
  // unknown priority -> medium, unknown repeat -> none, invalid dates ->
  // no due date, over-long text truncated to stored-task limits.
  function buildTask(raw, ctx) {
    const now = ctx && typeof ctx.now === 'string' ? ctx.now : new Date().toISOString();
    const makeId = ctx && typeof ctx.makeId === 'function'
      ? ctx.makeId
      : () => 'import-' + String(Date.parse(now)) + '-' + Math.random().toString(36).slice(2, 10);
    if (!raw || typeof raw !== 'object') return null;
    const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, MAX_TITLE_CHARS) : '';
    if (!title) return null;
    const dueDate = typeof raw.dueDate === 'string' && isDateOnly(raw.dueDate) ? raw.dueDate : null;
    const dueTime = dueDate !== null && typeof raw.dueTime === 'string' && isTimeOnly(raw.dueTime)
      ? raw.dueTime
      : null;
    const priorityRaw = typeof raw.priority === 'string' ? raw.priority.trim().toLowerCase() : '';
    const priority = PRIORITIES.indexOf(priorityRaw) !== -1 ? priorityRaw : 'medium';
    const completedRaw = typeof raw.completed === 'boolean'
      ? raw.completed
      : typeof raw.completed === 'string' ? raw.completed.trim().toLowerCase() : '';
    const completed = completedRaw === 'true' || completedRaw === '1' || completedRaw === true;
    const repeatRaw = typeof raw.repeat === 'string' ? raw.repeat.trim().toLowerCase() : '';
    const repeat = REPEATS.indexOf(repeatRaw) !== -1 ? repeatRaw : null;
    const notes = typeof raw.notes === 'string' ? raw.notes.slice(0, MAX_NOTES_CHARS) : '';
    const tags = cleanTags(Array.isArray(raw.tags) ? raw.tags : []);
    const subtasks = cleanSubtasks(Array.isArray(raw.subtasks) ? raw.subtasks : [], makeId) || [];
    const createdAt = typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt))
      ? raw.createdAt
      : now;
    const updatedAt = typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))
      ? raw.updatedAt
      : createdAt;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : makeId();
    return { id, title, dueDate, dueTime, priority, completed, createdAt, updatedAt, notes, repeat, tags, subtasks };
  }

  function parseSubtasksJson(value) {
    let parsed;
    try { parsed = JSON.parse(value); } catch (error) { return null; }
    return parsed;
  }

  function fromCsv(text, ctx) {
    const rows = parseCsv(text);
    if (rows.length === 0) throw new Error('CSV input is empty.');
    if (rows[0].join(',') !== CSV_HEADER) {
      throw new Error('CSV header does not match the Daymark export header.');
    }
    const width = CSV_HEADER.split(',').length;
    const tasks = [];
    let skippedRows = 0;
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.length !== width) { skippedRows += 1; continue; }
      const task = buildTask({
        id: row[0], title: row[1], dueDate: row[2], dueTime: row[3], priority: row[4],
        completed: row[5], repeat: row[6], tags: row[7] ? row[7].split(' ') : [], notes: row[8],
        subtasks: row[9] ? parseSubtasksJson(row[9]) : [], createdAt: row[10], updatedAt: row[11]
      }, ctx);
      if (task === null) { skippedRows += 1; continue; }
      tasks.push(task);
    }
    return { tasks, skippedRows };
  }

  // Parses the exact Markdown shape produced by export-logic toMarkdown:
  // "- [x] **Title** · due YYYY-MM-DD HH:mm · high priority · repeats weekly · #tag"
  // with two-space indented note lines and "  - [ ] step" subtask lines.
  // Unknown trailing parts are ignored so hand-edited files still import.
  function fromMarkdown(text, ctx) {
    requireString(text);
    const lines = text.split('\n');
    const tasks = [];
    let skippedRows = 0;
    let current = null;
    const noteLines = [];
    const subtaskLines = [];
    function flushTask() {
      if (current === null) return;
      const task = buildTask({
        id: current.id,
        title: current.title,
        dueDate: current.dueDate,
        dueTime: current.dueTime,
        priority: current.priority,
        completed: current.completed,
        repeat: current.repeat,
        tags: current.tags,
        notes: noteLines.join('\n'),
        subtasks: subtaskLines,
        createdAt: ctx && ctx.now,
        updatedAt: ctx && ctx.now
      }, ctx);
      if (task === null) { skippedRows += 1; } else { tasks.push(task); }
      current = null;
      noteLines.length = 0;
      subtaskLines.length = 0;
    }
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');
      const taskMatch = line.match(/^- \[( |x)\] \*\*([\s\S]*?)\*\* · (.*)$/);
      if (taskMatch) {
        flushTask();
        const dueDate = [];
        const dueTime = [];
        let priority = '';
        let repeat = null;
        const tags = [];
        for (const part of taskMatch[3].split(' · ')) {
          const due = part.match(/^due (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?$/);
          if (due) { dueDate.push(due[1]); if (due[2]) dueTime.push(due[2]); continue; }
          const prio = part.match(/^(low|medium|high) priority$/);
          if (prio) { priority = prio[1]; continue; }
          const rep = part.match(/^repeats (.+)$/);
          if (rep) { repeat = rep[1]; continue; }
          const tag = part.match(/^#(.+)$/);
          if (tag) { tags.push(tag[1]); continue; }
        }
        current = {
          id: null,
          title: mdUnescape(taskMatch[2]),
          completed: taskMatch[1] === 'x',
          dueDate: dueDate[0] || null,
          dueTime: dueTime[0] || null,
          priority,
          repeat,
          tags
        };
        continue;
      }
      const subMatch = line.match(/^  - \[( |x)\] (.*)$/);
      if (subMatch && current !== null) {
        subtaskLines.push({ id: null, title: mdUnescape(subMatch[2]), done: subMatch[1] === 'x' });
        continue;
      }
      const noteMatch = line.match(/^  (.*)$/);
      if (noteMatch && current !== null) {
        noteLines.push(noteMatch[1]);
        continue;
      }
      if (/^\s*$/.test(line)) { flushTask(); continue; }
    }
    flushTask();
    return { tasks, skippedRows };
  }

  // --- iCalendar (RFC 5545 subset, offline and dependency-free) ---

  // Undoes RFC 5545 text escaping: \n \N newline, \, comma, \; semicolon,
  // \\ backslash. Any other backslash pair is kept as written (fail-closed on
  // data we do not understand instead of silently dropping characters).
  function icsUnescape(text) {
    let out = '';
    for (let i = 0; i < text.length; i += 1) {
      if (text.charAt(i) === '\\' && i + 1 < text.length) {
        const next = text.charAt(i + 1);
        if (next === 'n' || next === 'N') { out += '\n'; i += 1; continue; }
        if (next === ',' || next === ';' || next === '\\') { out += next; i += 1; continue; }
      }
      out += text.charAt(i);
    }
    return out;
  }

  // RFC 5545 3.1: a line beginning with a space or tab continues the previous
  // logical line; that leading whitespace is removed when unfolding.

  // Splits an RFC 5545 list (CATEGORIES etc.) on unescaped commas or
  // semicolons, then unescapes each item. Escaped delimiters stay inside
  // their original value.
  function icsSplitList(text) {
    if (typeof text !== 'string' || text.length === 0) return [];
    const parts = [];
    let current = '';
    for (let i = 0; i < text.length; i += 1) {
      const ch = text.charAt(i);
      if (ch === '\\' && i + 1 < text.length) {
        current += ch + text.charAt(i + 1);
        i += 1;
        continue;
      }
      if (ch === ',' || ch === ';') {
        parts.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    parts.push(current);
    return parts.map((part) => icsUnescape(part.trim())).filter((part) => part.length > 0);
  }

  function unfoldIcsLines(text) {
    requireString(text);
    const logical = [];
    for (const rawLine of text.split('\n')) {
      const line = rawLine.replace(/\r$/, '');
      if (logical.length > 0 && (line.charAt(0) === ' ' || line.charAt(0) === '\t')) {
        logical[logical.length - 1] += line.slice(1);
        continue;
      }
      logical.push(line);
    }
    return logical;
  }

  // Splits "NAME;PARAM=VALUE;...:value". Parameter values may be quoted, so
  // the content colon is the first colon outside quotes.
  function icsProperty(line) {
    let inQuotes = false;
    let colon = -1;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line.charAt(i);
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ':' && !inQuotes) { colon = i; break; }
    }
    if (colon < 1) return null;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const headParts = head.split(';');
    const name = headParts[0].toUpperCase();
    const params = {};
    for (let i = 1; i < headParts.length; i += 1) {
      const eq = headParts[i].indexOf('=');
      if (eq < 1) continue;
      const key = headParts[i].slice(0, eq).toUpperCase();
      params[key] = headParts[i].slice(eq + 1).replace(/^"|"$/g, '');
    }
    return { name, params, value };
  }

  const ICS_DATE = /^(\d{4})(\d{2})(\d{2})$/;
  const ICS_DATETIME = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/;

  // Maps a DUE/DTSTART property onto stored dueDate/dueTime. The clock time
  // is kept exactly as written: a Z suffix or a TZID parameter is counted as
  // a dropped time zone, never silently re-interpreted.
  function icsDateTaskField(prop) {
    if (!prop) return { dueDate: null, dueTime: null, timezonePresent: false };
    const declaredDate = (prop.params.VALUE || '').toUpperCase() === 'DATE';
    const asDate = prop.value.match(ICS_DATE);
    if (declaredDate || asDate) {
      if (!asDate) return { dueDate: null, dueTime: null, timezonePresent: false };
      return { dueDate: asDate[1] + '-' + asDate[2] + '-' + asDate[3], dueTime: null, timezonePresent: false };
    }
    const asDateTime = prop.value.match(ICS_DATETIME);
    if (!asDateTime) return { dueDate: null, dueTime: null, timezonePresent: false };
    const timezonePresent = asDateTime[7] === 'Z' || Boolean(prop.params.TZID);
    const dueDate = asDateTime[1] + '-' + asDateTime[2] + '-' + asDateTime[3];
    const dueTime = asDateTime[4] + ':' + asDateTime[5];
    // Validate time before claiming a timezone drop. Invalid clock times are
    // dropped without counting a timezone simplification.
    if (!isTimeOnly(dueTime)) {
      return { dueDate, dueTime: null, timezonePresent: false };
    }
    return { dueDate, dueTime, timezonePresent };
  }

  // Collects the VTODO/VEVENT components of an unfolded iCalendar stream.
  // Nested sub-components (VALARM and friends) are skipped. hasCalendar is
  // false when no BEGIN:VCALENDAR line exists at all.
  function parseIcs(text) {
    const lines = unfoldIcsLines(text);
    const components = [];
    let hasCalendar = false;
    let current = null;
    let skipDepth = 0;
    for (const line of lines) {
      const beginMatch = line.match(/^BEGIN:(.+)$/);
      if (beginMatch) {
        const type = beginMatch[1].trim().toUpperCase();
        if (type === 'VCALENDAR') { hasCalendar = true; continue; }
        if (current === null && (type === 'VTODO' || type === 'VEVENT')) {
          current = { type, props: [] };
          continue;
        }
        if (current !== null) skipDepth += 1;
        continue;
      }
      const endMatch = line.match(/^END:(.+)$/);
      if (endMatch) {
        const type = endMatch[1].trim().toUpperCase();
        if (type === 'VCALENDAR') continue;
        if (current !== null) {
          if (type === current.type) { components.push(current); current = null; skipDepth = 0; continue; }
          if (skipDepth > 0) skipDepth -= 1;
        }
        continue;
      }
      if (current !== null && skipDepth === 0) {
        const prop = icsProperty(line);
        if (prop) current.props.push(prop);
      }
    }
    return { components, hasCalendar };
  }

  // Parses task-shaped iCalendar into stored tasks. VTODO and VEVENT both
  // map to tasks: SUMMARY -> title, DUE (todos) or DTSTART (events) -> due
  // date/time, DESCRIPTION -> notes, CATEGORIES -> tags, PRIORITY 1-4 high /
  // 5 medium / 6-9 low, STATUS:COMPLETED -> done, STATUS:CANCELLED skipped.
  // Recurrence rules are NOT expanded: a recurring item imports once as a
  // plain task and the recurring count says so honestly. Time zones are
  // never re-interpreted: the written clock time is kept, the drop counted.
  function fromIcs(text, ctx) {
    const parsed = parseIcs(text);
    if (!parsed.hasCalendar) throw new Error('Calendar input does not contain a VCALENDAR block.');
    const stats = { recurring: 0, timezoneDropped: 0, cancelled: 0 };
    const tasks = [];
    let skippedRows = 0;
    for (const component of parsed.components) {
      const byName = {};
      for (const prop of component.props) {
        if (!(prop.name in byName)) byName[prop.name] = prop;
      }
      const status = byName.STATUS ? byName.STATUS.value.trim().toUpperCase() : '';
      if (status === 'CANCELLED') { stats.cancelled += 1; continue; }
      const dueProp = component.type === 'VTODO' ? (byName.DUE || byName.DTSTART) : (byName.DTSTART || byName.DUE);
      const due = icsDateTaskField(dueProp);
      const priorityValue = byName.PRIORITY ? byName.PRIORITY.value.trim() : '';
      const priorityNumber = /^\d+$/.test(priorityValue) ? Number(priorityValue) : 0;
      const priority = priorityNumber >= 1 && priorityNumber <= 4 ? 'high'
        : priorityNumber >= 6 && priorityNumber <= 9 ? 'low'
        : 'medium';
      const raw = {
        id: byName.UID ? byName.UID.value.trim() : null,
        title: byName.SUMMARY ? icsUnescape(byName.SUMMARY.value) : '',
        dueDate: due.dueDate,
        dueTime: due.dueTime,
        priority,
        completed: status === 'COMPLETED' || Boolean(byName.COMPLETED),
        repeat: null,
        tags: byName.CATEGORIES ? icsSplitList(byName.CATEGORIES.value) : [],
        notes: byName.DESCRIPTION ? icsUnescape(byName.DESCRIPTION.value) : '',
        subtasks: [],
        createdAt: ctx && ctx.now,
        updatedAt: ctx && ctx.now
      };
      const task = buildTask(raw, ctx);
      if (task === null) { skippedRows += 1; continue; }
      // Count simplifications only for successfully imported tasks.
      if (byName.RRULE || byName.RDATE || byName['RECURRENCE-ID']) stats.recurring += 1;
      if (due.timezonePresent && task.dueTime !== null) stats.timezoneDropped += 1;
      tasks.push(task);
    }
    return {
      tasks,
      skippedRows,
      recurring: stats.recurring,
      timezoneDropped: stats.timezoneDropped,
      cancelled: stats.cancelled
    };
  }

  // Merges imported tasks into the existing stored list. Existing ids win:
  // an imported task with a colliding id is counted as a duplicate and
  // skipped, never overwriting current data. Imported tasks must pass the
  // same validation as stored tasks or they are counted as invalid.
  function mergeTasks(existing, imported, logic) {
    if (!Array.isArray(existing)) throw new Error('mergeTasks requires an array of existing tasks.');
    if (!Array.isArray(imported)) throw new Error('mergeTasks requires an array of imported tasks.');
    const isValidTask = logic && typeof logic.isValidTask === 'function'
      ? logic.isValidTask
      : null;
    const seen = new Set(existing.map((task) => task && task.id));
    const added = [];
    let duplicates = 0;
    let invalid = 0;
    for (const task of imported) {
      if (isValidTask && !isValidTask(task)) { invalid += 1; continue; }
      if (!task || typeof task.id !== 'string' || seen.has(task.id)) { duplicates += 1; continue; }
      seen.add(task.id);
      added.push(task);
    }
    return { merged: existing.concat(added), added, duplicates, invalid };
  }

  const api = {
    FORMATS,
    CSV_HEADER,
    MAX_IMPORT_CHARS,
    isFormat,
    isCsvFileName,
    isMarkdownFileName,
    isIcsFileName,
    formatFromFileName,
    parseCsv,
    mdUnescape,
    fromCsv,
    fromMarkdown,
    icsUnescape,
    icsSplitList,
    unfoldIcsLines,
    icsProperty,
    parseIcs,
    fromIcs,
    mergeTasks
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
