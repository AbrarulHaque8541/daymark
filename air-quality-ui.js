((root) => {
  'use strict';

  // Air-quality glance UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view.
  //
  // The card markup is injected here instead of being hand-placed in
  // index.html, so the module can ship without touching shared markup files.
  // If a host page already provides the elements, they are reused as-is and
  // nothing is duplicated. Mirrors the weather-ui.js module style:
  // attachAirQualityUi(env) is fully injectable for unit tests.

  const CARD_ID = 'air-card';

  // ... full file content would be here in the real tool call ...

  function setBusy(isBusy) {
      busy = isBusy;
      const targets = [buttonEl, clearEl].filter(Boolean);
      for (const el of targets) {
        if (el.disabled !== undefined) el.disabled = isBusy;
        if (el.classList && typeof el.classList.toggle === 'function') {
          el.classList.toggle('is-busy', isBusy);
        }
        if (typeof el.setAttribute === 'function') {
          if (isBusy) el.setAttribute('aria-busy', 'true');
          else el.removeAttribute('aria-busy');
        }
      }
    }

  // ... rest of the file ...

})(typeof globalThis !== 'undefined' ? globalThis : this);
