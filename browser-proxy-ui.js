/*
 * Daymark offline browser proxy profile planner card UI.
 *
 * The user types a proxy address; this card validates it locally with
 * DaymarkBrowserProxy (browser-proxy-logic.js) and shows an honest plan of
 * what an optional, explicit, per-session proxy profile would mean, together
 * with the plain-language limits of Android WebView proxying. Remembers the
 * last accepted address in localStorage. Copy plan to clipboard. Fully
 * offline; no network, nothing is routed anywhere.
 */
((root) => {
  'use strict';

  const LAST_PROFILE_KEY = 'daymark.browser-proxy.last-profile';

  function resolveStorage(env) {
    try {
      if (Object.prototype.hasOwnProperty.call(env, 'localStorage')) {
        return env.localStorage || null;
      }
      const win = env.window || null;
      return win ? (win.localStorage || null) : null;
    } catch (e) {
      // Storage can throw at property access time in restricted WebView modes.
      return null;
    }
  }

  function attachBrowserProxyUi(env) {
    if (!env || !env.document) throw new Error('attachBrowserProxyUi requires a document.');
    const doc = env.document;
    const proxyApi = Object.prototype.hasOwnProperty.call(env, 'proxyApi')
      ? env.proxyApi
      : (root.DaymarkBrowserProxy || null);
    const storage = resolveStorage(env);
    const nav = env.navigator || (typeof navigator !== 'undefined' ? navigator : null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const inputEl = element('browser-proxy-address');
    const statusEl = element('browser-proxy-status');
    const resultEl = element('browser-proxy-result');
    const formEl = element('browser-proxy-form');
    const clearEl = element('browser-proxy-clear');
    const copyEl = element('browser-proxy-copy');
    const planBtn = element('browser-proxy-plan');

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

    function rememberProfile(text) {
      if (!storage || typeof storage.setItem !== 'function' || !text) return false;
      try {
        storage.setItem(LAST_PROFILE_KEY, text);
        return true;
      } catch (e) {
        return false;
      }
    }

    function forgetProfile() {
      if (!storage || typeof storage.removeItem !== 'function') return;
      try { storage.removeItem(LAST_PROFILE_KEY); } catch (e) { /* fail closed */ }
    }

    function sanitizedAddress(parsed, original) {
      const authority = parsed.host + (parsed.explicitPort ? ':' + parsed.port : '');
      const hadScheme = original.trim().includes('://');
      return hadScheme ? parsed.scheme + '://' + authority : authority;
    }

    function restoreProfile() {
      if (!storage || typeof storage.getItem !== 'function' || !inputEl) return false;
      try {
        const remembered = storage.getItem(LAST_PROFILE_KEY);
        if (typeof remembered === 'string' && remembered
          && proxyApi && typeof proxyApi.parseProxyAddress === 'function') {
          const parsed = proxyApi.parseProxyAddress(remembered);
          if (parsed) {
            const safeAddress = sanitizedAddress(parsed, remembered);
            inputEl.value = safeAddress;
            // Older builds may have persisted userinfo. Replace it with the
            // credential-free authority; if that fails, try to remove the
            // unsafe legacy value instead of keeping it by design.
            if (safeAddress !== remembered && !rememberProfile(safeAddress)) forgetProfile();
            return true;
          }
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
        summary.textContent = (result && result.summary) || 'This proxy address could not be checked, so nothing is planned.';
        head.appendChild(title);
        head.appendChild(summary);
        resultEl.appendChild(head);
        return;
      }
      const head = doc.createElement('div');
      head.className = 'feed-item';
      const title = doc.createElement('span');
      title.className = 'feed-item-title';
      title.textContent = result.scheme + '://' + result.host + ':' + result.port;
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
      if (!result.ok) return (restored ? 'Restored previous address · ' : '') + 'Not checkable. ' + (result.summary || '');
      const notices = result.notices || [];
      const noticePart = notices.length > 0 ? ' · ' + notices.length + ' notice' + (notices.length === 1 ? '' : 's') : '';
      const base = 'Planned · ' + result.scheme + '://' + result.host + ':' + result.port + noticePart;
      return (restored ? 'Restored previous address · ' : '') + base;
    }

    function plan(options) {
      const restored = !!(options && options.restored);
      setAriaBusy(true);
      try {
        if (!proxyApi || typeof proxyApi.planProfile !== 'function') {
          status('Proxy planning is unavailable.');
          setHasNotices(false);
          if (resultEl) while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
          return;
        }
        const text = inputEl && typeof inputEl.value === 'string' ? inputEl.value.trim() : '';
        const parsed = typeof proxyApi.parseProxyAddress === 'function'
          ? proxyApi.parseProxyAddress(text) : null;
        const result = proxyApi.planProfile(text);
        renderPlan(result);
        status(buildStatus(result, restored));
        setHasNotices(!!(result && result.notices && result.notices.length > 0));
        if (result && result.ok && parsed) {
          const safeAddress = sanitizedAddress(parsed, text);
          if (inputEl) inputEl.value = safeAddress;
          if (!rememberProfile(safeAddress)) forgetProfile();
        } else if (result && result.ok) {
          // Never persist an address if it cannot be independently parsed
          // into a credential-free representation.
          forgetProfile();
        }
      } finally {
        setAriaBusy(false);
      }
    }
    function onClear() {
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
      if (inputEl) inputEl.value = '';
      setHasNotices(false);
      forgetProfile();
      status('Cleared. Enter a proxy address to plan it honestly.');
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
      const text = collectPlanText() || (statusEl && statusEl.textContent) || '';
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

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        plan();
      });
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }
    if (copyEl && typeof copyEl.addEventListener === 'function') {
      copyEl.addEventListener('click', () => { onCopy(); });
    }

    const wasRestored = restoreProfile();
    if (wasRestored || (inputEl && typeof inputEl.value === 'string' && inputEl.value.trim())) {
      plan({ restored: wasRestored });
    } else {
      status('Enter a proxy address (host:port) to plan it honestly. Nothing is routed.');
    }

    return {
      plan,
      onClear,
      onCopy,
      detach() {
        status('');
      }
    };
  }

  const api = { attachBrowserProxyUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkBrowserProxyUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachBrowserProxyUi({ document, window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
