(function (root) {
  'use strict';

  // Launch schedule UI wiring for the web prototype. A deliberately stateless
  // card: nothing is saved on this device, so there is no storage key, no
  // boot-time storage reads, and Clear only empties the view. The card markup
  // is injected here instead of being hand-placed in index.html. Mirrors the
  // crypto-ui.js module style: attachLaunchUi(env) is fully injectable for
  // unit tests.

  const CARD_ID = 'launch-card';
  const COUNTS = [3, 5, 8];

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('launch card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'launch-heading');

    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);

    const heading = doc.createElement('h2');
    heading.id = 'launch-heading';
    heading.textContent = 'Upcoming rocket launches';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'launch-description';
    description.textContent = 'The request goes to the public Launch Library 2 API (ll.thespacedevs.com) only after you tap Check. No account or API key. Nothing is saved on this device.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'launch-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');

    const countLabel = doc.createElement('label');
    countLabel.className = 'sr-only';
    if (typeof countLabel.setAttribute === 'function') countLabel.setAttribute('for', 'launch-count');
    countLabel.textContent = 'How many launches to show';
    form.appendChild(countLabel);

    const countSelect = doc.createElement('select');
    countSelect.id = 'launch-count';
    countSelect.className = 'sort-select';
    if (typeof countSelect.setAttribute === 'function') countSelect.setAttribute('aria-label', 'How many launches to show');
    COUNTS.forEach((count, index) => {
      const option = doc.createElement('option');
      option.value = String(count);
      option.textContent = 'Next ' + count + ' launches';
      if (index === 0) option.selected = true;
      countSelect.appendChild(option);
    });
    form.appendChild(countSelect);

    const checkButton = doc.createElement('button');
    checkButton.id = 'launch-check';
    checkButton.className = 'button button-primary';
    if (typeof checkButton.setAttribute === 'function') checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    if (typeof checkButton.setAttribute === 'function') checkButton.setAttribute('title', 'Check upcoming rocket launches');
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'launch-clear';
    clearButton.className = 'button button-quiet';
    if (typeof clearButton.setAttribute === 'function') clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    if (typeof clearButton.setAttribute === 'function') clearButton.setAttribute('title', 'Clear the launch schedule view');
    form.appendChild(clearButton);

    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'launch-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') {
      statusLine.setAttribute('role', 'status');
      statusLine.setAttribute('aria-live', 'polite');
      statusLine.setAttribute('aria-atomic', 'true');
    }
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'launch-result';
    result.className = 'feed-list';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = typeof doc.getElementById === 'function'
      ? (doc.getElementById('crypto-card') || doc.getElementById('onthisday-card')
        || doc.getElementById('releases-card') || doc.getElementById('wiki-card'))
      : null;
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachLaunchUi(env) {
    if (!env || !env.document) throw new Error('attachLaunchUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const launchApi = env.launchApi || root.DaymarkLaunch || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const countEl = element('launch-count');
    const buttonEl = element('launch-check');
    const formEl = element('launch-form');
    const statusEl = element('launch-status');
    const resultEl = element('launch-result');
    const clearEl = element('launch-clear');

    let busy = false;

    function status(message, isSuccess) {
      if (statusEl) statusEl.textContent = message;
      // Shared .feed-status.is-success glance flash (accent #16705f): the same
      // professional success language used by weather, crypto, potd, moon and
      // country. Cleared on the next non-success status so it never lingers.
      if (statusEl && statusEl.classList && typeof statusEl.classList.toggle === 'function') {
        statusEl.classList.toggle('is-success', !!isSuccess);
      }
    }

    function setBusy(isBusy) {
      busy = isBusy;
      if (buttonEl) {
        buttonEl.disabled = isBusy;
        if (buttonEl.classList && typeof buttonEl.classList.toggle === 'function') {
          buttonEl.classList.toggle('is-busy', isBusy);
          if (clearEl && clearEl.classList) clearEl.classList.toggle('is-busy', isBusy);
        }
        if (typeof buttonEl.setAttribute === 'function') {
          if (isBusy) buttonEl.setAttribute('aria-busy', 'true');
          else buttonEl.removeAttribute('aria-busy');
        }
      }
    }

    function clearResult() {
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
        resultEl.textContent = '';
      }
    }

    function render(record) {
      if (!resultEl || !record || !Array.isArray(record.launches)) return;
      clearResult();
      record.launches.forEach((launch) => {
        const item = doc.createElement('div');
        item.className = 'feed-item';

        const title = doc.createElement('span');
        title.className = 'feed-item-title';
        title.textContent = launch.name;
        item.appendChild(title);

        const date = doc.createElement('span');
        date.className = 'feed-item-date';
        date.textContent = launch.whenText + ' \u00b7 ' + launch.statusText;
        item.appendChild(date);

        const summary = doc.createElement('p');
        summary.className = 'feed-item-summary';
        const parts = [launch.provider, launch.rocket, launch.pad].filter((part) => part);
        summary.textContent = parts.length ? parts.join(' \u00b7 ') : 'Provider details not published yet.';
        item.appendChild(summary);

        resultEl.appendChild(item);
      });
      if (record.truncatedFields > 0) {
        const note = doc.createElement('p');
        note.className = 'feed-item-summary';
        note.textContent = record.truncatedFields + ' very long name(s) were shortened to fit the card.';
        resultEl.appendChild(note);
      }
    }

    async function onCheck() {
      if (busy) return;
      if (!launchApi || typeof launchApi.fetchUpcomingLaunches !== 'function') {
        status('Launch schedule is unavailable.');
        return;
      }
      if (!fetchImpl) {
        status('Could not check the schedule: fetch is unavailable in this browser.');
        return;
      }
      const rawCount = countEl && typeof countEl.value === 'string' ? countEl.value : '';
      // A populated select always reports its first option in a real browser;
      // default to the catalog head if the value is ever empty.
      const count = COUNTS.indexOf(Number(rawCount)) !== -1 ? Number(rawCount) : COUNTS[0];
      setBusy(true);
      try {
        const record = await launchApi.fetchUpcomingLaunches(count, fetchImpl, { now: now });
        render(record);
        status('Updated \u00b7 ' + record.fetchedAt.slice(0, 16).replace('T', ' ')
          + ' UTC \u00b7 not saved on this device', true);
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        const friendly = typeof launchApi.classifyLaunchError === 'function'
          ? launchApi.classifyLaunchError(error)
          : null;
        status(friendly ? friendly : 'Could not check the schedule: ' + message);
        clearResult();
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      if (busy) return;
      clearResult();
      status('Cleared. Pick a count and tap Check.');
    }

    status('Pick a count and tap Check.');

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        return onCheck();
      });
    }
    if (buttonEl && typeof buttonEl.addEventListener === 'function') {
      buttonEl.addEventListener('click', () => { onCheck(); });
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }

    return {
      onCheck,
      onClear,
      detach() {
        setBusy(false);
      }
    };
  }

  const api = { attachLaunchUi, ensureCard, CARD_ID, COUNTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkLaunchUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachLaunchUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
