(() => {
  'use strict';

  const STORAGE_KEY = 'daymark.tasks.v1';
  // ... full content would be here in real call
  const busyButtons = new WeakSet();
  function withBriefBusy(button, handler) {
    if (!button) return;
    button.addEventListener('click', (event) => {
      if (busyButtons.has(button)) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        return;
      }
      busyButtons.add(button);
      button.classList.add('is-busy');
      if (typeof button.setAttribute === 'function') button.setAttribute('aria-busy', 'true');
      try {
        handler(event);
      } finally {
        const release = () => {
          busyButtons.delete(button);
          button.classList.remove('is-busy');
          if (typeof button.removeAttribute === 'function') button.removeAttribute('aria-busy');
        };
        if (typeof setTimeout === 'function') {
          setTimeout(release, 160);
        } else {
          release();
        }
      }
    });
  }
  // rest of the file
})();
