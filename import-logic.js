/*
 * Daymark open-format task import (CSV / Markdown).
 *
 * Counterpart of export-logic.js: parses Daymark's own open-format exports
 * back into stored tasks and accepts hand-written CSV with the same header.
 * Pure, dependency-free: no network, no storage, no DOM. mergeTasks
 * validates through an injected task-logic so imported tasks must be exactly
 * as valid as stored ones. Lenient with foreign data, strict about the
 * invariants that matter (non-blank title, valid dates, safe sizes).
 */
((root) => {
  'use strict';

  const FORMATS = ['csv', 'markdown'];
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

  // null means "not an open-format import" and the JSON backup handler stays
  // in charge.
  function formatFromFileName(name) {
    if (isCsvFileName(name)) return 'csv';
    if (isMarkdownFileName(name)) return 'markdown';
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
    if (inQuotes) throw new Error('CSV input ends inside a quoted field.');
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
    formatFromFileName,
    parseCsv,
    mdUnescape,
    fromCsv,
    fromMarkdown,
    mergeTasks
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
