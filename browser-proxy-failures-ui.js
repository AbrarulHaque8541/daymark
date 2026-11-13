((root) => {
  'use strict';

  // Daymark offline "If the proxy fails" playbook card UI. Deliberately
  // stateless: nothing is saved on this device, there is no storage key and
  // no boot-time storage read. The card markup is injected here instead of
  // being hand-placed in index.html, so the module ships without touching
  // shared markup files. attachBrowserProxyFailuresUi(env) is fully
  // injectable for unit tests.

  const CARD_ID = 'proxy-failures-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('proxy failure card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'proxy-failures-heading');

    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);

    const heading = doc.createElement('h2');
    heading.id = 'proxy-failures-heading';
    heading.textContent = 'If the proxy fails';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'proxy-failures-description';
    description.textContent = 'A plain-words playbook for an explicit, per-session proxy profile: what an unreachable proxy, a login demand, bypass rules, DNS resolution, re-signed certificates and a session reset each do. This card is offline and stateless: nothing is saved on this device and nothing is routed anywhere.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'proxy-failures-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');

    const label = doc.createElement('label');
    label.className = 'sr-only';
    if (typeof label.setAttribute === 'function') label.setAttribute('for', 'proxy-failures-scenario');
    label.textContent = 'Failure scenario';
    form.appendChild(label);

    const select = doc.createElement('select');
    select.id = 'proxy-failures-scenario';
    if (select.setAttribute) select.setAttribute('name', 'scenario');
    form.appendChild(select);

    const showButton = doc.createElement('button');
    showButton.id = 'proxy-failures-show';
    showButton.className = 'button button-primary';
    if (showButton.setAttribute) showButton.setAttribute('type', 'submit');
    showButton.textContent = 'Show';
    form.appendChild(showButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'proxy-failures-clear';
    clearButton.className = 'button button-quiet';
    if (clearButton.setAttribute) clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    form.appendChild(clearButton);

    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'proxy-failures-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') statusLine.setAttribute('role', 'status');
    if (typeof statusLine.setAttribute === 'function') statusLine.setAttribute('aria-live', 'polite');
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'proxy-failures-result';
    result.className = 'feed-list';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const proxyCard = typeof doc.getElementById === 'function' ? doc.getElementById('browser-proxy-card') : null;
    if (proxyCard && proxyCard.parentNode && typeof proxyCard.parentNode.insertBefore === 'function') {
      proxyCard.parentNode.insertBefore(aside, proxyCard.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachBrowserProxyFailuresUi(env) {
    if (!env || !env.document) throw new Error('attachBrowserProxyFailuresUi requires a document.');
    const doc = env.document;
    const logic = Object.prototype.hasOwnProperty.call(env, 'proxyFailuresApi')
      ? env.proxyFailuresApi
      : (root.DaymarkBrowserProxyFailures || null);

    ensureCard(doc);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const selectEl = element('proxy-failures-scenario');
    const showEl = element('proxy-failures-show');
    const formEl = element('proxy-failures-form');
    const statusEl = element('proxy-failures-status');
    const resultEl = element('proxy-failures-result');
    const clearEl = element('proxy-failures-clear');

    let busy = false;
    function setBusy(isBusy) {
      busy = isBusy;
      if (showEl) {
        showEl.disabled = isBusy;
        if (showEl.classList && typeof showEl.classList.toggle === 'function') {
          showEl.classList.toggle('is-busy', isBusy);
        }
        if (typeof showEl.setAttribute === 'function') {
          if (isBusy) showEl.setAttribute('aria-busy', 'true');
          else showEl.removeAttribute('aria-busy');
        }
      }
      if (clearEl) {
        clearEl.disabled = isBusy;
        if (clearEl.classList && typeof clearEl.classList.toggle === 'function') {
          clearEl.classList.toggle('is-busy', isBusy);
        }
      }
    }

    function status(message) {
      if (statusEl) statusEl.textContent = message || '';
    }

    function clearResult() {
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
    }

    function fillScenarios() {
      if (!selectEl) return;
      while (selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);
      const scenarios = logic && typeof logic.listScenarios === 'function' ? logic.listScenarios() : [];
      for (let i = 0; i < scenarios.length; i += 1) {
        const option = doc.createElement('option');
        option.value = scenarios[i].id;
        option.textContent = scenarios[i].title;
        selectEl.appendChild(option);
      }
    }

    function makeItem(text) {
      const item = doc.createElement('div');
      item.className = 'feed-item';
      item.textContent = text;
      return item;
    }

    function renderSection(title, lines) {
      if (!resultEl) return;
      const head = doc.createElement('div');
      head.className = 'feed-item';
      const titleEl = doc.createElement('span');
      titleEl.className = 'feed-item-title';
      titleEl.textContent = title;
      head.appendChild(titleEl);
      resultEl.appendChild(head);
      for (let i = 0; i < lines.length; i += 1) {
        resultEl.appendChild(makeItem(lines[i]));
      }
    }

    function onShow() {
      if (busy) return;
      setBusy(true);
      try {
      if (!logic || typeof logic.explainScenario !== 'function') {
        clearResult();
        status('The proxy failure playbook is unavailable.');
        return;
      }
      const id = selectEl && typeof selectEl.value === 'string' ? selectEl.value : '';
      const plan = logic.explainScenario(id);
      clearResult();
      if (!plan) {
        status('That scenario could not be explained, so nothing is shown.');
        return;
      }
      renderSection('What happens', plan.behavior);
      renderSection('How to recover', plan.recovery);
      renderSection('Honest limits', plan.limits);
      status('Showing: ' + plan.title + ' · offline, nothing saved.');
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      if (busy) return;
      setBusy(true);
      try {
        clearResult();
        status('Cleared. Pick a scenario and tap Show.');
      } finally {
        setBusy(false);
      }
    }

    fillScenarios();
    if (!logic) status('The proxy failure playbook is unavailable.');
    else status('Pick a scenario and tap Show. Offline and stateless.');

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        onShow();
      });
    }
    if (showEl && typeof showEl.addEventListener === 'function') {
      showEl.addEventListener('click', () => { onShow(); });
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }

    return {
      onShow,
      onClear,
      detach() {
        status('');
      }
    };
  }

  const api = { attachBrowserProxyFailuresUi, ensureCard, CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkBrowserProxyFailuresUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachBrowserProxyFailuresUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
