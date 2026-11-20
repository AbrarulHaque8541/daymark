(function (root) {
  'use strict';

  function addPressFeedback(button) {
    if (!button || !button.classList) return;
    const press = () => {
      if (button.classList) button.classList.add('is-pressed');
    };
    const release = () => {
      if (button.classList) button.classList.remove('is-pressed');
    };
    if (typeof button.addEventListener === 'function') {
      button.addEventListener('pointerdown', press);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointerleave', release);
      button.addEventListener('pointercancel', release);
    }
  }

  function attach() {
    const ids = [
      'chip-today',
      'chip-tomorrow',
      'sort-toggle',
      'reset-view',
      'clear-search',
      'complete-visible',
      'copy-visible',
      'clear-completed',
      'export-tasks',
      'import-tasks'
    ];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) addPressFeedback(el);
    });
    // Also filter buttons
    document.querySelectorAll('.filter-button').forEach(addPressFeedback);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attach);
    } else {
      attach();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { addPressFeedback, attach };
  }
  root.DaymarkTaskToolsPolish = { addPressFeedback, attach };
})(typeof globalThis !== 'undefined' ? globalThis : this);
