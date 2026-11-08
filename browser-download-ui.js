/*
 * Daymark offline browser download safety planning card UI.
 *
 * User picks a sample download journey; this card plans it locally with
 * DaymarkBrowserDownload (browser-download-logic.js) and shows the safe
 * filename, type, redirects, retry advice, and any safety notices.
 * Remembers the last chosen journey in localStorage. Copy plan to clipboard
 * or save as a local .txt file. Fully offline; no network.
 */
((root) => {
  'use strict';

  const LAST_SCENARIO_KEY = 'daymark.browser-download.last-scenario';
  const SAVE_FILENAME = 'daymark-download-plan.txt';

  function attachBrowserDownloadUi(env) {
    if (!env || !env.document) throw new Error('attachBrowserDownloadUi requires a document.');
    const doc = env.document;
    const downloadApi = Object.prototype.hasOwnProperty.call(env, 'downloadApi')
      ? env.downloadApi
      : (root.DaymarkBrowserDownload || null);
    const storage = env.localStorage || null;
    const nav = env.navigator || (typeof navigator !== "undefined" ? navigator : null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const scenarioEl = element('browser-download-scenario');
    const statusEl = element('browser-download-status');
    const resultEl = element('browser-download-result');
    const formEl = element('browser-download-form');
    const clearEl = element('browser-download-clear');
    const copyEl = element('browser-download-copy');
    const saveEl = element('browser-download-save');
    const shareEl = element('browser-download-share');
    const planBtn = element('browser-download-check');

    function status(message) {
      if (statusEl) statusEl.textContent = message || '';
    }

    function setHasNotices(has) {
      if (!statusEl || !statusEl.classList) return;
      if (has) statusEl.classList.add('has-notices');
      else statusEl.classList.remove('has-notices');
    }

    function setAriaBusy(busy) {
      if (!planBtn) return;
      if (typeof planBtn.setAttribute === 'function') {
        if (busy) planBtn.setAttribute('aria-busy', 'true');
        else planBtn.removeAttribute('aria-busy');
      }
      if (planBtn.classList) {
        if (busy) planBtn.classList.add('is-busy');
        else planBtn.classList.remove('is-busy');
      }
    }

    function rememberScenario(id) {
      if (!storage || typeof storage.setItem !== 'function') return;
      try {
        if (id && downloadApi && typeof downloadApi.isKnownScenarioId === 'function' && downloadApi.isKnownScenarioId(id)) {
          storage.setItem(LAST_SCENARIO_KEY, id);
        }
      } catch (e) { /* fail closed */ }
    }

    function forgetScenario() {
      if (!storage || typeof storage.removeItem !== 'function') return;
      try { storage.removeItem(LAST_SCENARIO_KEY); } catch (e) { /* fail closed */ }
    }

    function restoreScenario() {
      if (!storage || typeof storage.getItem !== 'function' || !scenarioEl) return false;
      try {
        const remembered = storage.getItem(LAST_SCENARIO_KEY);
        if (remembered && downloadApi && typeof downloadApi.isKnownScenarioId === 'function' && downloadApi.isKnownScenarioId(remembered)) {
          scenarioEl.value = remembered;
          return true;
        }
      } catch (e) { /* ignore */ }
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
      if (!result || !result.ok) {
        const head = doc.createElement('div');
        head.className = 'feed-item';
        const title = doc.createElement('span');
        title.className = 'feed-item-title';
        title.textContent = 'Not checkable';
        const summary = doc.createElement('p');
        summary.className = 'feed-item-summary';
        summary.textContent = (result && result.summary) || 'This download journey is not known, so nothing is planned.';
        head.appendChild(title);
        head.appendChild(summary);
        resultEl.appendChild(head);
        return;
      }
      const head = doc.createElement('div');
      head.className = 'feed-item';
      const title = doc.createElement('span');
      title.className = 'feed-item-title';
      title.textContent = result.filename || 'Download';
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

    function buildStatus(result, restored) {
      if (!result) return 'Unavailable.';
      if (!result.ok) return (restored ? 'Restored previous journey · ' : '') + 'Not checkable. ' + (result.summary || 'This download journey is not known, so nothing is planned.');
      const notices = result.notices || [];
      const noticePart = notices.length > 0 ? ' · ' + notices.length + ' notice' + (notices.length === 1 ? '' : 's') : '';
      const retryPart = result.retryable ? ' · safe to retry' : ' · do not just retry';
      const base = 'Planned · ' + (result.filename || 'download') + retryPart + noticePart;
      return (restored ? 'Restored previous journey · ' : '') + base;
    }

    function plan(options) {
      const restored = !!(options && options.restored);
      setAriaBusy(true);
      try {
        if (!downloadApi || typeof downloadApi.planScenario !== 'function') {
          status('Download planning is unavailable.');
          setHasNotices(false);
          if (resultEl) while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
          return;
        }
        const id = scenarioEl && typeof scenarioEl.value === 'string' ? scenarioEl.value : '';
        const result = downloadApi.planScenario(id);
        renderPlan(result);
        status(buildStatus(result, restored));
        setHasNotices(!!(result && result.notices && result.notices.length > 0));
        if (id) rememberScenario(id);
      } finally {
        setAriaBusy(false);
      }
    }

    function onClear() {
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
      if (scenarioEl) scenarioEl.value = '';
      setHasNotices(false);
      forgetScenario();
      status('Cleared. Pick a download journey to plan its safety.');
    }

    function collectPlanText() {
      if (!resultEl) return '';
      const parts = [];
      for (let i = 0; i < (resultEl.children || []).length; i += 1) {
        const child = resultEl.children[i];
        if (child && child.textContent) parts.push(child.textContent);
      }
      return parts.join('\n');
    }

    function onCopy() {
      const text = collectPlanText() || statusEl && statusEl.textContent || '';
      if (!text) {
        status('Nothing to copy yet.');
        return;
      }
      if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
        nav.clipboard.writeText(text).then(() => {
          status('Copied plan to clipboard.');
        }).catch(() => {
          status('Could not copy the plan.');
        });
      } else {
        status('Clipboard is not available in this environment.');
      }
    }

    function onSave() {
      const text = collectPlanText();
      if (!text) {
        status('Nothing to save yet.');
        return;
      }
      try {
        const blob = new Blob([text], { type: 'text/plain' });
        const urlApi = (typeof URL !== 'undefined' ? URL : null);
        if (!urlApi || typeof urlApi.createObjectURL !== 'function') {
          status('Saving is not available in this environment.');
          return;
        }
        const url = urlApi.createObjectURL(blob);
        const a = doc.createElement('a');
        a.href = url;
        a.download = SAVE_FILENAME;
        if (doc.body && typeof doc.body.appendChild === 'function') {
          doc.body.appendChild(a);
          if (typeof a.click === 'function') a.click();
          doc.body.removeChild(a);
        }
        if (typeof urlApi.revokeObjectURL === 'function') urlApi.revokeObjectURL(url);
        status('Saved plan as ' + SAVE_FILENAME + '.');
      } catch (e) {
        status('Could not save the plan.');
      }
    }

    function onShare() {
      const text = collectPlanText();
      if (!text) {
        status('Nothing to share yet.');
        return;
      }
      if (nav && typeof nav.share === 'function') {
        nav.share({ title: 'Daymark download safety plan', text }).then(() => {
          status('Shared plan.');
        }).catch(() => {
          status('Could not share the plan.');
        });
        return;
      }
      status('Sharing is not available in this environment.');
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
    if (shareEl && typeof shareEl.addEventListener === 'function') {
      shareEl.addEventListener('click', () => { onShare(); });
    }

    const wasRestored = restoreScenario();
    plan({ restored: wasRestored });

    return {
      plan,
      onClear,
      onCopy,
      onSave,
      onShare,
      detach() {
        status('');
      }
    };
  }

  const api = { attachBrowserDownloadUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkBrowserDownloadUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachBrowserDownloadUi({ document, window, localStorage: window.localStorage });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
