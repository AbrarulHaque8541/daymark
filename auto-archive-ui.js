/*
 * Daymark auto-archive UI wiring for the web prototype.
 *
 * A self-injecting opt-in card (feature-flags card pattern). The card lists,
 * on an explicit Preview tap, the completed tasks that finished at least the
 * chosen number of days ago (repeating tasks and tasks with an unknown or
 * future age are never listed). Archive now removes exactly the freshly
 * previewed candidates through the same cross-tab coordinator app.js uses
 * (task-mutation-logic commitTaskSnapshot) and then asks app.js to reload the
 * list with a synthesized storage event. Nothing runs by itself: no timers,
 * no storage reads at attach, no network, no new storage keys.
 */
((root) => {
  'use strict';

  const CARD_ID = 'auto-archive-card';
  const STATUS_ID = 'auto-archive-status';
  const LIST_ID = 'auto-archive-list';
  const THRESHOLD_ID = 'auto-archive-threshold';
  const PREVIEW_ID = 'auto-archive-preview';
  const RUN_ID = 'auto-archive-run';
  const OFF_TEXT = 'Auto-archive is switched off in Feature settings. Turn it on there first.';
  const INACTIVE_TEXT = 'Nothing to archive: no completed task is older than the limit right now.';

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

  function attachAutoArchiveUi(env) {
    if (!env || typeof env !== 'object') return null;
    const doc = env.document;
    if (!doc || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return null;
    // Engines must arrive through env: module globals are loaded eagerly by
    // other scripts and would make a missing-engine attach succeed wrongly.
    const flagsApi = env.flags;
    const archiver = env.autoArchive;
    const logic = env.logic;
    const mutation = env.taskMutation;
    if (!flagsApi || typeof flagsApi.readFlags !== 'function') return null;
    if (!archiver || typeof archiver.pickArchiveCandidates !== 'function'
        || typeof archiver.buildArchiveSnapshot !== 'function') return null;
    if (!logic || typeof logic.validateStoredTasks !== 'function') return null;
    if (!mutation || typeof mutation.commitTaskSnapshot !== 'function') return null;
    if (doc.getElementById(CARD_ID)) return null;
    const win = env.window || doc.defaultView || null;
    const nowMs = typeof env.nowMs === 'function' ? env.nowMs : () => Date.now();
    const storage = resolveStorage(root, env.storage);
    const bodyEl = doc.body || null;
    if (!bodyEl || typeof bodyEl.appendChild !== 'function') return null;

    const card = doc.createElement('aside');
    card.className = 'suggestion-card';
    card.setAttribute('id', CARD_ID);
    const title = doc.createElement('h2');
    title.className = 'suggestion-title';
    title.textContent = 'Auto-archive finished tasks';
    card.appendChild(title);
    const intro = doc.createElement('p');
    intro.className = 'suggestion-description';
    intro.textContent = 'Preview completed tasks older than your limit, then archive them with one tap. Opt in with the Auto-archive switch in Feature settings.';
    card.appendChild(intro);

    const thresholdLabel = doc.createElement('label');
    thresholdLabel.setAttribute('class', 'field-label');
    thresholdLabel.setAttribute('for', THRESHOLD_ID);
    thresholdLabel.textContent = 'Tasks finished at least';
    card.appendChild(thresholdLabel);
    const select = doc.createElement('select');
    select.setAttribute('id', THRESHOLD_ID);
    select.setAttribute('aria-label', 'Minimum days since a task finished');
    for (const days of archiver.THRESHOLD_DAYS) {
      const option = doc.createElement('option');
      option.setAttribute('value', String(days));
      option.textContent = String(days) + ' day(s) ago';
      select.appendChild(option);
    }
    select.value = String(archiver.DEFAULT_THRESHOLD_DAYS);
    card.appendChild(select);

    const previewButton = doc.createElement('button');
    previewButton.className = 'button button-quiet';
    previewButton.setAttribute('id', PREVIEW_ID);
    previewButton.setAttribute('type', 'button');
    previewButton.textContent = 'Preview candidates';
    card.appendChild(previewButton);

    const runButton = doc.createElement('button');
    runButton.className = 'button button-primary';
    runButton.setAttribute('id', RUN_ID);
    runButton.setAttribute('type', 'button');
    runButton.setAttribute('disabled', 'disabled');
    runButton.textContent = 'Archive now';
    card.appendChild(runButton);

    const statusEl = doc.createElement('p');
    statusEl.setAttribute('id', STATUS_ID);
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.textContent = '';
    card.appendChild(statusEl);

    const listEl = doc.createElement('div');
    listEl.setAttribute('id', LIST_ID);
    listEl.setAttribute('aria-live', 'polite');
    card.appendChild(listEl);

    function setStatus(message) { statusEl.textContent = message; }

    function readSavedTasks() {
      if (!storage || typeof storage.getItem !== 'function') {
        return { ok: false, reason: 'storage-unavailable', tasks: [] };
      }
      let raw = null;
      try { raw = storage.getItem(archiver.TASKS_STORAGE_KEY); }
      catch (error) { return { ok: false, reason: 'storage-unavailable', tasks: [] }; }
      if (raw === null || raw === undefined || raw === '') return { ok: true, reason: '', tasks: [] };
      let parsed = null;
      try { parsed = JSON.parse(raw); }
      catch (error) { return { ok: false, reason: 'tasks-unreadable', tasks: [] }; }
      if (!Array.isArray(parsed)) return { ok: false, reason: 'tasks-unreadable', tasks: [] };
      let validated = null;
      try { validated = logic.validateStoredTasks(parsed); }
      catch (error) { return { ok: false, reason: 'tasks-unreadable', tasks: [] }; }
      if (!validated || !Array.isArray(validated.tasks) || validated.rejectedCount > 0) {
        return { ok: false, reason: 'tasks-unreadable', tasks: [] };
      }
      return { ok: true, reason: '', tasks: validated.tasks };
    }

    function readFlags() {
      if (!storage) return null;
      try { return flagsApi.readFlags(storage); }
      catch (error) { return null; }
    }

    function flagOn() {
      return archiver.flagIsOn(readFlags());
    }

    function chosenThreshold() {
      const value = typeof select.value === 'string' ? select.value : '';
      const parsed = Number(value);
      return archiver.normalizeThresholdDays(parsed);
    }

    function chosenChoices() {
      const norm = chosenThreshold();
      if (!norm.ok) return null;
      try {
        const stamp = nowMs();
        if (typeof stamp !== 'number' || !isFinite(stamp)) return null;
        return { nowMs: stamp, thresholdDays: norm.days };
      } catch (error) { return null; }
    }

    function clearList() {
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
    }

    function renderPlan() {
      const plan = archiver.describePlan(chosenThreshold().days);
      if (!plan.ok) return;
      clearList();
      const list = doc.createElement('ul');
      for (const line of plan.lines) {
        const li = doc.createElement('li');
        li.textContent = line;
        list.appendChild(li);
      }
      listEl.appendChild(list);
    }

    function preview() {
      if (!flagOn()) {
        clearList();
        setRunEnabled(false);
        setStatus(OFF_TEXT);
        return false;
      }
      const choices = chosenChoices();
      if (!choices) {
        clearList();
        setRunEnabled(false);
        setStatus(archiver.describeReadError('threshold-unreadable'));
        return false;
      }
      const read = readSavedTasks();
      if (!read.ok) {
        clearList();
        setRunEnabled(false);
        setStatus(archiver.describeReadError(read.reason));
        return false;
      }
      const pick = archiver.pickArchiveCandidates(read.tasks, choices.nowMs, choices.thresholdDays);
      if (!pick.ok) {
        clearList();
        setRunEnabled(false);
        setStatus(archiver.describeReadError(pick.reason));
        return false;
      }
      renderPlan();
      if (pick.items.length === 0) {
        setRunEnabled(false);
        setStatus(INACTIVE_TEXT);
        return false;
      }
      for (const item of pick.items) {
        const row = doc.createElement('p');
        row.textContent = item.title + ' \u00b7 finished ' + item.ageDays + ' day(s) ago';
        listEl.appendChild(row);
      }
      let note = pick.items.length + ' completed task(s) can be archived. Nothing is archived yet.';
      if (pick.truncated) note += ' (list truncated at ' + archiver.MAX_CANDIDATES + ')';
      setRunEnabled(true);
      setStatus(note);
      return true;
    }

    function setRunEnabled(enabled) {
      if (enabled === true) {
        runButton.removeAttribute('disabled');
        runButton.setAttribute('aria-disabled', 'false');
      } else {
        runButton.setAttribute('disabled', 'disabled');
        runButton.setAttribute('aria-disabled', 'true');
      }
    }

    let inFlight = false;

    async function run() {
      if (inFlight === true) return false;
      if (!flagOn()) {
        clearList();
        setRunEnabled(false);
        setStatus(OFF_TEXT);
        return false;
      }
      const choices = chosenChoices();
      if (!choices) {
        clearList();
        setRunEnabled(false);
        setStatus(archiver.describeReadError('threshold-unreadable'));
        return false;
      }
      const read = readSavedTasks();
      if (!read.ok) {
        clearList();
        setRunEnabled(false);
        setStatus(archiver.describeReadError(read.reason));
        return false;
      }
      const pick = archiver.pickArchiveCandidates(read.tasks, choices.nowMs, choices.thresholdDays);
      if (!pick.ok || pick.items.length === 0) {
        clearList();
        setRunEnabled(false);
        setStatus(pick.ok ? INACTIVE_TEXT : archiver.describeReadError(pick.reason));
        return false;
      }
      const planned = archiver.buildArchiveSnapshot(
        read.tasks,
        pick.items.map((item) => item.id),
        choices.nowMs,
        choices.thresholdDays
      );
      if (!planned.ok) {
        setStatus(archiver.describeRunError(planned.reason));
        return false;
      }
      const locks = resolveLockManager(win);
      if (!locks) {
        setStatus(archiver.describeRunError('lock-unavailable'));
        return false;
      }
      let generation = null;
      try { generation = mutation.readGeneration(storage); }
      catch (error) { generation = null; }
      if (!generation || !generation.ok) {
        setStatus(archiver.describeRunError(generation && generation.reason ? generation.reason : 'generation-unreadable'));
        return false;
      }
      inFlight = true;
      setStatus('Archiving ' + planned.removedCount + ' completed task(s)\u2026');
      let saved = null;
      try {
        saved = await mutation.commitTaskSnapshot({
          storage: storage,
          lockManager: locks,
          baseTasks: read.tasks,
          desiredTasks: planned.desiredTasks,
          expectedTaskEpoch: generation.value.taskEpoch,
          validateTasks: logic.validateStoredTasks
        });
      } catch (error) { saved = { ok: false, reason: 'tasks-ambiguous' }; }
      inFlight = false;
      if (!saved || saved.ok !== true) {
        setRunEnabled(false);
        clearList();
        setStatus(archiver.describeRunError(saved && saved.reason ? saved.reason : 'tasks-ambiguous'));
        return false;
      }
      try {
        if (win && typeof win.StorageEvent === 'function' && typeof win.dispatchEvent === 'function') {
          win.dispatchEvent(new win.StorageEvent('storage', { key: archiver.TASKS_STORAGE_KEY }));
        }
      } catch (error) {
        // The archive is durable even when the same-tab refresh hint fails.
      }
      setStatus('Archived ' + planned.removedCount + ' completed task(s). Task data saved on this device.');
      setRunEnabled(false);
      clearList();
      return true;
    }

    function onPreviewTap(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      preview();
    }
    function onRunTap(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      return run();
    }
    previewButton.addEventListener('click', onPreviewTap);
    runButton.addEventListener('click', onRunTap);

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

    if (!flagOn()) setStatus(OFF_TEXT);

    return {
      card: card,
      select: select,
      statusEl: statusEl,
      listEl: listEl,
      preview: preview,
      run: run,
      setRunEnabled: setRunEnabled
    };
  }

  const api = { attachAutoArchiveUi: attachAutoArchiveUi, CARD_ID: CARD_ID, STATUS_ID: STATUS_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkAutoArchiveUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachAutoArchiveUi({
      document: document,
      window: window,
      flags: root.DaymarkFeatureFlags,
      autoArchive: root.DaymarkAutoArchive,
      logic: root.DaymarkLogic,
      taskMutation: root.DaymarkTaskMutation
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
