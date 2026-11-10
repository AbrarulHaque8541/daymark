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
 *
 * Cycle B addition: Copy explanation button with press/busy feedback.
 */
((root) => {
  'use strict';

  function attachBrowserDataUi(env) {
    if (!env || !env.document) throw new Error('attachBrowserDataUi requires a document.');
    const doc = env.document;
    const dataApi = Object.prototype.hasOwnProperty.call(env, 'dataApi')
      ? env.dataApi
      : (root.DaymarkBrowserData || null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const actionEl = element('browser-data-action');
    const statusEl = element('browser-data-status');
    const resultEl = element('browser-data-result');
    const formEl = element('browser-data-form');
    const clearEl = element('browser-data-clear');
    const copyEl = element('browser-data-copy');

    let lastExplanationText = '';

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function makeItem(className, text) {
      const item = doc.createElement('div');
      item.className = className;
      item.textContent = text;
      return item;
    }

    function setBusy(button, busy) {
      if (!button || !button.classList) return;
      
      button.classList.toggle('is-busy', busy);
      button.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    function renderExplanation(result) {
      if (!resultEl) return;
      while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);

      const lines = [];
      lines.push(result.title);
      lines.push(result.summary);
      for (let i = 0; i < result.removes.length; i += 1) {
        lines.push('Removes · ' + result.removes[i]);
      }
      for (let i = 0; i < result.keeps.length; i += 1) {
        lines.push('Keeps · ' + result.keeps[i]);
      }
      lines.push((result.recoverable ? 'Comes back · ' : 'No undo · ') + result.recovery);
      lines.push('Scope · ' + result.scope);
      lines.push('Network · ' + result.network);
      lastExplanationText = lines.join('\n');

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

      for (let i = 2; i < lines.length; i += 1) {
        resultEl.appendChild(makeItem('feed-item', lines[i]));
      }
    }

    function explain() {
      if (!dataApi || typeof dataApi.explainClearAction !== 'function') {
        status('Clear-action explanations are unavailable.');
        lastExplanationText = '';
        return;
      }
      const action = actionEl && typeof actionEl.value === 'string' ? actionEl.value : '';
      const result = dataApi.explainClearAction(action);
      status('Explained · ' + result.label
        + (result.deletesData ? ' · deletes data' : ' · deletes nothing'));
      renderExplanation(result);
    }

    function onClear() {
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
      lastExplanationText = '';
      status('Cleared. Pick an action to see exactly what it touches.');
    }

    function copyExplanation() {
      if (!lastExplanationText) {
        status('Nothing to copy yet. Explain an action first.');
        return;
      }
      const nav = env.navigator || (typeof navigator !== 'undefined' ? navigator : null);
      if (!nav || !nav.clipboard || typeof nav.clipboard.writeText !== 'function') {
        status('Clipboard is unavailable in this browser.');
        return;
      }
      setBusy(copyEl, true);
      status('Copying explanation…');
      Promise.resolve(nav.clipboard.writeText(lastExplanationText))
        .then(() => {
          status('Copied the clear-action explanation.');
        })
        .catch(() => {
          status('Could not copy the explanation.');
        })
        .finally(() => {
          setBusy(copyEl, false);
        });
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
    if (copyEl && typeof copyEl.addEventListener === 'function') {
      copyEl.addEventListener('click', () => { copyExplanation(); });
    }

    explain();

    return {
      explain,
      onClear,
      copyExplanation,
      detach() {
        status('');
      }
    };
  }

  const api = { attachBrowserDataUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkBrowserDataUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachBrowserDataUi({ document });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
