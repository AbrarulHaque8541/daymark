(function (root) {
  'use strict';

  // Country glance UI wiring for the web prototype. A deliberately stateless
  // card: nothing is saved on this device, so there is no storage key, no
  // boot-time storage reads, and Clear only empties the view. The card markup
  // is injected here instead of being hand-placed in index.html. Mirrors the
  // launch-ui.js module style: attachCountryUi(env) is fully injectable for
  // unit tests.

  const CARD_ID = 'country-card';
  const HINT_TEXT = 'e.g. India, Japan, Brazil';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('country card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'country-heading');

    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);

    const heading = doc.createElement('h2');
    heading.id = 'country-heading';
    heading.textContent = 'Country glance';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'country-description';
    description.textContent = 'The request goes to the public REST Countries API (restcountries.com) only after you tap Check. No account or API key. Nothing is saved on this device.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'country-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');

    const nameLabel = doc.createElement('label');
    nameLabel.className = 'sr-only';
    if (typeof nameLabel.setAttribute === 'function') nameLabel.setAttribute('for', 'country-name');
    nameLabel.textContent = 'Country name';
    form.appendChild(nameLabel);

    const nameInput = doc.createElement('input');
    nameInput.id = 'country-name';
    nameInput.type = 'text';
    nameInput.maxLength = 60;
    nameInput.autocomplete = 'off';
    if (typeof nameInput.setAttribute === 'function') {
      nameInput.setAttribute('aria-label', 'Country name');
      nameInput.setAttribute('placeholder', HINT_TEXT);
      nameInput.setAttribute('spellcheck', 'false');
    }
    form.appendChild(nameInput);

    const checkButton = doc.createElement('button');
    checkButton.id = 'country-check';
    checkButton.className = 'button button-primary';
    if (typeof checkButton.setAttribute === 'function') checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    if (typeof checkButton.setAttribute === 'function') checkButton.setAttribute('title', 'Look up country facts');
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'country-clear';
    clearButton.className = 'button button-quiet';
    if (typeof clearButton.setAttribute === 'function') clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    if (typeof clearButton.setAttribute === 'function') clearButton.setAttribute('title', 'Clear the country view');
    form.appendChild(clearButton);

    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'country-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') {
      statusLine.setAttribute('role', 'status');
      statusLine.setAttribute('aria-live', 'polite');
      statusLine.setAttribute('aria-atomic', 'true');
    }
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'country-result';
    result.className = 'feed-list';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = typeof doc.getElementById === 'function'
      ? (doc.getElementById('launch-card') || doc.getElementById('crypto-card')
        || doc.getElementById('onthisday-card') || doc.getElementById('wiki-card'))
      : null;
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachCountryUi(env) {
    if (!env || !env.document) throw new Error('attachCountryUi requires a document.');
    const doc = env.document;
    const win = env.window || null;
    const countryApi = 'countryApi' in env ? env.countryApi : (root.DaymarkCountries || null);
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = typeof env.fetch === 'function' ? env.fetch
      : (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const nameEl = element('country-name');
    const buttonEl = element('country-check');
    const formEl = element('country-form');
    const statusEl = element('country-status');
    const resultEl = element('country-result');
    const clearEl = element('country-clear');

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

    function clearResult() {
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
        resultEl.textContent = '';
      }
    }

    function render(record) {
      if (!resultEl || !record || !Array.isArray(record.countries)) return;
      clearResult();
      record.countries.forEach((country) => {
        const item = doc.createElement('div');
        item.className = 'feed-item';

        const title = doc.createElement('span');
        title.className = 'feed-item-title';
        title.textContent = (country.flag ? country.flag + ' ' : '') + country.name;
        item.appendChild(title);

        const detail = doc.createElement('span');
        detail.className = 'feed-item-date';
        detail.textContent = country.officialName + ' \u00b7 ' + country.region
          + (country.subregion ? ' (' + country.subregion + ')' : '')
          + ' \u00b7 capital ' + country.capital;
        item.appendChild(detail);

        const summary = doc.createElement('p');
        summary.className = 'feed-item-summary';
        const money = country.currencies.join(', ');
        const zones = country.timezones.join(', ')
          + (country.timezonesOmitted > 0 ? ' and ' + country.timezonesOmitted + ' more' : '');
        summary.textContent = 'Population ' + country.populationText
          + (money ? ' \u00b7 currency ' + money : '')
          + ' \u00b7 ' + country.timezones.length + ' time zones (' + zones + ')';
        item.appendChild(summary);

        resultEl.appendChild(item);
      });
      if (record.truncatedFields > 0) {
        const note = doc.createElement('p');
        note.className = 'feed-item-summary';
        note.textContent = record.truncatedFields
          + ' very long published field(s) were shortened to fit the card.';
        resultEl.appendChild(note);
      }
    }

    async function onCheck() {
      if (busy) return;
      if (!countryApi || typeof countryApi.fetchCountries !== 'function') {
        status('Country lookup is unavailable.');
        return;
      }
      if (!fetchImpl) {
        status('Could not look up the country: fetch is unavailable in this browser.');
        return;
      }
      const rawQuery = nameEl && typeof nameEl.value === 'string' ? nameEl.value : '';
      setBusy(true);
      try {
        const record = await countryApi.fetchCountries(rawQuery, fetchImpl, { now: now });
        render(record);
        status('Updated \u00b7 ' + record.fetchedAt.slice(0, 16).replace('T', ' ')
          + ' UTC \u00b7 not saved on this device', true);
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        const friendly = typeof countryApi.classifyCountryError === 'function'
          ? countryApi.classifyCountryError(error)
          : null;
        status(friendly ? friendly : 'Could not look up the country: ' + message);
        clearResult();
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      if (busy) return;
      clearResult();
      status('Cleared. Pick a country and tap Check.');
    }

    if (!countryApi || typeof countryApi.fetchCountries !== 'function') {
      status('Country lookup is unavailable.');
    } else if (!fetchImpl) {
      status('Could not look up the country: fetch is unavailable in this browser.');
    } else {
      status('Pick a country and tap Check.');
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

  const api = { attachCountryUi, ensureCard, CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkCountriesUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachCountryUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
