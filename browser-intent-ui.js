/*
 * Daymark app-link planner card UI wiring for the web prototype.
 *
 * A small offline card next to the other browser planning cards: the
 * user pastes a link (an https page, a mailto/tel/sms handoff, a
 * tg:// deep link or an Android intent:// URI) and the card explains,
 * locally and in plain words, what would happen if they followed it —
 * including the app-not-installed fallback and the return path. Nothing
 * is fetched, nothing opens and no storage is touched; the engine is
 * DaymarkBrowserIntent (browser-intent-logic.js). Mirrors the
 * browser-data-ui.js module style: attachBrowserIntentUi(env) is fully
 * injectable for unit tests and the card is stateless, so boot never
 * touches window.localStorage.
 */
((root) => {
  'use strict';

  function attachBrowserIntentUi(env) {
    if (!env || !env.document) throw new Error('attachBrowserIntentUi requires a document.');
    const doc = env.document;
    // An env may explicitly pass intentApi: null to model a page where the
    // engine failed to load; only fall back to the global when absent.
    const intentApi = Object.prototype.hasOwnProperty.call(env, 'intentApi')
      ? env.intentApi
      : (root.DaymarkBrowserIntent || null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const linkEl = element('browser-intent-link');
    const statusEl = element('browser-intent-status');
    const resultEl = element('browser-intent-result');
    const formEl = element('browser-intent-form');
    const clearEl = element('browser-intent-clear');

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function makeItem(className, text) {
      const item = doc.createElement('div');
      item.className = className;
      item.textContent = text;
      return item;
    }

    function renderPlan(plan) {
      if (!resultEl) return;
      while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      const head = doc.createElement('div');
      head.className = 'feed-item';
      const title = doc.createElement('span');
      title.className = 'feed-item-title';
      title.textContent = plan.title;
      const summary = doc.createElement('p');
      summary.className = 'feed-item-summary';
      summary.textContent = plan.summary;
      head.appendChild(title);
      head.appendChild(summary);
      resultEl.appendChild(head);
      for (let i = 0; i < plan.lines.length; i += 1) {
        resultEl.appendChild(makeItem('feed-item', plan.lines[i]));
      }
      resultEl.appendChild(makeItem('feed-item', 'Network · ' + plan.network));
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

    function plan() {
      if (!intentApi || typeof intentApi.planIntentHandoff !== 'function') {
        status('App-link planning is unavailable.');
        return;
      }
      const link = linkEl && typeof linkEl.value === 'string' ? linkEl.value : '';
      // The engine fails closed: unknown or malformed links get an honest
      // "not planned" explanation instead of a guessed verdict.
      const planResult = intentApi.planIntentHandoff(link);
      status('Planned · ' + planResult.title + ' · nothing was opened');
      renderPlan(planResult);
    }

    function onClear() {
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
      status('Plan cleared; no link was followed and nothing was opened.');
    }

    if (clearEl) {
      clearEl.textContent = 'Clear plan';
      if (typeof clearEl.setAttribute === 'function') {
        clearEl.setAttribute('aria-label', 'Clear the plan only; no link is followed and nothing is opened');
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
        plan();
      });
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }

    return {
      plan,
      onClear,
      detach() {
        // No document-level listener is registered; the returned handle
        // simply stops being used once it goes out of scope.
        status('');
      }
    };
  }

  const api = { attachBrowserIntentUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkBrowserIntentUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // This UI is stateless. Do not touch window.localStorage during boot:
    // storage may be disabled or its getter may throw before the card can render.
    const boot = () => attachBrowserIntentUi({ document });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
