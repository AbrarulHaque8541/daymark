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

    const explainClearEl = element('explain-clear-completed');
    if (explainClearEl && actionEl && formEl) {
      explainClearEl.addEventListener('click', () => {
        actionEl.value = 'clear-completed';
        if (typeof formEl.requestSubmit === 'function') {
          formEl.requestSubmit();
        } else {
          formEl.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
        const card = element('browser-data-card');
        if (card && typeof card.scrollIntoView === 'function') {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (typeof actionEl.focus === 'function') actionEl.focus();
        status('Showing what Clear completed does.');
      });
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
      for (const removed of result.removes || []) lines.push(makeItem('feed-item', 'Removes · ' + removed));
      for (const kept of result.keeps || []) lines.push(makeItem('feed-item', 'Keeps · ' + kept));
      lines.push(makeItem('feed-item', (result.recoverable ? 'Can come back · ' : 'No undo · ') + (result.recovery || '')));
      lines.push(makeItem('feed-item', 'Scope · ' + (result.scope || '')));
      lines.push(makeItem('feed-item', 'Network · ' + (result.network || '')));
      for (const line of lines) resultEl.appendChild(line);
    }

    function explain() {
      if (!dataApi || typeof dataApi.explainClearAction !== 'function') {
        status('Clear-action catalog is unavailable.');
        return;
      }
      const id = actionEl ? actionEl.value : '';
      const result = dataApi.explainClearAction(id);
      renderExplanation(result);
      const deletes = result.deletesData ? 'deletes data' : 'does not delete data';
      status('Explained · ' + result.title + ' · ' + deletes);
    }

    if (formEl) {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        explain();
      });
    }
    if (clearEl) {
      clearEl.addEventListener('click', () => {
        if (resultEl) while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
        status('');
      });
    }
    if (actionEl) {
      actionEl.addEventListener('change', explain);
    }
    // Boot with the current selection.
    explain();

    return { explain };
  }

  function boot() {
    if (typeof document === 'undefined') return;
    attachBrowserDataUi({ document });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  const api = { attachBrowserDataUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DaymarkBrowserDataUi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
