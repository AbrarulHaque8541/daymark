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
 * Also supports planning a sequence of actions with export-before-delete
 * warnings using planClearSequence().
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
    const planEl = element('browser-data-plan');
    const planResultEl = element('browser-data-plan-result');
    const checksEl = element('browser-data-checks');

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
      if (planResultEl) {
        while (planResultEl.firstChild) planResultEl.removeChild(planResultEl.firstChild);
      }
      status('Cleared. Pick an action to see exactly what it touches.');
    }

    function collectSelectedIds() {
      if (!checksEl) return [];
      const boxes = checksEl.querySelectorAll('input[type="checkbox"]:checked');
      const ids = [];
      for (let i = 0; i < boxes.length; i += 1) {
        const id = boxes[i].value;
        if (id) ids.push(id);
      }
      return ids;
    }

    function renderPlan(plan) {
      if (!planResultEl) return;
      while (planResultEl.firstChild) planResultEl.removeChild(planResultEl.firstChild);
      if (!plan.ok) {
        planResultEl.appendChild(makeItem('feed-item', 'Plan refused: ' + plan.error));
        return;
      }
      planResultEl.appendChild(makeItem('feed-item', 'Planned sequence (nothing runs):'));
      for (let i = 0; i < plan.steps.length; i += 1) {
        planResultEl.appendChild(makeItem('feed-item', (i + 1) + '. ' + plan.steps[i]));
      }
      if (plan.warnings && plan.warnings.length) {
        for (let i = 0; i < plan.warnings.length; i += 1) {
          planResultEl.appendChild(makeItem('feed-item feed-item-warning', 'Warning: ' + plan.warnings[i]));
        }
      }
      if (plan.note) {
        planResultEl.appendChild(makeItem('feed-item', plan.note));
      }
    }

    function onPlan() {
      if (!dataApi || typeof dataApi.planClearSequence !== 'function') {
        status('Sequence planning is unavailable.');
        return;
      }
      const ids = collectSelectedIds();
      const plan = dataApi.planClearSequence(ids);
      status(plan.ok ? 'Sequence planned · ' + plan.ids.length + ' actions' : 'Sequence plan refused');
      renderPlan(plan);
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
    if (planEl && typeof planEl.addEventListener === 'function') {
      planEl.addEventListener('click', () => { onPlan(); });
    }

    explain();

    return {
      explain,
      onClear,
      onPlan,
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
