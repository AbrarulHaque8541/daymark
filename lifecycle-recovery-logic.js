/*
 * Daymark lifecycle-recovery engine for the web prototype.
 *
 * Pure, dependency-free catalog behind the "Lifecycle recovery, in plain
 * words" card. For each Android app and WebView lifecycle event the issue
 * #348 browser-UX checklist names (rotation and other configuration
 * changes, process death in the background, background and foreground
 * return, a renderer crash, low-memory trimming, and restore behavior for
 * reinstall or backup) it states, in plain words: what keeps working, what
 * is at risk, how recovery is supposed to work, what the user has to do,
 * what happens to stored data, whether any network is involved, and the
 * honest note that a card cannot substitute for physical-device
 * verification.
 *
 * Fail-closed policy: any unknown or malformed scenario id explains as the
 * honest "unknown" entry instead of guessing, and planLifecycleChecks()
 * refuses to plan a list containing unknown scenarios rather than silently
 * skipping them. Everything is local; no network access happens here and
 * this engine changes no Android or browser setting.
 */
((root) => {
  'use strict';

  // Stable scenario ids, in the order the prototype card lists them.
  const SCENARIO_IDS = [
    'rotation',
    'process-death',
    'background-return',
    'renderer-crash',
    'low-memory',
    'restore-backup'
  ];

  const CATALOG = {
    'rotation': {
      label: 'Rotation and other configuration changes',
      title: 'The page rebuilds, the data should stay',
      summary: 'Rotating the device, folding it, or changing the keyboard or font scale tears the visible screen down and rebuilds it. In an honest Android app a saved task survives this without any user action; anything typed but not yet saved can be lost.',
      stillWorks: [
        'Stored tasks, notes, Focus history and files already saved',
        'The rebuilt screen itself with the same controls'
      ],
      lostAtRisk: ['Anything typed but not yet saved'],
      deletesData: false,
      dataNote: 'Stored data is not wiped by a rotation; only unsaved input is at risk.',
      recovery: 'Save what you are typing before turning the device. If a screen comes back empty after rotation, treat the unsaved text as lost and re-enter it; a planner card cannot restore it.',
      userAction: 'Save before rotating; re-enter anything unsaved if a screen returns empty',
      network: 'None · rotation is local',
      verification: 'Required on hardware · screen rebuild is an Android runtime behavior'
    },
    'process-death': {
      label: 'Android stopped the app in the background',
      title: 'The process may be killed, the store should not be',
      summary: 'Android can silently stop the app while it is in the background. When it is opened again the screens start from a fresh state, so features like an in-flight Focus session or a half-typed note stop; data that is already written to the store must come back.',
      stillWorks: [
        'Tasks, notes, Focus history, backups, saved preferences and files already written',
        'Opening Daymark again and using it normally'
      ],
      lostAtRisk: [
        'The running Focus session and other transient screen state',
        'Anything typed but not yet saved'
      ],
      deletesData: false,
      dataNote: 'The persistent store is independent of the process; a stopped process does not delete tasks.',
      recovery: 'Reopen Daymark and let the saved screens rebuild from the store. If something you expected is missing, first try Export to check what the store actually contains before assuming data loss.',
      userAction: 'Reopen the app; export a backup before reinstall-level changes',
      network: 'None · the process stop is local',
      verification: 'Required on hardware · OEM background policy differs between devices'
    },
    'background-return': {
      label: 'Background and foreground return',
      title: 'Coming back should resume calmly',
      summary: 'When Daymark moves to the background, Android may remove only the visible window while keeping the process. Coming back should show the same screens; where the app kept working in the background, its state must remain consistent. If the process was also stopped, process-death behavior applies instead.',
      stillWorks: [
        'The screens as they were left, when the process survived',
        'The saved store in every case'
      ],
      lostAtRisk: ['Transient state such as a dialog, a fetch in progress, or scroll position'],
      deletesData: false,
      dataNote: 'Stored data is not wiped by going to the background.',
      recovery: 'Return to the app and finish what you were doing. If a dialog or in-flight action vanished, repeat it; nothing about stored tasks changed.',
      userAction: 'Repeat any dialog or action that did not survive the background gap',
      network: 'None · screen resume is local',
      verification: 'Required on hardware · background behavior is device- and OEM-specific'
    },
    'renderer-crash': {
      label: 'WebView renderer crashed',
      title: 'The page engine died, the app should live on',
      summary: 'The Android System WebView rendering engine can crash on a bad or very large page. A crash takes down the browser view, not the whole Daymark app; the tasks and files outside the WebView are untouched. A planner card cannot make a crashed page recover itself.',
      stillWorks: [
        'Tasks, notes, Focus timer and the planning cards, which live outside the WebView surface',
        'The saved store and backups'
      ],
      lostAtRisk: [
        'The page that was loading when the crash happened',
        'Its history position and scroll state'
      ],
      deletesData: false,
      dataNote: 'Stored data is not wiped by a renderer crash.',
      recovery: 'Reload the browser surface or open a different page. If the same page keeps crashing it, keep notes on what triggers it; Daymark never silently bypasses a failed page.',
      userAction: 'Reload the page or navigate elsewhere; report repeatable crashes',
      network: 'None · the recovery is local; reloading needs your explicit action',
      verification: 'Required on hardware · crash recovery is a WebView runtime behavior'
    },
    'low-memory': {
      label: 'Low-memory trimming',
      title: 'Android may reclaim memory the app holds',
      summary: 'When the device is short of memory Android asks Daymark to drop things it does not strictly need, and can stop the app entirely if the pressure continues. Cached page data and transient state are the ordinary casualties; the persistent store must not be a casualty.',
      stillWorks: [
        'Tasks, notes, Focus history, backups, saved preferences and files',
        'Rebuilding screens from the store after memory pressure'
      ],
      lostAtRisk: ['Page caches, transient screen state and unsaved input'],
      deletesData: false,
      dataNote: 'Stored data is written to disk, not held only in memory that pressure could reclaim.',
      recovery: 'Keep doing what you were doing; rebuild what vanished. If the app keeps getting killed, close heavy tabs or other apps first. Nothing about stored tasks changed.',
      userAction: 'None; export a backup before memory-heavy activities',
      network: 'None · memory trimming is local',
      verification: 'Required on hardware · low-memory behavior cannot be inferred from CI'
    },
    'restore-backup': {
      label: 'Reinstall and backup restore',
      title: 'A fresh install starts honest and empty',
      summary: 'A reinstall, or restoring a backup on a new device, recreates the app from scratch. Nothing typed inside this prototype card restores anything; restoring happens through the Import control from an exported backup file.',
      stillWorks: [
        'Tasks, notes and Focus history that are inside an exported backup file',
        'Saved preferences recorded by whichever export path you used'
      ],
      lostAtRisk: [
        'Data that was never exported, including items a format cannot express',
        'Anything stored only inside a WebView site that was cleared'
      ],
      deletesData: false,
      dataNote: 'Import merges a backup file with the current store; existing task ids win, so a restore cannot overwrite live tasks wholesale.',
      recovery: 'Export a backup regularly, especially before reinstalling. After a fresh install use Import with the most recent backup, then check the task list before assuming anything is missing.',
      userAction: 'Export a backup before reinstalling; import it afterwards',
      network: 'None · export and import are local file operations',
      verification: 'Required on hardware · same-signer upgrade and restore are device behaviors'
    }
  };

  // The honest fallback used whenever a scenario id is not in the catalog.
  const UNKNOWN = {
    label: 'Unknown lifecycle scenario',
    title: 'This scenario is not known',
    summary: 'This prototype has no honest description for the requested scenario, so instead of guessing, Daymark says so plainly. Nothing was changed.',
    stillWorks: ['Everything, out of caution'],
    lostAtRisk: [],
    deletesData: false,
    dataNote: 'Nothing ran, so no data was touched.',
    recovery: 'Nothing ran, so nothing needs recovering.',
    userAction: 'None',
    network: 'None',
    verification: 'Not applicable',
    available: false
  };

  function isKnownLifecycleScenario(id) {
    return typeof id === 'string'
      && Object.prototype.hasOwnProperty.call(CATALOG, id);
  }

  // Full explanation for a known scenario id. Fail-closed: any unknown or
  // malformed id explains as the honest unknown entry instead of throwing.
  function explainLifecycle(id) {
    const known = isKnownLifecycleScenario(id) ? id : 'unknown';
    const entry = known === 'unknown' ? UNKNOWN : CATALOG[known];
    return {
      id: known,
      label: entry.label,
      title: entry.title,
      summary: entry.summary,
      stillWorks: entry.stillWorks.slice(),
      lostAtRisk: entry.lostAtRisk.slice(),
      deletesData: entry.deletesData === true,
      dataNote: entry.dataNote,
      recovery: entry.recovery,
      userAction: entry.userAction,
      network: entry.network,
      verification: entry.verification,
      available: entry.available !== false
    };
  }

  // Stable list for pickers and tests.
  function listLifecycleScenarios() {
    return SCENARIO_IDS.map((id) => ({
      id,
      label: CATALOG[id].label,
      available: CATALOG[id].available !== false,
      deletesData: CATALOG[id].deletesData === true
    }));
  }

  // Plans a checks path as an explanation only: known scenario ids in the
  // given order, deduplicated. Fail-closed: any unknown id rejects the whole
  // plan rather than silently skipping it. Daymark runs nothing.
  function planLifecycleChecks(rawIds) {
    const fail = (error) => ({
      ok: false, error, ids: [], steps: [], warnings: []
    });
    if (!Array.isArray(rawIds)) {
      return fail('A lifecycle checks plan needs a list of scenario ids.');
    }
    const seen = {};
    const ids = [];
    const unknown = [];
    for (let i = 0; i < rawIds.length; i += 1) {
      const raw = rawIds[i];
      if (!isKnownLifecycleScenario(raw)) {
        unknown.push(typeof raw === 'string' ? raw : String(raw));
        continue;
      }
      if (!seen[raw]) {
        seen[raw] = true;
        ids.push(raw);
      }
    }
    if (unknown.length > 0) {
      return fail('Unknown lifecycle scenario(s), so nothing was planned: ' + unknown.join(', '));
    }
    if (ids.length === 0) {
      return fail('A lifecycle checks plan needs at least one known scenario.');
    }
    const steps = [];
    const warnings = [];
    for (let i = 0; i < ids.length; i += 1) {
      const entry = explainLifecycle(ids[i]);
      if (!entry.available) {
        return fail(entry.label + ' is unavailable in this build; no plan was created.');
      }
      steps.push(entry.label + ' · ' + entry.dataNote);
    }
    warnings.push('Explaining recovery is not acceptance. A physical-device run-through of these lifecycle scenarios is still required; this card cannot verify Android runtime behavior.');
    return {
      ok: true,
      ids: ids.slice(),
      steps,
      warnings,
      note: 'Daymark runs nothing automatically; this plan only explains and does not change any Android or browser setting.'
    };
  }

  const api = {
    explainLifecycle,
    listLifecycleScenarios,
    planLifecycleChecks,
    isKnownLifecycleScenario,
    SCENARIO_IDS,
    CATALOG
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkLifecycleRecovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
