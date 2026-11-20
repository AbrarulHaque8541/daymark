/*
 * Daymark lifecycle-recovery UI for the web prototype.
 *
 * Wires the "Lifecycle recovery, in plain words" card: a pick list of
 * Android and WebView lifecycle scenarios, an Explain action that renders a
 * plain-words breakdown from the DaymarkLifecycleRecovery engine, and a
 * Clear action. Nothing is fetched, nothing is stored, and no Android or
 * browser setting is touched.
 *
 * Fail-closed and stateless: unknown scenario ids render the honest
 * "Unavailable" notice instead of guessing, and if the engine is missing
 * the card says so instead of showing empty results.
 */
((root) => {
  'use strict';

  const CARD_IDS = [
    'lifecycle-recovery-form',
    'lifecycle-recovery-scenario',
    'lifecycle-recovery-status',
    'lifecycle-recovery-result',
    'lifecycle-recovery-clear'
  ];

  const AVAILABLE_PREFIX = 'Explained · ';
  const AVAILABLE_SUFFIX = ' · changes no data';
  const UNAVAILABLE_MESSAGE = 'Unavailable · this scenario is not known in this build, so no explanation was shown and no action was run';
  const NO_ENGINE_MESSAGE = 'Unavailable · lifecycle explanations are not loaded in this session, so no action was run';
  const CLEAR_ARIA_LABEL = 'Clear explanation';

  function normalize(text) {
    return String(text)
      .split(String.fromCharCode(10)).join(' ')
      .split('  ').join(' ')
      .trim();
  }

  function explanationLines(info) {
    return [
      { label: 'Still work', value: normalize(info.stillWorks.join('; ')) },
      { label: 'At risk', value: info.lostAtRisk.length > 0 ? normalize(info.lostAtRisk.join('; ')) : 'Nothing was listed as at risk.' },
      { label: 'Data', value: normalize(info.dataNote) },
      { label: 'Recovery', value: normalize(info.recovery) },
      { label: 'User action', value: normalize(info.userAction) },
      { label: 'Network', value: normalize(info.network) },
      { label: 'Device verification', value: normalize(info.verification) }
    ];
  }

  function renderInto(doc, els, engine, value) {
    while (els.result.firstChild) els.result.removeChild(els.result.firstChild);
    if (!engine || typeof engine.explainLifecycle !== 'function') {
      els.status.textContent = NO_ENGINE_MESSAGE;
      return;
    }
    const info = engine.explainLifecycle(value);
    if (!info || info.available === false) {
      els.status.textContent = UNAVAILABLE_MESSAGE;
      return;
    }
    const lines = explanationLines(info);
    for (let i = 0; i < lines.length; i += 1) {
      const item = doc.createElement('li');
      item.textContent = lines[i].label + ' · ' + lines[i].value;
      els.result.appendChild(item);
    }
    els.status.textContent = AVAILABLE_PREFIX + info.label + AVAILABLE_SUFFIX;
  }

  function collectElements(doc, ids) {
    const els = {};
    let missing = 0;
    for (let i = 0; i < ids.length; i += 1) {
      const el = doc.getElementById(ids[i]);
      if (!el) missing += 1;
      els[ids[i]] = el;
    }
    return { els, missing };
  }

  function attachLifecycleRecoveryUi(env) {
    const env2 = env || {};
    const doc = env2.document || (typeof document !== 'undefined' ? document : null);
    let engine = env2.engine;
    if (engine === undefined) {
      engine = (typeof globalThis !== 'undefined' && globalThis.DaymarkLifecycleRecovery)
        || (typeof window !== 'undefined' && window.DaymarkLifecycleRecovery)
        || null;
    }
    if (!doc) return { ok: false, reason: 'no-document' };
    const picked = collectElements(doc, CARD_IDS);
    if (picked.missing > 0) return { ok: false, reason: 'missing-elements' };

    const form = picked.els['lifecycle-recovery-form'];
    const select = picked.els['lifecycle-recovery-scenario'];
    const status = picked.els['lifecycle-recovery-status'];
    const result = picked.els['lifecycle-recovery-result'];
    const clearBtn = picked.els['lifecycle-recovery-clear'];
    clearBtn.setAttribute('aria-label', CLEAR_ARIA_LABEL);

    const run = () => {
      renderInto(doc, { status, result }, engine, select.value);
    };

    form.addEventListener('submit', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      run();
    });
    select.addEventListener('change', run);
    clearBtn.addEventListener('click', () => {
      while (result.firstChild) result.removeChild(result.firstChild);
      status.textContent = '';
    });

    run();
    return { ok: true };
  }

  function bootWhenReady() {
    if (typeof document === 'undefined') return { ok: false, reason: 'no-document' };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { attachLifecycleRecoveryUi(null); });
      return { ok: true, deferred: true };
    }
    return attachLifecycleRecoveryUi(null);
  }

  const api = {
    attachLifecycleRecoveryUi,
    explanationLines,
    CARD_IDS,
    AVAILABLE_PREFIX,
    AVAILABLE_SUFFIX,
    UNAVAILABLE_MESSAGE,
    NO_ENGINE_MESSAGE,
    CLEAR_ARIA_LABEL
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DaymarkLifecycleRecoveryUi = api;
  if (typeof document !== 'undefined') bootWhenReady();
})(typeof globalThis !== 'undefined' ? globalThis : this);
