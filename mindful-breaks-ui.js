((root) => {
  'use strict';
  const CARD_ID = 'mindful-breaks-card';
  const STATUS_ID = 'mindful-breaks-status';
  const LIST_ID = 'mindful-breaks-list';
  const BUTTON_ID = 'mindful-breaks-check';
  const DONE_ID = 'mindful-breaks-done';
  const INTERVAL_ID = 'mindful-breaks-interval';
  const OFF_TEXT = 'Mindful breaks are not confirmed on. Check the switch in Feature settings, then press Check now.';
  const CLOCK_TEXT = 'The page clock could not be read safely, so no break was scheduled.';
  const INTERVAL_TEXT = 'Pick an interval between 10 and 120 minutes.';
  const INTERVAL_CHOICES = [10, 20, 30, 45, 60];
  function resolveStorage(preferred, rootRef) {
    if (typeof preferred !== 'undefined') {
      return preferred && typeof preferred.getItem === 'function' ? preferred : null;
    }
    try {
      const candidate = rootRef.localStorage;
      return candidate && typeof candidate.getItem === 'function' ? candidate : null;
    } catch (error) { return null; }
  }
  function attachMindfulBreaksUi(env) {
    if (!env || typeof env !== 'object') return null;
    const doc = env.document;
    if (!doc || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function' || typeof doc.addEventListener !== 'function') {
      return null;
    }
    const flagsApi = typeof env.flags !== 'undefined' ? env.flags : (root.DaymarkFeatureFlags || null);
    if (!flagsApi || typeof flagsApi.readFlags !== 'function') return null;
    const logic = typeof env.mindfulBreaks !== 'undefined' ? env.mindfulBreaks : (root.DaymarkMindfulBreaks || null);
    if (!logic || typeof logic.evaluateBreak !== 'function' || typeof logic.describePlan !== 'function' || typeof logic.normalizeIntervalMinutes !== 'function') {
      return null;
    }
    if (doc.getElementById(CARD_ID)) return null;
    const storage = resolveStorage(env.storage, root);
    let nowMs = function () {
      if (typeof env.nowMs === 'function') return env.nowMs();
      return Date.now();
    };
    const card = doc.createElement('aside');
    card.className = 'suggestion-card';
    card.setAttribute('id', CARD_ID);
    const title = doc.createElement('h2');
    title.className = 'suggestion-title';
    title.textContent = 'Mindful breaks';
    card.appendChild(title);
    const intro = doc.createElement('p');
    intro.className = 'suggestion-description';
    intro.textContent = 'A gentle nudge to stand up and rest. Runs on this page, saves nothing.';
    card.appendChild(intro);
    const intervalLabel = doc.createElement('label');
    intervalLabel.className = 'suggestion-description';
    intervalLabel.setAttribute('for', INTERVAL_ID);
    intervalLabel.textContent = 'Nudge me every';
    card.appendChild(intervalLabel);
    const select = doc.createElement('select');
    select.setAttribute('id', INTERVAL_ID);
    for (const choice of INTERVAL_CHOICES) {
      const option = doc.createElement('option');
      option.setAttribute('value', String(choice));
      option.textContent = choice + ' minutes';
      select.appendChild(option);
    }
    select.value = String(logic.DEFAULT_INTERVAL_MINUTES);
    card.appendChild(select);
    const statusEl = doc.createElement('p');
    statusEl.className = 'feed-status';
    statusEl.setAttribute('id', STATUS_ID);
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.textContent = '';
    card.appendChild(statusEl);
    const listEl = doc.createElement('div');
    listEl.className = 'mindful-breaks-lines';
    listEl.setAttribute('id', LIST_ID);
    card.appendChild(listEl);
    const checkButton = doc.createElement('button');
    checkButton.className = 'button button-quiet';
    checkButton.setAttribute('id', BUTTON_ID);
    checkButton.setAttribute('type', 'button');
    checkButton.textContent = 'Check now';
    card.appendChild(checkButton);
    const doneButton = doc.createElement('button');
    doneButton.className = 'button button-primary';
    doneButton.setAttribute('id', DONE_ID);
    doneButton.setAttribute('type', 'button');
    doneButton.textContent = 'Done, back to the page';
    doneButton.hidden = true;
    card.appendChild(doneButton);
    function setStatus(message) { statusEl.textContent = message; }
    function renderPlan(lines) {
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
      for (const line of lines) {
        const row = doc.createElement('p');
        row.className = 'mindful-breaks-line';
        row.textContent = line;
        listEl.appendChild(row);
      }
    }
    function hideDone() { doneButton.hidden = true; }
    const state = { startedAtMs: null };
    function update() {
      if (!storage) {
        setStatus('Local storage is unavailable, so the saved Feature settings switch could not be read.');
        hideDone();
        renderPlan([]);
        return;
      }
      const read = flagsApi.readFlags(storage);
      const on = !!read && read.ok === true && read.flags[logic.FLAG_ID] === true;
      if (!on) {
        setStatus(OFF_TEXT);
        hideDone();
        renderPlan([]);
        return;
      }
      const norm = logic.normalizeIntervalMinutes(Number(select.value));
      if (!norm.ok) {
        setStatus(INTERVAL_TEXT);
        hideDone();
        renderPlan([]);
        return;
      }
      if (state.startedAtMs === null) state.startedAtMs = nowMs();
      const plan = logic.describePlan(norm.minutes);
      if (!plan.ok) {
        setStatus(INTERVAL_TEXT);
        hideDone();
        renderPlan([]);
        return;
      }
      renderPlan(plan.lines);
      const result = logic.evaluateBreak({ nowMs: nowMs(), startedAtMs: state.startedAtMs, intervalMinutes: norm.minutes });
      if (!result.ok) {
        setStatus(CLOCK_TEXT);
        hideDone();
        renderPlan([]);
        return;
      }
      if (result.state === 'break-due') {
        setStatus('Time for a short reset: ' + result.suggestion);
        doneButton.hidden = false;
        return;
      }
      setStatus('On. ' + result.minutesRemaining + ' minute(s) to go, ' + result.minutesElapsed + ' minute(s) on this page so far.');
      hideDone();
    }
    function takeBreak() {
      state.startedAtMs = nowMs();
      update();
    }
    checkButton.addEventListener('click', update);
    doneButton.addEventListener('click', takeBreak);
    doc.addEventListener('focusin', update);
    doc.addEventListener('pointerdown', update);
    doc.addEventListener('visibilitychange', update);
    const headEl = doc.head || null;
    const styleEl = doc.createElement('style');
    styleEl.textContent = '#mindful-breaks-card .mindful-breaks-line{margin:2px 0;}#mindful-breaks-card select{margin:4px 0;}';
    if (headEl && typeof headEl.appendChild === 'function') headEl.appendChild(styleEl);
    let placed = false;
    const anchors = ['feature-flags-card', 'storage-card'];
    for (const anchorId of anchors) {
      const anchor = doc.getElementById(anchorId);
      if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
        anchor.parentNode.insertBefore(card, anchor);
        placed = true;
        break;
      }
    }
    if (!placed && doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(card);
      placed = true;
    }
    if (!placed) return null;
    return { attached: true, handle: { card: card, statusEl: statusEl, listEl: listEl, checkButton: checkButton, doneButton: doneButton, intervalSelect: select, update: update, takeBreak: takeBreak } };
  }
  function bootWhenReady() {
    if (typeof document === 'undefined') return;
    attachMindfulBreaksUi({
      document: document,
      flags: root.DaymarkFeatureFlags,
      mindfulBreaks: root.DaymarkMindfulBreaks,
      storage: resolveStorage(undefined, root),
      nowMs: undefined
    });
  }
  const api = { attachMindfulBreaksUi: attachMindfulBreaksUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkMindfulBreaksUi = api;
  if (typeof document !== 'undefined' && document && typeof document.readyState === 'string') {
    if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', bootWhenReady);
    } else {
      bootWhenReady();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
