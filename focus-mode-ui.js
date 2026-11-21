/*
 * Daymark focus-mode UI wiring for the web prototype.
 *
 * A self-injecting opt-in card (feature-flags card pattern) plus a focus
 * overlay: one task, one view. The chooser lists open tasks from
 * daymark.tasks.v1 (read lazily, validated with the shared task logic). The
 * overlay dims the page and dims nothing else; Exit restores it. Mark
 * complete writes through the same cross-tab coordinator app.js uses
 * (task-mutation-logic commitTaskSnapshot) and then asks app.js to reload the
 * list with a synthesized storage event. The overlay opens only when the
 * focus-mode flag is on in Feature settings. Fully offline: no network, no
 * timers, nothing saved on exit.
 */
((root) => {
  'use strict';

  const CARD_ID = 'focus-mode-card';
  const STATUS_ID = 'focus-mode-status';
  const OVERLAY_ID = 'focus-mode-overlay';
  const TASK_SELECT_ID = 'focus-mode-task';
  const TASK_LABEL_ID = 'focus-mode-result';
  const TRUNCATED_NOTE = '(list truncated at 50 open tasks)';
  const OFF_TEXT = 'Focus view is switched off in Feature settings. Turn it on there first.';

  function resolveStorage(rootRef, preferred) {
    if (typeof preferred !== 'undefined') return preferred;
    try {
      const candidate = rootRef.localStorage;
      return candidate && typeof candidate.getItem === 'function' ? candidate : null;
    } catch (error) { return null; }
  }

  function resolveLockManager(win) {
    try {
      const locks = win && win.navigator ? win.navigator.locks : null;
      return locks && typeof locks.request === 'function' ? locks : null;
    } catch (error) { return null; }
  }

  function attachFocusModeUi(env) {
    if (!env || typeof env !== 'object') return null;
    const doc = env.document;
    if (!doc || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function'
        || typeof doc.addEventListener !== 'function') return null;
    // Engines must arrive through env: module globals are loaded eagerly by
    // other scripts and would make a missing-engine attach succeed wrongly.
    const flagsApi = env.flags;
    const focusLogic = env.focusMode;
    const logic = env.logic;
    const mutation = env.taskMutation;
    if (!flagsApi || typeof flagsApi.readFlags !== 'function') return null;
    if (!focusLogic || typeof focusLogic.pickOpenTasks !== 'function' || typeof focusLogic.completeTaskInSnapshot !== 'function') return null;
    if (!logic || typeof logic.validateStoredTasks !== 'function') return null;
    if (doc.getElementById(CARD_ID)) return null;
    const win = env.window || doc.defaultView || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const storage = resolveStorage(root, env.storage);
    const headEl = doc.head || null;
    const bodyEl = doc.body || null;
    if (!bodyEl || typeof bodyEl.appendChild !== 'function') return null;

    const card = doc.createElement('aside');
    card.className = 'suggestion-card';
    card.setAttribute('id', CARD_ID);
    const title = doc.createElement('h2');
    title.className = 'suggestion-title';
    title.textContent = 'One thing at a time';
    card.appendChild(title);
    const intro = doc.createElement('p');
    intro.className = 'suggestion-description';
    intro.textContent = 'Pick an open task and the page steps back behind a single view. Opt in with the Focus view switch in Feature settings.';
    card.appendChild(intro);
    const select = doc.createElement('select');
    select.setAttribute('id', TASK_SELECT_ID);
    select.setAttribute('aria-label', 'Task to focus on');
    card.appendChild(select);

    const enterButton = doc.createElement('button');
    enterButton.className = 'button button-primary';
    enterButton.setAttribute('id', 'focus-mode-enter');
    enterButton.setAttribute('type', 'button');
    enterButton.textContent = 'Enter focus';
    card.appendChild(enterButton);
    const statusEl = doc.createElement('p');
    statusEl.setAttribute('id', STATUS_ID);
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.textContent = '';
    card.appendChild(statusEl);

    function setStatus(message) { statusEl.textContent = message; }

    function readSavedTasks() {
      if (!storage || typeof storage.getItem !== 'function') {
        return { ok: false, reason: 'storage-unavailable', tasks: [] };
      }
      let raw = null;
      try { raw = storage.getItem(focusLogic.TASKS_STORAGE_KEY); }
      catch (error) { return { ok: false, reason: 'storage-unavailable', tasks: [] }; }
      if (raw === null || raw === '') return { ok: true, reason: '', tasks: [] };
      let parsed = null;
      try { parsed = JSON.parse(raw); }
      catch (error) { return { ok: false, reason: 'tasks-unreadable', tasks: [] }; }
      if (!Array.isArray(parsed)) return { ok: false, reason: 'tasks-unreadable', tasks: [] };
      let validated = null;
      try { validated = logic.validateStoredTasks(parsed); }
      catch (error) { return { ok: false, reason: 'tasks-unreadable', tasks: [] }; }
      if (!validated || !Array.isArray(validated.tasks)) {
        return { ok: false, reason: 'tasks-unreadable', tasks: [] };
      }
      return { ok: true, reason: '', tasks: validated.tasks };
    }

    function refreshChooser() {
      while (select.firstChild) select.removeChild(select.firstChild);
      const today = todayDate(now());
      const read = readSavedTasks();
      if (!read.ok) {
        const empty = doc.createElement('option');
        empty.setAttribute('value', '');
        empty.textContent = focusLogic.describeEntryError(read.reason);
        select.appendChild(empty);
        return { ok: false, reason: read.reason };
      }
      const pick = focusLogic.pickOpenTasks(read.tasks, today);
      if (!pick.ok) {
        const failed = doc.createElement('option');
        failed.setAttribute('value', '');
        failed.textContent = focusLogic.describeEntryError(pick.reason);
        select.appendChild(failed);
        return { ok: false, reason: pick.reason };
      }
      if (pick.items.length === 0) {
        const none = doc.createElement('option');
        none.setAttribute('value', '');
        none.textContent = 'No open tasks to focus on.';
        select.appendChild(none);
        return { ok: true, count: 0 };
      }
      for (const item of pick.items) {
        const option = doc.createElement('option');
        option.setAttribute('value', item.id);
        option.textContent = item.label;
        select.appendChild(option);
      }
      // Real browsers auto-select the first option; a script-built select does
      // not. Set it explicitly so entry never refuses on an empty value.
      if (typeof select.value === 'string' && select.value === '' && select.firstChild) {
        const first = select.firstChild.getAttribute('value');
        if (typeof first === 'string' && first !== '') select.value = first;
      }
      if (pick.truncated) setStatus(TRUNCATED_NOTE);
      return { ok: true, count: pick.items.length, truncated: pick.truncated };
    }

    function todayDate(iso) {
      const stamp = new Date(iso);
      if (isNaN(stamp.getTime())) return '';
      const month = String(stamp.getMonth() + 1).padStart(2, '0');
      const day = String(stamp.getDate()).padStart(2, '0');
      return String(stamp.getFullYear()) + '-' + month + '-' + day;
    }

    // Overlay markup, built once and kept hidden until it opens.
    const overlay = doc.createElement('section');
    overlay.setAttribute('id', OVERLAY_ID);
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'focus-mode-title');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.className = 'focus-mode-layer';
    const panel = doc.createElement('div');
    panel.className = 'focus-mode-panel';
    overlay.appendChild(panel);
    const overlayTitle = doc.createElement('h2');
    overlayTitle.setAttribute('id', 'focus-mode-title');
    overlayTitle.className = 'suggestion-title';
    overlayTitle.textContent = 'One task, one view';
    panel.appendChild(overlayTitle);
    const taskLabel = doc.createElement('p');
    taskLabel.setAttribute('id', TASK_LABEL_ID);
    taskLabel.className = 'focus-mode-result';
    taskLabel.textContent = '';
    panel.appendChild(taskLabel);
    const planList = doc.createElement('ul');
    planList.className = 'focus-mode-plan';
    for (const line of focusLogic.entryPlan()) {
      const li = doc.createElement('li');
      li.textContent = line;
      planList.appendChild(li);
    }
    panel.appendChild(planList);
    const overlayStatus = doc.createElement('p');
    overlayStatus.setAttribute('id', 'focus-mode-overlay-status');
    overlayStatus.setAttribute('role', 'status');
    overlayStatus.setAttribute('aria-live', 'polite');
    overlayStatus.textContent = '';
    panel.appendChild(overlayStatus);
    const completeButton = doc.createElement('button');
    completeButton.className = 'button button-primary';
    completeButton.setAttribute('id', 'focus-mode-complete');
    completeButton.setAttribute('type', 'button');
    completeButton.textContent = 'Mark complete';
    panel.appendChild(completeButton);
    const exitButton = doc.createElement('button');
    exitButton.className = 'button button-quiet';
    exitButton.setAttribute('id', 'focus-mode-exit');
    exitButton.setAttribute('type', 'button');
    exitButton.textContent = 'Exit focus';
    panel.appendChild(exitButton);

    const styleEl = doc.createElement('style');
    styleEl.textContent = '#focus-mode-card select#focus-mode-task{width:100%;height:42px;margin:8px 0 10px;padding:0 12px;border:1px solid rgba(219,226,232,.9);border-radius:12px;background:rgba(255,255,255,.85);color:var(--ink,#1c232a);font:inherit;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath d=\'m3 4.5 3 3 3-3\' fill=\'none\' stroke=\'%23565f68\' stroke-width=\'1.2\'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 11px center;padding-right:28px;}#focus-mode-card select#focus-mode-task:focus{border-color:#2a8f7a;box-shadow:0 0 0 3px rgba(22,112,95,.12);outline:none;}#focus-mode-card #focus-mode-enter:active,#focus-mode-overlay #focus-mode-complete:active,#focus-mode-overlay #focus-mode-exit:active{transform:scale(0.96);background:rgba(22,112,95,.12);}#focus-mode-overlay{position:fixed;top:0;right:0;bottom:0;left:0;margin:0;padding:16px;background:rgba(15,23,26,.62);display:flex;justify-content:center;align-items:center;z-index:62;opacity:0;pointer-events:none;overscroll-behavior:contain;transition:opacity .18s ease;}#focus-mode-overlay.is-open{opacity:1;pointer-events:auto;}#focus-mode-overlay .focus-mode-panel{width:min(480px,94vw);max-height:80vh;overflow:auto;padding:18px;border-radius:16px;display:flex;flex-direction:column;gap:10px;background:rgba(255,255,255,.78);-webkit-backdrop-filter:saturate(160%) blur(18px);backdrop-filter:saturate(160%) blur(18px);border:1px solid rgba(22,112,95,.28);box-shadow:0 18px 50px rgba(24,40,48,.12);}.focus-mode-panel .focus-mode-plan{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;}@media (prefers-reduced-motion: reduce){#focus-mode-overlay{transition:none;}#focus-mode-card #focus-mode-enter:active,#focus-mode-overlay #focus-mode-complete:active,#focus-mode-overlay #focus-mode-exit:active{transform:none;}}@media (prefers-color-scheme: dark){#focus-mode-overlay .focus-mode-panel{background:rgba(18,24,30,.78);border-color:rgba(42,143,122,.4);}#focus-mode-card select#focus-mode-task{background:rgba(30,36,42,.85);color:#e8eef2;border-color:rgba(60,70,80,.6);}}';

    let openTaskId = null;
    let returnFocusTo = null;

    function overlayOpen() { return overlay.classList.contains('is-open'); }

    function openOverlay(taskId, lines, heading) {
      openTaskId = taskId;
      taskLabel.textContent = heading;
      while (planList.firstChild) planList.removeChild(planList.firstChild);
      for (const line of lines) {
        const li = doc.createElement('li');
        li.textContent = line;
        planList.appendChild(li);
      }
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      if (typeof exitButton.focus === 'function') exitButton.focus();
      return true;
    }

    function closeOverlay() {
      if (!overlayOpen()) return false;
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      overlayStatus.textContent = '';
      const target = returnFocusTo;
      returnFocusTo = null;
      openTaskId = null;
      if (target && typeof target.focus === 'function') target.focus();
      return true;
    }

    function readFlags() {
      if (!storage) return { ok: false, read: null };
      try { return { ok: true, read: flagsApi.readFlags(storage) }; }
      catch (error) { return { ok: false, read: null }; }
    }

    function flagOn() {
      const attempt = readFlags();
      if (!attempt.ok || !attempt.read) return false;
      return focusLogic.flagIsOn(attempt.read);
    }

    function chosenTaskId() {
      const value = typeof select.value === 'string' ? select.value : '';
      return value === '' ? null : value;
    }

    function chosenTask() {
      const wanted = chosenTaskId();
      if (!wanted) return { ok: false, reason: 'no-tasks' };
      const read = readSavedTasks();
      if (!read.ok) return { ok: false, reason: read.reason };
      for (const task of read.tasks) {
        if (task && task.id === wanted) return { ok: true, task: task, tasks: read.tasks };
      }
      return { ok: false, reason: 'unknown-task' };
    }

    function enterFocus() {
      if (overlayOpen()) return true;
      if (!flagOn()) {
        setStatus(focusLogic.describeEntryError('flag-off'));
        return false;
      }
      const day = todayDate(now());
      const pick = refreshChooser();
      if (!pick.ok || pick.count === 0) {
        setStatus(focusLogic.describeEntryError(pick.ok ? 'no-tasks' : pick.reason));
        return false;
      }
      const found = chosenTask();
      if (!found.ok) {
        setStatus(focusLogic.describeEntryError(found.reason));
        return false;
      }
      const described = focusLogic.describeTask(found.task, day);
      if (!described.ok) {
        setStatus(focusLogic.describeEntryError(described.reason));
        return false;
      }
      returnFocusTo = typeof enterButton.focus === 'function' ? enterButton : null;
      const heading = found.task.title.trim().replace(/[\r\n\t]+/g, ' ');
      return openOverlay(found.task.id, focusLogic.entryPlan().concat(described.lines), heading);
    }

    async function markComplete() {
      if (!openTaskId) {
        overlayStatus.textContent = 'No task is open in the overlay, so nothing was saved.';
        return false;
      }
      overlayStatus.textContent = 'Saving the completed task\u2026';
      const read = readSavedTasks();
      if (!read.ok) {
        overlayStatus.textContent = focusLogic.describeCompleteError(read.reason);
        return false;
      }
      let completion = null;
      try { completion = now(); }
      catch (error) { completion = null; }
      if (typeof completion !== 'string' || completion === '') {
        overlayStatus.textContent = focusLogic.describeCompleteError('invalid-timestamp');
        return false;
      }
      const planned = focusLogic.completeTaskInSnapshot(read.tasks, openTaskId, completion);
      if (!planned.ok) {
        overlayStatus.textContent = focusLogic.describeCompleteError(planned.reason);
        return false;
      }
      const locks = resolveLockManager(win);
      if (!locks) {
        overlayStatus.textContent = focusLogic.describeCompleteError('lock-unavailable');
        return false;
      }
      let generation = null;
      try { generation = mutation.readGeneration(storage); }
      catch (error) { generation = null; }
      if (!generation || !generation.ok) {
        overlayStatus.textContent = focusLogic.describeCompleteError(generation && generation.reason ? generation.reason : 'generation-unreadable');
        return false;
      }
      let saved = null;
      try {
        saved = await mutation.commitTaskSnapshot({
          storage: storage,
          lockManager: locks,
          baseTasks: read.tasks,
          desiredTasks: planned.tasks,
          expectedTaskEpoch: generation.value.taskEpoch,
          validateTasks: logic.validateStoredTasks
        });
      } catch (error) { saved = { ok: false, reason: 'tasks-ambiguous' }; }
      if (!saved || saved.ok !== true) {
        overlayStatus.textContent = focusLogic.describeCompleteError(saved && saved.reason ? saved.reason : 'tasks-ambiguous');
        return false;
      }
      try {
        if (win && typeof win.StorageEvent === 'function' && typeof win.dispatchEvent === 'function') {
          win.dispatchEvent(new win.StorageEvent('storage', { key: focusLogic.TASKS_STORAGE_KEY }));
        }
      } catch (error) {
        // The saved data is durable even when the same-tab refresh hint fails.
      }
      overlayStatus.textContent = 'Task marked complete and saved on this device. Exit when ready.';
      refreshChooser();
      return true;
    }

    function onEnterTap(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      enterFocus();
    }
    function onExitTap(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      closeOverlay();
    }
    function onDocumentKeydown(event) {
      if (!overlayOpen()) return;
      if (!event || typeof event.key !== 'string') return;
      if (event.key.toLowerCase() === 'escape') {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        closeOverlay();
      }
    }
    function onLazyRefresh() {
      if (overlayOpen()) return;
      refreshChooser();
    }

    enterButton.addEventListener('click', onEnterTap);
    exitButton.addEventListener('click', onExitTap);
    completeButton.addEventListener('click', () => markComplete());
    doc.addEventListener('keydown', onDocumentKeydown);
    doc.addEventListener('focusin', onLazyRefresh);

    if (headEl && typeof headEl.appendChild === 'function') headEl.appendChild(styleEl);
    else if (typeof bodyEl.appendChild === 'function') bodyEl.appendChild(styleEl);
    bodyEl.appendChild(overlay);
    refreshChooser();
    if (!flagOn()) setStatus(OFF_TEXT);

    let placed = false;
    const anchor = doc.getElementById('storage-card');
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(card, anchor);
      placed = true;
    } else if (typeof bodyEl.appendChild === 'function') {
      bodyEl.appendChild(card);
      placed = true;
    }
    if (!placed) return null;

    return {
      card: card,
      overlay: overlay,
      select: select,
      statusEl: statusEl,
      overlayStatus: overlayStatus,
      enterFocus: enterFocus,
      closeOverlay: closeOverlay,
      overlayOpen: overlayOpen,
      markComplete: markComplete,
      refreshChooser: refreshChooser
    };
  }

  const api = { attachFocusModeUi: attachFocusModeUi, CARD_ID: CARD_ID, OVERLAY_ID: OVERLAY_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkFocusModeUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachFocusModeUi({
      document: document,
      window: window,
      flags: root.DaymarkFeatureFlags,
      focusMode: root.DaymarkFocusMode,
      logic: root.DaymarkLogic,
      taskMutation: root.DaymarkTaskMutation
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
