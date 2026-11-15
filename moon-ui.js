(function (root) {
  'use strict';

  // Moon-phase UI wiring for the web prototype. A deliberately stateless,
  // fully offline card: the phase is computed on this device, there is no
  // network request, no storage key, no boot-time storage reads, and Clear
  // only empties the view. attachMoonUi(env) is fully injectable for unit
  // tests, mirroring onthisday-ui.js.

  const CARD_ID = 'moon-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('moon card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'moon-heading');

    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);

    const heading = doc.createElement('h2');
    heading.id = 'moon-heading';
    heading.textContent = 'Moon phase, offline';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'moon-description';
    description.textContent = 'Before Check: nothing is sent anywhere. The phase is computed on this device from a mean lunar-month model, so dates are approximate (about half a day). No network request, no account or API key, and nothing is saved on this device.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'moon-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');

    const label = doc.createElement('label');
    label.className = 'sr-only';
    if (typeof label.setAttribute === 'function') label.setAttribute('for', 'moon-date');
    label.textContent = 'Date as YYYY-MM-DD, or leave empty for today';
    form.appendChild(label);

    const input = doc.createElement('input');
    input.id = 'moon-date';
    if (input.setAttribute) {
      input.setAttribute('name', 'date');
      input.setAttribute('type', 'text');
      input.setAttribute('maxlength', '10');
      input.setAttribute('placeholder', 'YYYY-MM-DD, empty = today');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('aria-describedby', 'moon-description');
    }
    form.appendChild(input);

    const checkButton = doc.createElement('button');
    checkButton.id = 'moon-check';
    checkButton.className = 'button button-primary';
    if (checkButton.setAttribute) checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'moon-clear';
    clearButton.className = 'button button-quiet';
    if (clearButton.setAttribute) clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    form.appendChild(clearButton);

    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'moon-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') {
      statusLine.setAttribute('role', 'status');
      statusLine.setAttribute('aria-live', 'polite');
      statusLine.setAttribute('aria-atomic', 'true');
    }
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'moon-result';
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

  function attachMoonUi(env) {
    if (!env || !env.document) throw new Error('attachMoonUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const logicApi = env.moonApi || root.DaymarkMoon || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();

    ensureCard(doc);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const inputEl = element('moon-date');
    const formEl = element('moon-form');
    const statusEl = element('moon-status');
    const resultEl = element('moon-result');
    const clearEl = element('moon-clear');

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function render(record) {
      if (!resultEl || !record) return;
      while (resultEl.firstChild) {
        resultEl.removeChild(resultEl.firstChild);
      }
      resultEl.appendChild(doc.createTextNode(
        record.date + ' \u00b7 ' + record.phaseName
        + ' \u00b7 ' + record.illuminationPercent + '% lit'
        + ' \u00b7 moon age ' + record.ageDays + ' days'
      ));
      resultEl.appendChild(doc.createElement('br'));
      resultEl.appendChild(doc.createTextNode(
        'Next full moon: ' + record.nextFullMoon + ' (in ' + record.nextFullMoonInDays + ' day(s))'
        + ' \u00b7 next new moon: ' + record.nextNewMoon + ' (in ' + record.nextNewMoonInDays + ' day(s))'
        + ' \u00b7 approximate'
      ));
    }

    function onCheck() {
      if (!logicApi || typeof logicApi.moonPhaseInfo !== 'function') {
        status('Moon phase is unavailable.');
        return;
      }
      const typed = inputEl && typeof inputEl.value === 'string' ? inputEl.value.trim() : '';
      try {
        const record = logicApi.moonPhaseInfo(typed || undefined, { now: now });
        render(record);
        status('Computed on this device \u00b7 no network request \u00b7 not saved on this device');
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        status(message);
        if (resultEl) {
          while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
          resultEl.textContent = '';
        }
      }
    }

    function onClear() {
      if (inputEl && typeof inputEl.value === 'string') inputEl.value = '';
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
        resultEl.textContent = '';
      }
      status('Cleared. Leave the date empty for today, or type YYYY-MM-DD, and tap Check.');
    }

    status('Leave the date empty for today, or type YYYY-MM-DD, and tap Check. Works offline.');

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        onCheck();
      });
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
      detach() {}
    };
  }

  const api = { attachMoonUi, ensureCard, CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkMoonUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachMoonUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
