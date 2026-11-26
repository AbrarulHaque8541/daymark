(function (root) {
  'use strict';

  // Hijri date glance UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view.
  // The card markup is injected here instead of being hand-placed in
  // index.html, so index.html keeps its minimal, guard-friendly surface.
  // Mirrors the prayer-times-ui.js lifecycle: attachHijriUi(env) is fully
  // injectable for unit tests, with an internal busy-guard for concurrency.

  const CARD_ID = 'hijri-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('Hijri date card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    aside.setAttribute('aria-labelledby', 'hijri-heading');
    aside.setAttribute('aria-describedby', 'hijri-description');

    const heading = doc.createElement('h2');
    heading.id = 'hijri-heading';
    heading.textContent = 'Hijri date';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'hijri-description';
    description.textContent = "Today's Hijri (Islamic) date from the public Aladhan open API (api.aladhan.com, no account, no API key) is fetched on Check, directly over HTTPS. Tap Check. This card does not save anything on your device, online or offline.";
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'hijri-form';
    form.setAttribute('novalidate', 'novalidate');
    form.setAttribute('aria-label', "Check today's Hijri date");

    const checkButton = doc.createElement('button');
    checkButton.id = 'hijri-check';
    checkButton.className = 'button button-primary';
    checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    checkButton.setAttribute('title', "Check today's Hijri date");
    checkButton.setAttribute('aria-label', "Check today's Hijri date");
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'hijri-clear';
    clearButton.className = 'button button-quiet';
    clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    clearButton.setAttribute('title', 'Clear the Hijri date view');
    clearButton.setAttribute('aria-label', 'Clear the Hijri date view');
    form.appendChild(clearButton);
    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'hijri-status';
    statusLine.className = 'feed-status';
    statusLine.setAttribute('role', 'status');
    statusLine.setAttribute('aria-live', 'polite');
    statusLine.setAttribute('aria-atomic', 'true');
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'hijri-result';
    result.className = 'feed-list';
    result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = (doc.getElementById('prayer-times-card') || doc.getElementById('space-news-card')
      || doc.getElementById('iss-card') || doc.getElementById('earthquake-card')
      || doc.getElementById('country-card') || doc.getElementById('weather-card'));
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachHijriUi(env) {
    if (!env || !env.document) throw new Error('attachHijriUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const api = env.hijriApi || win.DaymarkHijri || root.DaymarkHijri || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const todayIso = typeof env.todayIso === 'function' ? env.todayIso : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => doc.getElementById(id);
    const formEl = element('hijri-form');
    const buttonEl = element('hijri-check');
    const clearEl = element('hijri-clear');
    const statusEl = element('hijri-status');
    const resultEl = element('hijri-result');

    let busy = false;

    function setBusy(isBusy) {
      busy = isBusy;
      if (buttonEl) {
        buttonEl.disabled = isBusy;
        if (buttonEl.classList && typeof buttonEl.classList.toggle === 'function') buttonEl.classList.toggle('is-busy', isBusy);
        buttonEl.setAttribute('aria-busy', isBusy ? 'true' : 'false');
      }
    }

    function status(message, isSuccess) {
      if (statusEl) {
        statusEl.textContent = message;
        if (statusEl.classList && typeof statusEl.classList.toggle === "function") {
          statusEl.classList.toggle("is-success", isSuccess === true);
        }
      }
    }

    function clearResult() {
      if (!resultEl) return;
      while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      resultEl.textContent = '';
    }

    async function onCheck() {
      if (busy) return;
      if (!api || typeof api.fetchesHijri !== 'function') {
        status('The Hijri date glance is unavailable in this environment.');
        return;
      }
      if (!fetchImpl) {
        status('Could not check: fetch is unavailable in this browser.');
        return;
      }
      setBusy(true);
      try {
        const record = await api.fetchesHijri(fetchImpl, todayIso());
        render(record);
        status('Updated · ' + now().slice(0, 16).replace('T', ' ')
          + ' UTC · nothing saved on this device'
          + describeTruncation(record), true);
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        const friendly = typeof api.classifiesError === 'function'
          ? api.classifiesError(error)
          : null;
        status(friendly ? friendly : 'Could not check: ' + message, false);
        clearResult();
      } finally {
        setBusy(false);
      }
    }

    function describeTruncation(record) {
      return record && record.holidaysTruncated
        ? ' · some holidays were unlabeled and skipped' : '';
    }

    function render(record) {
      if (!resultEl || !record) return;
      clearResult();
      const lines = [];
      if (record.hijri) lines.push(record.hijri);
      if (record.weekday) lines.push(record.weekday);
      if (Array.isArray(record.holidays) && record.holidays.length) {
        lines.push('Holiday: ' + record.holidays.join(', '));
      }
      for (let i = 0; i < lines.length; i += 1) {
        const line = doc.createElement('p');
        line.className = 'feed-list-item';
        line.textContent = lines[i];
        if (resultEl.appendChild) resultEl.appendChild(line);
      }
      if (resultEl.setAttribute) resultEl.setAttribute('aria-live', 'polite');
    }

    function onClear() {
      if (busy) return;
      clearResult();
      status("Cleared. Tap Check to fetch today's Hijri date.", false);
    }

    function onSubmit(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      onCheck();
    }

    function onClearClick(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      onClear();
    }

    if (formEl) formEl.addEventListener('submit', onSubmit);
    if (buttonEl) buttonEl.addEventListener('click', onSubmit);
    if (clearEl) clearEl.addEventListener('click', onClearClick);

    return {
      onCheck: onCheck,
      onClear: onClear,
      detach() {
        setBusy(false);
      }
    };
  }

  const api = { attachHijriUi: attachHijriUi, ensureCard: ensureCard, CARD_ID: CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  root.DaymarkHijriUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => api.attachHijriUi({});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
