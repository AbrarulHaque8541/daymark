/*
 * Daymark browser error explanation card UI wiring for the web prototype.
 *
 * A small network-on-demand card next to the address-bar preview: the user
 * picks a failure scenario (offline, DNS, timeout, TLS, HTTP 4xx/5xx,
 * blocked link, download failure, unknown) and this card shows, locally,
 * how Daymark's browser will explain that failure in plain words — a calm
 * title, what happened, and concrete recovery steps. Nothing is fetched
 * or loaded; the taxonomy engine is DaymarkBrowserError
 * (browser-error-logic.js). Mirrors the browser-address-ui.js module
 * style: attachBrowserErrorUi(env) is fully injectable for unit tests.
 */
((root) => {
  'use strict';

  function attachBrowserErrorUi(env) {
    if (!env || !env.document) throw new Error('attachBrowserErrorUi requires a document.');
    const doc = env.document;
    // An env may explicitly pass errorApi: null to model a page where the
    // engine failed to load; only fall back to the global when it is absent.
    const errorApi = Object.prototype.hasOwnProperty.call(env, 'errorApi')
      ? env.errorApi
      : (root.DaymarkBrowserError || null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const scenarioEl = element('browser-error-scenario');
    const statusEl = element('browser-error-status');
    const resultEl = element('browser-error-result');
    const formEl = element('browser-error-form');
    const clearEl = element('browser-error-clear');

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function makeItem(className, text) {
      const item = doc.createElement('div');
      item.className = className;
      item.textContent = text;
      return item;
    }

    function renderExplanation(result) {
      if (!resultEl) return;
      while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      const head = doc.createElement('div');
      head.className = 'feed-item';
      const title = doc.createElement('span');
      title.className = 'feed-item-title';
      title.textContent = result.title;
      const summary = doc.createElement('p');
      summary.className = 'feed-item-summary';
      summary.textContent = result.summary;
      head.appendChild(title);
      head.appendChild(summary);
      resultEl.appendChild(head);
      for (let i = 0; i < result.recoveries.length; i += 1) {
        resultEl.appendChild(makeItem('feed-item',
          (i + 1) + '. ' + result.recoveries[i]));
      }
    }

    function explain() {
      if (!errorApi || typeof errorApi.explainError !== 'function') {
        status('Error explanations are unavailable.');
        return;
      }
      const scenario = scenarioEl && typeof scenarioEl.value === 'string' ? scenarioEl.value : '';
      // The engine fails closed to the honest unknown category for any
      // value the prototype does not know.
      const result = errorApi.explainError(scenario);
      status('Explained \u00b7 ' + result.label + (result.retryable ? ' \u00b7 you can retry' : ''));
      renderExplanation(result);
    }

    function onClear() {
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
      status('Cleared. Pick a failure to see its plain-words explanation.');
    }

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        explain();
      });
    }
    if (scenarioEl && typeof scenarioEl.addEventListener === 'function') {
      scenarioEl.addEventListener('change', () => { explain(); });
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }

    explain();

    return {
      explain,
      onClear,
      detach() {
        // No document-level listener is registered; the returned handle
        // simply stops being used once it goes out of scope.
        status('');
      }
    };
  }

  const api = { attachBrowserErrorUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkBrowserErrorUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // This UI is stateless. Do not touch window.localStorage during boot:
    // storage may be disabled or its getter may throw before the card can render.
    const boot = () => attachBrowserErrorUi({ document });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
