/*
 * Daymark clear-action lifecycle card UI wiring for the web prototype.
 *
 * A small offline card next to the other browser planning cards: the user
 * picks a storage-touching action (Clear completed, Clear search, Clear
 * webhook queue, Clear storage status, Import, Export) and this card
 * shows, locally and in plain words, exactly what that action removes,
 * what it keeps, whether the data can come back, its scope and whether
 * any network is involved. Nothing is fetched and no action is executed;
 * the catalog engine is DaymarkBrowserData (browser-data-logic.js).
 * Mirrors the browser-error-ui.js module style: attachBrowserDataUi(env)
 * is fully injectable for unit tests and the card is stateless, so boot
 * never touches window.localStorage.
 */
((root) => {
  'use strict';

  function attachBrowserDataUi(env) {
    if (!env || !env.document) throw new Error('attachBrowserDataUi requires a document.');
    const doc = env.document;
    // An env may explicitly pass dataApi: null to model a page where the
    // engine failed to load; only fall back to the global when absent.
    const dataApi = Object.prototype.hasOwnProperty.call(env, 'dataApi')
      ? env.dataApi
      : (root.DaymarkBrowserData || null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const actionEl = element('browser-data-action');
    const statusEl = element('browser-data-status');
    const resultEl = element('browser-data-result');
    const formEl = element('browser-data-form');
    const clearEl = element('browser-data-clear');

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
      const lines = [];
      for (let i = 0; i < result.removes.length; i += 1) {
        lines.push('Removes · ' + result.removes[i]);
      }
      for (let i = 0; i < result.keeps.length; i += 1) {
        lines.push('Keeps · ' + result.keeps[i]);
      }
      if (result.undoWindowSeconds > 0) {
        lines.push('Undo window · ' + result.undoWindowSeconds + ' seconds');
      }
      lines.push((result.recoverable ? 'Comes back · ' : 'No undo · ') + result.recovery);
      lines.push('Scope · ' + result.scope);
      lines.push('Network · ' + result.network);
      for (let i = 0; i < lines.length; i += 1) {
        resultEl.appendChild(makeItem('feed-item', lines[i]));
      }
      // Subtle motion for professional polish; respects reduced-motion via CSS.
      if (resultEl.classList && typeof resultEl.classList.add === 'function') {
        resultEl.classList.add('is-updating');
        setTimeout(() => {
          if (resultEl.classList && typeof resultEl.classList.remove === 'function') {
            resultEl.classList.remove('is-updating');
          }
        }, 180);
      }
    }

    function explain() {
      if (!dataApi || typeof dataApi.explainClearAction !== 'function') {
        status('Clear-action explanations are unavailable.');
        return;
      }
      const action = actionEl && typeof actionEl.value === 'string' ? actionEl.value : '';
      // The engine fails closed to the honest unknown entry for any value
      // the prototype does not know.
      const result = dataApi.explainClearAction(action);
      status(!result.available
        ? 'Unavailable · ' + result.label + ' · no action was run'
        : 'Explained · ' + result.label
          + (result.deletesData ? ' · deletes data' : ' · deletes nothing'));
      renderExplanation(result);
    }

    function onClear() {
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
      status('Explanation cleared; no task or storage data was changed.');
    }

    if (clearEl) {
      clearEl.textContent = 'Clear explanation';
      if (typeof clearEl.setAttribute === 'function') {
        clearEl.setAttribute('aria-label', 'Clear explanation only; no task or storage data is changed');
      }
      // Press feedback consistent with other tool buttons.
      if (typeof clearEl.addEventListener === 'function') {
        clearEl.addEventListener('pointerdown', () => {
          if (clearEl.classList && typeof clearEl.classList.add === 'function') clearEl.classList.add('is-pressed');
        });
        clearEl.addEventListener('pointerup', () => {
          if (clearEl.classList && typeof clearEl.classList.remove === 'function') clearEl.classList.remove('is-pressed');
        });
        clearEl.addEventListener('pointercancel', () => {
          if (clearEl.classList && typeof clearEl.classList.remove === 'function') clearEl.classList.remove('is-pressed');
        });
      }
    }

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        explain();
      });
    }
    if (actionEl && typeof actionEl.addEventListener === 'function') {
      actionEl.addEventListener('change', () => { explain(); });
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }

    // Initial explain for loading-state completeness.
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

  const api = { attachBrowserDataUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkBrowserDataUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // This UI is stateless. Do not touch window.localStorage during boot:
    // storage may be disabled or its getter may throw before the card can render.
    const boot = () => attachBrowserDataUi({ document });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
