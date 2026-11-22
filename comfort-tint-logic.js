((root) => {
  'use strict';
  const FLAG_ID = 'comfort-tint';
  const MODES = [
    { id: 'dim', label: 'Soft dim', overlay: 'rgba(5, 13, 11, 0.28)', note: 'A gentle dark veil for bright rooms.' },
    { id: 'warm', label: 'Warm evening', overlay: 'rgba(122, 74, 16, 0.20)', note: 'A warm hue that calms blue-heavy screens.' },
    { id: 'night', label: 'Deep night', overlay: 'rgba(10, 7, 24, 0.36)', note: 'The strongest veil, for late-night reading.' }
  ];
  const DEFAULT_MODE_ID = 'dim';
  function modeById(id) {
    if (typeof id !== 'string') return null;
    for (const mode of MODES) {
      if (mode.id === id) return mode;
    }
    return null;
  }
  function normalizeMode(value) {
    const mode = modeById(value);
    if (!mode) return { ok: false, reason: 'mode-unreadable', mode: null };
    return { ok: true, reason: null, mode: mode };
  }
  function describePlan(mode) {
    const norm = normalizeMode(mode);
    if (!norm.ok) return { ok: false, reason: norm.reason, lines: [] };
    const lines = [
      'A translucent overlay covers the whole page; nothing underneath is repainted.',
      'The overlay ignores taps and swipes (pointer-events: none), so every control keeps working.',
      'The accent color #16705f and text contrast are never changed by the tint.',
      'The overlay exists only while this page is open and this switch stays on; nothing is saved beyond the single Feature settings switch.',
      'Turn it off any time from Feature settings or this card; switching it off removes the overlay instantly.'
    ];
    return { ok: true, reason: null, lines: lines };
  }
  function resolveTintState(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      return { ok: false, reason: 'request-unreadable', active: false, modeId: null, label: null, note: null, overlay: null, lines: [] };
    }
    if (typeof request.enabled !== 'boolean') {
      return { ok: false, reason: 'enabled-unreadable', active: false, modeId: null, label: null, note: null, overlay: null, lines: [] };
    }
    const norm = normalizeMode(request.modeId);
    if (!norm.ok) {
      return { ok: false, reason: norm.reason, active: false, modeId: null, label: null, note: null, overlay: null, lines: [] };
    }
    if (request.enabled === false) {
      return { ok: true, reason: 'flag-off', active: false, modeId: norm.mode.id, label: norm.mode.label, note: norm.mode.note, overlay: null, lines: describePlan(norm.mode.id).lines };
    }
    return { ok: true, reason: null, active: true, modeId: norm.mode.id, label: norm.mode.label, note: norm.mode.note, overlay: norm.mode.overlay, lines: explainTint(norm.mode) };
  }
  function explainTint(mode) {
    const plan = describePlan(mode.id);
    return ['Comfort tint (' + mode.label + ') is on. ' + mode.note].concat(plan.lines);
  }
  const api = {
    FLAG_ID: FLAG_ID,
    MODES: MODES,
    DEFAULT_MODE_ID: DEFAULT_MODE_ID,
    modeById: modeById,
    normalizeMode: normalizeMode,
    describePlan: describePlan,
    resolveTintState: resolveTintState,
    explainTint: explainTint
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkComfortTint = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
