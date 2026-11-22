(function (root) {
  'use strict';
  // 'Picture of the day' UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view.
  // Mirrors onthisday-ui.js: attachPotdUi(env) is fully injectable for tests.
  const CARD_ID = 'potd-card';
  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;
    if (typeof doc.createElement !== 'function') throw new Error('picture card host is unavailable.');
    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'potd-heading');
    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);
    const heading = doc.createElement('h2');
    heading.id = 'potd-heading';
    heading.textContent = 'Picture of the day';
    aside.appendChild(heading);
    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'potd-description';
    description.textContent = 'Leave the date empty for today, or type month/day, and tap Check: today\u2019s date is sent to the free public Wikimedia Feed API (api.wikimedia.org) to fetch the picture of the day. The image itself loads over HTTPS from Wikimedia\u2019s servers, credited to its author. Nothing is saved on this device. No account or API key.';
    aside.appendChild(description);
    const form = doc.createElement('form');
    form.id = 'potd-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');
    const label = doc.createElement('label');
    label.className = 'sr-only';
    if (typeof label.setAttribute === 'function') label.setAttribute('for', 'potd-date');
    label.textContent = 'Date as month/day, or leave empty for today';
    form.appendChild(label);
    const input = doc.createElement('input');
    input.id = 'potd-date';
    if (input.setAttribute) {
      input.setAttribute('name', 'date');
      input.setAttribute('type', 'text');
      input.setAttribute('maxlength', '5');
      input.setAttribute('placeholder', 'MM-DD, empty = today');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('aria-describedby', 'potd-description');
    }
    form.appendChild(input);
    const checkButton = doc.createElement('button');
    checkButton.id = 'potd-check';
    checkButton.className = 'button button-primary';
    if (checkButton.setAttribute) checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    if (checkButton.setAttribute) checkButton.setAttribute('title', 'Check the picture of the day');
    form.appendChild(checkButton);
    const clearButton = doc.createElement('button');
    clearButton.id = 'potd-clear';
    clearButton.className = 'button button-quiet';
    if (clearButton.setAttribute) clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    if (clearButton.setAttribute) clearButton.setAttribute('title', 'Clear the picture view');
    form.appendChild(clearButton);
    aside.appendChild(form);
    const statusLine = doc.createElement('p');
    statusLine.id = 'potd-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') {
      statusLine.setAttribute('role', 'status');
      statusLine.setAttribute('aria-live', 'polite');
      statusLine.setAttribute('aria-atomic', 'true');
    }
    aside.appendChild(statusLine);
    const result = doc.createElement('div');
    result.id = 'potd-result';
    result.className = 'feed-list';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);
    const anchor = typeof doc.getElementById === 'function'
      ? (doc.getElementById('onthisday-card') || doc.getElementById('wiki-card') || doc.getElementById('releases-card') || doc.getElementById('currency-card'))
      : null;
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }
  function attachPotdUi(env) {
    if (!env || !env.document) throw new Error('attachPotdUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const logicApi = env.potdApi || root.DaymarkPotd || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);
    ensureCard(doc);
    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const inputEl = element('potd-date');
    const buttonEl = element('potd-check');
    const formEl = element('potd-form');
    const statusEl = element('potd-status');
    const resultEl = element('potd-result');
    const clearEl = element('potd-clear');
    let busy = false;
    function status(message, isSuccess) {
      if (!statusEl) return;
      statusEl.textContent = message;
      if (statusEl.classList && typeof statusEl.classList.toggle === 'function') {
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
    function render(record) {
      if (!resultEl || !record || !record.picture) return;
      while (resultEl.firstChild) {
        resultEl.removeChild(resultEl.firstChild);
      }
      const picture = record.picture;
      const paddedDay = (record.day < 10 ? '0' + record.day : String(record.day));
      const paddedMonth = (record.month < 10 ? '0' + record.month : String(record.month));
      const dateLabel = paddedDay + '/' + paddedMonth;
      const image = doc.createElement('img');
      const src = picture.thumbUrl || picture.imageUrl;
      if (image.setAttribute) {
        image.setAttribute('src', src);
        image.setAttribute('alt', picture.title
          ? 'Picture of the day for ' + dateLabel + ': ' + picture.title
          : 'Picture of the day for ' + dateLabel + ' from Wikimedia');
        image.setAttribute('loading', 'lazy');
        image.setAttribute('referrerpolicy', 'no-referrer');
        if (Number.isInteger(picture.width) && picture.width > 0
          && Number.isInteger(picture.height) && picture.height > 0) {
          image.setAttribute('width', String(picture.width));
          image.setAttribute('height', String(picture.height));
        }
      }
      image.onerror = function () {
        if (image.parentNode) image.parentNode.removeChild(image);
        const err = doc.createElement('p');
        err.className = 'potd-image-error';
        err.textContent = 'Picture could not be loaded. The Wikimedia image is unavailable right now.';
        if (err.setAttribute) err.setAttribute('role', 'status');
        resultEl.appendChild(err);
      };
      resultEl.appendChild(image);
      const parts = [];
      if (picture.title) parts.push(picture.title);
      if (picture.description) parts.push(picture.description + (picture.descriptionTruncated ? ' (description truncated)' : ''));
      if (picture.artist) parts.push('Photo: ' + picture.artist);
      if (picture.license) parts.push('License: ' + picture.license);
      parts.push('Date checked: ' + dateLabel);
      resultEl.appendChild(doc.createTextNode(parts.join(' \u00b7 ')));
      if (picture.filePage) {
        resultEl.appendChild(doc.createTextNode(' \u00b7 '));
        const link = doc.createElement('a');
        link.href = picture.filePage;
        link.textContent = 'File page';
        if (typeof link.setAttribute === 'function') {
          link.setAttribute('target', '_blank');
          link.setAttribute('rel', 'noopener noreferrer');
          link.setAttribute('aria-label', 'Open the Wikimedia file page for the ' + dateLabel + ' picture of the day');
        }
        resultEl.appendChild(link);
      }
    }
    async function onCheck() {
      if (busy) return;
      if (!logicApi || typeof logicApi.fetchPotd !== 'function') {
        status('The picture of the day is unavailable.');
        return;
      }
      if (!fetchImpl) {
        status('Could not check: fetch is unavailable in this browser.');
        return;
      }
      const typed = inputEl && typeof inputEl.value === 'string' ? inputEl.value.trim() : '';
      let options = { now: now };
      if (typed) {
        const parts = typeof logicApi.normalizeDateParts === 'function' ? logicApi.normalizeDateParts(typed) : null;
        if (!parts) {
          status('Enter the date as month/day, e.g. 08-05, or leave the field empty for today.');
          return;
        }
        options.month = parts.month;
        options.day = parts.day;
      }
      setBusy(true);
      try {
        const record = await logicApi.fetchPotd(fetchImpl, options);
        render(record);
        status('Updated \u00b7 ' + record.fetchedAt.slice(0, 16).replace('T', ' ')
          + ' UTC \u00b7 not saved on this device', true);
        if (statusEl && statusEl.classList && typeof statusEl.classList.add === 'function') {
          statusEl.classList.add('is-success');
          if (typeof statusEl.setAttribute === 'function') statusEl.setAttribute('title', 'Picture of the day updated');
          setTimeout(function () {
            if (statusEl.classList) statusEl.classList.remove('is-success');
            if (typeof statusEl.removeAttribute === 'function') statusEl.removeAttribute('title');
          }, 1400);
        }
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        const friendly = typeof logicApi.classifyPotdError === 'function'
          ? logicApi.classifyPotdError(error)
          : null;
        status(friendly ? friendly : 'Could not check: ' + message);
        if (statusEl && statusEl.classList && typeof statusEl.classList.remove === 'function') {
          statusEl.classList.remove('is-success');
          if (typeof statusEl.removeAttribute === 'function') statusEl.removeAttribute('title');
        }
        if (resultEl) {
          while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
          resultEl.textContent = '';
        }
      } finally {
        setBusy(false);
      }
    }
    function onClear() {
      if (busy) return;
      if (inputEl && typeof inputEl.value === 'string') inputEl.value = '';
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
        resultEl.textContent = '';
      }
      status('Cleared. Leave the date empty for today, or type month/day, and tap Check.');
      if (statusEl && statusEl.classList && typeof statusEl.classList.remove === 'function') {
        statusEl.classList.remove('is-success');
        if (typeof statusEl.removeAttribute === 'function') statusEl.removeAttribute('title');
      }
    }
    status('Leave the date empty for today, or type month/day, and tap Check.');
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
    if (inputEl && typeof inputEl.addEventListener === 'function') {
      inputEl.addEventListener('keydown', (event) => {
        if (event && (event.key === 'Enter' || event.keyCode === 13)) {
          if (typeof event.preventDefault === 'function') event.preventDefault();
          onCheck();
        }
      });
    }
    return {
      onCheck: onCheck,
      onClear: onClear,
      detach() { setBusy(false); }
    };
  }
  const api = { attachPotdUi: attachPotdUi, ensureCard: ensureCard, CARD_ID: CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkPotdUi = api;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachPotdUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);