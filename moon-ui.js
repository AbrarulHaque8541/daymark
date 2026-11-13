((root) => {
  'use strict';

  // Moon phase glance UI for the web prototype. Fully offline: no network,
  // no storage key, no boot-time storage reads. Clear only empties the view.
  //
  // Markup is injected here so the module can ship without touching index.html.
  // If a host page already provides the elements, they are reused as-is.

  const CARD_ID = 'moon-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('moon card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'moon-heading');

    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);

    const heading = doc.createElement('h2');
    heading.id = 'moon-heading';
    heading.textContent = 'Moon phase';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'moon-description';
    description.textContent = 'Computed on this device from a fixed astronomical epoch. No place is sent anywhere. No account, no API key, nothing is saved. Approximate only — not a high-precision ephemeris.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'moon-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');

    const actions = doc.createElement('div');
    actions.className = 'feed-actions';

    const checkBtn = doc.createElement('button');
    checkBtn.type = 'submit';
    checkBtn.id = 'moon-refresh';
    checkBtn.className = 'secondary-btn';
    checkBtn.textContent = 'Check';
    actions.appendChild(checkBtn);

    const clearBtn = doc.createElement('button');
    clearBtn.type = 'button';
    clearBtn.id = 'moon-clear';
    clearBtn.className = 'ghost-btn';
    clearBtn.textContent = 'Clear';
    actions.appendChild(clearBtn);

    form.appendChild(actions);
    aside.appendChild(form);

    const status = doc.createElement('p');
    status.id = 'moon-status';
    status.className = 'briefing-status';
    if (typeof status.setAttribute === 'function') status.setAttribute('role', 'status');
    status.textContent = 'Ready. Tap Check for the current phase on this device.';
    aside.appendChild(status);

    const result = doc.createElement('p');
    result.id = 'moon-result';
    result.className = 'briefing-result';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchors = ['daylight-card', 'air-card', 'weather-card'];
    let inserted = false;
    for (const id of anchors) {
      const anchor = typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
      if (anchor && anchor.parentNode) {
        if (anchor.nextSibling) anchor.parentNode.insertBefore(aside, anchor.nextSibling);
        else anchor.parentNode.appendChild(aside);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      const body = doc.body || (typeof doc.querySelector === 'function' ? doc.querySelector('body') : null);
      if (body && typeof body.appendChild === 'function') body.appendChild(aside);
    }
    return aside;
  }

  function attachMoonUi(env) {
    if (!env || typeof env !== 'object') throw new Error('moon UI environment is required.');
    const doc = env.document;
    if (!doc) throw new Error('moon UI document is required.');

    const moonApi = env.moonApi || root.DaymarkMoon || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date();

    ensureCard(doc);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const buttonEl = element('moon-refresh');
    const formEl = element('moon-form');
    const statusEl = element('moon-status');
    const resultEl = element('moon-result');
    const clearEl = element('moon-clear');

    let busy = false;

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function setBusy(isBusy) {
      busy = isBusy;
      if (buttonEl) {
        buttonEl.disabled = isBusy;
        if (buttonEl.classList && typeof buttonEl.classList.toggle === 'function') {
          buttonEl.classList.toggle('is-busy', isBusy);
        }
        if (clearEl && clearEl.classList && typeof clearEl.classList.toggle === 'function') {
          clearEl.classList.toggle('is-busy', isBusy);
        }
        if (typeof buttonEl.setAttribute === 'function') {
          if (isBusy) buttonEl.setAttribute('aria-busy', 'true');
          else buttonEl.removeAttribute('aria-busy');
        }
      }
    }

    function render(briefing) {
      if (!resultEl || !briefing) return;
      const line = moonApi && typeof moonApi.formatBriefingLine === 'function'
        ? moonApi.formatBriefingLine(briefing)
        : (briefing.name || '');
      resultEl.textContent = line;
    }

    function onCheck() {
      if (busy) return;
      if (!moonApi || typeof moonApi.moonBriefing !== 'function') {
        status('Moon phase is unavailable.');
        return;
      }
      setBusy(true);
      status('Computing phase on this device…');
      try {
        const when = now();
        const briefing = moonApi.moonBriefing(when instanceof Date ? when : new Date(when));
        render(briefing);
        status('Computed offline. Approximate synodic phase; not saved.');
      } catch (error) {
        if (resultEl) resultEl.textContent = '';
        status('Could not compute phase: '
          + (error && error.message ? error.message : 'unknown error.'));
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      if (busy) return;
      if (resultEl) resultEl.textContent = '';
      status('Cleared. Nothing was stored on this device.');
    }

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        onCheck();
      });
    }
    if (buttonEl && typeof buttonEl.addEventListener === 'function') {
      buttonEl.addEventListener('click', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        onCheck();
      });
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }

    return {
      check: onCheck,
      clear: onClear,
      isBusy: () => busy
    };
  }

  const api = { attachMoonUi, ensureCard, CARD_ID };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.DaymarkMoonUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachMoonUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
