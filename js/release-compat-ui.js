/* Daymark release-compatibility card UI wiring for the web prototype.
 *
 * A small offline card next to the other planner cards: the user picks a
 * release topic (package identity, signer continuity, data migration, the
 * HTTPS-only updater, device gates, rollback and recovery) and this card
 * shows, locally and in plain words, what is true, what breaks if it is
 * ignored, the recovery and its cost. Nothing is fetched, nothing runs and
 * no setting is changed; the catalog engine is DaymarkReleaseCompat
 * (release-compat-logic.js). Mirrors the permission-lifecycle-ui.js module
 * style: attachReleaseCompatUi(env) is fully injectable for unit tests and
 * the card is stateless, so boot never touches window.localStorage.
 */
((root) => {
  'use strict';
  function attachReleaseCompatUi(env) {
    if (!env || !env.document) throw new Error('attachReleaseCompatUi requires a document.');
    const doc = env.document;
    const dataApi = Object.prototype.hasOwnProperty.call(env, 'dataApi')
      ? env.dataApi
      : (root.DaymarkReleaseCompat || null);
    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const topicEl = element('release-compat-topic');
    const statusEl = element('release-compat-status');
    const resultEl = element('release-compat-result');
    const formEl = element('release-compat-form');
    const clearEl = element('release-compat-clear');
    function status(message) { if (statusEl) statusEl.textContent = message; }
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
      for (let i = 0; i < result.keepsWorking.length; i += 1) lines.push('Stays true · ' + result.keepsWorking[i]);
      for (let i = 0; i < result.breaksIfIgnored.length; i += 1) lines.push('Breaks if ignored · ' + result.breaksIfIgnored[i]);
      lines.push('Action required · ' + (result.requiresAction ? 'yes, this one needs a deliberate step' : 'no, already pinned'));
      lines.push('Recovery · ' + result.recovery);
      lines.push('Scope · ' + result.scope);
      lines.push('Network · ' + result.network);
      for (let i = 0; i < lines.length; i += 1) resultEl.appendChild(makeItem('feed-item', lines[i]));
      if (resultEl.classList && typeof resultEl.classList.add === 'function' && typeof resultEl.classList.remove === 'function') {
        resultEl.classList.add('is-updating');
        try {
          setTimeout(function () { resultEl.classList.remove('is-updating'); }, 180);
        } catch (timerUnavailable) {
          // Some embedded engines provide no working timer; the class is
          // removed immediately instead. Rendering stays complete.
          resultEl.classList.remove('is-updating');
        }
      }
    }
    function explain() {
      if (!dataApi || typeof dataApi.explainTopic !== 'function') {
        status('Release-compatibility explanations are unavailable.');
        return;
      }
      const topic = topicEl && typeof topicEl.value === 'string' ? topicEl.value : '';
      const result = dataApi.explainTopic(topic);
      status(!result.available
        ? 'Unavailable · ' + result.label + ' · no action was run'
        : 'Explained · ' + result.label + (result.requiresAction ? ' · action required' : ' · already pinned'));
      renderExplanation(result);
    }
    function onClear() {
      if (resultEl) { while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild); }
      status('Explanation cleared; no setting, build or release was changed.');
    }
    if (clearEl) {
      clearEl.textContent = 'Clear explanation';
      if (typeof clearEl.setAttribute === 'function') {
        clearEl.setAttribute('aria-label', 'Clear explanation only; no setting, build or release is changed');
      }
      if (typeof clearEl.addEventListener === 'function') {
        clearEl.addEventListener('pointerdown', function () { if (clearEl.classList && clearEl.classList.add) clearEl.classList.add('is-pressed'); });
        clearEl.addEventListener('pointerup', function () { if (clearEl.classList && clearEl.classList.remove) clearEl.classList.remove('is-pressed'); });
        clearEl.addEventListener('pointercancel', function () { if (clearEl.classList && clearEl.classList.remove) clearEl.classList.remove('is-pressed'); });
      }
    }
    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', function (event) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        explain();
      });
    }
    if (topicEl && typeof topicEl.addEventListener === 'function') topicEl.addEventListener('change', function () { explain(); });
    if (clearEl && typeof clearEl.addEventListener === 'function') clearEl.addEventListener('click', function () { onClear(); });
    explain();
    return {
      explain, onClear,
      detach() { status(''); }
    };
  }
  const api = { attachReleaseCompatUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkReleaseCompatUi = api;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // This UI is stateless. Do not touch window storage state during boot:
    // storage may be disabled or its getter may throw before the card renders.
    const boot = () => attachReleaseCompatUi({ document });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
