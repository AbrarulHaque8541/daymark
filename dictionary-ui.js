(function (root) {
  'use strict';

  // Dictionary lookup UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view.
  //
  // The card markup is injected here instead of being hand-placed in
  // index.html, so the module can ship without touching shared markup files.
  // Mirrors the releases-ui.js module style: attachDictionaryUi(env) is
  // fully injectable for unit tests.

  const CARD_ID = 'dictionary-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('dictionary card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'dictionary-heading');

    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);

    const heading = doc.createElement('h2');
    heading.id = 'dictionary-heading';
    heading.textContent = 'Dictionary lookup';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'dictionary-description';
    description.textContent = 'The word is sent to the public Free Dictionary API (api.dictionaryapi.dev) to fetch definitions. This happens only after you tap Look up. No word or result is saved on this device. No account or API key.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'dictionary-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');

    const label = doc.createElement('label');
    label.className = 'sr-only';
    if (typeof label.setAttribute === 'function') label.setAttribute('for', 'dictionary-word');
    label.textContent = 'Word to look up';
    form.appendChild(label);

    const input = doc.createElement('input');
    input.id = 'dictionary-word';
    if (input.setAttribute) {
      input.setAttribute('name', 'word');
      input.setAttribute('type', 'text');
      input.setAttribute('maxlength', '60');
      input.setAttribute('placeholder', 'A word, e.g. serendipity');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('autocapitalize', 'none');
      input.setAttribute('spellcheck', 'false');
      input.setAttribute('aria-describedby', 'dictionary-description');
    }
    form.appendChild(input);

    const checkButton = doc.createElement('button');
    checkButton.id = 'dictionary-lookup';
    checkButton.className = 'button button-primary';
    if (checkButton.setAttribute) checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Look up';
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'dictionary-clear';
    clearButton.className = 'button button-quiet';
    if (clearButton.setAttribute) clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    form.appendChild(clearButton);

    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'dictionary-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') {
      statusLine.setAttribute('role', 'status');
      statusLine.setAttribute('aria-live', 'polite');
      statusLine.setAttribute('aria-atomic', 'true');
    }
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'dictionary-result';
    result.className = 'feed-list';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = typeof doc.getElementById === 'function'
      ? (doc.getElementById('releases-card') || doc.getElementById('wiki-card'))
      : null;
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachDictionaryUi(env) {
    if (!env || !env.document) throw new Error('attachDictionaryUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const dictionaryApi = env.dictionaryApi || root.DaymarkDictionary || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const inputEl = element('dictionary-word');
    const buttonEl = element('dictionary-lookup');
    const formEl = element('dictionary-form');
    const statusEl = element('dictionary-status');
    const resultEl = element('dictionary-result');
    const clearEl = element('dictionary-clear');

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
      const entry = record.entry;

      const header = doc.createElement('div');
      header.className = 'dictionary-header';
      const wordStrong = doc.createElement('strong');
      wordStrong.textContent = entry.word;
      header.appendChild(wordStrong);
      if (entry.phonetic) {
        const phoneticSpan = doc.createElement('span');
        phoneticSpan.className = 'dictionary-phonetic';
        phoneticSpan.textContent = ' /' + entry.phonetic + '/';
        header.appendChild(phoneticSpan);
      }
      resultEl.appendChild(header);

      const list = doc.createElement('ul');
      list.className = 'dictionary-definitions';
      entry.definitions.forEach((def) => {
        const li = doc.createElement('li');
        if (def.partOfSpeech) {
          const pos = doc.createElement('em');
          pos.textContent = def.partOfSpeech + ': ';
          li.appendChild(pos);
        }
        li.appendChild(doc.createTextNode(def.definition + (def.definitionTruncated ? ' (definition truncated)' : '')));
        if (def.example) {
          const example = doc.createElement('span');
          example.className = 'dictionary-example';
          example.textContent = ' (e.g. ' + def.example + (def.exampleTruncated ? ', truncated)' : ')');
          li.appendChild(example);
        }
        list.appendChild(li);
      });
      resultEl.appendChild(list);
    }

    async function onLookup() {
      if (busy) return;
      if (!dictionaryApi || typeof dictionaryApi.fetchEntry !== 'function') {
        status('Dictionary lookup is unavailable.');
        return;
      }
      if (!fetchImpl) {
        status('Could not look up: fetch is unavailable in this browser.');
        return;
      }
      const typed = inputEl && typeof inputEl.value === 'string' ? inputEl.value : '';
      if (!typed.trim()) {
        status('Type a word to look up first.');
        return;
      }
      setBusy(true);
      try {
        const record = await dictionaryApi.fetchEntry(typed, fetchImpl, { now: now });
        render(record);
        status('Updated \u00b7 ' + record.fetchedAt.slice(0, 16).replace('T', ' ')
          + ' UTC \u00b7 not saved on this device');
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        const friendly = typeof dictionaryApi.classifyDictionaryError === 'function'
          ? dictionaryApi.classifyDictionaryError(error)
          : null;
        status(friendly ? friendly : 'Could not look up: ' + message);
        clearResult();
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      if (busy) return;
      if (inputEl && typeof inputEl.value === 'string') inputEl.value = '';
      clearResult();
      status('Cleared. Type a word and tap Look up.');
    }

    status('Type a word and tap Look up.');

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        return onLookup();
      });
    }
    if (buttonEl && typeof buttonEl.addEventListener === 'function') {
      buttonEl.addEventListener('click', () => { onLookup(); });
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }
    if (inputEl && typeof inputEl.addEventListener === 'function') {
      inputEl.addEventListener('keydown', (event) => {
        if (event && (event.key === 'Enter' || event.keyCode === 13)) {
          if (typeof event.preventDefault === 'function') event.preventDefault();
          onLookup();
        }
      });
    }

    return {
      onLookup,
      onClear,
      detach() {
        setBusy(false);
      }
    };
  }

  const api = { attachDictionaryUi, ensureCard, CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkDictionaryUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachDictionaryUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
