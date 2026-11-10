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
    const explainEl = element('browser-data-explain');

    function setBusy(busy) {
      if (!explainEl) return;
      if (busy) {
        explainEl.setAttribute('aria-busy', 'true');
        if (explainEl.classList && typeof explainEl.classList.add === 'function') explainEl.classList.add('is-busy');
        explainEl.disabled = true;
      } else {
        explainEl.removeAttribute('aria-busy');
        if (explainEl.classList && typeof explainEl.classList.remove === 'function') explainEl.classList.remove('is-busy');
        explainEl.disabled = false;
      }
    }

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
      lines.push((result.recoverable ? 'Comes back · ' : 'No undo · ') + result.recovery);
      lines.push('Scope · ' + result.scope);
      lines.push('Network · ' + result.network);
      for (let i = 0; i < lines.length; i += 1) {
        resultEl.appendChild(makeItem('feed-item', lines[i]));
      }
    }

    function explain() {
      if (!dataApi || typeof dataApi.explainClearAction !== 'function') {
        status('Clear-action explanations are unavailable.');
        return;
      }
      setBusy(true);
      try {
        const action = actionEl && typeof actionEl.value === 'string' ? actionEl.value : '';
        // The engine fails closed to the honest unknown entry for any value
        // the prototype does not know.
        const result = dataApi.explainClearAction(action);
        status('Explained \u00b7 ' + result.label
          + (result.deletesData ? ' \u00b7 deletes data' : ' \u00b7 deletes nothing'));
        renderExplanation(result);
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
      status('Cleared. Pick an action to see exactly what it touches.');
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

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { attachBrowserDataUi };
  } else {
    root.attachBrowserDataUi = attachBrowserDataUi;
  }

  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => attachBrowserDataUi({ document, dataApi: root.DaymarkBrowserData }));
  } else if (typeof document !== 'undefined') {
    attachBrowserDataUi({ document, dataApi: root.DaymarkBrowserData });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
