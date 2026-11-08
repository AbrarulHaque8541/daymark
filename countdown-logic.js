((root) => {
  'use strict';

  // Pure offline countdown helpers. No DOM, no storage, no network, no timers.
  // Dates are local-calendar YYYY-MM-DD. "Today" is the local date of `now`.

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const MAX_NAME = 80;
  const MAX_ITEMS = 8;

  function isValidDateString(value) {
    if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
    const parts = value.split('-').map(Number);
    const y = parts[0], m = parts[1], d = parts[2];
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function localDateString(now) {
    const dt = now instanceof Date ? now : new Date(now || Date.now());
    if (Number.isNaN(dt.getTime())) return null;
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function daysUntil(dateStr, now) {
    if (!isValidDateString(dateStr)) return null;
    const today = localDateString(now);
    if (!today) return null;
    const target = new Date(dateStr + 'T00:00:00');
    const base = new Date(today + 'T00:00:00');
    const ms = target.getTime() - base.getTime();
    return Math.round(ms / 86400000);
  }

  function formatDays(days) {
    if (days === null || typeof days !== 'number' || !Number.isFinite(days)) return '—';
    if (days < 0) return Math.abs(days) === 1 ? '1 day ago' : Math.abs(days) + ' days ago';
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return days + ' days';
  }

  function sanitizeName(raw) {
    if (typeof raw !== 'string') return '';
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    return trimmed.slice(0, MAX_NAME);
  }

  function validateItem(item) {
    if (!item || typeof item !== 'object') return false;
    if (typeof item.id !== 'string' || item.id.length < 1 || item.id.length > 64) return false;
    if (typeof item.name !== 'string' || item.name.length < 1 || item.name.length > MAX_NAME) return false;
    return isValidDateString(item.date);
  }

  function sortItems(items) {
    return items.slice().sort((a, b) => {
      const da = daysUntil(a.date) ?? 9999;
      const db = daysUntil(b.date) ?? 9999;
      if (da !== db) return da - db;
      return a.name.localeCompare(b.name);
    });
  }

  const api = {
    DATE_RE,
    MAX_NAME,
    MAX_ITEMS,
    isValidDateString,
    localDateString,
    daysUntil,
    formatDays,
    sanitizeName,
    validateItem,
    sortItems
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkCountdown = api;
})(globalThis);
