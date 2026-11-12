/*
 * Daymark clear-action lifecycle engine for the web prototype.
 *
 * Pure, dependency-free catalog behind the "What each Clear button really
 * does" card: for every destructive or storage-touching action the web
 * prototype offers (Clear completed, Clear search, Clear webhook queue,
 * Clear storage status, Clear all local data, Import, Export) it states, in plain words, exactly
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
    'storage-clear-all',
    'import-merge',
    'export-backup'
  ];

  const CATALOG = {
    'clear-completed': {
      label: 'Clear completed tasks',
      title: 'Clear completed tasks',
      summary: 'Removes completed tasks from the current task list and attempts to save the remaining list. If saving fails, the removal is only for this session and the previously saved list remains.',
      removes: [
        'Completed tasks from the saved task list when the save succeeds',
        'A fully valid stale task recovery backup may also be cleared after a successful save'
      ],
      keeps: [
        'Open tasks, with notes and tags',
        'Focus session history',
        'Reminders that belong to open tasks',
        'Partial or opaque recovery backups that still need preservation'
      ],
      recoverable: true,
      undoWindowSeconds: 7,
      recovery: 'Undo is available in the toast for 7 seconds. After it expires, there is no built-in undo. Export a backup first for durable recovery. If saving fails, the removal is session-only and the previously saved task list remains.',
      deletesData: true,
      exportable: true,
      scope: 'This device only',
      network: 'None — this never contacts the network'
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
      exportable: false,
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
      exportable: false,
      scope: 'This device only',
      network: 'None \u2014 clearing happens locally, without contacting the server'
    },
    'storage-clear-status': {
      label: 'Clear storage status',
      title: 'Clear storage status',
      summary: 'The storage card has two read-only controls: Check re-runs the local storage scan, and Clear status empties only the status message under the card. Neither deletes any stored data.',
      removes: [],
      keeps: ['All stored tasks and settings; no storage operation runs'],
      available: true,
      recoverable: true,
      recovery: 'Nothing is deleted, so nothing needs recovering. Use either control again any time.',
      deletesData: false,
      exportable: false,
      scope: 'The storage card status message only',
      network: 'None — the scan and the status reset are local only'
    },

    'storage-clear-all': {
      label: 'Clear all local data',
      title: 'Clear all local data',
      summary: 'One explicit, confirmed action on the storage card removes every managed Daymark key in this browser: tasks, recovery backups, Focus history and preferences, saved card preferences (including the remembered Telegram chat target), caches, browser download state, and queued webhook events. Keys this prototype does not manage are never touched.',
      removes: [
        'All managed Daymark keys in this browser, including recovery backups and queued webhook events'
      ],
      keeps: [
        'Keys this prototype does not manage',
        'The legacy secret-bearing webhook endpoint, which this card never inspects'
      ],
      recoverable: false,
      recovery: 'There is no built-in undo. Export a backup first; note that a task export cannot restore Focus history, card preferences or the webhook queue.',
      deletesData: true,
      exportable: false,
      scope: 'This device only',
      network: 'None — clearing happens locally'
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
      exportable: false,
      scope: 'This device only',
      network: 'None \u2014 files are read locally'
    },
    'export-backup': {
      label: 'Export a backup',
      title: 'Export a backup',
      summary: 'Creates a local task export without changing stored data. The JSON backup uses the current in-memory task list; CSV, Markdown and iCalendar exports read the saved task store and validate parsed tasks. On this build, a present empty-string value is treated like a missing key and can yield an empty export, so a successful empty export does not prove storage is healthy. If storage access throws, export fails; if recovery is pending, a normal export may be incomplete.',
      removes: [],
      keeps: ['Saved task data and existing recovery backups are not changed', 'The current task list remains in Daymark'],
      recoverable: true,
      recovery: 'This is a normal plaintext export, not a raw recovery export or encrypted backup. Exported files may contain private task details; keep them private. If storage is unreadable or recovery is pending, use Export recovery instead.',
      deletesData: false,
      exportable: false,
      scope: 'A new local file',
      network: 'None — the file never leaves this device unless you share it yourself'
    }

  };

  // The honest fallback used whenever an action id is not in the catalog.
  const UNKNOWN = {
    label: 'Unknown action',
    title: 'What this button does is not known',
    summary: 'This prototype has no honest description for the requested action, so instead of guessing, Daymark says so plainly. No data was touched.',
    removes: [],
    keeps: ['Everything, out of caution'],
    available: false,
    recoverable: true,
    recovery: 'Nothing ran, so nothing needs recovering.',
    deletesData: false,
    exportable: false,
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
      undoWindowSeconds: Number.isSafeInteger(entry.undoWindowSeconds) ? entry.undoWindowSeconds : 0,
      available: entry.available !== false,
      recovery: entry.recovery,
      deletesData: entry.deletesData,
      exportable: entry.exportable === true,
      scope: entry.scope,
      network: entry.network
    };
  }

  // Stable list for pickers and tests.
  function listClearActions() {
    return CLEAR_ACTION_IDS.map((id) => ({
      id,
      label: CATALOG[id].label,
      available: CATALOG[id].available !== false,
      undoWindowSeconds: Number.isSafeInteger(CATALOG[id].undoWindowSeconds) ? CATALOG[id].undoWindowSeconds : 0,
      deletesData: CATALOG[id].deletesData,
      exportable: CATALOG[id].exportable === true
    }));
  }

  // Plans a sequence of clear actions as an explanation only: known ids in
  // the given order, deduplicated. Every destructive step warns because a
  // planned Export is not proof of a successful, complete backup. Fail-closed: any unknown id
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
    let exportPlanned = false;
    for (let i = 0; i < ids.length; i += 1) {
      const entry = explainClearAction(ids[i]);
      if (!entry.available) {
        return fail(entry.label + ' is unavailable in this build; no plan was created.');
      }
      steps.push(entry.label + ' \u2014 ' + (entry.deletesData
        ? 'deletes data on this device'
        : 'changes no stored data'));
      if (ids[i] === 'export-backup') exportPlanned = true;
      if (entry.deletesData) {
        const backupWarning = !entry.exportable
          ? 'This data is not included in task exports or Export recovery, so a task backup cannot restore it. '
          : exportPlanned
            ? 'A planned Export step is not proof that a complete backup was created; verify the file is present and contains the intended data. If recovery is pending, use Export recovery. '
            : 'No Export step is planned before this deletion. If recovery is pending, use Export recovery. ';
        const undoWarning = entry.undoWindowSeconds > 0
          ? 'The temporary Undo lasts only ' + entry.undoWindowSeconds + ' seconds and is not a durable backup.'
          : 'This action has no built-in undo.';
        warnings.push(entry.label + ' deletes data. ' + backupWarning + undoWarning);
      }
    }
    return {
      ok: true,
      ids: ids.slice(),
      steps,
      warnings,
      note: 'Daymark runs nothing automatically; this plan only explains and does not inspect storage/recovery state or verify an export.'
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
