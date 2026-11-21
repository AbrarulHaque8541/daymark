((root) => {
  'use strict';
  const STORAGE_KEY = 'daymark.features.v1';
  const FLAG_IDS = ['command-bar', 'search-bangs', 'comfort-tint', 'mindful-breaks', 'focus-mode'];
  const FEATURE_FLAGS = [
    { id: 'command-bar', label: 'Command bar (Ctrl+K)', kind: 'feature', description: 'A keyboard palette that opens cards and runs searches without leaving the page.' },
    { id: 'search-bangs', label: '!bang search shortcuts', kind: 'feature', description: 'Type !g, !d, !br, !b, !sp or !y inside the palette to search a specific engine.' },
    { id: 'comfort-tint', label: 'Comfort tint', kind: 'planned', description: 'A soft warm tint over the page for long reading sessions.' },
    { id: 'mindful-breaks', label: 'Mindful break reminders', kind: 'planned', description: 'Gentle nudges to look away from the screen while you work.' },
    { id: 'focus-mode', label: 'Focus view (one task, one view)', kind: 'feature', description: 'Pick an open task and the page steps back behind a single view. Mark the task complete from there.' }
  ];
  function defaults() {
    const flags = {};
    for (const id of FLAG_IDS) flags[id] = false;
    return flags;
  }
  function knownBooleanCount(parsed) {
    let known = 0;
    for (const id of FLAG_IDS) {
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed[id] === 'boolean') known += 1;
    }
    return known;
  }
  function readFlags(storage) {
    if (!storage || typeof storage.getItem !== 'function') {
      return { ok: false, reason: 'storage-unavailable', flags: defaults() };
    }
    let raw = null;
    try { raw = storage.getItem(STORAGE_KEY); }
    catch (error) { return { ok: false, reason: 'storage-unavailable', flags: defaults() }; }
    if (raw === null || raw === undefined || raw === '') {
      return { ok: false, reason: 'no-saved-state', flags: defaults() };
    }
    if (typeof raw !== 'string') {
      return { ok: false, reason: 'malformed-saved-state', flags: defaults() };
    }
    let parsed = null;
    try { parsed = JSON.parse(raw); }
    catch (error) { return { ok: false, reason: 'malformed-saved-state', flags: defaults() }; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || knownBooleanCount(parsed) === 0) {
      return { ok: false, reason: 'malformed-saved-state', flags: defaults() };
    }
    const flags = defaults();
    for (const id of FLAG_IDS) {
      if (typeof parsed[id] === 'boolean') flags[id] = parsed[id];
    }
    return { ok: true, reason: '', flags: flags };
  }
  function setFlag(storage, id, value) {
    let entry = null;
    for (const flag of FEATURE_FLAGS) {
      if (flag.id === id) entry = flag;
    }
    if (typeof id !== 'string' || !entry) {
      return { ok: false, reason: 'unknown-flag', flags: defaults() };
    }
    if (entry.kind !== 'feature') {
      return { ok: false, reason: 'planned-flag', flags: defaults() };
    }
    if (typeof value !== 'boolean') {
      return { ok: false, reason: 'invalid-value', flags: defaults() };
    }
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      return { ok: false, reason: 'storage-unavailable', flags: defaults() };
    }
    const current = readFlags(storage);
    const next = current.flags;
    next[id] = value;
    try { storage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch (error) { return { ok: false, reason: 'storage-write-failed', flags: defaults() }; }
    return { ok: true, flags: next };
  }
  const api = { STORAGE_KEY: STORAGE_KEY, FLAG_IDS: FLAG_IDS, FEATURE_FLAGS: FEATURE_FLAGS, defaults: defaults, readFlags: readFlags, setFlag: setFlag };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkFeatureFlags = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
