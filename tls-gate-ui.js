/*
 * Daymark TLS gate card UI wiring for the web prototype.
 *
 * A small offline planner card in the browser cards column: the user picks
 * a certificate-failure scenario and the fresh-install consent state, and
 * the card shows, computed locally, how Daymark explains the TLS failure
 * (plain words, never bypassable) and what the consent gate allows in that
 * state. Nothing is fetched or loaded; the engine is DaymarkTlsGate
 * (tls-gate-logic.js). Mirrors the browser-error-ui.js module style:
 * attachTlsGateUi(env) is fully injectable for unit tests.
 */
((root) => {
  'use strict';

  function attachTlsGateUi(env) {
    if (!env || !env.document) throw new Error('attachTlsGateUi requires a document.');
    const doc = env.document;
    // An env may explicitly pass gateApi: null to model a page where the
    // engine failed to load; only fall back to the global when it is absent.
    const gateApi = Object.prototype.hasOwnProperty.call(env, 'gateApi')
      ? env.gateApi
      : (root.DaymarkTlsGate || null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const failureEl = element('tls-gate-failure');
    const consentEl = element('tls-gate-consent');
    const statusEl = element('tls-gate-status');
    const resultEl = element('tls-gate-result');
    const formEl = element('tls-gate-form');
    const clearEl = element('tls-gate-clear');

    let busy = false;

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function setBusy(value) {
      busy = value;
      if (formEl) {
        if (value) formEl.className = 'feed-form is-busy';
        else formEl.className = 'feed-form';
      }
      if (statusEl && typeof statusEl.setAttribute === 'function') {
        if (value) statusEl.setAttribute('aria-busy', 'true');
        else statusEl.removeAttribute('aria-busy');
      }
    }

    function makeItem(className, text) {
      const item = doc.createElement('div');
      item.className = className;
      item.textContent = text;
      return item;
    }

    function renderSection(heading, lines) {
      const head = makeItem('feed-item-title', heading);
      resultEl.appendChild(head);
      for (let i = 0; i < lines.length; i += 1) {
        resultEl.appendChild(makeItem('feed-item', lines[i]));
      }
    }

    function plan() {
      if (busy) return;
      if (!gateApi || typeof gateApi.planTlsJourney !== 'function') {
        status('TLS and consent-gate planning is unavailable.');
        return;
      }
      setBusy(true);
      try {
        const failure = failureEl && typeof failureEl.value === 'string' ? failureEl.value : '';
        const consent = consentEl && typeof consentEl.value === 'string' ? consentEl.value : '';
        const planResult = gateApi.planTlsJourney({ code: failure, consentState: consent });
        if (!resultEl) return;
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
        const head = doc.createElement('div');
        head.className = 'feed-item';
        const title = doc.createElement('span');
        title.className = 'feed-item-title';
        title.textContent = planResult.tls.title;
        const summary = doc.createElement('p');
        summary.className = 'feed-item-summary';
        summary.textContent = planResult.tls.summary
          + (planResult.origin ? ' Site: ' + planResult.origin + '.' : '');
        head.appendChild(title);
        head.appendChild(summary);
        resultEl.appendChild(head);
        for (let i = 0; i < planResult.tls.recoveries.length; i += 1) {
          resultEl.appendChild(makeItem('feed-item',
            (i + 1) + '. ' + planResult.tls.recoveries[i]));
        }
        renderSection('Consent gate: ' + planResult.gate.label, [
          planResult.gate.networkNote,
          'Allowed: ' + planResult.gate.allowed.join(' '),
          'Not allowed: ' + planResult.gate.blocked.join(' ')
        ]);
        status('Planned \u00b7 ' + planResult.tls.label
          + ' \u00b7 never bypassable \u00b7 gate: ' + planResult.gate.label);
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
      status('Cleared. Pick a certificate failure and a consent state to plan.');
    }

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        plan();
      });
    }
    if (failureEl && typeof failureEl.addEventListener === 'function') {
      failureEl.addEventListener('change', () => { plan(); });
    }
    if (consentEl && typeof consentEl.addEventListener === 'function') {
      consentEl.addEventListener('change', () => { plan(); });
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }

    plan();

    return {
      plan,
      onClear,
      isBusy() { return busy; },
      detach() {
        // No document-level listener is registered; the returned handle
        // simply stops being used once it goes out of scope.
        status('');
      }
    };
  }

  const api = { attachTlsGateUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkTlsGateUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // This UI is stateless. Do not touch window storage during boot:
    // storage may be disabled or its getter may throw before the card can
    // render, and this card has nothing to persist anyway.
    const boot = () => attachTlsGateUi({ document });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
