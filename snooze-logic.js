/*
 * Daymark snooze-pages planner for the web prototype.
 *
 * Park a web page here with a wake time, and the card lists what is due when
 * you look at it. Pure functions only: no DOM, no network, no timers. State
 * lives in browser localStorage under one inventoried key and is written
 * whole-list, honestly, with fail-closed reads. Nothing opens by itself:
 * the card only ever renders links a person can tap.
 */
((root) => {
  'use strict';

  const STORAGE_KEY = 'daymark.snooze.v1';
  const MAX_SNOOZES = 30;
  const URL_MAX = 300;
  const NOTE_MAX = 120;

  function isDigits(text) {
    if (typeof text !== 'string' || text.length === 0) return false;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code < 48 || code > 57) return false;
    }
    return true;
  }

  function squashWhitespace(text) {
    let out = '';
    let inSpace = false;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code <= 32) {
        if (out.length > 0) inSpace = true;
      } else {
        if (inSpace) { out += ' '; inSpace = false; }
        out += text.charAt(i);
      }
    }
    return out;
  }

  function normalizeNote(rawNote) {
    const raw = typeof rawNote === 'string' ? rawNote : '';
    for (let i = 0; i < raw.length; i += 1) {
      const code = raw.charCodeAt(i);
      if (code < 9 || (code > 9 && code < 10) || (code > 13 && code < 32)) {
        return { ok: false, reason: 'note-unreadable' };
      }
    }
    const squashed = squashWhitespace(raw);
    if (squashed.length > NOTE_MAX) {
      return { ok: true, note: squashed.slice(0, NOTE_MAX), truncated: true };
    }
    return { ok: true, note: squashed, truncated: false };
  }

  function normalizeUrl(rawUrl) {
    if (typeof rawUrl !== 'string') return { ok: false, reason: 'invalid-url' };
    for (let i = 0; i < rawUrl.length; i += 1) {
      if (rawUrl.charCodeAt(i) <= 32) return { ok: false, reason: 'invalid-url' };
    }
    if (rawUrl.length === 0) return { ok: false, reason: 'invalid-url' };
    if (rawUrl.length > URL_MAX) return { ok: false, reason: 'url-too-long' };
    const head = rawUrl.slice(0, 7).toLowerCase();
    const head8 = rawUrl.slice(0, 8).toLowerCase();
    if (head !== 'http://' && head8 !== 'https://') return { ok: false, reason: 'invalid-url' };
    return { ok: true, url: rawUrl };
  }

  function parseWakeAt(raw) {
    if (typeof raw !== 'string') return { ok: false, reason: 'wake-unreadable' };
    const value = squashWhitespace(raw);
    if (value.length !== 16) return { ok: false, reason: 'wake-unreadable' };
    const shapes = [value.slice(0, 4), value.slice(5, 7), value.slice(8, 10), value.slice(11, 13), value.slice(14, 16)];
    for (const shape of shapes) {
      if (!isDigits(shape)) return { ok: false, reason: 'wake-unreadable' };
    }
    if (value.charAt(4) !== '-' || value.charAt(7) !== '-' || value.charAt(10) !== 'T' || value.charAt(13) !== ':') {
      return { ok: false, reason: 'wake-unreadable' };
    }
    const stamp = Date.parse(value + ':00Z');
    if (typeof stamp !== 'number' || !isFinite(stamp)) return { ok: false, reason: 'wake-unreadable' };
    const stampIso = new Date(stamp).toISOString();
    if (stampIso.slice(0, 4) !== value.slice(0, 4)
        || stampIso.slice(5, 7) !== value.slice(5, 7)
        || stampIso.slice(8, 10) !== value.slice(8, 10)
        || stampIso.slice(11, 13) !== value.slice(11, 13)
        || stampIso.slice(14, 16) !== value.slice(14, 16)) {
      return { ok: false, reason: 'wake-unreadable' };
    }
    return { ok: true, wakeAtMs: stamp, wakeAtIso: new Date(stamp).toISOString() };
  }

  function readSnoozes(storage) {
    if (!storage || typeof storage.getItem !== 'function') {
      return { ok: false, reason: 'storage-unavailable', snoozes: [] };
    }
    let raw = null;
    try { raw = storage.getItem(STORAGE_KEY); }
    catch (error) { return { ok: false, reason: 'storage-unavailable', snoozes: [] }; }
    if (raw === null || raw === undefined || raw === '') return { ok: true, reason: '', snoozes: [] };
    if (typeof raw !== 'string') return { ok: false, reason: 'malformed-saved-state', snoozes: [] };
    let parsed = null;
    try { parsed = JSON.parse(raw); }
    catch (error) { return { ok: false, reason: 'malformed-saved-state', snoozes: [] }; }
    if (!Array.isArray(parsed)) return { ok: false, reason: 'malformed-saved-state', snoozes: [] };
    const snoozes = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return { ok: false, reason: 'malformed-saved-state', snoozes: [] };
      }
      if (typeof entry.id !== 'string' || entry.id.length === 0
          || !normalizeUrl(entry.url).ok
          || typeof entry.wakeAtMs !== 'number' || !isFinite(entry.wakeAtMs)
          || entry.wakeAtMs <= 0
          || (typeof entry.note !== 'undefined' && typeof entry.note !== 'string')) {
        return { ok: false, reason: 'malformed-saved-state', snoozes: [] };
      }
      snoozes.push(entry);
    }
    return { ok: true, reason: '', snoozes: snoozes };
  }

  function writeSnoozes(storage, snoozes) {
    if (!storage || typeof storage.setItem !== 'function') {
      return { ok: false, reason: 'storage-unavailable' };
    }
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(snoozes));
    } catch (error) {
      return { ok: false, reason: 'write-failed' };
    }
    return { ok: true, reason: '' };
  }

  function createSnooze(rawUrl, rawWakeAt, rawNote, nowMs, existing) {
    const checkedUrl = normalizeUrl(rawUrl);
    if (!checkedUrl.ok) return { ok: false, reason: checkedUrl.reason };
    const checkedWake = parseWakeAt(rawWakeAt);
    if (!checkedWake.ok) return { ok: false, reason: checkedWake.reason };
    if (typeof nowMs !== 'number' || !isFinite(nowMs)) return { ok: false, reason: 'storage-unavailable' };
    if (checkedWake.wakeAtMs <= nowMs) return { ok: false, reason: 'wake-in-past' };
    const checkedNote = normalizeNote(rawNote);
    if (!checkedNote.ok) return { ok: false, reason: checkedNote.reason };
    const list = Array.isArray(existing) ? existing : [];
    for (const entry of list) {
      if (entry && entry.url === checkedUrl.url && entry.wakeAtMs > nowMs) {
        return { ok: false, reason: 'duplicate' };
      }
    }
    if (list.length >= MAX_SNOOZES) return { ok: false, reason: 'limit-reached' };
    const snooze = {
      id: 'snooze-' + String(list.length + 1) + '-' + String(checkedWake.wakeAtMs) + '-' + String(nowMs % 100000),
      url: checkedUrl.url,
      wakeAtMs: checkedWake.wakeAtMs,
      note: checkedNote.note,
      createdAtMs: nowMs
    };
    return { ok: true, snooze: snooze, snoozes: list.concat([snooze]) };
  }

  function dueSnoozes(snoozes, nowMs) {
    if (!Array.isArray(snoozes) || typeof nowMs !== 'number' || !isFinite(nowMs)) return [];
    const due = [];
    for (const entry of snoozes) {
      if (entry && entry.wakeAtMs <= nowMs) due.push(entry);
    }
    due.sort((a, b) => a.wakeAtMs - b.wakeAtMs);
    return due;
  }

  function pendingSnoozes(snoozes, nowMs) {
    if (!Array.isArray(snoozes) || typeof nowMs !== 'number' || !isFinite(nowMs)) return [];
    const pending = [];
    for (const entry of snoozes) {
      if (entry && entry.wakeAtMs > nowMs) pending.push(entry);
    }
    pending.sort((a, b) => a.wakeAtMs - b.wakeAtMs);
    return pending;
  }

  function pad2(value) { return value < 10 ? '0' + String(value) : String(value); }

  function describeWakeTime(wakeAtMs) {
    if (typeof wakeAtMs !== 'number' || !isFinite(wakeAtMs)) return '';
    const stamp = new Date(wakeAtMs);
    if (!stamp || isNaN(stamp.getTime())) return '';
    return stamp.getUTCFullYear() + '-' + pad2(stamp.getUTCMonth() + 1) + '-' + pad2(stamp.getUTCDate())
      + ' ' + pad2(stamp.getUTCHours()) + ':' + pad2(stamp.getUTCMinutes()) + ' UTC';
  }

  function removeSnooze(storage, id) {
    if (typeof id !== 'string' || id.length === 0) return { ok: false, reason: 'unknown-id' };
    const read = readSnoozes(storage);
    if (!read.ok) return { ok: false, reason: read.reason };
    const kept = [];
    const removed = [];
    for (const entry of read.snoozes) {
      if (entry.id === id) removed.push(entry); else kept.push(entry);
    }
    if (removed.length === 0) return { ok: false, reason: 'unknown-id' };
    const written = writeSnoozes(storage, kept);
    if (!written.ok) return { ok: false, reason: written.reason };
    return { ok: true, removed: removed, snoozes: kept };
  }

  function clearSnoozes(storage) {
    const read = readSnoozes(storage);
    if (!read.ok) return { ok: false, reason: read.reason };
    if (read.snoozes.length === 0) return { ok: true, clearedCount: 0 };
    if (!storage || typeof storage.removeItem !== 'function') {
      return { ok: false, reason: 'storage-unavailable' };
    }
    try { storage.removeItem(STORAGE_KEY); }
    catch (error) { return { ok: false, reason: 'write-failed' }; }
    return { ok: true, clearedCount: read.snoozes.length };
  }

  const ERROR_TEXT = {
    'flag-off': 'Snooze pages is switched off in Feature settings. Turn it on there first.',
    'storage-unavailable': 'Browser storage is unavailable, so nothing was saved or changed.',
    'malformed-saved-state': 'Saved snoozes were unreadable, so nothing was changed. Clear all is safe to use.',
    'invalid-url': 'Enter a full web address that starts with http:// or https://.',
    'url-too-long': 'That web address is too long to save.',
    'wake-unreadable': 'Enter a wake date and time first, in the picker.',
    'wake-in-past': 'Pick a wake time that is still in the future.',
    'limit-reached': 'The snooze list is full (30 items). Remove one before adding another.',
    'duplicate': 'That page is already waiting in the list.',
    'write-failed': 'Browser storage refused the write, so nothing was saved or changed.',
    'unknown-id': 'That snooze is gone from the list already.',
    'note-unreadable': 'That note has unreadable characters; plain text only.'
  };

  function describeError(reason) {
    if (typeof reason === 'string' && ERROR_TEXT[reason]) return ERROR_TEXT[reason];
    return 'Something went wrong with the snooze list, and nothing was changed.';
  }

  const api = {
    STORAGE_KEY: STORAGE_KEY,
    MAX_SNOOZES: MAX_SNOOZES,
    URL_MAX: URL_MAX,
    NOTE_MAX: NOTE_MAX,
    normalizeNote: normalizeNote,
    normalizeUrl: normalizeUrl,
    parseWakeAt: parseWakeAt,
    readSnoozes: readSnoozes,
    writeSnoozes: writeSnoozes,
    createSnooze: createSnooze,
    dueSnoozes: dueSnoozes,
    pendingSnoozes: pendingSnoozes,
    describeWakeTime: describeWakeTime,
    removeSnooze: removeSnooze,
    clearSnoozes: clearSnoozes,
    describeError: describeError
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkSnooze = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
