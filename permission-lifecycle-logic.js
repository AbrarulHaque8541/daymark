/*
 * Daymark permission-lifecycle engine for the web prototype.
 *
 * Pure, dependency-free catalog behind the "Permission lifecycle, in plain
 * words" card. For each Android/WebView permission lifecycle state the web
 * prototype can describe (granted, denied this time, denied with
 * "don't ask again", revoked in Android Settings, per-site permission reset)
 * it states, in plain words: what still works, what is lost, whether the
 * prompt can appear again, how to recover, the user action needed, the scope
 * and whether any network is involved.
 *
 * Fail-closed policy: any unknown or malformed state id explains as the
 * honest "unknown" entry instead of guessing, and planRecoveryPath()
 * refuses to plan paths containing unknown states rather than silently
 * skipping them. Everything is local; no network access happens here and
 * this engine changes no Android or browser setting.
 */
((root) => {
  'use strict';

  // Stable state ids, in the order the prototype card lists them.
  const PERMISSION_STATE_IDS = [
    'granted',
    'denied-once',
    'denied-permanent',
    'revoked-settings',
    'site-reset'
  ];

  const CATALOG = {
    'granted': {
      label: 'Permission granted',
      title: 'The capability is available right now',
      summary: 'The app or site may use the capability immediately, with no further prompt, until the grant is revoked or expires. Nothing is stored about this in Daymark.',
      stillWorks: ['The capability, everywhere Daymark uses it'],
      lost: [],
      promptsAgain: false,
      recovery: 'Nothing to recover. To take the capability away later, revoke it in Android Settings or reset it per site in the browser.',
      userAction: 'None needed',
      deletesData: false,
      scope: 'This app on this device',
      network: 'None \u2014 permissions are decided locally by Android and the site prompt'
    },
    'denied-once': {
      label: 'Denied this time',
      title: 'A single no, not a permanent one',
      summary: 'The request was refused for this attempt only. Android does not treat one refusal as permanent, so the next request can still show the prompt again.',
      stillWorks: ['Everything else in Daymark', 'Sites and features that need no permission'],
      lost: ['This one capability for this one request'],
      promptsAgain: true,
      recovery: 'Use the feature again and choose Allow when the prompt appears. Nothing was deleted and nothing needs repairing.',
      userAction: 'Use the feature again and answer the prompt',
      deletesData: false,
      scope: 'This request only',
      network: 'None \u2014 the prompt is local'
    },
    'denied-permanent': {
      label: 'Denied with "don\'t ask again"',
      title: 'Only system settings can bring it back',
      summary: 'Android will not show the prompt again for this capability, so retrying inside Daymark cannot fix it. The only way back is a manual action in system or site settings.',
      stillWorks: ['Everything that needs no permission: tasks, notes, Focus timer, offline planning cards'],
      lost: ['Every feature that relies on this capability, until you re-enable it'],
      promptsAgain: false,
      recovery: 'Open Android Settings, then Apps, then Daymark, then Permissions (or the site-permissions screen in the browser) and turn the capability back on, then use the feature again.',
      userAction: 'Re-enable the permission in system or site settings',
      deletesData: false,
      scope: 'This app on this device',
      network: 'None \u2014 changing the setting is local'
    },
    'revoked-settings': {
      label: 'Revoked in Android Settings',
      title: 'Off everywhere, all at once',
      summary: 'The permission was switched off at the system level. Every part of Daymark that relies on it stops working at once, including features that were already open. Android may also stop the app so the change takes effect.',
      stillWorks: ['Features that need no permission: tasks, notes, Focus timer, offline planning cards'],
      lost: ['Every feature that relies on the revoked capability'],
      promptsAgain: false,
      recovery: 'Turn the permission back on in Android Settings, then Apps, then Daymark, then Permissions. Stored tasks, notes, Focus history and backups are not deleted by revoking a permission.',
      userAction: 'Re-enable the permission in Android Settings',
      deletesData: false,
      scope: 'This app on this device',
      network: 'None \u2014 changing the setting is local'
    },
    'site-reset': {
      label: 'Per-site permission reset',
      title: 'One site starts over, everything else stays',
      summary: 'Resetting a site in the browser removes what that site stored and drops the per-site grants it holds. Other sites and the rest of Daymark keep working exactly as before.',
      stillWorks: ['Other sites, with their own grants untouched', 'The rest of Daymark'],
      lost: ['That site\'s stored data and its per-site grants'],
      promptsAgain: true,
      recovery: 'The next time that site needs a capability, the prompt appears again as if it were the first visit. Export any task backup you still need first: cleared site data is not part of a Daymark export.',
      userAction: 'None; grant again if you want the site to have the capability',
      deletesData: true,
      scope: 'That one site only',
      network: 'None \u2014 the reset is local'
    }
  };

  // The honest fallback used whenever a state id is not in the catalog.
  const UNKNOWN = {
    label: 'Unknown permission state',
    title: 'This state is not known',
    summary: 'This prototype has no honest description for the requested state, so instead of guessing, Daymark says so plainly. Nothing was changed.',
    stillWorks: ['Everything, out of caution'],
    lost: [],
    promptsAgain: false,
    available: false,
    recovery: 'Nothing ran, so nothing needs recovering.',
    userAction: 'None',
    deletesData: false,
    scope: 'Nothing ran',
    network: 'None'
  };

  function isKnownPermissionState(id) {
    return typeof id === 'string'
      && Object.prototype.hasOwnProperty.call(CATALOG, id);
  }

  // Full explanation for a known state id. Fail-closed: any unknown or
  // malformed id explains as the honest unknown entry instead of throwing.
  function explainPermissionState(id) {
    const known = isKnownPermissionState(id) ? id : 'unknown';
    const entry = known === 'unknown' ? UNKNOWN : CATALOG[known];
    return {
      id: known,
      label: entry.label,
      title: entry.title,
      summary: entry.summary,
      stillWorks: entry.stillWorks.slice(),
      lost: entry.lost.slice(),
      promptsAgain: entry.promptsAgain === true,
      available: entry.available !== false,
      recovery: entry.recovery,
      userAction: entry.userAction,
      deletesData: entry.deletesData === true,
      scope: entry.scope,
      network: entry.network
    };
  }

  // Stable list for pickers and tests.
  function listPermissionStates() {
    return PERMISSION_STATE_IDS.map((id) => ({
      id,
      label: CATALOG[id].label,
      available: CATALOG[id].available !== false,
      promptsAgain: CATALOG[id].promptsAgain === true,
      deletesData: CATALOG[id].deletesData === true
    }));
  }

  // Plans a recovery path as an explanation only: known state ids in the
  // given order, deduplicated. Fail-closed: any unknown id rejects the whole
  // path rather than silently skipping it. Daymark runs nothing.
  function planRecoveryPath(rawIds) {
    const fail = (error) => ({
      ok: false, error, ids: [], steps: [], warnings: []
    });
    if (!Array.isArray(rawIds)) {
      return fail('A recovery path needs a list of state ids.');
    }
    const seen = Object.create(null);
    const ids = [];
    const unknown = [];
    for (let i = 0; i < rawIds.length; i += 1) {
      const raw = rawIds[i];
      if (!isKnownPermissionState(raw)) {
        unknown.push(typeof raw === 'string' ? raw : String(raw));
        continue;
      }
      if (!seen[raw]) {
        seen[raw] = true;
        ids.push(raw);
      }
    }
    if (unknown.length > 0) {
      return fail('Unknown permission state(s), so nothing was planned: ' + unknown.join(', '));
    }
    if (ids.length === 0) {
      return fail('A recovery path needs at least one known state.');
    }
    const steps = [];
    const warnings = [];
    for (let i = 0; i < ids.length; i += 1) {
      const entry = explainPermissionState(ids[i]);
      if (!entry.available) {
        return fail(entry.label + ' is unavailable in this build; no path was created.');
      }
      steps.push(entry.label + ' \u2014 ' + (entry.deletesData
        ? 'clears that site\'s stored data'
        : 'changes no stored data'));
      if (entry.deletesData) {
        warnings.push(entry.label + ' clears site data. Export any task backup you still need first; cleared site data is not part of a Daymark export and cannot be restored by Daymark.');
      }
    }
    return {
      ok: true,
      ids: ids.slice(),
      steps,
      warnings,
      note: 'Daymark runs nothing automatically; this plan only explains and does not change any Android or browser setting.'
    };
  }

  const api = {
    explainPermissionState,
    listPermissionStates,
    planRecoveryPath,
    isKnownPermissionState,
    PERMISSION_STATE_IDS,
    CATALOG
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkPermissionLifecycle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
