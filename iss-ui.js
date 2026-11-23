(function (root) {
  'use strict';
  // 'Space station, live' UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, no storage key, no
  // boot-time storage reads, no background timers. Each Check is one manual
  // fetch, so the card costs zero battery while idle. Mirrors potd-ui.js:
  // attachIssUi(env) is fully injectable for tests.
  const CARD_ID = 'iss-card';
  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;
    if (typeof doc.createElement !== 'function') throw new Error('space-station card host is unavailable.');
    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'iss-heading');
    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);
    const heading = doc.createElement('h2');
    heading.id = 'iss-heading';
    heading.textContent = 'Space station, live';
    aside.appendChild(heading);
    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'iss-description';
    description.textContent = 'Tap Check and the free keyless wheretheiss.at API is asked once for the ISS position, speed and lighting. The OpenStreetMap link opens the spot in a new tab. No tracking between checks, no background timers, and nothing is saved on this device. No account or API key.';
    aside.appendChild(description);
    const form = doc.createElement('form');
    form.id = 'iss-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');
    const checkButton = doc.createElement('button');
    checkButton.id = 'iss-check';
    checkButton.className = 'button button-primary';
    if (checkButton.setAttribute) checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    if (checkButton.setAttribute) checkButton.setAttribute('title', 'Check the ISS position');
    form.appendChild(checkButton);
    const clearButton = doc.createElement('button');
    clearButton.id = 'iss-clear';
    clearButton.className = 'button button-quiet';
    if (clearButton.setAttribute) clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    if (clearButton.setAttribute) clearButton.setAttribute('title', 'Clear the space-station view');
    form.appendChild(clearButton);
    aside.appendChild(form);
    const statusLine = doc.createElement('p');
    statusLine.id = 'iss-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') {
      statusLine.setAttribute('role', 'status');
      statusLine.setAttribute('aria-live', 'polite');
      statusLine.setAttribute('aria-atomic', 'true');
    }
    aside.appendChild(statusLine);
    const result = doc.createElement('div');
    result.id = 'iss-result';
    result.className = 'feed-list';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);
    const anchor = typeof doc.getElementById === 'function'
      ? (doc.getElementById('earthquake-card') || doc.getElementById('launch-card')
        || doc.getElementById('country-card') || doc.getElementById('crypto-card')
        || doc.getElementById('holiday-card'))
      : null;
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }
  function visibilityPhrase(visibility) {
    if (visibility === 'daylight') return 'in sunlight';
    if (visibility === 'eclipsed') return 'in Earth shadow';
    return 'lighting unknown';
  }
  function truncatedName(value) {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    for (let index = 0; index < trimmed.length; index += 1) {
      const code = trimmed.charCodeAt(index);
      if (code < 32 || code === 127) return '';
    }
    return trimmed.slice(0, 60);
  }
  function truncatedMapUrl(position) {
    if (!position || typeof position.mapUrl !== 'string') return null;
    const url = position.mapUrl;
    if (url.length > 300 || url.indexOf('https://') !== 0) return null;
    for (let index = 0; index < url.length; index += 1) {
      const code = url.charCodeAt(index);
      if (code < 32 || code === 127) return null;
    }
    return url;
  }
  function attachIssUi(env) {
    if (!env || !env.document) throw new Error('attachIssUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const logicApi = env.issApi || root.DaymarkIss || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);
    ensureCard(doc);
    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const buttonEl = element('iss-check');
    const formEl = element('iss-form');
    const statusEl = element('iss-status');
    const resultEl = element('iss-result');
    const clearEl = element('iss-clear');
    let busy = false;
    function status(message) { if (statusEl) statusEl.textContent = message; }
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
    function render(position) {
      if (!resultEl || !position) return;
      while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      const parts = [];
      parts.push(truncatedName(position.name) || 'ISS');
      parts.push('Latitude ' + position.latitudeLabel);
      parts.push('Longitude ' + position.longitudeLabel);
      parts.push('Altitude ' + position.altitude + ' km');
      parts.push('Speed ' + position.velocity + ' km/h');
      parts.push(visibilityPhrase(position.visibility));
      if (position.timestamp) {
        parts.push('Feed epoch second ' + position.timestamp);
      }
      parts.push('Checked ' + position.fetchedAt.slice(0, 16).replace('T', ' ') + ' UTC');
      resultEl.appendChild(doc.createTextNode(parts.join(' · ')));
      const mapUrl = truncatedMapUrl(position);
      if (mapUrl) {
        resultEl.appendChild(doc.createTextNode(' · '));
        const link = doc.createElement('a');
        link.href = mapUrl;
        link.textContent = 'Open map';
        if (typeof link.setAttribute === 'function') {
          link.setAttribute('target', '_blank');
          link.setAttribute('rel', 'noopener noreferrer');
          link.setAttribute('aria-label', 'Open the ISS position on an OpenStreetMap map in a new tab');
        }
        resultEl.appendChild(link);
      }
    }
    async function onCheck() {
      if (busy) return;
      if (!logicApi || typeof logicApi.fetchIss !== 'function') {
        status('The space-station card is unavailable.');
        return;
      }
      if (!fetchImpl) {
        status('Could not check: fetch is unavailable in this browser.');
        return;
      }
      setBusy(true);
      try {
        const position = await logicApi.fetchIss(fetchImpl, { now: now });
        render(position);
        status('Updated · ' + position.fetchedAt.slice(0, 16).replace('T', ' ')
          + ' UTC · not saved on this device · check again for a fresh fix');
        if (statusEl && statusEl.classList && typeof statusEl.classList.add === 'function'
          && typeof setTimeout === 'function') {
          statusEl.classList.add('is-success');
          if (typeof statusEl.setAttribute === 'function') statusEl.setAttribute('title', 'ISS position updated');
          setTimeout(() => {
            if (statusEl.classList) statusEl.classList.remove('is-success');
            if (typeof statusEl.removeAttribute === 'function') statusEl.removeAttribute('title');
          }, 1400);
        }
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        const friendly = typeof logicApi.classifyIssError === 'function'
          ? logicApi.classifyIssError(error)
          : null;
        status(friendly ? friendly : 'Could not check: ' + message);
        if (statusEl && statusEl.classList && typeof statusEl.classList.remove === 'function') {
          statusEl.classList.remove('is-success');
          if (typeof statusEl.removeAttribute === 'function') statusEl.removeAttribute('title');
        }
        if (resultEl) {
          while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
        }
      } finally {
        setBusy(false);
      }
    }
    function onClear() {
      if (busy) return;
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
      status('Cleared. Tap Check when you want the next station fix.');
      if (statusEl && statusEl.classList && typeof statusEl.classList.remove === 'function') {
        statusEl.classList.remove('is-success');
        if (typeof statusEl.removeAttribute === 'function') statusEl.removeAttribute('title');
      }
    }
    status('Tap Check for the current space-station position.');
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
      onCheck: onCheck,
      onClear: onClear,
      detach() { setBusy(false); }
    };
  }
  const api = { attachIssUi: attachIssUi, ensureCard: ensureCard, CARD_ID: CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkIssUi = api;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachIssUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);