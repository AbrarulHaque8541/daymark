/*
 * Daymark browser download safety card UI wiring for the web prototype.
 *
 * A small offline-first card next to the error taxonomy: the user picks a
 * download journey (redirects within one site, redirects to another site,
 * a server-chosen filename, an unknown file type, an expired link, an
 * installable app file, a suspicious filename) and this card shows,
 * locally, how Daymark will treat that download: the planned filename and
 * where it came from, the file type verdict, the redirect verdict, honest
 * retry advice, and the duplicate-tap rule. Nothing is fetched or
 * downloaded here; the planning engine is DaymarkBrowserDownload
 * (browser-download-logic.js). Mirrors the browser-error-ui.js module
 * style: attachBrowserDownloadUi(env) is fully injectable for unit tests.
 */
((root) => {
  'use strict';

  function attachBrowserDownloadUi(env) {
    if (!env || !env.document) throw new Error('attachBrowserDownloadUi requires a document.');
    const doc = env.document;
    // An env may explicitly pass downloadApi: null to model a page where
    // the engine failed to load; only fall back to the global when absent.
    const downloadApi = Object.prototype.hasOwnProperty.call(env, 'downloadApi')
      ? env.downloadApi
      : (root.DaymarkBrowserDownload || null);
    const storage = (env && env.localStorage) || (typeof localStorage !== 'undefined' ? localStorage : null);
    const LAST_SCENARIO_KEY = 'daymark.browser-download.last-scenario';

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const scenarioEl = element('browser-download-scenario');
    const statusEl = element('browser-download-status');
    const resultEl = element('browser-download-result');
    const formEl = element('browser-download-form');
    const clearEl = element('browser-download-clear');
    const copyEl = element('browser-download-copy');
    const planBtn = element('browser-download-check');

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function setStatusTone(hasNotices) {
      if (!statusEl || !statusEl.classList) return;
      if (hasNotices) statusEl.classList.add('has-notices');
      else statusEl.classList.remove('has-notices');
    }

    function isKnownScenario(id) {
      return !!(downloadApi && typeof downloadApi.isKnownScenarioId === 'function' && downloadApi.isKnownScenarioId(id));
    }

    function loadLastScenario() {
      if (!storage || typeof storage.getItem !== 'function') return '';
      try {
        const raw = storage.getItem(LAST_SCENARIO_KEY);
        return (typeof raw === 'string' && isKnownScenario(raw)) ? raw : '';
      } catch (_) { return ''; }
    }

    function saveLastScenario(id) {
      if (!storage || typeof storage.setItem !== 'function' || !isKnownScenario(id)) return;
      try { storage.setItem(LAST_SCENARIO_KEY, id); } catch (_) { /* ignore quota / private mode */ }
    }

    function clearLastScenario() {
      if (!storage || typeof storage.removeItem !== 'function') return;
      try { storage.removeItem(LAST_SCENARIO_KEY); } catch (_) { /* ignore */ }
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
      const titleRow = doc.createElement('div');
      titleRow.className = 'plan-title-row';
      const title = doc.createElement('span');
      title.className = 'feed-item-title';
      title.textContent = plan.ok && plan.filename ? plan.filename : 'Not checkable';
      titleRow.appendChild(title);
      const noticeCount = Array.isArray(plan.notices) ? plan.notices.length : 0;
      if (noticeCount > 0) {
        const badge = doc.createElement('span');
        badge.className = 'plan-notices-badge';
        badge.setAttribute('aria-label', noticeCount + ' safety notice' + (noticeCount === 1 ? '' : 's'));
        badge.textContent = String(noticeCount);
        titleRow.appendChild(badge);
      }
      const summary = doc.createElement('p');
      summary.className = 'feed-item-summary';
      summary.textContent = plan.summary;
      head.appendChild(titleRow);
      head.appendChild(summary);
      resultEl.appendChild(head);
      for (let i = 0; i < plan.lines.length; i += 1) {
        resultEl.appendChild(makeItem('feed-item', (i + 1) + '. ' + plan.lines[i]));
      }
    }

    function setBusy(on) {
      if (planBtn && planBtn.classList) {
        if (on) planBtn.classList.add('is-busy');
        else planBtn.classList.remove('is-busy');
      }
    }

    function plan() {
      setBusy(true);
      if (!downloadApi || typeof downloadApi.planScenario !== 'function') {
        status('Download planning is unavailable.');
        setStatusTone(false);
        setBusy(false);
        return;
      }
      const scenario = scenarioEl && typeof scenarioEl.value === 'string' ? scenarioEl.value : '';
      saveLastScenario(scenario);
      // The engine fails closed for any value the prototype does not know.
      const result = downloadApi.planScenario(scenario);
      if (!result.ok) {
        status('Not checkable \u00b7 nothing is planned.');
        setStatusTone(false);
      } else {
        status('Planned \u00b7 ' + result.filename + (Array.isArray(result.notices) && result.notices.length ? ' \u00b7 ' + result.notices.length + ' notice' + (result.notices.length === 1 ? '' : 's') : '')
          + (result.retryable ? ' \u00b7 safe to retry' : ' \u00b7 do not just retry'));
        setStatusTone(Array.isArray(result.notices) && result.notices.length > 0);
      }
      renderPlan(result);
      // Brief busy feedback for press consistency (sync engine; reduced-motion safe).
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setBusy(false));
        });
      } else {
        setBusy(false);
      }
    }

    function onClear() {
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
      clearLastScenario();
      if (scenarioEl) scenarioEl.value = '';
      status('Cleared. Pick a download journey to see its safety plan.');
      setStatusTone(false);
    }

    function collectPlanText() {
      if (!resultEl || !resultEl.children || resultEl.children.length === 0) return '';
      const lines = [];
      for (let i = 0; i < resultEl.children.length; i += 1) {
        const child = resultEl.children[i];
        if (child.textContent) lines.push(child.textContent.trim());
      }
      return lines.join('\n');
    }

    function onCopy() {
      const text = collectPlanText();
      if (!text) {
        status('Nothing to copy yet. Plan a journey first.');
        return;
      }
      const prev = statusEl ? statusEl.textContent : '';
      const done = (ok) => {
        status(ok ? 'Copied plan to clipboard.' : 'Could not copy plan.');
        setTimeout(() => { if (statusEl) statusEl.textContent = prev; }, 1800);
      };
      const clip = (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function')
        ? navigator.clipboard.writeText(text)
        : Promise.reject(new Error('no clipboard'));
      clip.then(() => done(true)).catch(() => done(false));
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

    // Restore the last valid journey the user planned, so the card remembers across reloads.
    const remembered = loadLastScenario();
    if (remembered && scenarioEl && scenarioEl.value !== remembered) {
      scenarioEl.value = remembered;
    }
    plan();

    return {
      plan,
      onClear,
      onCopy,
      detach() {
        // No document-level listener is registered; the returned handle
        // simply stops being used once it goes out of scope.
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
