/* Daymark release-compatibility engine for the web prototype.
 *
 * Pure, dependency-free source guide behind the "Update and release safety,
 * in plain words" card. It explains selected topics; it does not inspect an
 * installed app or APK, test a migration, or carry out an update or rollback.
 *
 * Fail-closed policy: any unknown or malformed topic id explains as the honest
 * "unknown" entry instead of guessing. planUpgradePath() only assembles a
 * topic checklist; it does not calculate or verify a version-to-version path.
 * Everything is local; no network access happens here and this engine changes
 * no Android or browser setting.
 */
((root) => {
  'use strict';
  const TOPIC_IDS = ['package-identity', 'signer-continuity', 'data-migration', 'updater-security', 'device-gates', 'rollback-recovery'];
  const CATALOG = {
    'package-identity': {
      label: 'App identity: current source',
      title: 'This source uses com.abrar.daymark today',
      summary: 'Android treats a different application ID as a different app. Current Gradle source declares com.abrar.daymark, but this guide cannot guarantee every future build keeps it or that a particular APK matches it. A different ID does not automatically move data from an installed copy.',
      keepsWorking: ['The current Gradle source declares applicationId com.abrar.daymark'],
      breaksIfIgnored: ['A changed application ID creates a separate app; private data is not automatically moved'],
      requiresAction: true,
      recovery: 'Compare the exact release APK application ID with the installed app before updating. If they differ, stop and plan a supported, tested migration; do not assume Android carries app data across.',
      scope: 'Current source only; not a check of a built APK',
      network: 'None - this guide shows fixed source-backed text'
    },
    'signer-continuity': {
      label: 'Update identity and version checks',
      title: 'Android checks the app ID, signer and version code',
      summary: 'An in-place update needs the same app ID and a signing identity Android accepts. Android also uses versionCode to block installing an APK with a lower code over a newer install. Current source pins a production signer and requires versionCode to rise, but this guide does not inspect a particular APK.',
      keepsWorking: ['Current source pins a production signer and requires a monotonic versionCode'],
      breaksIfIgnored: ['A different app ID, unaccepted signer or lower versionCode can block an install-over update'],
      requiresAction: true,
      recovery: 'Check the exact APK app ID, signer and versionCode against the installed app and release metadata. Do not uninstall to bypass a mismatch: removing the app can delete its private data.',
      scope: 'A specific APK and installed app must be checked',
      network: 'None - Android checks install identity locally'
    },
    'data-migration': {
      label: 'Task-data migration limits',
      title: 'The current codec supports specific task formats',
      summary: 'Tasks and templates use an encrypted app-private snapshot. The current TaskSnapshotCodec reads schema versions 1–5 and writes version 5. That is evidence for those source formats, not a promise that every future build, field or device will preserve all data. Storage changes need explicit migrations and tests.',
      keepsWorking: ['Current source has codec rules for task snapshot schemas v1–v5'],
      breaksIfIgnored: ['An unsupported or malformed snapshot can fail to load; there is no blanket retention guarantee'],
      requiresAction: true,
      recovery: 'For a build that changes task storage, use only an export path present and validated for that build, keep the export outside app storage, and test restore before relying on it. Do not uninstall or clear data as a generic fix.',
      scope: 'Task/template snapshot code only; not all app state or every release',
      network: 'None - this guide shows fixed source-backed text'
    },
    'updater-security': {
      label: 'HTTPS-only updater in current source',
      title: 'Current updater code uses HTTPS-only requests',
      summary: 'Current updater source uses HTTPS for release metadata and APK assets, and repository source checks guard that policy. Browser HTTP is a separate WebView path. This card shows fixed text; it does not inspect a built APK or prove that future source will keep the policy.',
      keepsWorking: ['Current source and its guard declare HTTPS-only updater requests'],
      breaksIfIgnored: ['Weakening the updater path would let a compromise on the network swap a release APK mid-download'],
      requiresAction: false,
      recovery: 'Check the current source guard and exact release artifact; this guide does not inspect either.',
      scope: 'Current updater source only; not an APK check',
      network: 'HTTPS to GitHub, keyless; nothing else'
    },
    'device-gates': {
      label: 'CI and device evidence',
      title: 'CI and physical-device checks answer different questions',
      summary: 'Host tests and emulator workflows are evidence for the exact code and scenarios they test; they do not prove behavior on a physical phone. This repository also tracks device acceptance separately. This guide does not inspect test runs or certify a build.',
      keepsWorking: ['Use PASS, FAIL, NOT RUN and NOT TESTED for the evidence actually collected'],
      breaksIfIgnored: ['A green CI job or generated APK can be mistaken for physical-device acceptance'],
      requiresAction: true,
      recovery: 'Check the current exact-head CI results and the relevant device record separately. If a physical-device scenario was not run, report it as NOT TESTED.',
      scope: 'Evidence for a particular code revision and tested device',
      network: 'Depends on the test scenario; this guide makes no network request'
    },
    'rollback-recovery': {
      label: 'Rollback limits',
      title: 'Android can block an older APK over a newer one',
      summary: 'Android uses versionCode to protect against downgrades, so it can refuse an older APK over the current install. This guide cannot bypass that check or confirm a rollback APK will install. Uninstalling first may remove app-private data, and a backup helps only if it is valid, compatible and contains that data.',
      keepsWorking: ['A user-held export may help only when its contents and restore path are tested'],
      breaksIfIgnored: ['Having an older APK available does not guarantee it can replace the installed version or restore data'],
      requiresAction: true,
      recovery: 'Before updating, check the exact installed and proposed APKs, supported migration and a tested export/restore path. Do not rely on uninstalling or installing an older APK as a rollback plan.',
      scope: 'This device and user-held exports; no device state is checked here',
      network: 'None - this guide does not download or install APKs'
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
    if (!Array.isArray(rawIds)) return fail('A topic checklist needs a list of topic ids.');
    const seen = Object.create(null);
    const ids = [];
    const unknown = [];
    for (let i = 0; i < rawIds.length; i += 1) {
      const raw = rawIds[i];
      if (!isKnownTopic(raw)) { unknown.push(typeof raw === 'string' ? raw : String(raw)); continue; }
      if (!seen[raw]) { seen[raw] = true; ids.push(raw); }
    }
    if (unknown.length > 0) return fail('Unknown release topic(s), so no checklist was created: ' + unknown.join(', '));
    if (ids.length === 0) return fail('A topic checklist needs at least one known topic.');
    const steps = [];
    const warnings = [];
    for (let i = 0; i < ids.length; i += 1) {
      const entry = explainTopic(ids[i]);
      if (!entry.available) return fail(entry.label + ' is unavailable in this build; no checklist was created.');
      steps.push('Review ' + entry.label + ' - ' + (entry.requiresAction ? 'needs a separate check' : 'current source describes this as pinned'));
      if (entry.requiresAction) warnings.push(entry.label + ' needs a separate check: ' + entry.recovery);
    }
    return {
      ok: true, ids: ids.slice(), steps, warnings,
      note: 'This is a topic checklist only: it does not inspect app versions, an installed package, signer, task data or APK, and does not run an update, migration, install or rollback.'
    };
  }
  const api = { explainTopic, listTopics, planUpgradePath, isKnownTopic, TOPIC_IDS, CATALOG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkReleaseCompat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
