(function (root) {
  'use strict';

  // Prayer times glance UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view.
  // The card markup is injected here instead of being hand-placed in
  // index.html, so index.html keeps its minimal, guard-friendly surface.
  // Mirrors the earthquake-ui.js lifecycle: attachPrayerTimesUi(env) is fully
  // injectable for unit tests, with an internal busy-guard for concurrency.

  const CARD_ID = 'prayer-times-card';

  function ensureCard(doc, cities) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('prayer times card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    aside.setAttribute('aria-labelledby', 'prayer-times-heading');
    aside.setAttribute('aria-describedby', 'prayer-times-description');

    const heading = doc.createElement('h2');
    heading.id = 'prayer-times-heading';
    heading.textContent = 'Prayer times';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'prayer-times-description';
    description.textContent = "Today's prayer schedule from the public Aladhan open API (api.aladhan.com, no account, no API key) is fetched on Check, directly over HTTPS. Pick a city and tap Check. This card does not save anything on your device, online or offline.";
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'prayer-times-form';
    form.setAttribute('novalidate', 'novalidate');
    form.setAttribute('aria-label', 'Check the prayer times for a city');

    const cityHeading = doc.createElement('label');
    cityHeading.className = 'sr-only';
    cityHeading.setAttribute('for', 'prayer-times-city');
    cityHeading.textContent = 'City for prayer times';
    form.appendChild(cityHeading);

    const citySelect = doc.createElement('select');
    citySelect.id = 'prayer-times-city';
    citySelect.className = 'sort-select';
    citySelect.setAttribute('aria-label', 'City');
    form.appendChild(citySelect);

    const checkButton = doc.createElement('button');
    checkButton.id = 'prayer-times-check';
    checkButton.className = 'button button-primary';
    checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    checkButton.setAttribute('title', "Check today's prayer times for the selected city");
    checkButton.setAttribute('aria-label', "Check today's prayer times for the selected city");
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'prayer-times-clear';
    clearButton.className = 'button button-quiet';
    clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    clearButton.setAttribute('title', 'Clear the prayer times view');
    clearButton.setAttribute('aria-label', 'Clear the prayer times view');
    form.appendChild(clearButton);
    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'prayer-times-status';
    statusLine.className = 'feed-status';
    statusLine.setAttribute('role', 'status');
    statusLine.setAttribute('aria-live', 'polite');
    statusLine.setAttribute('aria-atomic', 'true');
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'prayer-times-result';
    result.className = 'feed-list';
    result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    if (citySelect) {
      for (let i = 0; i < cities.length; i += 1) {
        const option = doc.createElement('option');
        option.value = cities[i].id;
        option.textContent = cities[i].label;
        citySelect.appendChild(option);
      }
    }

    const anchor = (doc.getElementById('space-news-card') || doc.getElementById('iss-card')
      || doc.getElementById('earthquake-card') || doc.getElementById('country-card') || doc.getElementById('weather-card'));
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachPrayerTimesUi(env) {
    if (!env || !env.document) throw new Error('attachPrayerTimesUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const api = env.prayerTimesApi || win.DaymarkPrayerTimes || root.DaymarkPrayerTimes || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const todayIso = typeof env.todayIso === 'function' ? env.todayIso : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc, api && api.cities ? api.cities : []);

    const element = (id) => doc.getElementById(id);
    const formEl = element('prayer-times-form');
    const cityEl = element('prayer-times-city');
    const buttonEl = element('prayer-times-check');
    const clearEl = element('prayer-times-clear');
    const statusEl = element('prayer-times-status');
    const resultEl = element('prayer-times-result');

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

    function chosenCityId() {
      const fallback = api && api.cities && api.cities.length ? api.cities[0].id : null;
      const raw = cityEl && typeof cityEl.value === 'string' && cityEl.value ? cityEl.value : fallback;
      if (!raw) return null;
      if (api && typeof api.normalizesCity === 'function') {
        return api.normalizesCity(raw) ? raw : fallback;
      }
      return fallback;
    }

    function describeMissing(record) {
      return record.missing > 0 ? ' · ' + record.missing + ' prayer entries were unreadable and skipped' : '';
    }

    async function onCheck() {
      if (busy) return;
      if (!api || typeof api.fetchesTimings !== 'function') {
        status('The prayer times glance is unavailable in this environment.');
        return;
      }
      if (!fetchImpl) {
        status('Could not check: fetch is unavailable in this browser.');
        return;
      }
      const cityId = chosenCityId();
      if (!cityId) {
        status('Could not check: no city is available in this environment.');
        return;
      }
      setBusy(true);
      try {
        const record = await api.fetchesTimings(fetchImpl, cityId, todayIso());
        render(record);
        status('Updated · ' + now().slice(0, 16).replace('T', ' ')
          + ' UTC · nothing saved on this device'
          + describeMissing(record));
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        const friendly = typeof api.classifiesError === 'function'
          ? api.classifiesError(error)
          : null;
        status(friendly ? friendly : 'Could not check: ' + message);
        clearResult();
      } finally {
        setBusy(false);
      }
    }

    function render(record) {
      if (!resultEl || !record) return;
      clearResult();
      const parts = [];
      if (record.city) parts.push(record.city);
      if (record.gregorian) parts.push(record.gregorian);
      if (record.hijri) parts.push(record.hijri);
      if (parts.length) resultEl.appendChild(doc.createTextNode(parts.join(' · ')));
      const line = record.prayers.map((prayer) => prayer.name + ' ' + prayer.time).join(' · ');
      if (line) resultEl.appendChild(doc.createTextNode(line));
    }

    function onClear() {
      if (busy) return;
      clearResult();
      status("Cleared. Tap Check to fetch today's prayer times.");
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

  const api = { attachPrayerTimesUi: attachPrayerTimesUi, ensureCard: ensureCard, CARD_ID: CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  root.DaymarkPrayerTimesUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => api.attachPrayerTimesUi({});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
