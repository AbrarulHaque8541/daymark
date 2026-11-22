(function (root) {
  'use strict';

  // Earthquake glance UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view.
  // The card markup is injected here instead of being hand-placed in
  // index.html, so index.html keeps its minimal, guard-friendly surface.
  // Mirrors the releases-ui.js lifecycle: attachEarthquakeUi(env) is fully
  // injectable for unit tests, with an internal busy-guard for concurrency.

  const CARD_ID = 'earthquake-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('earthquake card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    aside.setAttribute('aria-labelledby', 'earthquake-heading');
    aside.setAttribute('aria-describedby', 'earthquake-description');

    const heading = doc.createElement('h2');
    heading.id = 'earthquake-heading';
    heading.textContent = 'Earthquake glance';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'earthquake-description';
    description.textContent = 'Significant earthquakes from the public USGS feed (earthquake.usgs.gov, past 24 hours, no account, no API key) are fetched directly over HTTPS. This card does not save anything on your device, online or offline.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'earthquake-form';
    form.setAttribute('novalidate', 'novalidate');
    form.setAttribute('aria-label', 'Check significant earthquakes');

    const checkButton = doc.createElement('button');
    checkButton.id = 'earthquake-check';
    checkButton.className = 'button button-primary';
    checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    checkButton.setAttribute('title', 'Check significant earthquakes from the past 24 hours');
    checkButton.setAttribute('aria-label', 'Check significant earthquakes from the past 24 hours');
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'earthquake-clear';
    clearButton.className = 'button button-quiet';
    clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    clearButton.setAttribute('title', 'Clear the earthquake view');
    clearButton.setAttribute('aria-label', 'Clear the earthquake view');
    form.appendChild(clearButton);
    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'earthquake-status';
    statusLine.className = 'feed-status';
    statusLine.setAttribute('role', 'status');
    statusLine.setAttribute('aria-live', 'polite');
    statusLine.setAttribute('aria-atomic', 'true');
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'earthquake-result';
    result.className = 'feed-list';
    result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = (doc.getElementById('country-card') || doc.getElementById('launch-card') || doc.getElementById('weather-card'));
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachEarthquakeUi(env) {
    if (!env || !env.document) throw new Error('attachEarthquakeUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const quakesApi = env.earthquakesApi || win.DaymarkEarthquakes || root.DaymarkEarthquakes || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => doc.getElementById(id);
    const formEl = element('earthquake-form');
    const buttonEl = element('earthquake-check');
    const clearEl = element('earthquake-clear');
    const statusEl = element('earthquake-status');
    const resultEl = element('earthquake-result');

    let busy = false;

    function setBusy(isBusy) {
      busy = isBusy;
      if (buttonEl) {
        buttonEl.disabled = isBusy;
        if (buttonEl.classList && typeof buttonEl.classList.toggle === 'function') buttonEl.classList.toggle('is-busy', isBusy);
        buttonEl.setAttribute('aria-busy', isBusy ? 'true' : 'false');
      }
    }

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function clearResult() {
      if (!resultEl) return;
      while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      resultEl.textContent = '';
    }

    function renderQuake(quake) {
      if (!resultEl || !quake) return;
      const magnitudeLabel = quake.magnitude === null ? 'unrated' : 'M' + quake.magnitude;
      const parts = [magnitudeLabel + ' ' + quakesApi.describesMagnitude(quake.magnitude)];
      if (quake.place) parts.push(quake.place);
      if (quake.time) parts.push(quake.time);
      if (quake.tsunami) parts.push('tsunami alert possible');
      resultEl.appendChild(doc.createTextNode(parts.join(' · ') + ' · '));
      if (quake.url) {
        const link = doc.createElement('a');
        link.href = quake.url;
        link.textContent = 'USGS page';
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
        link.setAttribute('aria-label', 'Open the USGS page for ' + (quake.place || 'this earthquake'));
        resultEl.appendChild(link);
      }
      resultEl.appendChild(doc.createTextNode(' '));
    }

    function describeHidden(record) {
      return record.hidden > 0 ? ' · ' + record.hidden + ' more entries not shown' : '';
    }

    function render(record) {
      if (!resultEl || !record) return;
      clearResult();
      if (!record.quakes || !record.quakes.length) {
        resultEl.appendChild(doc.createTextNode('No significant earthquakes reported in the past 24 hours.'));
        return;
      }
      for (let i = 0; i < record.quakes.length; i += 1) renderQuake(record.quakes[i]);
    }

    async function onCheck() {
      if (busy) return;
      if (!quakesApi || typeof quakesApi.fetchesRecent !== 'function') {
        status('The earthquake glance is unavailable in this environment.');
        return;
      }
      if (!fetchImpl) {
        status('Could not check: fetch is unavailable in this browser.');
        return;
      }
      setBusy(true);
      try {
        const record = await quakesApi.fetchesRecent(fetchImpl);
        render(record);
        status('Updated · ' + now().slice(0, 16).replace('T', ' ')
          + ' UTC · nothing saved on this device'
          + describeHidden(record));
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        const friendly = typeof quakesApi.classifiesError === 'function'
          ? quakesApi.classifiesError(error)
          : null;
        status(friendly ? friendly : 'Could not check: ' + message);
        clearResult();
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      if (busy) return;
      clearResult();
      status('Cleared. Tap Check to fetch the latest significant earthquakes.');
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

  const api = { attachEarthquakeUi: attachEarthquakeUi, ensureCard: ensureCard, CARD_ID: CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  root.DaymarkEarthquakesUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => api.attachEarthquakeUi({});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
