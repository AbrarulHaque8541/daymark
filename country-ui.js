(function (root) {
  'use strict';

  // Self-injecting country glance card for the Daymark web prototype.
  // Injects after #launch-card (or fallbacks). Fully injectable for tests.
  // No boot storage reads, no polling, nothing saved on device.

  const CARD_ID = 'country-card';

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

    const label = doc.createElement('label');
    label.className = 'sr-only';
    if (typeof label.setAttribute === 'function') label.setAttribute('for', 'country-query');
    label.textContent = 'Country name';
    form.appendChild(label);

    const input = doc.createElement('input');
    input.id = 'country-query';
    input.type = 'text';
    input.className = 'sort-select';
    input.placeholder = 'e.g. Japan';
    if (typeof input.setAttribute === 'function') {
      input.setAttribute('aria-label', 'Country name');
      input.setAttribute('aria-describedby', 'country-description');
      input.setAttribute('autocomplete', 'off');
    }
    form.appendChild(input);

    const actions = doc.createElement('div');
    actions.className = 'feed-actions';

    const check = doc.createElement('button');
    check.id = 'country-check';
    check.type = 'submit';
    check.className = 'button';
    check.textContent = 'Check';
    actions.appendChild(check);

    const clear = doc.createElement('button');
    clear.id = 'country-clear';
    clear.type = 'button';
    clear.className = 'button';
    clear.textContent = 'Clear';
    actions.appendChild(clear);

    form.appendChild(actions);
    aside.appendChild(form);

    const status = doc.createElement('p');
    status.id = 'country-status';
    status.className = 'feed-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    aside.appendChild(status);

    const results = doc.createElement('div');
    results.id = 'country-results';
    results.className = 'feed-results';
    aside.appendChild(results);

    return aside;
  }

  function renderResults(resultsEl, payload) {
    while (resultsEl.firstChild) resultsEl.removeChild(resultsEl.firstChild);
    if (!payload || !payload.countries || !payload.countries.length) return;

    payload.countries.forEach((country) => {
      const item = resultsEl.ownerDocument.createElement('div');
      item.className = 'feed-item';
      const title = resultsEl.ownerDocument.createElement('strong');
      title.textContent = country.name;
      item.appendChild(title);
      const meta = resultsEl.ownerDocument.createElement('p');
      meta.textContent = `${country.capital} · ${country.region} · pop. ${country.population}`;
      item.appendChild(meta);
      resultsEl.appendChild(item);
    });
    if (payload.truncated) {
      const note = resultsEl.ownerDocument.createElement('p');
      note.className = 'feed-note';
      note.textContent = 'Showing the first 5 matches.';
      resultsEl.appendChild(note);
    }
  }

  function attachCountryUi(env) {
    const doc = env && env.document;
    if (!doc) throw new Error('document is required');
    const card = ensureCard(doc);

    const anchor = doc.getElementById('launch-card')
      || doc.getElementById('crypto-card')
      || doc.getElementById('onthisday-card')
      || doc.getElementById('wiki-card');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(card, anchor.nextSibling);
    } else if (doc.body) {
      doc.body.appendChild(card);
    }

    const form = card.querySelector('#country-form');
    const input = card.querySelector('#country-query');
    const status = card.querySelector('#country-status');
    const results = card.querySelector('#country-results');
    const clearBtn = card.querySelector('#country-clear');

    let busy = false;

    function setStatus(text) {
      if (status) status.textContent = text || '';
    }

    function clearView() {
      if (input) input.value = '';
      setStatus('');
      while (results && results.firstChild) results.removeChild(results.firstChild);
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', clearView);
    }

    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (busy) return;
        const query = input ? input.value : '';
        const api = env.DaymarkCountries || root.DaymarkCountries;
        if (!api || typeof api.lookupCountry !== 'function') {
          setStatus('Country lookup is unavailable.');
          return;
        }
        busy = true;
        setStatus('Looking up…');
        try {
          const payload = await api.lookupCountry(query, { fetch: env.fetch });
          renderResults(results, payload);
          setStatus(payload.countries.length === 1
            ? `Found ${payload.countries[0].name}.`
            : `Found ${payload.countries.length} matches.`);
        } catch (error) {
          setStatus(error && error.message ? error.message : 'Lookup failed.');
          while (results && results.firstChild) results.removeChild(results.firstChild);
        } finally {
          busy = false;
        }
      });
    }

    return { card, clearView };
  }

  if (typeof module === 'object' && module.exports) module.exports = { attachCountryUi };
  else root.DaymarkCountriesUi = { attachCountryUi };

  if (typeof document !== "undefined") {
    const boot = () => attachCountryUi({ document: document, fetch: typeof fetch === "function" ? fetch : null });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
