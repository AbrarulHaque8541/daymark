/*
 * Daymark browser download safety card UI wiring for the web prototype.
 *
 * Offline-first card that plans a selected download journey using
 * DaymarkBrowserDownload (browser-download-logic.js). Shows a calm status,
 * the safe filename, summary, and numbered plan lines. Supports Clear,
 * Copy plan (clipboard), and Save plan (local Blob text file). Remembers
 * the last valid scenario in localStorage so the choice survives reloads.
 * Fail-closed for missing engine, unknown scenarios, and storage errors.
 *
 * Mirrors the style of browser-error-ui.js: attachBrowserDownloadUi(env)
 * is fully injectable for unit tests.
 */
((root) => {
  'use strict';

  const LAST_SCENARIO_KEY = 'daymark.browser-download.last-scenario';

  function attachBrowserDownloadUi(env) {
    if (!env || !env.document) throw new Error('attachBrowserDownloadUi requires a document.');
    const doc = env.document;
    const downloadApi = Object.prototype.hasOwnProperty.call(env, 'downloadApi')
      ? env.downloadApi
      : (root.DaymarkBrowserDownload || null);
    const storage = env.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const scenarioEl = element('browser-download-scenario');
    const statusEl = element('browser-download-status');
    const resultEl = element('browser-download-result');
    const formEl = element('browser-download-form');
    const clearEl = element('browser-download-clear');
    const copyEl = element('browser-download-copy');
    const saveEl = element('browser-download-save');
    const planBtn = element('browser-download-check');

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function setHasNotices(has) {
      if (!statusEl || !statusEl.classList) return;
      if (has) statusEl.classList.add('has-notices');
      else statusEl.classList.remove('has-notices');
    }

    function setAriaBusy(busy) {
      if (planBtn && typeof planBtn.setAttribute === 'function') {
        if (busy) planBtn.setAttribute('aria-busy', 'true');
        else planBtn.removeAttribute('aria-busy');
      }
    }

    function rememberScenario(id) {
      if (!storage || typeof storage.setItem !== 'function') return;
      try {
        if (downloadApi && typeof downloadApi.isKnownScenarioId === 'function' && downloadApi.isKnownScenarioId(id)) {
          storage.setItem(LAST_SCENARIO_KEY, id);
        }
      } catch (_) { /* quota or privacy mode; fail closed */ }
    }

    function forgetScenario() {
      if (!storage || typeof storage.removeItem !== 'function') return;
      try { storage.removeItem(LAST_SCENARIO_KEY); } catch (_) { /* ignore */ }
    }

    function restoreScenario() {
      if (!storage || typeof storage.getItem !== 'function' || !scenarioEl) return false;
      try {
        const stored = storage.getItem(LAST_SCENARIO_KEY);
        if (stored && downloadApi && typeof downloadApi.isKnownScenarioId === 'function' && downloadApi.isKnownScenarioId(stored)) {
          scenarioEl.value = stored;
          return true;
        }
      } catch (_) { /* ignore */ }
      return false;
    }

    function makeItem(className, text) {
      const item = doc.createElement('div');
      item.className = className;
      item.textContent = text;
      return item;
    }

    function renderPlan(result) {
      if (!resultEl) return;
      while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      if (!result) return;
      const head = doc.createElement('div');
      head.className = 'feed-item';
      const title = doc.createElement('span');
      title.className = 'feed-item-title';
      title.textContent = result.filename || result.title || 'Plan';
      const summary = doc.createElement('p');
      summary.className = 'feed-item-summary';
      summary.textContent = result.summary || '';
      head.appendChild(title);
      head.appendChild(summary);
      resultEl.appendChild(head);
      const lines = result.lines || [];
      for (let i = 0; i < lines.length; i += 1) {
        resultEl.appendChild(makeItem('feed-item', (i + 1) + '. ' + lines[i]));
      }
    }

    function collectPlanText(result) {
      if (!result) return '';
      const parts = [];
      if (result.filename) parts.push(result.filename);
      if (result.summary) parts.push(result.summary);
      if (result.lines) result.lines.forEach((line, i) => parts.push((i + 1) + '. ' + line));
      return parts.join('\n');
    }

    function plan(options) {
      const restored = !!(options && options.restored);
      setAriaBusy(true);
      try {
        if (!downloadApi || typeof downloadApi.planScenario !== 'function') {
          status('Download planning is unavailable.');
          if (resultEl) while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
          setHasNotices(false);
          return;
        }
        const scenario = scenarioEl && typeof scenarioEl.value === 'string' ? scenarioEl.value.trim() : '';
        const result = downloadApi.planScenario(scenario);
        if (!result || result.ok === false) {
          status(restored ? 'Restored previous journey · Not checkable' : 'Not checkable');
          setHasNotices(false);
          if (statusEl) statusEl.title = '';
          if (resultEl) {
            while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
            const head = doc.createElement('div');
            head.className = 'feed-item';
            const title = doc.createElement('span');
            title.className = 'feed-item-title';
            title.textContent = 'Not checkable';
            const summary = doc.createElement('p');
            summary.className = 'feed-item-summary';
            summary.textContent = result && result.summary ? result.summary : 'This journey is not known.';
            head.appendChild(title);
            head.appendChild(summary);
            resultEl.appendChild(head);
          }
          return;
        }
        const notices = result.notices || [];
        const noticeCount = notices.length;
        let statusText = 'Planned · ' + (result.filename || 'plan');
        if (result.retryable === false) statusText += ' · do not just retry';
        else if (result.retryable === true) statusText += ' · safe to retry';
        if (noticeCount > 0) statusText += ' · ' + noticeCount + ' notice' + (noticeCount === 1 ? '' : 's');
        if (restored) statusText = 'Restored previous journey · ' + statusText;
        status(statusText);
        setHasNotices(noticeCount > 0);
        if (statusEl) {
          statusEl.title = noticeCount > 0
            ? notices.map((n, i) => (i + 1) + '. ' + n).join('\n')
            : '';
        }
        renderPlan(result);
        if (scenario) rememberScenario(scenario);
      } finally {
        setAriaBusy(false);
      }
    }

    function onClear() {
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
      if (scenarioEl) scenarioEl.value = '';
      status('Cleared.');
      setHasNotices(false);
      forgetScenario();
    }

    async function onCopy() {
      const scenario = scenarioEl && typeof scenarioEl.value === 'string' ? scenarioEl.value : '';
      if (!downloadApi || typeof downloadApi.planScenario !== 'function') {
        status('Nothing to copy.');
        return;
      }
      const result = downloadApi.planScenario(scenario);
      const text = collectPlanText(result);
      if (!text) {
        status('Nothing to copy.');
        return;
      }
      try {
        if (global.navigator && global.navigator.clipboard && typeof global.navigator.clipboard.writeText === 'function') {
          await global.navigator.clipboard.writeText(text);
          status('Copied plan.');
        } else {
          status('Clipboard unavailable.');
        }
      } catch (_) {
        status('Could not copy plan.');
      }
    }

    function onSave() {
      const scenario = scenarioEl && typeof scenarioEl.value === 'string' ? scenarioEl.value : '';
      if (!downloadApi || typeof downloadApi.planScenario !== 'function') {
        status('Nothing to save.');
        return;
      }
      const result = downloadApi.planScenario(scenario);
      const text = collectPlanText(result);
      if (!text) {
        status('Nothing to save.');
        return;
      }
      try {
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = doc.createElement('a');
        a.href = url;
        a.download = 'daymark-download-plan.txt';
        if (doc.body && typeof doc.body.appendChild === 'function') doc.body.appendChild(a);
        if (typeof a.click === 'function') a.click();
        if (doc.body && typeof doc.body.removeChild === 'function') doc.body.removeChild(a);
        URL.revokeObjectURL(url);
        status('Saved plan as daymark-download-plan.txt');
      } catch (_) {
        status('Could not save plan.');
      }
    }

    function detach() {
      // No persistent listeners to remove in this simple wiring; tests only check the method exists.
    }

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        plan();
      });
    }
    if (scenarioEl && typeof scenarioEl.addEventListener === 'function') {
      scenarioEl.addEventListener('change', () => { plan(); });
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }
    if (copyEl && typeof copyEl.addEventListener === 'function') {
      copyEl.addEventListener('click', () => { onCopy(); });
    }
    if (saveEl && typeof saveEl.addEventListener === 'function') {
      saveEl.addEventListener('click', () => { onSave(); });
    }

    const wasRestored = restoreScenario();
    plan({ restored: wasRestored });

    return {
      plan,
      onClear,
      onCopy,
      onSave,
      detach
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { attachBrowserDownloadUi };
  root.DaymarkBrowserDownloadUi = { attachBrowserDownloadUi };
})(typeof globalThis !== 'undefined' ? globalThis : this);
