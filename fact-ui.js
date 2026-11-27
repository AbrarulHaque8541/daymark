(function (root) {
  'use strict';

  // Fact glance UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view.
  // Mirrors the joke-ui.js lifecycle: attachFactUi(env) is fully injectable
  // for unit tests, with an internal busy-guard for concurrency. There are
  // no timers and no polling in this card: it acts only when the user taps
  // Check, so it costs zero battery while idle.

  const CARD_ID = 'fact-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('Fact card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    aside.setAttribute('aria-labelledby', 'fact-heading');
    aside.setAttribute('aria-describedby', 'fact-description');

    const heading = doc.createElement('h2');
    heading.id = 'fact-heading';
    heading.textContent = 'Fact of the day';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'fact-description';
    description.textContent = 'A short useless fact from the public uselessfacts.jsph.pl JSON endpoint (no account, no API key), fetched on Check, directly over HTTPS. Type random for a random fact, or leave it empty for today\'s fact. Nothing is saved on your device, online or offline.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'fact-form';
    form.setAttribute('novalidate', 'novalidate');
    form.setAttribute('aria-label', 'Check a fact');

    const modeInput = doc.createElement('input');
    modeInput.id = 'fact-mode';
    modeInput.className = 'feed-input';
    modeInput.setAttribute('type', 'text');
    modeInput.setAttribute('maxlength', '6');
    modeInput.setAttribute('placeholder', 'Today (or random)');
    modeInput.setAttribute('aria-label', 'Fact mode, today or random');
    form.appendChild(modeInput);

    const checkButton = doc.createElement('button');
    checkButton.id = 'fact-check';
    checkButton.className = 'button button-primary';
    checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    checkButton.setAttribute('title', 'Check the fact');
    checkButton.setAttribute('aria-label', 'Check the fact');
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'fact-clear';
    clearButton.className = 'button button-quiet';
    clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    clearButton.setAttribute('title', 'Clear the fact view');
    clearButton.setAttribute('aria-label', 'Clear the fact view');
    form.appendChild(clearButton);
    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'fact-status';
    statusLine.className = 'feed-status';
    statusLine.setAttribute('role', 'status');
    statusLine.setAttribute('aria-live', 'polite');
    statusLine.setAttribute('aria-atomic', 'true');
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'fact-result';
    result.className = 'feed-list';
    result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = (doc.getElementById('joke-card') || doc.getElementById('advice-card')
      || doc.getElementById('xkcd-card') || doc.getElementById('hijri-card')
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

  function attachFactUi(env) {
    const settings = env || {};
    let doc = settings.document;
    if (!doc && typeof document !== 'undefined') doc = document;
    if (!doc) throw new Error('attachFactUi requires a document.');
    const win = settings.window || root;
    // An explicitly provided factApi always wins, even when it is null:
    // callers must be able to test the unavailable-module path even when the
    // shared global fallback (root.DaymarkFact) was loaded earlier.
    const api = Object.prototype.hasOwnProperty.call(settings, 'factApi')
      ? settings.factApi
      : ((win && win.DaymarkFact) || root.DaymarkFact || null);
    const now = typeof settings.now === 'function' ? settings.now : () => new Date().toISOString();
    const fetchImpl = settings.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => doc.getElementById(id);
    const formEl = element('fact-form');
    const inputEl = element('fact-mode');
    const buttonEl = element('fact-check');
    const clearEl = element('fact-clear');
    const statusEl = element('fact-status');
    const resultEl = element('fact-result');

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
      if (!api || typeof api.fetchesFact !== 'function') {
        status('The fact glance is unavailable in this environment.');
        return;
      }
      if (!fetchImpl) {
        status('Could not check: fetch is unavailable in this browser.');
        return;
      }
      const requested = inputEl && typeof inputEl.value === 'string' ? inputEl.value : '';
      setBusy(true);
      try {
        const record = await api.fetchesFact(fetchImpl, requested);
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
      if (!record) return '';
      return record.truncated ? ' · the fact was shortened to 400 characters' : '';
    }

    function render(record) {
      if (!resultEl || !record) return;
      clearResult();

      const factLine = doc.createElement('p');
      factLine.className = 'feed-list-item';
      factLine.textContent = record.text;
      resultEl.appendChild(factLine);

      const metaLine = doc.createElement('p');
      metaLine.className = 'feed-list-item';
      const sourceText = record.source ? ' · Source: ' + record.source : '';
      metaLine.textContent = 'Fact #' + (record.id || '?') + ' · ' + record.mode + sourceText + '.';
      resultEl.appendChild(metaLine);

      const linkLine = doc.createElement('p');
      linkLine.className = 'feed-list-item';
      const link = doc.createElement('a');
      link.setAttribute('href', record.link);
      link.setAttribute('rel', 'noopener noreferrer');
      link.setAttribute('target', '_blank');
      link.textContent = 'Learn more at uselessfacts.jsph.pl';
      linkLine.appendChild(link);
      resultEl.appendChild(linkLine);

      if (resultEl.setAttribute) resultEl.setAttribute('aria-live', 'polite');
    }

    function onClear() {
      if (busy) return;
      clearResult();
      status('Cleared. Tap Check to fetch a fact.', false);
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

  const api = { attachFactUi: attachFactUi, ensureCard: ensureCard, CARD_ID: CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  root.DaymarkFactUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => api.attachFactUi({});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
