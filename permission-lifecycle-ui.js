/*
 * Daymark permission-lifecycle card UI wiring for the web prototype.
 *
 * A small offline card next to the other planning cards: the user picks a
 * permission lifecycle state (granted, denied this time, denied with
 * "don't ask again", revoked in Android Settings, per-site reset) and this
 * card shows, locally and in plain words, what still works, what is lost,
 * whether the prompt can appear again, how to recover and what it costs.
 * Nothing is fetched, nothing runs and no setting is changed; the catalog
 * engine is DaymarkPermissionLifecycle (permission-lifecycle-logic.js).
 * Mirrors the browser-data-ui.js module style: attachPermissionLifecycleUi(env)
 * is fully injectable for unit tests and the card is stateless, so boot
 * never touches window.localStorage.
 */
((root) => {
  'use strict';

  function attachPermissionLifecycleUi(env) {
    if (!env || !env.document) throw new Error('attachPermissionLifecycleUi requires a document.');
    const doc = env.document;
    // An env may explicitly pass dataApi: null to model a page where the
    // engine failed to load; only fall back to the global when absent.
    const dataApi = Object.prototype.hasOwnProperty.call(env, 'dataApi')
      ? env.dataApi
      : (root.DaymarkPermissionLifecycle || null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const stateEl = element('permission-lifecycle-state');
    const statusEl = element('permission-lifecycle-status');
    const resultEl = element('permission-lifecycle-result');
    const formEl = element('permission-lifecycle-form');
    const clearEl = element('permission-lifecycle-clear');

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
      if (resultEl.classList && typeof resultEl.classList.remove === 'function') {
        resultEl.classList.remove('is-updating');
      }
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
      for (let i = 0; i < result.stillWorks.length; i += 1) {
        lines.push('Still works \u00b7 ' + result.stillWorks[i]);
      }
      for (let i = 0; i < result.lost.length; i += 1) {
        lines.push('Lost until you act \u00b7 ' + result.lost[i]);
      }
      lines.push('Prompts again \u00b7 ' + (result.promptsAgain ? 'yes' : 'no'));
      lines.push('Recovery \u00b7 ' + result.recovery);
      lines.push('User action \u00b7 ' + result.userAction);
      lines.push('Scope \u00b7 ' + result.scope);
      lines.push('Network \u00b7 ' + result.network);
      for (let i = 0; i < lines.length; i += 1) {
        resultEl.appendChild(makeItem('feed-item', lines[i]));
      }
      // Subtle motion for professional polish; respects reduced-motion via CSS.
      if (resultEl.classList && typeof resultEl.classList.add === 'function') {
        resultEl.classList.add('is-updating');
        try {
          setTimeout(() => {
            if (resultEl.classList && typeof resultEl.classList.remove === 'function') {
              resultEl.classList.remove('is-updating');
            }
          }, 180);
        } catch (timerUnavailable) {
          // Some embedded engines provide no working timer; the class is
          // removed on the next render instead. Rendering stays complete.
        }
      }
    }

    function explain() {
      if (!dataApi || typeof dataApi.explainPermissionState !== 'function') {
        status('Permission-lifecycle explanations are unavailable.');
        return;
      }
      const state = stateEl && typeof stateEl.value === 'string' ? stateEl.value : '';
      // The engine fails closed to the honest unknown entry for any value
      // the prototype does not know.
      const result = dataApi.explainPermissionState(state);
      status(!result.available
        ? 'Unavailable \u00b7 ' + result.label + ' \u00b7 no action was run'
        : 'Explained \u00b7 ' + result.label
          + (result.deletesData ? ' \u00b7 clears site data' : ' \u00b7 changes no data'));
      renderExplanation(result);
    }

    function onClear() {
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
      status('Explanation cleared; no permission, setting or stored data was changed.');
    }

    if (clearEl) {
      clearEl.textContent = 'Clear explanation';
      if (typeof clearEl.setAttribute === 'function') {
        clearEl.setAttribute('aria-label', 'Clear explanation only; no permission, setting or stored data is changed');
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
    if (stateEl && typeof stateEl.addEventListener === 'function') {
      stateEl.addEventListener('change', () => { explain(); });
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

  const api = { attachPermissionLifecycleUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkPermissionLifecycleUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // This UI is stateless. Do not touch window.localStorage during boot:
    // storage may be disabled or its getter may throw before the card can render.
    const boot = () => attachPermissionLifecycleUi({ document });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
