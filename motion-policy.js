(function exposeMotionPolicy(root) {
  'use strict';

  function focusScrollBehavior(matchMedia = root && typeof root.matchMedia === 'function'
    ? root.matchMedia.bind(root)
    : null) {
    if (typeof matchMedia !== 'function') return 'auto';
    try {
      return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    } catch (_) {
      return 'auto';
    }
  }

  const policy = Object.freeze({ focusScrollBehavior });
  if (typeof module === 'object' && module.exports) module.exports = policy;
  else if (root) root.DaymarkMotionPolicy = policy;
})(typeof window !== 'undefined' ? window : globalThis);

(function (root) {
  'use strict';
  function addPressFeedback(button) {
    if (!button || !button.classList) return;
    const press = () => { if (button.classList) button.classList.add('is-pressed'); };
    const release = () => { if (button.classList) button.classList.remove('is-pressed'); };
    if (typeof button.addEventListener === 'function') {
      button.addEventListener('pointerdown', press);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointerleave', release);
      button.addEventListener('pointercancel', release);
    }
  }
  function attachTaskToolsPressFeedback() {
    const ids = [
      'chip-today', 'chip-tomorrow', 'sort-toggle', 'reset-view', 'clear-search',
      'complete-visible', 'copy-visible', 'clear-completed', 'export-tasks', 'import-tasks'
    ];
    ids.forEach((id) => {
      const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null;
      if (el) addPressFeedback(el);
    });
    if (typeof document !== 'undefined' && document.querySelectorAll) {
      document.querySelectorAll('.filter-button').forEach(addPressFeedback);
    }
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachTaskToolsPressFeedback);
    else attachTaskToolsPressFeedback();
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports.addPressFeedback = addPressFeedback;
    module.exports.attachTaskToolsPressFeedback = attachTaskToolsPressFeedback;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);