/*
 * Priority balance card UI for the web prototype.
 * Self-injecting, offline, stateless. Refresh computes from the
 * current in-memory task list if provided; otherwise shows honest empty state.
 * Glass press + busy feedback matching existing cards. Accent #16705f.
 */
((root) => {
  'use strict';

  const CARD_ID = 'priority-balance-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('priority balance host unavailable');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'priority-balance-heading');

    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);

    const heading = doc.createElement('h2');
    heading.id = 'priority-balance-heading';
    heading.textContent = 'Priority balance';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.textContent = 'Open tasks by priority. Computed on this page from the current list. Nothing is fetched or saved.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'priority-balance-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');

    const refresh = doc.createElement('button');
    refresh.id = 'priority-balance-refresh';
    refresh.className = 'button button-primary';
    if (typeof refresh.setAttribute === 'function') refresh.setAttribute('type', 'button');
    refresh.textContent = 'Refresh';
    form.appendChild(refresh);

    const clear = doc.createElement('button');
    clear.id = 'priority-balance-clear';
    clear.className = 'button button-quiet';
    if (typeof clear.setAttribute === 'function') clear.setAttribute('type', 'button');
    clear.textContent = 'Clear';
    form.appendChild(clear);

    aside.appendChild(form);

    const status = doc.createElement('p');
    status.id = 'priority-balance-status';
    status.className = 'feed-status';
    if (typeof status.setAttribute === 'function') {
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('aria-atomic', 'true');
    }
    aside.appendChild(status);

    const result = doc.createElement('div');
    result.id = 'priority-balance-result';
    result.className = 'feed-list';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = typeof doc.getElementById === 'function'
      ? (doc.getElementById('focus-card') || doc.getElementById('suggestion-card'))
      : null;
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachPriorityBalanceUi(env) {
    if (!env || !env.document) throw new Error('attachPriorityBalanceUi requires a document');
    const doc = env.document;
    const engine = env.balanceApi || root.DaymarkPriorityBalance || null;
    const getTasks = typeof env.getTasks === 'function' ? env.getTasks : () => [];

    ensureCard(doc);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const refreshEl = element('priority-balance-refresh');
    const clearEl = element('priority-balance-clear');
    const statusEl = element('priority-balance-status');
    const resultEl = element('priority-balance-result');
    const formEl = element('priority-balance-form');

    let busy = false;

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function setBusy(isBusy) {
      busy = isBusy;
      if (refreshEl) {
        refreshEl.disabled = isBusy;
        if (refreshEl.classList && typeof refreshEl.classList.toggle === 'function') {
          refreshEl.classList.toggle('is-busy', isBusy);
          if (clearEl && clearEl.classList) clearEl.classList.toggle('is-busy', isBusy);
        }
        if (typeof refreshEl.setAttribute === 'function') {
          if (isBusy) refreshEl.setAttribute('aria-busy', 'true');
          else refreshEl.removeAttribute('aria-busy');
        }
      }
    }

    function render(counts) {
      if (!resultEl) return;
      while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      const lines = [
        'High · ' + counts.high,
        'Medium · ' + counts.medium,
        'Low · ' + counts.low,
        'Unspecified · ' + counts.none,
        'Open total · ' + counts.total
      ];
      for (let i = 0; i < lines.length; i += 1) {
        const row = doc.createElement('div');
        row.className = 'feed-item';
        row.textContent = lines[i];
        resultEl.appendChild(row);
      }
    }

    function onRefresh() {
      if (busy) return;
      if (!engine || typeof engine.summarizePriorities !== 'function') {
        status('Priority balance is unavailable.');
        return;
      }
      setBusy(true);
      try {
        const tasks = getTasks() || [];
        const counts = engine.summarizePriorities(tasks);
        render(counts);
        status('Updated · ' + counts.total + ' open tasks · nothing saved');
      } catch (error) {
        status('Could not summarize: ' + (error && error.message ? error.message : 'unknown'));
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      if (busy) return;
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
      status('Cleared. Tap Refresh to count current open tasks.');
    }

    status('Tap Refresh to count open tasks by priority.');

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        onRefresh();
      });
    }
    if (refreshEl && typeof refreshEl.addEventListener === 'function') {
      refreshEl.addEventListener('click', onRefresh);
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', onClear);
    }

    return { onRefresh, onClear, detach() { setBusy(false); } };
  }

  const api = { attachPriorityBalanceUi, ensureCard, CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkPriorityBalanceUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachPriorityBalanceUi({ document: document, window: window, getTasks: () => (window.DaymarkTasks && typeof window.DaymarkTasks.getAll === 'function' ? window.DaymarkTasks.getAll() : []) });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
