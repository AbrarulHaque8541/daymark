/*
 * Daymark address-bar insights card UI for the web prototype.
 *
 * Stateless wiring behind the "Address bar, explained" briefing card.
 * The card reads only the text the user pastes, explains it offline,
 * and never fetches, opens, or stores anything. Missing elements or a
 * missing logic engine degrade honestly instead of guessing.
 */
((root) => {
  'use strict';

  const IDS = {
    card: 'url-insights-card',
    input: 'url-insights-input',
    status: 'url-insights-status',
    result: 'url-insights-result',
    form: 'url-insights-form',
    clear: 'url-insights-clear'
  };

  function elementById(doc, id) {
    return typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
  }

  function renderResult(resultEl, doc, plan) {
    if (!resultEl) return;
    while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
    const item = doc.createElement('div');
    item.className = 'feed-item';
    const title = doc.createElement('div');
    title.textContent = plan.title;
    item.appendChild(title);
    resultEl.appendChild(item);
    const lines = plan.lines.concat(['Network · ' + plan.network]);
    for (let i = 0; i < lines.length; i += 1) {
      const row = doc.createElement('div');
      row.textContent = lines[i];
      resultEl.appendChild(row);
    }
  }

  function attachUrlInsightsUi(env) {
    if (!env || !env.document) throw new Error('attachUrlInsightsUi requires a document');
    const doc = env.document;
    const engine = env.insightsApi !== undefined
      ? env.insightsApi
      : (root.DaymarkUrlInsights || null);
    const input = elementById(doc, IDS.input);
    const statusEl = elementById(doc, IDS.status);
    const resultEl = elementById(doc, IDS.result);
    const form = elementById(doc, IDS.form);
    const clearButton = elementById(doc, IDS.clear);
    let detached = false;

    function plan() {
      if (detached || !input) return;
      if (!engine) {
        if (statusEl) statusEl.textContent = 'Address explanation is unavailable.';
        return;
      }
      const value = typeof input.value === 'string' ? input.value : '';
      const explained = engine.explainAddress(value);
      if (statusEl) {
        statusEl.textContent = explained.verdict === 'refused'
          ? explained.title + ' · nothing was opened'
          : 'Planned · ' + explained.title + ' · nothing was opened or fetched';
      }
      renderResult(resultEl, doc, explained);
    }

    function onClear() {
      if (detached) return;
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
      if (statusEl) statusEl.textContent = 'Plan cleared; nothing was opened';
    }

    function detach() {
      detached = true;
    }

    if (form && typeof form.addEventListener === 'function') {
      form.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        plan();
      });
    }
    if (clearButton && typeof clearButton.addEventListener === 'function') {
      clearButton.textContent = 'Clear plan';
      if (typeof clearButton.setAttribute === 'function') {
        clearButton.setAttribute('aria-label', 'Clear the explanation; no page is opened and nothing is fetched');
      }
      clearButton.addEventListener('click', () => { onClear(); });
    }

    return { plan, onClear, detach };
  }

  function boot() {
    if (!root.document) return;
    try {
      attachUrlInsightsUi({ document: root.document });
    } catch (error) {
      // Honest degradation: the card simply does less.
    }
  }

  if (root.document && root.document.readyState === 'loading'
    && typeof root.document.addEventListener === 'function') {
    root.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  const api = { attachUrlInsightsUi, IDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkUrlInsightsUi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
