/*
 * Daymark clear-action lifecycle engine for the web prototype.
 *
 * Pure, dependency-free catalog behind the "What each Clear button really
 * does" card: for every destructive or storage-touching action the web
 * prototype offers (Clear completed, Clear search, Clear webhook queue,
 * Clear storage status, Import, Export, Clear Focus history) it states, in plain words, exactly
 * what the action removes, what it keeps, whether the data can come back,
 * what scope it has (this device only) and whether any network is involved.
 *
 * Fail-closed policy: any unknown or malformed action id explains as the
 * honest "unknown" entry instead of guessing, and planClearSequence()
 * refuses to plan sequences containing unknown actions rather than
 * silently skipping them. Everything is local; no network access happens
 * here and this engine runs nothing automatically.
 */
((root) => {
  'use strict';

  // Stable action ids, in the order the prototype card lists them.
  const CLEAR_ACTION_IDS = [
    'clear-completed',
    'clear-search',
    'webhook-clear-queue',
    'storage-clear-status',
    'import-merge',
    'export-backup',
    'clear-focus'
  ];

  const CATALOG = {
    'clear-completed': {
      label: 'Clear completed tasks',
      title: 'Clear completed tasks',
      summary: 'Removes every task you marked done from this device\u2019s local storage. Open tasks, their notes and tags, and Focus history are untouched. Nothing is sent anywhere.',
      removes: ['Completed tasks from local storage (daymark.tasks.v1)'],
      keeps: ['Open tasks, with notes and tags', 'Focus session history', 'Reminders that belong to open tasks'],
      recoverable: false,
      recovery: 'Deleted completed tasks cannot be brought back. Use Export first to save a backup file, and keep that file somewhere safe.',
      deletesData: true,
      scope: 'This device only',
      network: 'None \u2014 this never contacts the network'
    },
    'clear-search': {
      label: 'Clear task search',
      title: 'Clear task search',
      summary: 'Only clears the search filter. It hides nothing and deletes nothing; your full task list returns immediately.',
      removes: [],
      keeps: ['All tasks, exactly as they were'],
      recoverable: true,
      recovery: 'Nothing is lost, so nothing needs recovering \u2014 type the search again if you want it back.',
      deletesData: false,
      scope: 'The current view only',
      network: 'None'
    },
    'webhook-clear-queue': {
      label: 'Clear webhook queue',
      title: 'Clear webhook queue',
      summary: 'Drops completion announcements that are still waiting on this device to be delivered. The receiving server will never see them. Events that were already delivered cannot be unsent.',
      removes: ['Queued, not-yet-delivered completion events'],
      keeps: ['Tasks themselves', 'The saved webhook address', 'Events already delivered'],
      recoverable: false,
      recovery: 'Cleared queue entries cannot be re-sent. Complete a task again if you need a new announcement.',
      deletesData: true,
      scope: 'This device only',
      network: 'None \u2014 clearing happens locally, without contacting the server'
    },
    'storage-clear-status': {
      label: 'Clear storage status',
      title: 'Clear storage status',
      summary: 'Only empties the status line on the storage health card. No storage key, task, or any other data is touched.',
      removes: ['The status text on the storage health card'],
      keeps: ['Every stored task and setting'],
      recoverable: true,
      recovery: 'Press Check again and the status is recomputed from the same local data.',
      deletesData: false,
      scope: 'The current view only',
      network: 'None'
    },
    'import-merge': {
      label: 'Import a backup',
      title: 'Import a backup',
      summary: 'Adds tasks from a backup file into local storage. When an imported task has the same id as an existing one, the task already on this device wins and the imported copy is skipped. Nothing is deleted.',
      removes: [],
      keeps: ['Existing tasks, including on id conflicts', 'The imported file itself, unchanged on disk'],
      recoverable: true,
      recovery: 'Import only adds; the imported file stays intact, so you can inspect or retry it any time.',
      deletesData: false,
      scope: 'This device only',
      network: 'None \u2014 files are read locally'
    },
    'export-backup': {
      label: 'Export a backup',
      title: 'Export a backup',
      summary: 'Reads your tasks from local storage and writes a backup file for you to save. Storage itself is not changed in any way.',
      removes: [],
      keeps: ['All tasks in local storage, unchanged'],
      recoverable: true,
      recovery: 'Export changes nothing, so there is nothing to recover from.',
      deletesData: false,
      scope: 'A new local file',
      network: 'None \u2014 the file never leaves this device unless you share it yourself'
    },
    'clear-focus': {
      label: 'Clear Focus history',
      title: 'Clear Focus history',
      summary: 'Removes the Focus session history log and any active session data from this device’s local storage. Tasks, other caches, and settings are untouched. Nothing is sent anywhere.',
      removes: ['Focus session history and active session (daymark.focus.v1)'],
      keeps: ['All tasks', 'Other caches (weather, holidays, etc.)', 'Webhook settings'],
      recoverable: false,
      recovery: 'Cleared Focus history cannot be brought back. Export a backup first if you want to keep a copy.',
      deletesData: true,
      scope: 'This device only',
      network: 'None — this never contacts the network'
    },
  };

  // The honest fallback used whenever an action id is not in the catalog.
  const UNKNOWN = {
    label: 'Unknown action',
    title: 'What this button does is not known',
    summary: 'This prototype has no honest description for the requested action, so instead of guessing, Daymark says so plainly. No data was touched.',
    removes: [],
    keeps: ['Everything, out of caution'],
    recoverable: true,
    recovery: 'Nothing ran, so nothing needs recovering.',
    deletesData: false,
    scope: 'Nothing ran',
    network: 'None'
  };

  function isKnownClearActionId(id) {
    return typeof id === 'string'
      && Object.prototype.hasOwnProperty.call(CATALOG, id);
  }

  // Full explanation for a known action id. Fail-closed: any unknown or
  // malformed id explains as the honest unknown entry instead of throwing.
  function explainClearAction(id) {
    const known = isKnownClearActionId(id) ? id : 'unknown';
    const entry = known === 'unknown' ? UNKNOWN : CATALOG[known];
    return {
      id: known,
      label: entry.label,
      title: entry.title,
      summary: entry.summary,
      removes: entry.removes.slice(),
      keeps: entry.keeps.slice(),
      recoverable: entry.recoverable,
      recovery: entry.recovery,
      deletesData: entry.deletesData,
      scope: entry.scope,
      network: entry.network
    };
  }

  // Stable list for pickers and tests.
  function listClearActions() {
    return CLEAR_ACTION_IDS.map((id) => ({
      id,
      label: CATALOG[id].label,
      deletesData: CATALOG[id].deletesData
    }));
  }

  // Plans a sequence of clear actions as an explanation only: known ids in
  // the given order, deduplicated, with an honest warning whenever data is
  // deleted with no Export step before it. Fail-closed: any unknown id
  // rejects the whole plan rather than silently skipping it.
  function planClearSequence(rawIds) {
    const fail = (error) => ({
      ok: false, error, ids: [], steps: [], warnings: []
    });
    if (!Array.isArray(rawIds)) {
      return fail('A plan needs a list of action ids.');
    }
    const seen = Object.create(null);
    const ids = [];
    const unknown = [];
    for (let i = 0; i < rawIds.length; i += 1) {
      const raw = rawIds[i];
      if (!isKnownClearActionId(raw)) {
        unknown.push(typeof raw === 'string' ? raw : String(raw));
        continue;
      }
      if (!seen[raw]) {
        seen[raw] = true;
        ids.push(raw);
      }
    }
    if (unknown.length > 0) {
      return fail('Unknown clear action(s), so nothing was planned: ' + unknown.join(', '));
    }
    if (ids.length === 0) {
      return fail('A plan needs at least one known action.');
    }
    const steps = [];
    const warnings = [];
    let exported = false;
    for (let i = 0; i < ids.length; i += 1) {
      const entry = explainClearAction(ids[i]);
      steps.push(entry.label + ' \u2014 ' + (entry.deletesData
        ? 'deletes data on this device'
        : 'changes no stored data'));
      if (ids[i] === 'export-backup') exported = true;
      if (entry.deletesData && !exported) {
        warnings.push(entry.label + ' deletes data with no Export step before it; deleted data cannot come back.');
      }
    }
    return {
      ok: true,
      ids: ids.slice(),
      steps,
      warnings,
      note: 'Daymark runs nothing automatically; this plan only explains.'
    };
  }

  const api = {
    explainClearAction,
    listClearActions,
    planClearSequence,
    isKnownClearActionId,
    CLEAR_ACTION_IDS,
    CATALOG
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkBrowserData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
