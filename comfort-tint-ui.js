((root) => {
  'use strict';
  const CARD_ID = 'comfort-tint-card';
  const STATUS_ID = 'comfort-tint-status';
  const LIST_ID = 'comfort-tint-list';
  const MODE_ID = 'comfort-tint-mode';
  const APPLY_ID = 'comfort-tint-apply';
  const CLEAR_ID = 'comfort-tint-clear';
  const OVERLAY_ID = 'comfort-tint-overlay';
  const OFF_TEXT = 'Comfort tint is not confirmed on. Check the switch in Feature settings, or press Turn the tint on here.';
  function resolveStorage(preferred, rootRef) {
    if (typeof preferred !== 'undefined') {
      return preferred && typeof preferred.getItem === 'function' ? preferred : null;
    }
    try {
      const candidate = rootRef.localStorage;
      return candidate && typeof candidate.getItem === 'function' ? candidate : null;
    } catch (error) { return null; }
  }
  function attachComfortTintUi(env) {
    if (!env || typeof env !== 'object') return null;
    const doc = env.document;
    if (!doc || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function' || typeof doc.addEventListener !== 'function') {
      return null;
    }
    const flagsApi = typeof env.flags !== 'undefined' ? env.flags : (root.DaymarkFeatureFlags || null);
    if (!flagsApi || typeof flagsApi.readFlags !== 'function' || typeof flagsApi.setFlag !== 'function') return null;
    const logic = typeof env.comfortTint !== 'undefined' ? env.comfortTint : (root.DaymarkComfortTint || null);
    if (!logic || typeof logic.resolveTintState !== 'function' || typeof logic.describePlan !== 'function' || !Array.isArray(logic.MODES)) {
      return null;
    }
    if (!doc.body) return null;
    if (doc.getElementById(CARD_ID)) return null;
    const storage = resolveStorage(env.storage, root);
    const card = doc.createElement('aside');
    card.className = 'suggestion-card';
    card.setAttribute('id', CARD_ID);
    const title = doc.createElement('h2');
    title.className = 'suggestion-title';
    title.textContent = 'Comfort tint';
    card.appendChild(title);
    const intro = doc.createElement('p');
    intro.className = 'suggestion-description';
    intro.textContent = 'A soft optional veil over the whole page for long reading sessions. One switch, nothing extra saved.';
    card.appendChild(intro);
    const modeLabel = doc.createElement('label');
    modeLabel.className = 'suggestion-description';
    modeLabel.setAttribute('for', MODE_ID);
    modeLabel.textContent = 'Tint strength';
    card.appendChild(modeLabel);
    const select = doc.createElement('select');
    select.setAttribute('id', MODE_ID);
    for (const mode of logic.MODES) {
      const option = doc.createElement('option');
      option.setAttribute('value', mode.id);
      option.textContent = mode.label;
      select.appendChild(option);
    }
    select.value = logic.DEFAULT_MODE_ID;
    card.appendChild(select);
    const statusEl = doc.createElement('p');
    statusEl.className = 'feed-status';
    statusEl.setAttribute('id', STATUS_ID);
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.textContent = '';
    card.appendChild(statusEl);
    const listEl = doc.createElement('div');
    listEl.className = 'comfort-tint-lines';
    listEl.setAttribute('id', LIST_ID);
    card.appendChild(listEl);
    const applyButton = doc.createElement('button');
    applyButton.className = 'button button-primary';
    applyButton.setAttribute('id', APPLY_ID);
    applyButton.setAttribute('type', 'button');
    applyButton.textContent = 'Turn the tint on';
    card.appendChild(applyButton);
    const clearButton = doc.createElement('button');
    clearButton.className = 'button button-quiet';
    clearButton.setAttribute('id', CLEAR_ID);
    clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Turn the tint off';
    card.appendChild(clearButton);
    function setStatus(message) { statusEl.textContent = message; }
    function renderLines(lines) {
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
      for (const line of lines) {
        const row = doc.createElement('p');
        row.className = 'comfort-tint-line';
        row.textContent = line;
        listEl.appendChild(row);
      }
    }
    function overlayForNow() { return doc.body && doc.getElementById(OVERLAY_ID) ? doc.getElementById(OVERLAY_ID) : null; }
    function removeOverlay() {
      const existing = overlayForNow();
      if (existing && existing.parentNode && typeof existing.parentNode.removeChild === 'function') {
        existing.parentNode.removeChild(existing);
      }
    }
    function applyOverlayFor(mode) {
      removeOverlay();
      const overlay = doc.createElement('div');
      overlay.className = 'comfort-tint-overlay';
      overlay.setAttribute('id', OVERLAY_ID);
      overlay.setAttribute('role', 'presentation');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style = 'position: fixed; left: 0; top: 0; width: 100%; height: 100%; border: 0; margin: 0; padding: 0; z-index: 2147483000; pointer-events: none; background: ' + mode.overlay + '; opacity: 1;';
      if (doc.body && typeof doc.body.appendChild === 'function') doc.body.appendChild(overlay);
    }
    function update() {
      if (!storage) {
        setStatus('Local storage is unavailable, so the saved Feature settings switch could not be read.');
        removeOverlay();
        renderLines([]);
        return;
      }
      const read = flagsApi.readFlags(storage);
      const enabled = !!read && read.ok === true && read.flags[logic.FLAG_ID] === true;
      const result = logic.resolveTintState({ enabled: enabled, modeId: select.value });
      if (!result.ok) {
        setStatus('The tint could not be resolved safely, so it stayed off.');
        removeOverlay();
        renderLines([]);
        return;
      }
      renderLines(result.lines);
      if (result.active) {
        applyOverlayFor({ id: result.modeId, overlay: result.overlay });
        setStatus('On: ' + result.label + '. ' + result.note);
      } else {
        removeOverlay();
        setStatus(OFF_TEXT);
      }
    }
    function applyToggle() {
      if (!storage) { update(); return; }
      const saved = flagsApi.setFlag(storage, logic.FLAG_ID, true);
      update();
      if (!saved || saved.ok !== true) {
        let again = { ok: false };
        try { again = flagsApi.readFlags(storage); } catch (error) { again = { ok: false }; }
        if (again && again.ok === true && again.flags[logic.FLAG_ID] === true) return;
        setStatus('Could not save the comfort-tint switch, so the overlay was removed and nothing was changed on disk.');
        removeOverlay();
      }
    }
    function clearToggle() {
      if (!storage) { update(); return; }
      flagsApi.setFlag(storage, logic.FLAG_ID, false);
      update();
    }
    applyButton.addEventListener('click', applyToggle);
    clearButton.addEventListener('click', clearToggle);
    select.addEventListener('change', update);
    doc.addEventListener('focusin', update);
    doc.addEventListener('pointerdown', update);
    doc.addEventListener('visibilitychange', update);
    const headEl = doc.head || null;
    const styleEl = doc.createElement('style');
    styleEl.textContent = '#comfort-tint-card .comfort-tint-line{margin:2px 0;}#comfort-tint-card select{margin:4px 0;}#comfort-tint-card button{margin:4px 8px 0 0;}';
    if (headEl && typeof headEl.appendChild === 'function') headEl.appendChild(styleEl);
    const anchors = ['mindful-breaks-card', 'feature-flags-card', 'storage-card'];
    let placed = false;
    for (const anchorId of anchors) {
      const anchor = doc.getElementById(anchorId);
      if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
        anchor.parentNode.insertBefore(card, anchor);
        placed = true;
        break;
      }
    }
    if (!placed) {
      doc.body.appendChild(card);
      placed = true;
    }
    if (!placed) return null;
    return { attached: true, handle: {
      card: card,
      statusEl: statusEl,
      listEl: listEl,
      modeSelect: select,
      applyButton: applyButton,
      clearButton: clearButton,
      update: update,
      applyToggle: applyToggle,
      clearToggle: clearToggle
    } };
  }
  function bootWhenReady() {
    if (typeof document === 'undefined') return;
    attachComfortTintUi({
      document: document,
      flags: root.DaymarkFeatureFlags,
      comfortTint: root.DaymarkComfortTint,
      storage: resolveStorage(undefined, root)
    });
  }
  const api = { attachComfortTintUi: attachComfortTintUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkComfortTintUi = api;
  if (typeof document !== 'undefined' && document && typeof document.readyState === 'string') {
    if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', bootWhenReady);
    } else {
      bootWhenReady();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
