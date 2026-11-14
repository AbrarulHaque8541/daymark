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
  const LEGACY_CSV_HEADER = 'id,title,dueDate,dueTime,priority,completed,repeat,tags,notes,subtasks,createdAt,updatedAt';
  const CSV_HEADER = LEGACY_CSV_HEADER + ',repeatDayOfMonth';
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

  // iCalendar import reports categories the Daymark tag contract cannot retain.
  // Mirror cleanTags normalization/deduplication/cap without silently hiding losses.
  function countDroppedTags(candidates) {
    const accepted = [];
    let dropped = 0;
    for (const raw of candidates) {
      if (typeof raw !== 'string') continue;
      const tag = raw.trim().toLowerCase().replace(/ /g, '-');
      if (!tag) continue;
      if (!isTag(tag)) {
        dropped += 1;
        continue;
      }
      if (accepted.indexOf(tag) !== -1) continue;
      if (accepted.length >= MAX_TAGS) {
        dropped += 1;
        continue;
      }
      accepted.push(tag);
    }
    return dropped;
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
  // a row without a usable title. Unknown repeat metadata is preserved so the
  // shared task validator can reject it instead of silently converting it to none.
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
    const repeatRaw = raw.repeat;
    const repeat = repeatRaw === undefined || repeatRaw === null || repeatRaw === ''
      ? null : (typeof repeatRaw === 'string' ? raw.repeat.trim().toLowerCase() : repeatRaw);
    const repeatDayRaw = raw.repeatDayOfMonth;
    const repeatDayOfMonth = repeatDayRaw === undefined || repeatDayRaw === null || repeatDayRaw === ''
      ? ((repeat === 'monthly' || repeat === 'yearly') && dueDate !== null ? Number(dueDate.slice(8)) : null)
      : (typeof repeatDayRaw === 'string' && /^\d+$/.test(repeatDayRaw) ? Number(repeatDayRaw) : repeatDayRaw);
    const notes = typeof raw.notes === 'string' ? raw.notes.slice(0, MAX_NOTES_CHARS) : '';
    const tags = cleanTags(Array.isArray(raw.tags) ? raw.tags : []);
    const subtasks = cleanSubtasks(Array.isArray(raw.subtasks) ? raw.subtasks : [], makeId) || [];
    // Only absent/empty timestamps receive import defaults. Preserve any explicitly
    // supplied value so the shared TaskLogic validator can reject malformed or
    // non-canonical instants instead of silently rewriting user data to "now".
    const createdAt = raw.createdAt === undefined || raw.createdAt === null || raw.createdAt === ''
      ? now
      : raw.createdAt;
    const updatedAt = raw.updatedAt === undefined || raw.updatedAt === null || raw.updatedAt === ''
      ? createdAt
      : raw.updatedAt;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : makeId();
    return { id, title, dueDate, dueTime, priority, completed, createdAt, updatedAt, notes, repeat, repeatDayOfMonth, tags, subtasks };
  }

  function parseSubtasksJson(value, ctx) {
    // CSV subtasks are nested JSON inside a CSV cell. Require the shared
    // duplicate-key guard before JSON.parse can silently keep the last member.
    if (!ctx || typeof ctx.hasDuplicateJsonKeys !== 'function'
        || ctx.hasDuplicateJsonKeys(value)) return null;
    let parsed;
    try { parsed = JSON.parse(value); } catch (error) { return null; }
    return Array.isArray(parsed) ? parsed : null;
  }

  function fromCsv(text, ctx) {
    const rows = parseCsv(text);
    if (rows.length === 0) throw new Error('CSV input is empty.');
    const header = rows[0].join(',');
    const legacyHeader = header === LEGACY_CSV_HEADER;
    if (!legacyHeader && header !== CSV_HEADER) {
      throw new Error('CSV header does not match the Daymark export header.');
    }
    const width = (legacyHeader ? LEGACY_CSV_HEADER : CSV_HEADER).split(',').length;
    const tasks = [];
    let skippedRows = 0;
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.length !== width) { skippedRows += 1; continue; }
      const subtasks = row[9] ? parseSubtasksJson(row[9], ctx) : [];
      if (!Array.isArray(subtasks)) { skippedRows += 1; continue; }
      const task = buildTask({
        id: row[0], title: row[1], dueDate: row[2], dueTime: row[3], priority: row[4],
        completed: row[5], repeat: row[6], tags: row[7] ? row[7].split(' ') : [], notes: row[8],
        subtasks, createdAt: row[10], updatedAt: row[11],
        repeatDayOfMonth: legacyHeader ? undefined : row[12]
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
        repeatDayOfMonth: current.repeatDayOfMonth,
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
        let repeatDayOfMonth = null;
        const tags = [];
        for (const part of taskMatch[3].split(' · ')) {
          const due = part.match(/^due (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?$/);
          if (due) { dueDate.push(due[1]); if (due[2]) dueTime.push(due[2]); continue; }
          const prio = part.match(/^(low|medium|high) priority$/);
          if (prio) { priority = prio[1]; continue; }
          const rep = part.match(/^repeats (.+)$/);
          if (rep) { repeat = rep[1]; continue; }
          const repeatDay = part.match(/^repeat day (\d{1,2})$/);
          if (repeatDay) { repeatDayOfMonth = Number(repeatDay[1]); continue; }
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
          repeatDayOfMonth,
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

  // CATEGORIES is a comma-separated TEXT list. Semicolons are ordinary
  // category text, not separators. Split before unescaping so escaped commas
  // stay inside their original value; cleanTags later rejects unsupported punctuation.
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
      if (ch === ',') {
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

  // Maps DUE/DTSTART onto Daymark's date + minute-precision time fields.
  // Time-zone conversion is deliberately not attempted. Non-zero seconds are
  // truncated (and disclosed) because the stored task contract is HH:MM.
  function icsDateTaskField(prop) {
    const empty = {
      dueDate: null, dueTime: null, timezonePresent: false,
      secondsDropped: false, invalidDateType: false, invalidDateTimeValue: false
    };
    if (!prop) return empty;
    const params = prop.params || {};
    const valueType = (params.VALUE || '').toUpperCase();
    const hasValue = Object.prototype.hasOwnProperty.call(params, 'VALUE');
    const hasTzid = Object.prototype.hasOwnProperty.call(params, 'TZID');
    const invalidType = () => ({ ...empty, invalidDateType: true });
    const invalidValue = () => ({ ...empty, invalidDateTimeValue: true });
    if ((hasValue && valueType !== 'DATE' && valueType !== 'DATE-TIME')
        || (!hasValue && valueType !== '')) return invalidType();

    const asDate = prop.value.match(ICS_DATE);
    if (valueType === 'DATE') {
      // RFC 5545 DATE values cannot carry a TZID parameter.
      if (!asDate || hasTzid) return invalidType();
      const dueDate = asDate[1] + '-' + asDate[2] + '-' + asDate[3];
      if (!isDateOnly(dueDate)) return invalidValue();
      return {
        dueDate,
        dueTime: null,
        timezonePresent: false,
        secondsDropped: false,
        invalidDateType: false,
        invalidDateTimeValue: false
      };
    }
    // DATE-TIME is the default value type. A date-only value therefore needs
    // an explicit VALUE=DATE parameter; never infer DATE from its shape.
    if (asDate) return invalidType();

    const asDateTime = prop.value.match(ICS_DATETIME);
    if (!asDateTime) return invalidValue();
    // TZID is for local DATE-TIME values and must not accompany a UTC "Z" value.
    if (hasTzid && asDateTime[7] === 'Z') return invalidType();
    const dueDate = asDateTime[1] + '-' + asDateTime[2] + '-' + asDateTime[3];
    if (!isDateOnly(dueDate)) return invalidValue();
    const dueTime = asDateTime[4] + ':' + asDateTime[5];
    const seconds = Number(asDateTime[6]);
    // RFC 5545 permits 00-60 seconds. Daymark stores minutes only, so valid
    // non-zero seconds are intentionally truncated and reported to the user.
    // Invalid clock values must be counted separately from timezone or
    // precision simplification; the task may still be imported without a time.
    if (!isTimeOnly(dueTime) || seconds > 60) {
      return {
        dueDate, dueTime: null, timezonePresent: false,
        secondsDropped: false, invalidDateType: false, invalidDateTimeValue: true
      };
    }
    return {
      dueDate,
      dueTime,
      timezonePresent: asDateTime[7] === 'Z' || hasTzid,
      secondsDropped: seconds !== 0,
      invalidDateType: false,
      invalidDateTimeValue: false
    };
  }

  // RFC 5545 defines COMPLETED as a UTC DATE-TIME property on VTODO.
  // A valid timestamp is completion evidence independently of STATUS; invalid
  // values and use on VEVENT are ignored and disclosed rather than trusted.
  function isValidIcsCompletion(prop) {
    if (!prop || typeof prop.value !== 'string') return false;
    const params = prop.params || {};
    const valueType = (params.VALUE || '').toUpperCase();
    const hasValue = Object.prototype.hasOwnProperty.call(params, 'VALUE');
    // COMPLETED is a UTC DATE-TIME: an explicitly empty VALUE or any TZID
    // parameter is invalid, even when its parameter text is empty.
    if ((hasValue && valueType !== 'DATE-TIME')
        || (!hasValue && valueType !== '') || Object.prototype.hasOwnProperty.call(params, 'TZID')) return false;
    const match = prop.value.match(ICS_DATETIME);
    if (!match || match[7] !== 'Z') return false;
    const date = match[1] + '-' + match[2] + '-' + match[3];
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    return isDateOnly(date) && hour <= 23 && minute <= 59 && second <= 60;
  }

  // Collects the VTODO/VEVENT components of an unfolded iCalendar stream.
  // Nested sub-components (VALARM and friends) are skipped. hasCalendar is
  // false when no BEGIN:VCALENDAR line exists at all.
  function parseIcs(text) {
    const lines = unfoldIcsLines(text);
    const components = [];
    const stack = [];
    let hasCalendar = false;
    let calendarClosed = false;
    let current = null;
    let currentDepth = 0;

    for (const line of lines) {
      if (line.trim().length === 0) continue;

      const beginMatch = line.match(/^BEGIN:(.+)$/i);
      if (beginMatch) {
        const type = beginMatch[1].trim().toUpperCase();
        if (!type) throw new Error('Calendar input contains an empty component name.');

        if (stack.length === 0) {
          if (hasCalendar || calendarClosed) {
            throw new Error('Calendar input contains more than one VCALENDAR block.');
          }
          if (type !== 'VCALENDAR') {
            throw new Error('Calendar component appears outside the VCALENDAR block.');
          }
          hasCalendar = true;
        } else {
          if (type === 'VCALENDAR') {
            throw new Error('Calendar input contains a nested VCALENDAR block.');
          }
          if (calendarClosed) {
            throw new Error('Calendar component appears after the VCALENDAR block.');
          }
          if ((type === 'VTODO' || type === 'VEVENT') && stack.length !== 1) {
            throw new Error(type + ' components cannot be nested inside another calendar component.');
          }
        }

        const parentDepth = stack.length;
        stack.push(type);
        if (parentDepth === 1 && (type === 'VTODO' || type === 'VEVENT')) {
          current = { type, props: [] };
          currentDepth = stack.length;
        }
        continue;
      }

      const endMatch = line.match(/^END:(.+)$/i);
      if (endMatch) {
        const type = endMatch[1].trim().toUpperCase();
        if (stack.length === 0) {
          throw new Error('Calendar input contains an unmatched END:' + type + '.');
        }
        const openType = stack[stack.length - 1];
        if (openType !== type) {
          throw new Error('Calendar END:' + type + ' does not match BEGIN:' + openType + '.');
        }

        if (current && stack.length === currentDepth && type === current.type) {
          components.push(current);
          current = null;
          currentDepth = 0;
        }
        stack.pop();
        if (stack.length === 0) {
          if (type !== 'VCALENDAR') {
            throw new Error('Calendar input ended outside its VCALENDAR block.');
          }
          calendarClosed = true;
        }
        continue;
      }

      if (stack.length === 0) {
        if (!hasCalendar) {
          throw new Error('Calendar input does not contain a VCALENDAR block.');
        }
        if (calendarClosed) {
          throw new Error('Calendar input contains content after END:VCALENDAR.');
        }
        throw new Error('Calendar property appears outside the VCALENDAR block.');
      }

      // Only direct VTODO/VEVENT properties are imported. Nested components
      // (including VALARM) are balanced above but never leak properties.
      if (current && stack.length === currentDepth) {
        const prop = icsProperty(line);
        if (prop) current.props.push(prop);
      }
    }

    if (!hasCalendar) return { components, hasCalendar: false };
    if (!calendarClosed || stack.length !== 0 || current) {
      const openType = stack.length > 0 ? stack[stack.length - 1] : 'VCALENDAR';
      throw new Error('Calendar input contains an unclosed ' + openType + ' component.');
    }
    return { components, hasCalendar: true };
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
    const stats = { recurring: 0, timezoneDropped: 0, secondsDropped: 0, categoriesDropped: 0, invalidCompletion: 0, invalidDateType: 0, invalidDateTimeValue: 0, ambiguousComponents: 0, cancelled: 0 };
    const tasks = [];
    let skippedRows = 0;
    for (const component of parsed.components) {
      const byName = Object.create(null);
      const categoryProps = [];
      const singletonNames = new Set([
        'UID', 'SUMMARY', 'DUE', 'DTSTART', 'STATUS', 'COMPLETED', 'PRIORITY', 'DESCRIPTION'
      ]);
      let hasDuplicateSingleton = false;
      for (const prop of component.props) {
        if (prop.name === 'CATEGORIES') {
          categoryProps.push(prop);
          continue;
        }
        if (singletonNames.has(prop.name) && Object.prototype.hasOwnProperty.call(byName, prop.name)) {
          hasDuplicateSingleton = true;
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(byName, prop.name)) byName[prop.name] = prop;
      }
      if (hasDuplicateSingleton) {
        stats.ambiguousComponents += 1;
        continue;
      }
      const status = byName.STATUS ? byName.STATUS.value.trim().toUpperCase() : '';
      if (status === 'CANCELLED') { stats.cancelled += 1; continue; }
      const dueProp = component.type === 'VTODO' ? (byName.DUE || byName.DTSTART) : (byName.DTSTART || byName.DUE);
      const due = icsDateTaskField(dueProp);
      const rawCategories = categoryProps.reduce((all, prop) => all.concat(icsSplitList(prop.value)), []);
      const categoriesDropped = countDroppedTags(rawCategories);
      const completionProp = byName.COMPLETED || null;
      // RFC 5545 defines COMPLETED as the actual completion timestamp on
      // VTODO. It is independent of STATUS (the RFC example pairs it with
      // STATUS:NEEDS-ACTION), so a valid UTC timestamp is completion evidence
      // even when STATUS is absent or has not been updated.
      const validCompletion = component.type === 'VTODO' && isValidIcsCompletion(completionProp);
      const invalidCompletion = (completionProp !== null && !validCompletion) ||
        (component.type !== 'VTODO' && status === 'COMPLETED');
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
        completed: component.type === 'VTODO' && (status === 'COMPLETED' || validCompletion),
        repeat: null,
        tags: rawCategories,
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
      if (due.secondsDropped && task.dueTime !== null) stats.secondsDropped += 1;
      stats.categoriesDropped += categoriesDropped;
      if (due.invalidDateType) stats.invalidDateType += 1;
      if (due.invalidDateTimeValue) stats.invalidDateTimeValue += 1;
      if (invalidCompletion) stats.invalidCompletion += 1;
      tasks.push(task);
    }
    return {
      tasks,
      skippedRows,
      recurring: stats.recurring,
      timezoneDropped: stats.timezoneDropped,
      secondsDropped: stats.secondsDropped,
      categoriesDropped: stats.categoriesDropped,
      invalidCompletion: stats.invalidCompletion,
      invalidDateType: stats.invalidDateType,
      invalidDateTimeValue: stats.invalidDateTimeValue,
      ambiguousComponents: stats.ambiguousComponents,
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
    if (!isValidTask) throw new Error('mergeTasks requires the shared task validator.');
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
    LEGACY_CSV_HEADER,
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
