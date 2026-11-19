/* Daymark release-compatibility engine for the web prototype.
 *
 * Pure, dependency-free catalog behind the "Update and release safety, in
 * plain words" card. For each release topic it explains in plain words: what
 * is true about Daymark releases, what breaks if it is ignored, what recovery
 * looks like, the scope and whether any network is involved.
 *
 * Fail-closed policy: any unknown or malformed topic id explains as the honest
 * "unknown" entry instead of guessing, and planUpgradePath() refuses to plan
 * paths containing unknown topics rather than silently skipping them.
 * Everything is local; no network access happens here and this engine changes
 * no Android or browser setting.
 */
((root) => {
  'use strict';
  const TOPIC_IDS = ['package-identity', 'signer-continuity', 'data-migration', 'updater-security', 'device-gates', 'rollback-recovery'];
  const CATALOG = {
    'package-identity': {
      label: 'Package identity stays put',
      title: 'com.abrar.daymark is the app for life, not per version',
      summary: 'The application id names what Android sees as the app. It is com.abrar.daymark and every release keeps it. A build with a different id installs as a separate app instead of upgrading the installed one, so changing the id is effectively an uninstall path for existing users.',
      keepsWorking: ['The existing installed app, upgraded in place by every future release'],
      breaksIfIgnored: ['Users keep an old version forever while the renamed build sits beside it as a second app'],
      requiresAction: false,
      recovery: 'Nothing to recover. The identity is already pinned in the app build file and guarded, so no action is needed.',
      scope: 'This app on this device',
      network: 'None - identity is decided by the build files'
    },
    'signer-continuity': {
      label: 'Same signer, same key',
      title: 'Only the pinned signer can upgrade the installed app',
      summary: 'Android accepts an in-place upgrade only when the new APK is signed with the same key as the installed build. The Daymark signer pin is fixed for that reason. Uninstalling to work around a signer change deletes app data, so the pin is never changed casually.',
      keepsWorking: ['Every future matched-signer build installs straight over the installed app'],
      breaksIfIgnored: ['A re-signed build is refused by Android unless the app is uninstalled first'],
      requiresAction: true,
      recovery: 'Keep using builds from the pinned release workflow, which signs with the trusted key. If a signing change is ever considered, plan it as a data-losing migration with an explicit export first, never as a quiet switch.',
      scope: 'This app on this device',
      network: 'None - signing is checked locally at install time'
    },
    'data-migration': {
      label: 'Data survives the upgrade',
      title: 'Encrypted on-device data must survive every version step',
      summary: 'Tasks, notes, Focus history and backups are stored on-device in encrypted Daymark storage. An upgrade changes code, not data, and preferences are read with safe defaults plus unknown-value handling so an older stored value never breaks a newer build. No user data is moved to any cloud to make this work.',
      keepsWorking: ['Existing tasks, notes, Focus sessions and backups, exactly where the user left them'],
      breaksIfIgnored: ['A careless change to storage shapes can make stored data unreadable with no undo'],
      requiresAction: true,
      recovery: 'Before releases that touch storage, export a portable backup first, keep it outside the app, and test upgrading over an install that already has real data. Uninstall is data loss by design; never suggest it as a fix.',
      scope: 'This device and user-chosen export files',
      network: 'None - local-only storage; exports go where the user says'
    },
    'updater-security': {
      label: 'The updater stays HTTPS-only',
      title: 'Release downloads ride the strict path, never the browser one',
      summary: 'The release-gated GitHub sideload updater fetches release metadata and APKs over HTTPS only, and a source guard keeps it that way. The browser deliberate plain-HTTP allowance is a separate WebView path; it never relaxes the updater. A failed or in-between state stops the update instead of downgrading transport security.',
      keepsWorking: ['HTTPS-only release metadata, asset download and signature checks'],
      breaksIfIgnored: ['Weakening the updater path would let a compromise on the network swap a release APK mid-download'],
      requiresAction: false,
      recovery: 'Nothing to recover: the HTTPS-only updater policy is pinned in code and CI, and any change to it is a policy decision, not a bug fix.',
      scope: 'This app updater path',
      network: 'HTTPS to GitHub, keyless; nothing else'
    },
    'device-gates': {
      label: 'Device evidence before release',
      title: 'Green CI and a built APK are not device acceptance',
      summary: 'A release is gated on CI source guards, contract tests and emulator runs, and separately on the physical-device acceptance matrix. Emulator passes and downloadable debug APKs prove the toolchain works, not that a real phone behaves. A release claim without device evidence is not made.',
      keepsWorking: ['The honest status labels: PASS, FAIL, NOT RUN, NOT TESTED, per scenario'],
      breaksIfIgnored: ['A release cut on CI evidence alone can break real keyboards, storage paths or OEM background rules'],
      requiresAction: true,
      recovery: 'Install the non-production debug build on real hardware, record device model, API level, variant, commit and APK SHA for each scenario, then decide. Until then the matrix says NOT TESTED, and the acceptance issue stays open.',
      scope: 'Physical devices, per the acceptance matrix',
      network: 'Whatever the scenario being tested uses'
    },
    'rollback-recovery': {
      label: 'A way back, planned honestly',
      title: 'Exports and the previous build are the only rollback',
      summary: 'Android does not offer a go-back button across versions on-device. The honest backup plan is: export a portable backup before updating, keep the previous signed build available, and use the sideload release path to install it again if needed. Clearing data or uninstalling is treated as the emergency exit it is.',
      keepsWorking: ['Portable backups that a fresh install can import', 'The pinned release workflow that can rebuild any tagged version'],
      breaksIfIgnored: ['An update with no export before it leaves only uninstall, which loses tasks and history'],
      requiresAction: true,
      recovery: 'Export a backup before every update, keep at least one copy outside the app, note the current version and signer state, and only then install. If a rollback is needed, install the previous release from the pinned path and import the backup.',
      scope: 'This device plus user-chosen export files',
      network: 'HTTPS to GitHub for release downloads; exports are local'
    }
  };
  const UNKNOWN = {
    label: 'Unknown release topic',
    title: 'This topic is not known',
    summary: 'This prototype has no honest description for the requested release topic, so instead of guessing, Daymark says so plainly. Nothing was changed.',
    keepsWorking: ['Everything, out of caution'],
    breaksIfIgnored: [],
    requiresAction: false,
    available: false,
    recovery: 'Nothing ran, so nothing needs recovering.',
    scope: 'Nothing ran',
    network: 'None'
  };
  function isKnownTopic(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(CATALOG, id);
  }
  function explainTopic(id) {
    const known = isKnownTopic(id) ? id : 'unknown';
    const entry = known === 'unknown' ? UNKNOWN : CATALOG[known];
    return {
      id: known, label: entry.label, title: entry.title, summary: entry.summary,
      keepsWorking: entry.keepsWorking.slice(), breaksIfIgnored: entry.breaksIfIgnored.slice(),
      requiresAction: entry.requiresAction === true, available: entry.available !== false,
      recovery: entry.recovery, scope: entry.scope, network: entry.network
    };
  }
  function listTopics() {
    return TOPIC_IDS.map((id) => ({
      id, label: CATALOG[id].label,
      available: CATALOG[id].available !== false,
      requiresAction: CATALOG[id].requiresAction === true
    }));
  }
  function planUpgradePath(rawIds) {
    const fail = (error) => ({ ok: false, error, ids: [], steps: [], warnings: [] });
    if (!Array.isArray(rawIds)) return fail('An upgrade path needs a list of topic ids.');
    const seen = Object.create(null);
    const ids = [];
    const unknown = [];
    for (let i = 0; i < rawIds.length; i += 1) {
      const raw = rawIds[i];
      if (!isKnownTopic(raw)) { unknown.push(typeof raw === 'string' ? raw : String(raw)); continue; }
      if (!seen[raw]) { seen[raw] = true; ids.push(raw); }
    }
    if (unknown.length > 0) return fail('Unknown release topic(s), so nothing was planned: ' + unknown.join(', '));
    if (ids.length === 0) return fail('An upgrade path needs at least one known topic.');
    const steps = [];
    const warnings = [];
    for (let i = 0; i < ids.length; i += 1) {
      const entry = explainTopic(ids[i]);
      if (!entry.available) return fail(entry.label + ' is unavailable in this build; no path was created.');
      steps.push(entry.label + ' - ' + (entry.requiresAction ? 'needs a deliberate action before release' : 'already pinned; no action needed'));
      if (entry.requiresAction) warnings.push(entry.label + ' needs action: ' + entry.recovery);
    }
    return {
      ok: true, ids: ids.slice(), steps, warnings,
      note: 'Daymark runs nothing automatically; this plan only explains and does not change any setting, build or release.'
    };
  }
  const api = { explainTopic, listTopics, planUpgradePath, isKnownTopic, TOPIC_IDS, CATALOG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkReleaseCompat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
