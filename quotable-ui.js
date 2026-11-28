(function (root) {
  'use strict';

  // Quote glance UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view.
  // Mirrors the fact-ui.js lifecycle: attachQuoteUi(env) is fully injectable
  // for unit tests, with an internal busy-guard for concurrency. There are
  // no timers and no polling in this card: it acts only when the user taps
  // Check, so it costs zero battery while idle.

  const CARD_ID = 'quote-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('Quote card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    aside.setAttribute('aria-labelledby', 'quote-heading');
    aside.setAttribute('aria-describedby', 'quote-description');

    const heading = doc.createElement('h2');
    heading.id = 'quote-heading';
    heading.textContent = 'Quote of the day';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'quote-description';
    description.textContent = 'A short quote from the public zenquotes.io JSON endpoint (no account, no API key), fetched on Check, directly over HTTPS. Type random for a random quote, or leave it empty for today\'s quote. Nothing is saved on your device, online or offline. Quotes provided by ZenQuotes.io.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'quote-form';
    form.setAttribute('novalidate', 'novalidate');
    form.setAttribute('aria-label', 'Check a quote');

    const modeInput = doc.createElement('input');
    modeInput.id = 'quote-mode';
    modeInput.className = 'feed-input';
    modeInput.setAttribute('type', 'text');
    modeInput.setAttribute('maxlength', '6');
    modeInput.setAttribute('placeholder', 'Today (or random)');
    modeInput.setAttribute('aria-label', 'Quote mode, today or random');
    form.appendChild(modeInput);

    const checkButton = doc.createElement('button');
    checkButton.id = 'quote-check';
    checkButton.className = 'button button-primary';
    checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    checkButton.setAttribute('title', 'Check the quote');
    checkButton.setAttribute('aria-label', 'Check the quote');
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'quote-clear';
    clearButton.className = 'button button-quiet';
    clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    clearButton.setAttribute('title', 'Clear the quote view');
    clearButton.setAttribute('aria-label', 'Clear the quote view');
    form.appendChild(clearButton);
    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'quote-status';
    statusLine.className = 'feed-status';
    statusLine.setAttribute('role', 'status');
    statusLine.setAttribute('aria-live', 'polite');
    statusLine.setAttribute('aria-atomic', 'true');
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'quote-result';
    result.className = 'feed-list';
    result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = (doc.getElementById('fact-card') || doc.getElementById('joke-card')
      || doc.getElementById('advice-card') || doc.getElementById('xkcd-card')
      || doc.getElementById('hijri-card') || doc.getElementById('prayer-times-card')
      || doc.getElementById('space-news-card') || doc.getElementById('iss-card')
      || doc.getElementById('earthquake-card') || doc.getElementById('country-card')
      || doc.getElementById('weather-card'));
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachQuoteUi(env) {
    const settings = env || {};
    let doc = settings.document;
    if (!doc && typeof document !== 'undefined') doc = document;
    if (!doc) throw new Error('attachQuoteUi requires a document.');
    const win = settings.window || root;
    // An explicitly provided quoteApi always wins, even when it is null:
    // callers must be able to test the unavailable-module path even when the
    // shared global fallback (root.DaymarkQuote) was loaded earlier.
    const api = Object.prototype.hasOwnProperty.call(settings, 'quoteApi')
      ? settings.quoteApi
      : ((win && win.DaymarkQuote) || root.DaymarkQuote || null);
    const now = typeof settings.now === 'function' ? settings.now : () => new Date().toISOString();
    const fetchImpl = settings.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => doc.getElementById(id);
    const formEl = element('quote-form');
    const inputEl = element('quote-mode');
    const buttonEl = element('quote-check');
    const clearEl = element('quote-clear');
    const statusEl = element('quote-status');
    const resultEl = element('quote-result');

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
      if (!api || typeof api.fetchesQuote !== 'function') {
        status('The quote glance is unavailable in this environment.');
        return;
      }
      if (!fetchImpl) {
        status('Could not check: fetch is unavailable in this browser.');
        return;
      }
      const requested = inputEl && typeof inputEl.value === 'string' ? inputEl.value : '';
      setBusy(true);
      try {
        const record = await api.fetchesQuote(fetchImpl, requested);
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
      let note = '';
      if (record.quoteTruncated) note += ' · the quote was shortened to 400 characters';
      if (record.authorTruncated) note += ' · the author was shortened to 80 characters';
      return note;
    }

    function render(record) {
      if (!resultEl || !record) return;
      clearResult();

      const quoteLine = doc.createElement('p');
      quoteLine.className = 'feed-list-item';
      quoteLine.textContent = record.quote;
      resultEl.appendChild(quoteLine);

      const metaLine = doc.createElement('p');
      metaLine.className = 'feed-list-item';
      metaLine.textContent = (record.author ? 'By ' + record.author : 'Author unknown')
        + ' · ' + record.mode + '.';
      resultEl.appendChild(metaLine);

      const linkLine = doc.createElement('p');
      linkLine.className = 'feed-list-item';
      const link = doc.createElement('a');
      link.setAttribute('href', record.link);
      link.setAttribute('rel', 'noopener noreferrer');
      link.setAttribute('target', '_blank');
      link.textContent = 'Quotes provided by ZenQuotes.io';
      linkLine.appendChild(link);
      resultEl.appendChild(linkLine);

      if (resultEl.setAttribute) resultEl.setAttribute('aria-live', 'polite');
    }

    function onClear() {
      if (busy) return;
      clearResult();
      status('Cleared. Tap Check to fetch a quote.', false);
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

  const api = { attachQuoteUi: attachQuoteUi, ensureCard: ensureCard, CARD_ID: CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  root.DaymarkQuoteUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => api.attachQuoteUi({});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
