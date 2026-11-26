(function (root) {
  'use strict';

  // XKCD comic glance UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view.
  // The card markup is injected here instead of being hand-placed in
  // index.html, so index.html keeps its minimal, guard-friendly surface.
  // Mirrors the hijri-ui.js lifecycle: attachXkcdUi(env) is fully injectable
  // for unit tests, with an internal busy-guard for concurrency. There are
  // no timers and no polling in this card: it acts only when the user taps
  // Check, so it costs zero battery while idle.

  const CARD_ID = 'xkcd-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('XKCD comic card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    aside.setAttribute('aria-labelledby', 'xkcd-heading');
    aside.setAttribute('aria-describedby', 'xkcd-description');

    const heading = doc.createElement('h2');
    heading.id = 'xkcd-heading';
    heading.textContent = 'XKCD comic';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'xkcd-description';
    description.textContent = "Today's XKCD comic from the public xkcd.com JSON endpoint (no account, no API key) is fetched on Check, directly over HTTPS, and the image loads lazily from the validated https://imgs.xkcd.com URL. Enter a comic number (1 to 999999) to open an older one, or leave it empty for the latest. Nothing is saved on your device, online or offline.";
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'xkcd-form';
    form.setAttribute('novalidate', 'novalidate');
    form.setAttribute('aria-label', 'Check an XKCD comic');

    const numberInput = doc.createElement('input');
    numberInput.id = 'xkcd-number';
    numberInput.className = 'feed-input';
    numberInput.setAttribute('type', 'text');
    numberInput.setAttribute('inputmode', 'numeric');
    numberInput.setAttribute('maxlength', '6');
    numberInput.setAttribute('placeholder', 'Latest (or comic number)');
    numberInput.setAttribute('aria-label', 'Comic number, empty for the latest');
    form.appendChild(numberInput);

    const checkButton = doc.createElement('button');
    checkButton.id = 'xkcd-check';
    checkButton.className = 'button button-primary';
    checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    checkButton.setAttribute('title', 'Check the XKCD comic');
    checkButton.setAttribute('aria-label', 'Check the XKCD comic');
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'xkcd-clear';
    clearButton.className = 'button button-quiet';
    clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    clearButton.setAttribute('title', 'Clear the XKCD comic view');
    clearButton.setAttribute('aria-label', 'Clear the XKCD comic view');
    form.appendChild(clearButton);
    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'xkcd-status';
    statusLine.className = 'feed-status';
    statusLine.setAttribute('role', 'status');
    statusLine.setAttribute('aria-live', 'polite');
    statusLine.setAttribute('aria-atomic', 'true');
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'xkcd-result';
    result.className = 'feed-list';
    result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = (doc.getElementById('hijri-card') || doc.getElementById('prayer-times-card')
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

  function attachXkcdUi(env) {
    if (!env || !env.document) throw new Error('attachXkcdUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const api = env.xkcdApi || win.DaymarkXkcd || root.DaymarkXkcd || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => doc.getElementById(id);
    const formEl = element('xkcd-form');
    const inputEl = element('xkcd-number');
    const buttonEl = element('xkcd-check');
    const clearEl = element('xkcd-clear');
    const statusEl = element('xkcd-status');
    const resultEl = element('xkcd-result');

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
      if (!api || typeof api.fetchesXkcd !== 'function') {
        status('The XKCD comic glance is unavailable in this environment.');
        return;
      }
      if (!fetchImpl) {
        status('Could not check: fetch is unavailable in this browser.');
        return;
      }
      const requested = inputEl && typeof inputEl.value === 'string' ? inputEl.value : '';
      setBusy(true);
      try {
        const record = await api.fetchesXkcd(fetchImpl, requested);
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
      return record && record.altTruncated
        ? ' · the hover caption was shortened to 400 characters' : '';
    }

    function render(record) {
      if (!resultEl || !record) return;
      clearResult();

      const titleLine = doc.createElement('p');
      titleLine.className = 'feed-list-item';
      titleLine.textContent = '#' + String(record.num) + ': ' + record.title;
      resultEl.appendChild(titleLine);

      const image = doc.createElement('img');
      image.className = 'feed-list-item';
      image.setAttribute('src', record.img);
      image.setAttribute('alt', record.alt || record.title);
      image.setAttribute('loading', 'lazy');
      image.setAttribute('decoding', 'async');
      image.setAttribute('referrerpolicy', 'no-referrer');
      image.setAttribute('style', 'display:block;max-width:100%;height:auto;margin:8px 0;border-radius:12px;');
      resultEl.appendChild(image);

      const altLine = doc.createElement('p');
      altLine.className = 'feed-list-item';
      altLine.textContent = record.alt ? ('Caption: ' + record.alt) : 'This comic has no hover caption.';
      resultEl.appendChild(altLine);

      const metaLine = doc.createElement('p');
      metaLine.className = 'feed-list-item';
      metaLine.textContent = 'Published ' + record.comicDate + '.';
      resultEl.appendChild(metaLine);

      const linkLine = doc.createElement('p');
      linkLine.className = 'feed-list-item';
      const link = doc.createElement('a');
      link.setAttribute('href', record.link);
      link.setAttribute('rel', 'noopener noreferrer');
      link.setAttribute('target', '_blank');
      link.textContent = 'Open comic #' + String(record.num) + ' on xkcd.com';
      linkLine.appendChild(link);
      resultEl.appendChild(linkLine);

      if (resultEl.setAttribute) resultEl.setAttribute('aria-live', 'polite');
    }

    function onClear() {
      if (busy) return;
      clearResult();
      status("Cleared. Tap Check to fetch an XKCD comic.", false);
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

  const api = { attachXkcdUi: attachXkcdUi, ensureCard: ensureCard, CARD_ID: CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  root.DaymarkXkcdUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => api.attachXkcdUi({});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

