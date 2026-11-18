(function (root) {
  'use strict';

  // Quote glance UI wiring for the web prototype. A deliberately stateless
  // card: nothing is saved on this device, so there is no storage key, no
  // boot-time storage reads, and Clear only empties the view. The card markup
  // is injected here instead of being hand-placed in index.html. Mirrors the
  // country-ui.js / launch-ui.js module style.

  const CARD_ID = 'quote-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('quote card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'quote-heading');

    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);

    const heading = doc.createElement('h2');
    heading.id = 'quote-heading';
    heading.textContent = 'Quote of the moment';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'quote-description';
    description.textContent = 'The request goes to the public Quotable API (api.quotable.io) only after you tap Check. No account or API key. Nothing is saved on this device.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'quote-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');

    const checkButton = doc.createElement('button');
    checkButton.id = 'quote-check';
    checkButton.className = 'button button-primary';
    if (typeof checkButton.setAttribute === 'function') checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    if (typeof checkButton.setAttribute === 'function') checkButton.setAttribute('title', 'Fetch a random quote');
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'quote-clear';
    clearButton.className = 'button button-quiet';
    if (typeof clearButton.setAttribute === 'function') clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    if (typeof clearButton.setAttribute === 'function') clearButton.setAttribute('title', 'Clear the quote view');
    form.appendChild(clearButton);

    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'quote-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') {
      statusLine.setAttribute('role', 'status');
      statusLine.setAttribute('aria-live', 'polite');
      statusLine.setAttribute('aria-atomic', 'true');
    }
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'quote-result';
    result.className = 'feed-list';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = typeof doc.getElementById === 'function'
      ? (doc.getElementById('country-card') || doc.getElementById('launch-card')
        || doc.getElementById('crypto-card') || doc.getElementById('wiki-card'))
      : null;
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachQuoteUi(env) {
    if (!env || !env.document) throw new Error('attachQuoteUi requires a document.');
    const doc = env.document;
    const win = env.window || null;
    const quoteApi = 'quoteApi' in env ? env.quoteApi : (root.DaymarkQuotes || null);
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = typeof env.fetch === 'function' ? env.fetch
      : (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const buttonEl = element('quote-check');
    const formEl = element('quote-form');
    const statusEl = element('quote-status');
    const resultEl = element('quote-result');
    const clearEl = element('quote-clear');

    let busy = false;

    function status(message) {
      if (statusEl) statusEl.textContent = message;
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
      if (!resultEl || !record) return;
      clearResult();
      const item = doc.createElement('div');
      item.className = 'feed-item';

      const title = doc.createElement('span');
      title.className = 'feed-item-title';
      title.textContent = '\u201c' + record.content + '\u201d';
      item.appendChild(title);

      const detail = doc.createElement('span');
      detail.className = 'feed-item-date';
      detail.textContent = '\u2014 ' + record.author
        + (record.tags && record.tags.length ? ' \u00b7 ' + record.tags.join(', ') : '');
      item.appendChild(detail);

      resultEl.appendChild(item);
      if (record.contentTruncated) {
        const note = doc.createElement('p');
        note.className = 'feed-item-summary';
        note.textContent = 'Quote shortened to fit the card.';
        resultEl.appendChild(note);
      }
    }

    async function onCheck() {
      if (busy) return;
      if (!quoteApi || typeof quoteApi.fetchQuote !== 'function') {
        status('Quote lookup is unavailable.');
        return;
      }
      if (!fetchImpl) {
        status('Could not fetch a quote: fetch is unavailable in this browser.');
        return;
      }
      setBusy(true);
      try {
        const record = await quoteApi.fetchQuote(fetchImpl, { now: now });
        render(record);
        status('Updated \u00b7 ' + record.fetchedAt.slice(0, 16).replace('T', ' ')
          + ' UTC \u00b7 not saved on this device');
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        const friendly = typeof quoteApi.classifyQuoteError === 'function'
          ? quoteApi.classifyQuoteError(error)
          : null;
        status(friendly ? friendly : 'Could not fetch a quote: ' + message);
        clearResult();
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      if (busy) return;
      clearResult();
      status('Cleared. Tap Check for a new quote.');
    }

    if (!quoteApi || typeof quoteApi.fetchQuote !== 'function') {
      status('Quote lookup is unavailable.');
    } else if (!fetchImpl) {
      status('Could not fetch a quote: fetch is unavailable in this browser.');
    } else {
      status('Tap Check for a random quote.');
    }

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

  const api = { attachQuoteUi, ensureCard, CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkQuotesUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachQuoteUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
