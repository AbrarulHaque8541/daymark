((root) => {
  'use strict';
  const CARD_ID = 'feature-flags-card';
  const STATUS_ID = 'feature-flags-status';
  const NO_SAVED_STATE_TEXT = 'No saved preferences yet; defaults are shown. Nothing was fetched.';
  const MALFORMED_TEXT = 'Saved preferences were unreadable, so defaults are shown.';
  const UNAVAILABLE_TEXT = 'Local storage is unavailable, so defaults are shown.';
  const SAVED_TEXT = 'Saved preferences on this device are shown.';
  const NOT_DO_TEXT = 'What it does not do: this card makes no network requests, sells nothing, and never flips a planned switch by itself.';
  const PLANNED_NOTE = 'Planned, not switchable yet.';
  function resolveStorage(rootRef, preferred) {
    if (typeof preferred !== 'undefined') return preferred;
    try {
      const candidate = rootRef.localStorage;
      return candidate && typeof candidate.getItem === 'function' ? candidate : null;
    } catch (error) { return null; }
  }
  function attachFeatureFlagsUi(env) {
    if (!env || typeof env !== 'object') return { attached: false, reason: 'document-unavailable' };
    const doc = env.document;
    if (!doc || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function' || typeof doc.addEventListener !== 'function') {
      return { attached: false, reason: 'document-unavailable' };
    }
    const flagsApi = typeof env.flags !== 'undefined' ? env.flags : (root.DaymarkFeatureFlags || null);
    if (!flagsApi || !Array.isArray(flagsApi.FEATURE_FLAGS) || flagsApi.FEATURE_FLAGS.length === 0
        || typeof flagsApi.readFlags !== 'function' || typeof flagsApi.setFlag !== 'function') {
      return { attached: false, reason: 'registry-unavailable' };
    }
    if (doc.getElementById(CARD_ID)) return { attached: false, reason: 'already-attached' };
    const storage = resolveStorage(root, env.storage);
    const headEl = doc.head || null;
    const bodyEl = doc.body || null;
    const card = doc.createElement('aside');
    card.className = 'suggestion-card';
    card.setAttribute('id', CARD_ID);
    const title = doc.createElement('h2');
    title.className = 'suggestion-title';
    title.textContent = 'Feature settings';
    card.appendChild(title);
    const intro = doc.createElement('p');
    intro.className = 'suggestion-description';
    intro.textContent = 'Switch optional extras on here. Every toggle starts off, so nothing changes until you ask for it.';
    card.appendChild(intro);
    const rows = doc.createElement('div');
    rows.className = 'feature-flag-rows';
    card.appendChild(rows);
    const checkboxInputs = [];
    for (const flag of flagsApi.FEATURE_FLAGS) {
      const row = doc.createElement('div');
      row.className = 'feature-flag-row';
      const input = doc.createElement('input');
      input.setAttribute('type', 'checkbox');
      input.setAttribute('data-feature-id', flag.id);
      input.setAttribute('id', 'feature-flag-' + flag.id);
      if (flag.kind !== 'feature') input.disabled = true;
      const label = doc.createElement('label');
      label.setAttribute('for', 'feature-flag-' + flag.id);
      label.textContent = flag.label;
      const info = doc.createElement('span');
      info.className = 'suggestion-description';
      info.textContent = flag.description + (flag.kind !== 'feature' ? ' ' + PLANNED_NOTE : '');
      row.appendChild(input);
      row.appendChild(label);
      row.appendChild(info);
      rows.appendChild(row);
      checkboxInputs.push(input);
    }
    const notDo = doc.createElement('p');
    notDo.className = 'suggestion-description';
    notDo.textContent = NOT_DO_TEXT;
    card.appendChild(notDo);
    const statusEl = doc.createElement('p');
    statusEl.className = 'feed-status';
    statusEl.setAttribute('id', STATUS_ID);
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.textContent = '';
    card.appendChild(statusEl);
    function setStatus(message) {
      statusEl.textContent = message;
    }
    function syncInputs(flags) {
      for (const input of checkboxInputs) {
        const id = input.getAttribute('data-feature-id');
        if (Object.prototype.hasOwnProperty.call(flags, id) && typeof flags[id] === 'boolean') {
          input.checked = flags[id];
        }
      }
    }
    function hydrateOnce() {
      if (!storage) {
        setStatus(UNAVAILABLE_TEXT);
        return { ok: false, reason: 'storage-unavailable' };
      }
      const read = flagsApi.readFlags(storage);
      if (!read || read.ok !== true) {
        const reason = read && read.reason ? read.reason : 'malformed-saved-state';
        setStatus(reason === 'no-saved-state' ? NO_SAVED_STATE_TEXT : (reason === 'storage-unavailable' ? UNAVAILABLE_TEXT : MALFORMED_TEXT));
        return { ok: false, reason: reason };
      }
      syncInputs(read.flags);
      setStatus(SAVED_TEXT);
      return { ok: true, flags: read.flags };
    }
    let hydrated = false;
    function hydrateLazily() {
      if (hydrated) return { ok: false, reason: 'already-hydrated' };
      hydrated = true;
      return hydrateOnce();
    }
    function onChange(event) {
      const target = event && event.target;
      if (!target || typeof target.getAttribute !== 'function') return;
      const id = target.getAttribute('data-feature-id');
      if (!id) return;
      let flag = null;
      for (const candidate of flagsApi.FEATURE_FLAGS) {
        if (candidate.id === id) flag = candidate;
      }
      if (!flag || flag.kind !== 'feature') return;
      const wanted = target.checked === true;
      hydrateLazily();
      const saved = flagsApi.setFlag(storage, flag.id, wanted);
      if (!saved || saved.ok !== true) {
        const again = flagsApi.readFlags(storage);
        if (again && again.ok === true && typeof again.flags[flag.id] === 'boolean') target.checked = again.flags[flag.id];
        else target.checked = !wanted;
        setStatus('Could not save this switch' + (saved && saved.reason ? ' (' + saved.reason + ')' : '') + '. Nothing was changed on disk.');
        return;
      }
      target.checked = wanted === true;
      if (saved.flags) syncInputs(saved.flags);
      setStatus(flag.label + ' is now ' + (wanted ? 'on' : 'off') + '. Saved on this device.');
    }
    function onLazyEvent() { hydrateLazily(); }
    doc.addEventListener('focusin', onLazyEvent);
    doc.addEventListener('pointerdown', onLazyEvent);
    doc.addEventListener('change', onChange);
    const styleEl = doc.createElement('style');
    styleEl.textContent = '#feature-flags-card .feature-flag-row{display:flex;align-items:flex-start;gap:8px;padding:6px 0;}#feature-flags-card input[type=checkbox]{flex:none;}';
    if (headEl && typeof headEl.appendChild === 'function') headEl.appendChild(styleEl);
    else if (bodyEl && typeof bodyEl.appendChild === 'function') bodyEl.appendChild(styleEl);
    let placed = false;
    const anchor = doc.getElementById('storage-card');
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(card, anchor);
      placed = true;
    } else if (bodyEl && typeof bodyEl.appendChild === 'function') {
      bodyEl.appendChild(card);
      placed = true;
    }
    if (!placed) return { attached: false, reason: 'card-unavailable' };
    return { attached: true, handle: { card: card, statusEl: statusEl, hydrate: hydrateLazily } };
  }
  const api = { attachFeatureFlagsUi: attachFeatureFlagsUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkFeatureFlagsUi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
