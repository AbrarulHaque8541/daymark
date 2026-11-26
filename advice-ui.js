(function (root) {
  'use strict';

  // Advice glance UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view.
  // The card markup is injected here instead of being hand-placed in
  // index.html, so index.html keeps its minimal, guard-friendly surface.
  // Mirrors the xkcd-ui.js lifecycle: attachAdviceUi(env) is fully injectable
  // for unit tests, with an internal busy-guard for concurrency. There are
  // no timers and no polling in this card: it acts only when the user taps
  // Check, so it costs zero battery while idle.

  const CARD_ID = 'advice-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('Advice card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    aside.setAttribute('aria-labelledby', 'advice-heading');
    aside.setAttribute('aria-describedby', 'advice-description');

    const heading = doc.createElement('h2');
    heading.id = 'advice-heading';
    heading.textContent = 'Advice of the day';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'advice-description';
    description.textContent = 'A short piece of advice from the public adviceslip.com JSON endpoint (no account, no API key), fetched on Check, directly over HTTPS. Enter a slip id (1 to 99999) to read a specific one, or leave it empty for a random slip. Nothing is saved on your device, online or offline.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'advice-form';
    form.setAttribute('novalidate', 'novalidate');
    form.setAttribute('aria-label', 'Check an advice slip');

    const idInput = doc.createElement('input');
    idInput.id = 'advice-id';
    idInput.className = 'feed-input';
    idInput.setAttribute('type', 'text');
    idInput.setAttribute('inputmode', 'numeric');
    idInput.setAttribute('maxlength', '5');
    idInput.setAttribute('placeholder', 'Random (or slip id)');
    idInput.setAttribute('aria-label', 'Advice slip id, empty for a random slip');
    form.appendChild(idInput);

    const checkButton = doc.createElement('button');
    checkButton.id = 'advice-check';
    checkButton.className = 'button button-primary';
    checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    checkButton.setAttribute('title', 'Check the advice slip');
    checkButton.setAttribute('aria-label', 'Check the advice slip');
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'advice-clear';
    clearButton.className = 'button button-quiet';
    clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    clearButton.setAttribute('title', 'Clear the advice view');
    clearButton.setAttribute('aria-label', 'Clear the advice view');
    form.appendChild(clearButton);
    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'advice-status';
    statusLine.className = 'feed-status';
    statusLine.setAttribute('role', 'status');
    statusLine.setAttribute('aria-live', 'polite');
    statusLine.setAttribute('aria-atomic', 'true');
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'advice-result';
    result.className = 'feed-list';
    result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = (doc.getElementById('xkcd-card') || doc.getElementById('hijri-card')
      || doc.getElementById('prayer-times-card') || doc.getElementById('space-news-card')
      || doc.getElementById('iss-card') || doc.getElementById('earthquake-card')
      || doc.getElementById('country-card') || doc.getElementById('weather-card'));
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachAdviceUi(env) {
    const settings = env || {};
    let doc = settings.document;
    if (!doc && typeof document !== 'undefined') doc = document;
    if (!doc) throw new Error('attachAdviceUi requires a document.');
    const win = settings.window || root;
    const api = settings.adviceApi || win.DaymarkAdvice || root.DaymarkAdvice || null;
    const now = typeof settings.now === 'function' ? settings.now : () => new Date().toISOString();
    const fetchImpl = settings.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => doc.getElementById(id);
    const formEl = element('advice-form');
    const inputEl = element('advice-id');
    const buttonEl = element('advice-check');
    const clearEl = element('advice-clear');
    const statusEl = element('advice-status');
    const resultEl = element('advice-result');

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
        if (statusEl.classList && typeof statusEl.classList.toggle === 'function') {
          statusEl.classList.toggle('is-success', isSuccess === true);
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
      if (!api || typeof api.fetchesAdvice !== 'function') {
        status('The advice glance is unavailable in this environment.');
        return;
      }
      if (!fetchImpl) {
        status('Could not check: fetch is unavailable in this browser.');
        return;
      }
      const requested = inputEl && typeof inputEl.value === 'string' ? inputEl.value : '';
      setBusy(true);
      try {
        const record = await api.fetchesAdvice(fetchImpl, requested);
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
      return record && record.adviceTruncated
        ? ' · the advice was shortened to 400 characters' : '';
    }

    function render(record) {
      if (!resultEl || !record) return;
      clearResult();

      const adviceLine = doc.createElement('p');
      adviceLine.className = 'feed-list-item';
      adviceLine.textContent = '“' + record.advice + '”';
      resultEl.appendChild(adviceLine);

      const metaLine = doc.createElement('p');
      metaLine.className = 'feed-list-item';
      metaLine.textContent = 'Advice slip #' + String(record.id) + '.';
      resultEl.appendChild(metaLine);

      const linkLine = doc.createElement('p');
      linkLine.className = 'feed-list-item';
      const link = doc.createElement('a');
      link.setAttribute('href', record.link);
      link.setAttribute('rel', 'noopener noreferrer');
      link.setAttribute('target', '_blank');
      link.textContent = 'Open advice slip #' + String(record.id) + ' on adviceslip.com';
      linkLine.appendChild(link);
      resultEl.appendChild(linkLine);

      if (resultEl.setAttribute) resultEl.setAttribute('aria-live', 'polite');
    }

    function onClear() {
      if (busy) return;
      clearResult();
      status('Cleared. Tap Check to fetch an advice slip.', false);
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

  const api = { attachAdviceUi: attachAdviceUi, ensureCard: ensureCard, CARD_ID: CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  root.DaymarkAdviceUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => api.attachAdviceUi({});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
