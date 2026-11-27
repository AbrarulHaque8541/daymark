(function (root) {
  'use strict';

  // Joke glance UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view.
  // Mirrors the advice-ui.js lifecycle: attachJokeUi(env) is fully injectable
  // for unit tests, with an internal busy-guard for concurrency. There are
  // no timers and no polling in this card: it acts only when the user taps
  // Check, so it costs zero battery while idle.

  const CARD_ID = 'joke-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('Joke card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    aside.setAttribute('aria-labelledby', 'joke-heading');
    aside.setAttribute('aria-describedby', 'joke-description');

    const heading = doc.createElement('h2');
    heading.id = 'joke-heading';
    heading.textContent = 'Joke of the day';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'joke-description';
    description.textContent = 'A safe-mode joke from the public jokeapi.dev JSON endpoint (no account, no API key), fetched on Check, directly over HTTPS. Enter a joke id (0 to 99999) to read a specific one, or leave it empty for a random joke. Nothing is saved on your device, online or offline.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'joke-form';
    form.setAttribute('novalidate', 'novalidate');
    form.setAttribute('aria-label', 'Check a joke');

    const idInput = doc.createElement('input');
    idInput.id = 'joke-id';
    idInput.className = 'feed-input';
    idInput.setAttribute('type', 'text');
    idInput.setAttribute('inputmode', 'numeric');
    idInput.setAttribute('maxlength', '5');
    idInput.setAttribute('placeholder', 'Random (or joke id)');
    idInput.setAttribute('aria-label', 'Joke id, empty for a random joke');
    form.appendChild(idInput);

    const checkButton = doc.createElement('button');
    checkButton.id = 'joke-check';
    checkButton.className = 'button button-primary';
    checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    checkButton.setAttribute('title', 'Check the joke');
    checkButton.setAttribute('aria-label', 'Check the joke');
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'joke-clear';
    clearButton.className = 'button button-quiet';
    clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    clearButton.setAttribute('title', 'Clear the joke view');
    clearButton.setAttribute('aria-label', 'Clear the joke view');
    form.appendChild(clearButton);
    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'joke-status';
    statusLine.className = 'feed-status';
    statusLine.setAttribute('role', 'status');
    statusLine.setAttribute('aria-live', 'polite');
    statusLine.setAttribute('aria-atomic', 'true');
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'joke-result';
    result.className = 'feed-list';
    result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = (doc.getElementById('advice-card') || doc.getElementById('xkcd-card')
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

  function attachJokeUi(env) {
    const settings = env || {};
    let doc = settings.document;
    if (!doc && typeof document !== 'undefined') doc = document;
    if (!doc) throw new Error('attachJokeUi requires a document.');
    const win = settings.window || root;
    // An explicitly provided jokeApi always wins, even when it is null:
    // callers must be able to test the unavailable-module path even when the
    // shared global fallback (root.DaymarkJoke) was loaded earlier.
    const api = Object.prototype.hasOwnProperty.call(settings, 'jokeApi')
      ? settings.jokeApi
      : ((win && win.DaymarkJoke) || root.DaymarkJoke || null);
    const now = typeof settings.now === 'function' ? settings.now : () => new Date().toISOString();
    const fetchImpl = settings.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => doc.getElementById(id);
    const formEl = element('joke-form');
    const inputEl = element('joke-id');
    const buttonEl = element('joke-check');
    const clearEl = element('joke-clear');
    const statusEl = element('joke-status');
    const resultEl = element('joke-result');

    let busy = false;

    function setBusy(isBusy) {
      busy = isBusy;
      if (buttonEl) {
        buttonEl.disabled = isBusy;
        if (buttonEl.classList && typeof buttonEl.classList.toggle === 'function') buttonEl.classList.toggle('is-busy', isBusy);
        buttonEl.setAttribute('aria-busy', isBusy ? 'true' : 'false');
      }
      if (inputEl) inputEl.disabled = isBusy;
      if (clearEl) clearEl.disabled = isBusy;
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
      if (!api || typeof api.fetchesJoke !== 'function') {
        status('The joke glance is unavailable in this environment.');
        return;
      }
      if (!fetchImpl) {
        status('Could not check: fetch is unavailable in this browser.');
        return;
      }
      const requested = inputEl && typeof inputEl.value === 'string' ? inputEl.value : '';
      setBusy(true);
      status('Checking…', false);
      try {
        const record = await api.fetchesJoke(fetchImpl, requested);
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
      const notes = [];
      if (record.jokeTruncated) notes.push('the joke was shortened to 400 characters');
      if (record.setupTruncated) notes.push('the setup was shortened to 400 characters');
      if (record.deliveryTruncated) notes.push('the punchline was shortened to 400 characters');
      return notes.length ? ' · ' + notes.join(', ') : '';
    }

    function render(record) {
      if (!resultEl || !record) return;
      clearResult();

      if (record.type === 'twopart') {
        const setupLine = doc.createElement('p');
        setupLine.className = 'feed-list-item';
        setupLine.textContent = record.setup;
        resultEl.appendChild(setupLine);

        const deliveryLine = doc.createElement('p');
        deliveryLine.className = 'feed-list-item';
        deliveryLine.textContent = record.delivery;
        resultEl.appendChild(deliveryLine);
      } else {
        const jokeLine = doc.createElement('p');
        jokeLine.className = 'feed-list-item';
        jokeLine.textContent = record.joke;
        resultEl.appendChild(jokeLine);
      }

      const metaLine = doc.createElement('p');
      metaLine.className = 'feed-list-item';
      metaLine.textContent = 'Joke #' + String(record.id) + ' · ' + record.category + ' · safe mode.';
      resultEl.appendChild(metaLine);

      const linkLine = doc.createElement('p');
      linkLine.className = 'feed-list-item';
      const link = doc.createElement('a');
      link.setAttribute('href', record.link);
      link.setAttribute('rel', 'noopener noreferrer');
      link.setAttribute('target', '_blank');
      link.textContent = 'Learn more about JokeAPI at jokeapi.dev';
      linkLine.appendChild(link);
      resultEl.appendChild(linkLine);

      if (resultEl.setAttribute) resultEl.setAttribute('aria-live', 'polite');
    }

    function onClear() {
      if (busy) return;
      clearResult();
      status('Cleared. Tap Check to fetch a joke.', false);
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

  const api = { attachJokeUi: attachJokeUi, ensureCard: ensureCard, CARD_ID: CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  root.DaymarkJokeUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => api.attachJokeUi({});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
