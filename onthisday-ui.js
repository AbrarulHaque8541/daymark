(function (root) {
  'use strict';

  // "On this day" history UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view.
  //
  // The card markup is injected here instead of being hand-placed in
  // index.html, mirroring releases-ui.js: attachOnThisDayUi(env) is fully
  // injectable for unit tests.

  const CARD_ID = 'onthisday-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('on this day card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'onthisday-heading');

    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);

    const heading = doc.createElement('h2');
    heading.id = 'onthisday-heading';
    heading.textContent = 'On this day in history';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'onthisday-description';
    description.textContent = 'Before Check: today\u2019s date is sent to the free public Wikimedia Feed API (api.wikimedia.org) to fetch selected historical events. This happens only after you tap Check. Nothing is saved on this device. No account or API key.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'onthisday-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');

    const label = doc.createElement('label');
    label.className = 'sr-only';
    if (typeof label.setAttribute === 'function') label.setAttribute('for', 'onthisday-date');
    label.textContent = 'Date as month/day, or leave empty for today';
    form.appendChild(label);

    const input = doc.createElement('input');
    input.id = 'onthisday-date';
    if (input.setAttribute) {
      input.setAttribute('name', 'date');
      input.setAttribute('type', 'text');
      input.setAttribute('maxlength', '5');
      input.setAttribute('placeholder', 'MM-DD, empty = today');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('aria-describedby', 'onthisday-description');
    }
    form.appendChild(input);

    const checkButton = doc.createElement('button');
    checkButton.id = 'onthisday-check';
    checkButton.className = 'button button-primary';
    if (checkButton.setAttribute) checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'onthisday-clear';
    clearButton.className = 'button button-quiet';
    if (clearButton.setAttribute) clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    form.appendChild(clearButton);

    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'onthisday-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') {
      statusLine.setAttribute('role', 'status');
      statusLine.setAttribute('aria-live', 'polite');
      statusLine.setAttribute('aria-atomic', 'true');
    }
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'onthisday-result';
    result.className = 'feed-list';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = typeof doc.getElementById === 'function'
      ? (doc.getElementById('wiki-card') || doc.getElementById('releases-card') || doc.getElementById('currency-card'))
      : null;
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachOnThisDayUi(env) {
    if (!env || !env.document) throw new Error('attachOnThisDayUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const logicApi = env.onThisDayApi || root.DaymarkOnThisDay || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const inputEl = element('onthisday-date');
    const buttonEl = element('onthisday-check');
    const formEl = element('onthisday-form');
    const statusEl = element('onthisday-status');
    const resultEl = element('onthisday-result');
    const clearEl = element('onthisday-clear');

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

    function render(record) {
      if (!resultEl || !record) return;
      while (resultEl.firstChild) {
        resultEl.removeChild(resultEl.firstChild);
      }
      const paddedDay = (record.day < 10 ? '0' + record.day : String(record.day));
      const paddedMonth = (record.month < 10 ? '0' + record.month : String(record.month));
      const dateLabel = paddedDay + '/' + paddedMonth;
      for (const event of record.events) {
        const parts = [event.year + ': ' + event.text + (event.textTruncated ? ' (text truncated)' : '')];
        if (event.pages.length) parts.push(event.pages.length + ' related page(s)' + (event.pagesTruncated ? ' (list truncated)' : ''));
        resultEl.appendChild(doc.createTextNode(parts.join(' \u00b7 ') + ' \u00b7 '));
        if (event.pages.length) {
          const link = doc.createElement('a');
          link.href = event.pages[0];
          link.textContent = 'Read';
          if (typeof link.setAttribute === 'function') {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
            link.setAttribute('aria-label', 'Read more about a ' + dateLabel + ' event from ' + event.year);
          }
          resultEl.appendChild(link);
          resultEl.appendChild(doc.createTextNode(' \u00b7 '));
        }
      }
      resultEl.appendChild(doc.createTextNode('Date checked: ' + dateLabel));
    }

    async function onCheck() {
      if (busy) return;
      if (!logicApi || typeof logicApi.fetchOnThisDay !== 'function') {
        status('On this day is unavailable.');
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
          status('Enter the date as month/day, e.g. 11-15, or leave the field empty for today.');
          return;
        }
        options.month = parts.month;
        options.day = parts.day;
      }
      setBusy(true);
      try {
        const record = await logicApi.fetchOnThisDay(fetchImpl, options);
        render(record);
        status('Updated \u00b7 ' + record.fetchedAt.slice(0, 16).replace('T', ' ')
          + ' UTC \u00b7 not saved on this device');
        if (win && typeof win.showToast === 'function') {
          win.showToast('History updated · not saved on this device');
        }
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        const friendly = typeof logicApi.classifyOnThisDayError === 'function'
          ? logicApi.classifyOnThisDayError(error)
          : null;
        status(friendly ? friendly : 'Could not check: ' + message);
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
      if (win && typeof win.showToast === 'function') {
        win.showToast('History cleared');
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
      onCheck,
      onClear,
      detach() {
        setBusy(false);
      }
    };
  }

  const api = { attachOnThisDayUi, ensureCard, CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkOnThisDayUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachOnThisDayUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
