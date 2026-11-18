/*
 * Daymark capability registry card UI wiring for the web prototype.
 *
 * A small offline card: the user picks a capability and this card shows, in
 * plain words, its stable id, where it lives, whether it is available, what
 * network it uses, what permissions and backend it needs, its rollout state
 * and its honest limitations. Nothing is fetched, nothing runs, nothing is
 * stored; the registry engine is DaymarkCapabilityRegistry
 * (capability-registry-logic.js). Mirrors permission-lifecycle-ui.js:
 * attachCapabilityRegistryUi(env) is fully injectable for unit tests and
 * the card is stateless, so boot never touches window.localStorage.
 */
((root) => {
  'use strict';

  function attachCapabilityRegistryUi(env) {
    if (!env || !env.document) throw new Error('attachCapabilityRegistryUi requires a document.');
    const doc = env.document;
    const dataApi = Object.prototype.hasOwnProperty.call(env, 'registryApi')
      ? env.registryApi
      : (root.DaymarkCapabilityRegistry || null);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const featureEl = element('capability-registry-feature');
    const statusEl = element('capability-registry-status');
    const resultEl = element('capability-registry-result');
    const formEl = element('capability-registry-form');
    const clearEl = element('capability-registry-clear');

    function status(message, isSuccess) {
      if (statusEl) statusEl.textContent = message;
      if (statusEl && statusEl.classList && typeof statusEl.classList.toggle === 'function') {
        statusEl.classList.toggle('is-success', !!isSuccess);
      }
    }

    function makeItem(text) {
      const item = doc.createElement('div');
      item.className = 'feed-item';
      item.textContent = text;
      return item;
    }

    function renderFeature(result) {
      if (!resultEl) return;
      while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      const head = doc.createElement('div');
      head.className = 'feed-item';
      const title = doc.createElement('span');
      title.className = 'feed-item-title';
      title.textContent = result.title;
      const summary = doc.createElement('p');
      summary.className = 'feed-item-summary';
      summary.textContent = result.summary;
      head.appendChild(title);
      head.appendChild(summary);
      resultEl.appendChild(head);
      const lines = [
        'Capability id \u00b7 ' + result.id,
        'Where \u00b7 ' + result.where,
        'Availability \u00b7 ' + result.availability + ' \u2014 ' + result.availabilityNote,
        'Network \u00b7 ' + result.network + ' \u2014 ' + result.networkNote,
        'Permissions \u00b7 ' + (result.permissions.length === 0 ? 'none' : result.permissions.join('; ')),
        'Backend \u00b7 ' + result.backend,
        'Rollout \u00b7 ' + result.rollout
      ];
      for (let i = 0; i < result.limitations.length; i += 1) {
        lines.push('Limitation \u00b7 ' + result.limitations[i]);
      }
      for (let i = 0; i < lines.length; i += 1) {
        resultEl.appendChild(makeItem(lines[i]));
      }
    }

    function describe() {
      if (!dataApi || typeof dataApi.describeFeature !== 'function') {
        status('Capability registry descriptions are unavailable.', false);
        return;
      }
      const feature = featureEl && typeof featureEl.value === 'string' ? featureEl.value : '';
      const result = dataApi.describeFeature(feature);
      status(!result.available
        ? 'Not available here \u00b7 ' + result.label + ' \u2014 described honestly, nothing rendered as available'
        : 'Described \u00b7 ' + result.label, !!result.available);
      renderFeature(result);
    }

    function onClear() {
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
      status('Registry view cleared; nothing was fetched, run or stored.', false);
    }

    if (clearEl) {
      clearEl.textContent = 'Clear';
      if (typeof clearEl.setAttribute === 'function') {
        clearEl.setAttribute('aria-label', 'Clear registry view only; nothing is fetched, run or stored');
      }
    }

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        describe();
      });
    }
    if (featureEl && typeof featureEl.addEventListener === 'function') {
      featureEl.addEventListener('change', () => { describe(); });
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }

    // Initial describe for loading-state completeness.
    describe();

    return {
      describe,
      onClear,
      detach() {
        status('');
      }
    };
  }

  const api = { attachCapabilityRegistryUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkCapabilityRegistryUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // This UI is stateless. Do not touch window.localStorage during boot:
    // storage may be disabled or its getter may throw before the card renders.
    const boot = () => attachCapabilityRegistryUi({ document });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
