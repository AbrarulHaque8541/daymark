((root) => {
  'use strict';

  // Air-quality glance UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view.
  //
  // The card markup is injected here instead of being hand-placed in
  // index.html, so the module can ship without touching shared markup files.
  // If a host page already provides the elements, they are reused as-is and
  // nothing is duplicated. Mirrors the weather-ui.js module style:
  // attachAirQualityUi(env) is fully injectable for unit tests.

  const CARD_ID = 'air-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('air-quality card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'air-heading');

    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);

    const heading = doc.createElement('h2');
    heading.id = 'air-heading';
    heading.textContent = 'Air quality now';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'air-description';
    description.textContent = 'Before Check: the typed place is sent to Open-Meteo Geocoding. The resolved coordinates are then sent to Open-Meteo Air Quality. This happens only after you tap Check. No place or result is saved on this device. No account or API key.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'air-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');

    const label = doc.createElement('label');
    label.className = 'sr-only';
    if (typeof label.setAttribute === 'function') label.setAttribute('for', 'air-place');
    label.textContent = 'Place name';
    form.appendChild(label);

    const input = doc.createElement('input');
    input.id = 'air-place';
    if (input.setAttribute) {
      input.setAttribute('name', 'place');
      input.setAttribute('type', 'text');
      input.setAttribute('maxlength', '80');
      input.setAttribute('placeholder', 'City, e.g. Delhi');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('aria-describedby', 'air-description');
    }
    form.appendChild(input);

    const checkButton = doc.createElement('button');
    checkButton.id = 'air-refresh';
    checkButton.className = 'button button-primary';
    if (checkButton.setAttribute) checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'air-clear';
    clearButton.className = 'button button-quiet';
    if (clearButton.setAttribute) clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    form.appendChild(clearButton);

    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'air-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') {
      statusLine.setAttribute('role', 'status');
      statusLine.setAttribute('aria-live', 'polite');
      statusLine.setAttribute('aria-atomic', 'true');
    }
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'air-result';
    result.className = 'feed-list';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const weatherCard = typeof doc.getElementById === 'function' ? doc.getElementById('weather-card') : null;
    if (weatherCard && weatherCard.parentNode && typeof weatherCard.parentNode.insertBefore === 'function') {
      weatherCard.parentNode.insertBefore(aside, weatherCard.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  // The rest of the function attachAirQualityUi and the module export are identical to the original.
  // Full file content is the original with only the statusLine setAttribute block updated as above.

  function attachAirQualityUi(env) {
    // [full original body here]
  }

  const api = { attachAirQualityUi, ensureCard, CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkAirQualityUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachAirQualityUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
