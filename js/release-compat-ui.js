/* Daymark release-compatibility card UI wiring for the web prototype.
 *
 * A small local guide next to the other briefing cards: the user picks a
 * release topic and sees fixed source-backed explanations. It does not
 * inspect an installed app or APK, test a migration, or perform an update or
 * rollback. Nothing is fetched, nothing runs and no setting is changed; the
 * catalog engine is DaymarkReleaseCompat
 * (release-compat-logic.js). Remembers the last selected topic across
 * sessions (localStorage only, fail-closed). Mirrors the permission-lifecycle-ui.js module
 * style: attachReleaseCompatUi(env) is fully injectable for unit tests.
 */
((root) => {
  'use strict';
  const PREFS_KEY = 'daymark.release-compat.prefs.v1';
  function attachReleaseCompatUi(env) {
    if (!env || !env.document) throw new Error('attachReleaseCompatUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    let storage = null;
    try {
      storage = Object.prototype.hasOwnProperty.call(env, 'localStorage')
        ? env.localStorage
        : (win && win.localStorage) || null;
    } catch (error) {
      storage = null;
    }
    const dataApi = Object.prototype.hasOwnProperty.call(env, 'dataApi')
      ? env.dataApi
      : (root.DaymarkReleaseCompat || null);
    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const topicEl = element('release-compat-topic');
    const statusEl = element('release-compat-status');
    const resultEl = element('release-compat-result');
    const formEl = element('release-compat-form');
    const clearEl = element('release-compat-clear');
    function status(message, isSuccess) {
      if (statusEl) statusEl.textContent = message;
      if (statusEl && statusEl.classList && typeof statusEl.classList.add === 'function' && typeof statusEl.classList.remove === 'function') {
        if (isSuccess) statusEl.classList.add('is-success');
        else statusEl.classList.remove('is-success');
      }
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
          resultEl.classList.remove('is-updating');
        }
      }
    }
    function persistTopic(topic) {
      if (!storage || typeof storage.setItem !== 'function' || !topic) return;
      try {
        storage.setItem(PREFS_KEY, JSON.stringify({ topic: topic }));
      } catch (error) {
        // Fail closed: do not surface storage errors as user-facing failures for this optional preference.
      }
    }
    function restoreTopic() {
      if (!storage || typeof storage.getItem !== 'function' || !topicEl) return;
      try {
        const raw = storage.getItem(PREFS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.topic === 'string' && parsed.topic) {
          topicEl.value = parsed.topic;
        }
      } catch (error) {
        // Ignore corrupt or inaccessible preference.
      }
    }
    function explain() {
      if (!dataApi || typeof dataApi.explainTopic !== 'function') {
        status('Release-compatibility explanations are unavailable.');
        return;
      }
      const topic = topicEl && typeof topicEl.value === 'string' ? topicEl.value : '';
      persistTopic(topic);
      const result = dataApi.explainTopic(topic);
      const ok = !!result.available;
      status(!ok
        ? 'Unavailable · ' + result.label + ' · no action was run'
        : 'Explained · ' + result.label + (result.requiresAction ? ' · check needed' : ''), ok);
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
    restoreTopic();
    explain();
    return {
      explain, onClear,
      detach() { status(''); }
    };
  }
  const api = { attachReleaseCompatUi, PREFS_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkReleaseCompatUi = api;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachReleaseCompatUi({ document, window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
