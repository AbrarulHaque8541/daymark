## Current execution queue — 2026-11-10T14:08:50Z (main 41fda91fbb15d2bf9634fd7576cf842fe9bdacbc)

Latest snapshot: [CURRENT_STATUS_20261110T140850Z.md](docs/CURRENT_STATUS_20261110T140850Z.md). Live inventory: **8 open PRs / 25 open issues**. Main Android CI #42784930733, contracts #42784930716 and nightly audit #42807418062 are recorded PASS. No independent APPROVED review exists on the eight open PRs. Main protection was last observed disabled/rulesets empty at 13:53Z; this run could not re-read the protection endpoint.

1. **P0 #675 Focus + storage integration:** current head `a5967f19f5232185b957ef86a940eea9ca94ddc9`, 243 ahead / 0 behind. This run corrected ModeSelector ACTION_DOWN to release parent interception until gesture direction is classified and updated the source guard (commits `7d47dec`, `cd548a3`); the latest branch retains the fix and includes a separate storage rollback test commit. Current-head Focus API 29/36, Android CI, contracts, Focus UI/Live Update and device workflows are running/pending. Intermediate head `cd548a3` API 29 passed; API 36 failed before emulator startup because the Android SDK system-image archive was corrupt, so no instrumentation assertion ran. Do not call that a product result. Preserve all tap/swipe/vertical-scroll assertions.
2. **P0 #708 secure download body transfer:** head `2119020ad2c89644df94dfff7860c0afb17f7c90`, 8 ahead / 0 behind; **5/5 exact-head workflows PASS**, including 57 JDK body-transfer assertions. PublicationGate serializes final cancellation/Online check with commit; fatal Error paths abort staging. This is only a body-transfer primitive: DNS-pinned TLS, manual redirects/cookie policy, Android staging adapter and MainActivity/history integration remain absent. Keep downloads fail-closed.
3. **P0 #648 Focus/download branch:** head `239b180d398f50d5f06812e706220b5367e7afbd`, 202 ahead / 9 behind, diverged/non-mergeable; no current-head workflow runs. Contains fail-closed download mitigation but also shared MainActivity/Focus work. Extract the security mitigation in an owner-coordinated focused integration; do not bulk-merge.
4. **P0 storage integrity (#683/#689/#690/#640/#603):** review #675 task-generation rollback, cross-tab task/import/recovery/undo races, Focus generation/write/clear coordination, webhook queue ordering and backup preservation. Preserve task → delivery → queue → Focus lock order.
5. **P1 #656 import/export:** head `a47ba7b4`, 90 ahead / 0 behind, 7/7 workflows PASS including API 29/36. Independent RFC 5545, category and timestamp/data-integrity review remains.
6. **P0 governance/device (#646/#160):** required main checks and independent approvals are not enforced in the last observed configuration; physical Android/WebView/OEM/SAF acceptance remains NOT TESTED.
7. **P1 signing (#705/#84):** head `d0312cb7`, 4/4 workflows PASS. Owner must configure and verify protected production-signing environment reviewer/ref restrictions; no signing secret/key was accessed or changed.
8. **P1 extensions/Service Worker (#676/#702/#680/#687/#704/#685):** #676 has 6/6 previously reported PASS but real System WebView SPA/OEM acceptance remains; #704 retains fail-closed Service Worker policy, with current exact-head run lookup unavailable.
9. **P1/P2 recurrence, Telegram, desktop and architecture (#684/#476/#700/#696/#691/#348/#325):** finish Android/web repeat parity, real Telegram CORS/browser verification, desktop lockfile/npm ci and local-process download race protection, then architecture/compatibility work.

No merge, release/tag, version, signing-key/signer-pin, applicationId/namespace or destructive data change was made. Live source identity is `com.abrar.daymark`; run-level safety requires `com.cue.daymark`. This conflict remains with #679 and no identity migration is authorized. Physical device testing remains NOT TESTED.

---

## Current execution queue — 2026-11-10T13:53:03Z (main 41fda91fbb15d2bf9634fd7576cf842fe9bdacbc)

Latest snapshot: [CURRENT_STATUS_20261110T135303Z.md](docs/CURRENT_STATUS_20261110T135303Z.md). Inventory: **8 open PRs / 25 open issues**. Main Android CI/contracts/nightly audit PASS; main protection disabled, rulesets empty.

1. **P0 #675 Focus discrepancy:** head `6b0c3eeb`, 239 ahead / 0 behind. Node 949/949, Gradle, contracts, Focus UI/Live Update, device artifact and unsigned validation PASS. API29 PASS; API36 Stopwatch tap failed twice. #656 passes API36 on matching MainActivity/instrumentation blobs. Add hit-path/scroll-state diagnostics; do not weaken assertions.
2. **P0 #656 import/export:** head `a47ba7b4`, 90 ahead / 0 behind; 7/7 PASS, Node 849/849, API29/36 372/375. Independent RFC5545/import review remains.
3. **P0 governance/device acceptance (#646/#160):** main unprotected; required checks/rulesets/independent approvals absent. Physical Android/WebView/OEM acceptance NOT TESTED.
4. **P0 #648 Focus:** 202 ahead / 9 behind, mergeable=false, no current-head runs; synchronize owner-aware without overlapping MainActivity edits.
5. **P1 storage integrity (#683/#689/#690/#640/#603):** #675 contains task generation fencing and ordered task → delivery → queue → Focus locks; independent review and API36 gate remain.
6. **P1 secure downloads (#671/#708):** #708 5/5 PASS, 53 body-transfer assertions; no DNS-pinned TLS/manual redirects/atomic Downloads or SAF publication. Keep fail-closed.
7. **P1 signing (#705/#84):** four workflows PASS; protected production environment reviewer/ref controls and provenance runtime remain unverified.
8. **P1 extensions (#676/#702/#687):** six workflows PASS; physical WebView SPA/OEM acceptance and recovery UI acceptance remain.
9. **P1 Service Worker (#704/#685):** six workflows PASS; retain Offline fail-closed and verify Online compatibility.
10. **P1/P2 recurrence/Telegram/desktop/architecture (#684/#476/#700/#696/#691/#348/#325):** complete parity, real CORS/browser, desktop reproducibility/download race and architecture work.

No release/tag/version/signer/applicationId change or destructive migration. Source identity remains `com.abrar.daymark`; run-level `the alternate application identifier specified by the run-level safety directive` conflicts with AGENTS and #679, so no identity change pending explicit owner reconciliation.

---

## Current execution queue — 2026-11-10T10:17:00Z (main 41fda91fbb15d2bf9634fd7576cf842fe9bdacbc)

Live inventory: 7 open PRs / 24 open issues. Main Android CI #42784930733 and contracts #42784930716 PASS. Main protection is disabled; rulesets are empty. See docs/CURRENT_STATUS_20261110T101700Z.md for exact heads and workflow evidence.

1. P0 — verify synchronized integration heads: #675 (task/Focus/webhook/storage), #676 (extension SPA), and #656 (iCalendar/import/export) are now 0 behind main via non-force two-parent merge commits. Their new-head workflows are running; do not reuse older PASS results.
2. P0 — Focus reliability (#648, #675, #613, #690): #675's pre-sync API 29/36 lifecycle passed; #648's separate API 36 gate still fails. Resolve after the synchronized #675 head passes.
3. P0 — task/import/recovery/webhook races (#683, #656, #689, #639): global task → delivery → queue → Focus lock order is covered; explicit integrated import-vs-normal-write race remains.
4. P0 — production signing/security (#705, #84): exact repository/owner actor gates are implemented and all four workflows pass; independent security review and owner-side tag ruleset/protected environment remain.
5. P0 — main governance (#646): owner/admin must configure required Android CI/contracts, independent approval, up-to-date branch and no-force-push/delete protections.
6. P0 — physical Android/WebView/OEM acceptance (#160): NOT TESTED.
7. P1 — extension privacy/runtime (#676, #702, #687): previous head all six workflows pass; synchronized merge head requires fresh CI and physical WebView acceptance; recovery UI remains.
8. P1 — Service Worker compatibility (#704, #685): all six exact-head checks pass; independent review remains.
9. P1 — secure Android download transport (#671), recurrence parity (#684/#476), Telegram browser acceptance (#700), and desktop reproducibility (#696).

No release/tag/version/signing-key/applicationId change or destructive migration was made. Current source identity remains com.abrar.daymark; owner reconciliation remains open without changing package identity.

---

## Current execution queue — 2026-11-10T10:13:00Z (main 41fda91fbb15d2bf9634fd7576cf842fe9bdacbc)

Live inventory: 7 open PRs / 24 open issues. Main Android CI #42784930733 and cross-platform contracts #42784930716 PASS. Main protection is disabled; rulesets are empty. See docs/CURRENT_STATUS_20261110T101300Z.md for exact heads and run evidence.

1. P0 — production signing authorization (#705, #84): production and device-test/SLSA jobs are owner/repository gated; all four exact-head workflows pass. Independent security review and owner-side tag ruleset/protected-environment controls remain.
2. P0 — Focus lifecycle and storage (#675, #648, #613, #690): #675 exact head passes seven workflows, including API 29/36; #648's separate API 36 gate still fails. Synchronize/review before replacing the older branch.
3. P0 — task/import/recovery/webhook races (#683, #656, #689, #639): shared task → delivery → queue → Focus locking is covered; explicit integrated import-vs-normal-write race remains.
4. P0 — governance (#646): owner/admin must configure required Android CI/contracts, independent approval, up-to-date branch and no-force-push/delete protections.
5. P0 — physical Android/WebView/OEM acceptance (#160): NOT TESTED.
6. P1 — extension privacy/runtime (#676, #702, #687): all six workflows, including API 26/36 runtime, pass; main synchronization, physical acceptance and recovery UI remain.
7. P1 — Service Worker compatibility (#704, #685): exact-head policy, Android, contracts, device artifact and API 26/36 runtime pass; independent review remains.
8. P1 — secure Android download transport (#671): remain fail-closed until redirect validation, bounded streaming, cancellation and safe publication.
9. P1 — recurrence parity (#684/#476), Telegram browser acceptance (#700), and desktop reproducibility (#696).

No release/tag/version/signing-key/applicationId change or destructive migration was made. Current source identity remains com.abrar.daymark; a conflicting run-level package instruction is recorded for owner reconciliation without reproducing the retired literal.

---

## Current execution queue — 2026-11-10T10:06:00Z (main 41fda91fbb15d2bf9634fd7576cf842fe9bdacbc)

Latest live inventory: 7 open PRs / 24 open issues. Main Android CI #42784930733 and Ubuntu/Windows contracts #42784930716 pass. Main protection is disabled and rulesets are empty. See docs/CURRENT_STATUS_20261110T100600Z.md for exact base/head SHAs, run links and evidence.

1. P0 — production signing authorization (#705, #84): exact production job now has repository + owner actor + triggering-actor gates; all four exact-head workflows pass. Keep draft until independent security review. Owner/admin must separately configure tag rulesets and protected-environment reviewers; no settings changed.
2. P0 — Focus lifecycle and storage (#648, #675, #613, #690): #648 API 36 lifecycle still fails; #675 prior head passed API 29/36, but its latest Focus-clear regression head is undergoing fresh checks. Do not reuse old-head PASS results.
3. P0 — cross-tab task/webhook consistency (#683, #689, #639): #675 implements the global task → delivery → queue → Focus lock order and broad tests; explicit import-vs-normal-write race coverage and independent review remain.
4. P0 — main governance (#646): configure required Android CI/contracts, independent approval, up-to-date branch and no-force-push/delete only after owner/admin approval and stable check-name verification.
5. P0 — physical Android/WebView acceptance (#160): real-device/OEM matrix remains NOT TESTED.
6. P1 — extension privacy/runtime (#676, #702, #687): source guards and core CI pass on #676; WebView runtime acceptance remains in progress; malformed-pack recovery UI remains.
7. P1 — Service Worker compatibility (#704, #685): exact-head policy, Android and API 26/36 runtime checks pass; independent review and compatibility acceptance remain.
8. P1 — secure Android download transport (#671): keep fail-closed until redirect validation, cookie/referrer isolation, bounded streaming, cancellation and atomic publication are implemented.
9. P1 — recurrence parity (#684, #476), Telegram browser acceptance (#700), and desktop reproducibility (#696): complete shared contracts, real browser tests and lockfile/npm-ci work.

No release/tag/version/signing-key/applicationId change or destructive migration was made. Current source application ID remains com.abrar.daymark; the run-level package instruction conflicts with root AGENTS, so identity remains unchanged pending owner reconciliation.

---

## Current execution queue — 2026-11-10T06:32:15Z (main 469b29edea69)

Latest whole-project snapshot: [CURRENT_STATUS_20261110T063215Z.md](docs/CURRENT_STATUS_20261110T063215Z.md).

Current main is `469b29edea6993b19c0f50d427b9d48605b2a4c7`; root AGENTS blob is `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Live inventory: **15 open PRs / 23 open issues**. Main Android CI and Ubuntu/Windows contracts pass on the exact main SHA. Main protection is disabled; rulesets are empty; detailed protection endpoint is HTTP 403.

### P0 — runtime, data integrity and governance
1. **#686:** Online Service Worker egress and Offline blocking passed API 26/36 on prior code head; current-main merge head has policy PASS and Android/contracts/runtime/device workflows in progress. Complete exact-head gates, independent security review and physical Android acceptance.
2. **#675/#656:** both branches are 0 behind main, mergeable, Telegram-integrated and all exact-head Android/contracts/Focus/device workflows pass; obtain independent storage/RFC review.
3. **#648/#677:** API 29/36 full lifecycle, selector gestures and Task Editor IME/Cancel pass on exact heads; obtain independent review and physical-device acceptance.
4. **#683/#689/#690 and #646/#160:** finish shared task/Focus/webhook mutation and clear ordering; owner-approved required CI/independent review governance; physical Android/WebView acceptance.

### P1 — security, integration and correctness
5. **#665/#84:** flow-style YAML trigger guard fix is in exact head and all four PR/device checks pass; tag-only SLSA v1.4.0 uses retired upload-artifact v3 and Node16 actions. Obtain a trusted Node24-compatible/provenance-preserving solution and independent review before any release.
6. **#694/#693:** current-main AST guard covers primitive constant expressions, WithStatement and imported test-namespace mutation; canonical Node suite 728/728 and all five exact-head workflows pass. Obtain independent test-integrity review.
7. **#692/#691:** private staging/no-replace desktop publication and URL-free failure IPC pass Desktop/Android/contracts/device-artifact CI; physical desktop GUI remains untested.
8. **#671/#678:** complete the actual redirect-validating, pinned, bounded Android download transport; keep current downloads fail-closed.
9. **#659/#687:** accessible malformed-extension recovery UI.

### P2 — infrastructure and cross-platform behavior
10. **#696:** generate a real Electron package lock only when npm registry DNS is available; current lockfile is absent and CI uses `npm install`.
11. **#684/#476:** align Android/web recurrence validation, anchors, catch-up, Doze/reboot/timezone semantics.
12. **#348/#325:** resume broader browser UX and cross-platform architecture after P0/P1 gates.

Recent main merges: #697 Telegram task-digest card, #695 platform support matrix, #688 Node test-registration guard. Latest published release remains v1.5 (2026-10-23); no release/tag is authorized or created.

## Current execution queue — 2026-11-10T06:29:42Z (main 469b29edea69)

Latest whole-project snapshot: [CURRENT_STATUS_20261110T062942Z.md](docs/CURRENT_STATUS_20261110T062942Z.md).

Current main is `469b29edea6993b19c0f50d427b9d48605b2a4c7`; root AGENTS blob is `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Live inventory: **15 open PRs / 23 open issues**. Main Android CI and Ubuntu/Windows contracts pass on the exact main SHA. Main protection is disabled; rulesets are empty; detailed protection endpoint is HTTP 403.

### P0 — runtime, data integrity and governance
1. **#686:** Online Service Worker egress and Offline blocking now both pass API 26/36 runtime; synchronize with main, obtain independent security review and perform physical Android acceptance.
2. **#675/#656:** both branches are 0 behind main, mergeable, Telegram-integrated and all exact-head Android/contracts/Focus/device workflows pass; obtain independent storage/RFC review.
3. **#648/#677:** API 29/36 full lifecycle, selector gestures and Task Editor IME/Cancel pass on exact heads; obtain independent review and physical-device acceptance.
4. **#683/#689/#690 and #646/#160:** finish shared task/Focus/webhook mutation and clear ordering; owner-approved required CI/independent review governance; physical Android/WebView acceptance.

### P1 — security, integration and correctness
5. **#665/#84:** flow-style YAML trigger guard fix is in exact head and all four PR/device checks pass; tag-only SLSA v1.4.0 uses retired upload-artifact v3 and Node16 actions. Obtain a trusted Node24-compatible/provenance-preserving solution and independent review before any release.
6. **#694/#693:** current-main AST guard covers primitive constant expressions, WithStatement and imported test-namespace mutation; canonical Node suite 728/728 and all five exact-head workflows pass. Obtain independent test-integrity review.
7. **#692/#691:** private staging/no-replace desktop publication and URL-free failure IPC pass Desktop/Android/contracts/device-artifact CI; physical desktop GUI remains untested.
8. **#671/#678:** complete the actual redirect-validating, pinned, bounded Android download transport; keep current downloads fail-closed.
9. **#659/#687:** accessible malformed-extension recovery UI.

### P2 — infrastructure and cross-platform behavior
10. **#696:** generate a real Electron package lock only when npm registry DNS is available; current lockfile is absent and CI uses `npm install`.
11. **#684/#476:** align Android/web recurrence validation, anchors, catch-up, Doze/reboot/timezone semantics.
12. **#348/#325:** resume broader browser UX and cross-platform architecture after P0/P1 gates.

Recent main merges: #697 Telegram task-digest card, #695 platform support matrix, #688 Node test-registration guard. Latest published release remains v1.5 (2026-10-23); no release/tag is authorized or created.

## Current execution queue — 2026-11-10T06:27:20Z (main 469b29edea69)

Latest whole-project snapshot: [CURRENT_STATUS_20261110T062720Z.md](docs/CURRENT_STATUS_20261110T062720Z.md).

Current main is `469b29edea6993b19c0f50d427b9d48605b2a4c7`; root AGENTS blob is `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Live inventory: **15 open PRs / 23 open issues**. Main Android CI and Ubuntu/Windows contracts pass on the exact main SHA. Main protection is disabled; rulesets are empty; detailed protection endpoint is HTTP 403.

### P0 — runtime, data integrity and governance
1. **#675/#656:** both branches are 0 behind main, mergeable, Telegram-integrated and all exact-head Android/contracts/Focus/device workflows pass; obtain independent storage/RFC review.
2. **#648/#677:** API 29/36 full lifecycle, selector gestures and Task Editor IME/Cancel pass on exact heads; obtain independent review and physical-device acceptance.
3. **#683/#689/#690 and #646/#160:** finish shared task/Focus/webhook mutation and clear ordering; owner-approved required checks/independent review governance; physical Android/WebView acceptance.

### P1 — security, integration and correctness
4. **#665/#84:** flow-style YAML trigger guard fix is in exact head and all four PR/device checks pass; tag-only SLSA v1.4.0 uses retired upload-artifact v3 and Node16 actions. Obtain a trusted Node24-compatible/provenance-preserving solution and independent review before any release.
5. **#694/#693:** current-main AST guard covers primitive constant expressions, WithStatement and imported test-namespace mutation; canonical Node suite 728/728 and all five exact-head workflows pass. Obtain independent test-integrity review.
6. **#692/#691:** private staging/no-replace desktop publication and URL-free failure IPC pass Desktop/Android/contracts/device-artifact CI; physical desktop GUI remains untested.
7. **#671/#678:** complete the actual redirect-validating, pinned, bounded Android download transport; keep current downloads fail-closed.
8. **#659/#687 and #686/#685:** accessible malformed-extension recovery UI and Service Worker Online/Offline compatibility.

### P2 — infrastructure and cross-platform behavior
9. **#696:** generate a real Electron package lock only when npm registry DNS is available; current lockfile is absent and CI uses `npm install`.
10. **#684/#476:** align Android/web recurrence validation, anchors, catch-up, Doze/reboot/timezone semantics.
11. **#348/#325:** resume broader browser UX and cross-platform architecture after P0/P1 gates.

Recent main merges: #697 Telegram task-digest card, #695 platform support matrix, #688 Node test-registration guard. Latest published release remains v1.5 (2026-10-23); no release/tag is authorized or created.

## Current execution queue — 2026-11-10T06:25:08Z (main 469b29edea69)

Latest whole-project snapshot: [CURRENT_STATUS_20261110T062508Z.md](docs/CURRENT_STATUS_20261110T062508Z.md).

Current main is `469b29edea6993b19c0f50d427b9d48605b2a4c7`; root AGENTS blob is `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Live inventory: **15 open PRs / 23 open issues**. Main Android CI and Ubuntu/Windows contracts pass on the exact main SHA. Main protection is disabled; rulesets are empty; detailed protection endpoint is HTTP 403.

### P0 — runtime, data integrity and governance
1. **#675/#656:** both branches are 0 behind main, mergeable, Telegram-integrated and all exact-head Android/contracts/Focus/device workflows pass; obtain independent storage/RFC review.
2. **#648/#677:** API 29/36 full lifecycle, selector gestures and Task Editor IME/Cancel pass on exact heads; obtain independent review and physical-device acceptance.
3. **#683/#689/#690 and #646/#160:** finish shared task/Focus/webhook mutation and clear ordering; owner-approved required checks/independent review governance; physical Android/WebView acceptance.

### P1 — security, integration and correctness
4. **#665/#84:** flow-style YAML trigger guard fix is in exact head and all four PR/device checks pass; tag-only SLSA v1.4.0 uses retired upload-artifact v3 and Node16 actions. Obtain a trusted Node24-compatible/provenance-preserving solution and independent review before any release.
5. **#694/#693:** current-main AST guard covers primitive constant expressions, WithStatement and imported test-namespace mutation; canonical Node suite 728/728 and all five exact-head workflows pass. Obtain independent test-integrity review.
6. **#692/#691:** private staging/no-replace desktop publication and URL-free failure IPC pass Desktop/Android/contracts/device-artifact CI; physical desktop GUI remains untested.
7. **#671/#678:** complete the actual redirect-validating, pinned, bounded Android download transport; keep current downloads fail-closed.
8. **#659/#687 and #686/#685:** accessible malformed-extension recovery UI and Service Worker Online/Offline compatibility.

### P2 — infrastructure and cross-platform behavior
9. **#696:** generate a real Electron package lock only when npm registry DNS is available; current lockfile is absent and CI uses `npm install`.
10. **#684/#476:** align Android/web recurrence validation, anchors, catch-up, Doze/reboot/timezone semantics.
11. **#348/#325:** resume broader browser UX and cross-platform architecture after P0/P1 gates.

Recent main merges: #697 Telegram task-digest card, #695 platform support matrix, #688 Node test-registration guard. Latest published release remains v1.5 (2026-10-23); no release/tag is authorized or created.

## Current execution queue — 2026-11-10T06:22:34Z (main 469b29edea69)

Latest whole-project snapshot: [CURRENT_STATUS_20261110T062234Z.md](docs/CURRENT_STATUS_20261110T062234Z.md).

Current main is `469b29edea6993b19c0f50d427b9d48605b2a4c7`; root AGENTS blob is `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Live inventory: **15 open PRs / 23 open issues**. Main Android CI and Ubuntu/Windows contracts pass on the exact main SHA. Main protection is disabled; rulesets are empty; detailed protection endpoint is HTTP 403.

### P0 — runtime, data integrity and governance
1. **#675/#656:** both branches are 0 behind main, mergeable, Telegram-integrated and all exact-head Android/contracts/Focus/device workflows pass; obtain independent storage/RFC review.
2. **#648/#677:** API 29/36 full lifecycle, selector gestures and Task Editor IME/Cancel pass on exact heads; obtain independent review and physical-device acceptance.
3. **#683/#689/#690 and #646/#160:** finish shared task/Focus/webhook mutation and clear ordering; owner-approved required checks/independent review governance; physical Android/WebView acceptance.

### P1 — security, integration and correctness
4. **#665/#84:** flow-style YAML trigger guard fix is in exact head and core CI passes; tag-only SLSA v1.4.0 uses retired upload-artifact v3 and Node16 actions. Obtain a trusted Node24-compatible/provenance-preserving solution and independent review before any release.
5. **#694/#693:** current-main AST guard now covers primitive constant expressions, WithStatement and imported test-namespace mutation; canonical Node suite 728/728 and all five exact-head workflows pass. Obtain independent test-integrity review.
6. **#692/#691:** private staging/no-replace desktop publication and URL-free failure IPC pass Desktop/Android/contracts/device-artifact CI; physical desktop GUI remains untested.
7. **#671/#678:** complete the actual redirect-validating, pinned, bounded Android download transport; keep current downloads fail-closed.
8. **#659/#687 and #686/#685:** accessible malformed-extension recovery UI and Service Worker Online/Offline compatibility.

### P2 — infrastructure and cross-platform behavior
9. **#696:** generate a real Electron package lock only when npm registry DNS is available; current lockfile is absent and CI uses `npm install`.
10. **#684/#476:** align Android/web recurrence validation, anchors, catch-up, Doze/reboot/timezone semantics.
11. **#348/#325:** resume broader browser UX and cross-platform architecture after P0/P1 gates.

Recent main merges: #697 Telegram task-digest card, #695 platform support matrix, #688 Node test-registration guard. Latest published release remains v1.5 (2026-10-23); no release/tag is authorized or created.

## Current execution queue — 2026-11-10T06:17:36Z (main 469b29edea69)

Latest whole-project snapshot: [CURRENT_STATUS_20261110T061736Z.md](docs/CURRENT_STATUS_20261110T061736Z.md).

Current main is `469b29edea6993b19c0f50d427b9d48605b2a4c7`; root AGENTS blob is `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Live inventory: **15 open PRs / 23 open issues**. Main Android CI and Ubuntu/Windows contracts pass on the exact main SHA. Main protection is disabled; rulesets are empty; detailed protection endpoint is HTTP 403.

### P0 — runtime, data integrity and governance
1. **#675/#656:** both branches are now 0 behind main, mergeable, Telegram-integrated, and all exact-head Android/contracts/Focus/device workflows pass. Obtain independent storage/RFC review.
2. **#648/#677:** API 29/36 full lifecycle, selector gestures and Task Editor IME/Cancel pass; obtain independent review and physical-device acceptance.
3. **#683/#689/#690 and #646/#160:** finish shared task/Focus/webhook mutation and clear ordering; owner-approved required checks/independent review governance; physical Android/WebView acceptance.

### P1 — security, integration and correctness
4. **#665/#84:** flow-style YAML trigger guard fix is now in exact head f54c and all PR/device checks pass. Remaining blocker is the trusted SLSA generator's transitive Node16/20 actions; obtain a Node24-compatible trusted solution and independent provenance review.
5. **#694/#693:** literal-only callback declaration/dead-branch hardening is pushed but exact-head Actions are absent; general constant folding remains a possible follow-up. Synchronize and run canonical CI.
6. **#692/#691:** private staging/no-replace desktop publication and URL-free failure IPC pass Desktop/Android/contracts/device-artifact CI; physical desktop GUI remains untested.
7. **#671/#678:** complete the actual redirect-validating, pinned, bounded Android download transport; keep current downloads fail-closed.
8. **#659/#687 and #686/#685:** accessible malformed-extension recovery UI and Service Worker Online/Offline compatibility.

### P2 — infrastructure and cross-platform behavior
9. **#696:** generate a real Electron package lock only when npm registry DNS is available; current lockfile is absent and CI uses `npm install`.
10. **#684/#476:** align Android/web recurrence validation, anchors, catch-up, Doze/reboot/timezone semantics.
11. **#348/#325:** resume broader browser UX and cross-platform architecture after P0/P1 gates.

Recent main merges: #697 Telegram task-digest card, #695 platform support matrix, #688 Node test-registration guard. Latest published release remains v1.5 (2026-10-23); no release/tag is authorized or created.

## Current execution queue — 2026-11-10T06:13:21Z (main 469b29edea69)

Latest whole-project snapshot: [CURRENT_STATUS_20261110T061321Z.md](docs/CURRENT_STATUS_20261110T061321Z.md).

Current main is `469b29edea6993b19c0f50d427b9d48605b2a4c7`; root AGENTS blob is `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Live inventory: **15 open PRs / 23 open issues**. Main Android CI and Ubuntu/Windows contracts pass on the exact main SHA. Main protection is disabled; rulesets are empty; detailed protection endpoint is HTTP 403.

### P0 — runtime, data integrity and governance
1. **#675/#656:** both accumulated branches now include current main as a merge parent, Telegram card/scripts/tests and required-test inventory; exact-head CI is running. Review merged trees and obtain independent storage/RFC review.
2. **#677/#648:** API 29/36 full lifecycle, selector gestures and Task Editor IME/Cancel pass on exact heads; synchronize with main and obtain independent review.
3. **#683/#689/#690 and #646/#160:** finish shared task/Focus/webhook mutation and clear ordering; owner-approved required checks/independent review governance; physical Android/WebView acceptance.

### P1 — security, integration and correctness
4. **#665/#84:** flow-style YAML trigger detection is already implemented/tested; remaining work is independent release/provenance review and a fresh transitive SLSA generator runtime audit.
5. **#694/#693:** literal-only callback declaration/dead-branch hardening is pushed but exact-head Actions are absent; general constant folding remains a possible follow-up. Synchronize and run canonical CI.
6. **#692/#691:** private staging/no-replace desktop publication and URL-free failure IPC pass Desktop/Android/contracts/device-artifact CI; physical desktop GUI remains untested.
7. **#671/#678:** complete the actual redirect-validating, pinned, bounded Android download transport; keep current downloads fail-closed.
8. **#659/#687 and #686/#685:** accessible malformed-extension recovery UI and Service Worker Online/Offline compatibility.

### P2 — infrastructure and cross-platform behavior
9. **#696:** generate a real Electron package lock only when npm registry DNS is available; current lockfile is absent and CI uses `npm install`.
10. **#684/#476:** align Android/web recurrence validation, anchors, catch-up, Doze/reboot/timezone semantics.
11. **#348/#325:** resume broader browser UX and cross-platform architecture after P0/P1 gates.

Recent main merges: #697 Telegram task-digest card, #695 platform support matrix, #688 Node test-registration guard. Latest published release remains v1.5 (2026-10-23); no release/tag is authorized or created.

## Current execution queue — 2026-11-10T06:15:00Z (main 469b29edea69)

Latest whole-project snapshot: [CURRENT_STATUS_20261110T061500Z.md](docs/CURRENT_STATUS_20261110T061500Z.md).

Live inventory: 15 open PRs / 24 open issues. Main Android CI and Ubuntu/Windows contracts pass on exact main 469b29edea6993b19c0f50d427b9d48605b2a4c7. PR #665 signing isolation and #699 Telegram storage-integrity fixes have exact-head canonical CI green; #648/#677 API 29/36 lifecycle gates are green. No PR merged in this run.

### P0 — security, runtime, data integrity and governance
1. **#665/#84:** current main still exposes signing-secret expressions in a pull_request-triggered workflow. PR #665 exact head f54c6108 has Android CI, contracts, non-publishing device acceptance and PR device validation PASS; npm 723/723. Obtain independent security/provenance review, synchronize with current main and verify owner-side Actions secret/environment controls before integration.
2. **#648/#677/#613:** both current Focus/reminder heads pass API 29/36 lifecycle. Coordinate overlapping instrumentation/Focus UI files, synchronize with current main, rerun combined acceptance and obtain independent review.
3. **#683/#689/#690:** finish cross-tab task, Focus and webhook Web Locks, import/recovery/undo races and same-tab invalidation.
4. **#646/#160:** owner-approved required CI/independent-review governance and physical Android/WebView acceptance.

### P1 — integration and security
5. **#675/#656:** synchronize accumulated recovery/webhook and iCalendar branches with current main while preserving Telegram card/scripts and the append-only test inventory.
6. **#694/#693:** resolve merge conflict, run exact-head canonical CI and independent test-integrity review; current head has no workflow runs.
7. **#671/#678:** complete actual redirect-validating, pinned, bounded Android download transport; keep downloads fail-closed.
8. **#687/#659 and #685/#686:** accessible malformed-extension recovery UI and Service Worker Online/Offline compatibility.
9. **#700/#698/#699:** Telegram logic/UI CI is green, but live browser/WebView CORS and token lifecycle remain untested.
10. **#691/#692:** desktop private staging/no-replace publication passes CI; physical desktop GUI/installer acceptance remains untested.

### P2 — infrastructure and cross-platform behavior
11. **#696:** generate a real Electron lockfile only when registry DNS works; clean npm lock generation failed with EAI_AGAIN.
12. **#684/#476:** align Android/web recurrence validation, anchors, catch-up, Doze/reboot/timezone semantics.
13. **#348/#325:** resume browser UX and cross-platform architecture after P0/P1 gates.

No release/tag/version/signing-key/application identity change or destructive migration was made. Physical Android and desktop GUI acceptance remain NOT TESTED.

Work by: ChatGPT (OpenAI)
Model: GPT-6
Tooling: GitHub connector via Code Mode; live PR/issue/Actions/source audit
Timestamp (UTC): 2026-11-10T06:15:00Z

## Current execution queue — 2026-11-10T06:07:29Z (main 469b29edea69)

Latest whole-project snapshot: [CURRENT_STATUS_20261110T060729Z.md](docs/CURRENT_STATUS_20261110T060729Z.md).

Current main is `469b29edea6993b19c0f50d427b9d48605b2a4c7`; root AGENTS blob is `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Live inventory: **15 open PRs / 23 open issues**. Main Android CI and Ubuntu/Windows contracts pass on the exact main SHA. Main protection is disabled; rulesets are empty; detailed protection endpoint is HTTP 403.

### P0 — runtime, data integrity and governance
1. **#677/#613:** API 29/36 full lifecycle, selector gestures and Task Editor IME/Cancel pass on exact #677 head; synchronize with main and obtain independent review.
2. **#683/#689/#690:** finish task, Focus and webhook Web Locks/clear ordering, import/recovery/undo concurrency and same-tab invalidation.
3. **#646/#160:** owner-approved required CI/independent review governance and physical Android/WebView acceptance.

### P1 — security, integration and correctness
4. **#84/#665:** flow-style YAML trigger detection is already implemented/tested; remaining work is independent release/provenance review and a fresh transitive SLSA generator runtime audit.
5. **#694/#693:** declaration/literal-dead-branch callback bypass is partially addressed, but exact-head Actions are absent and general constant folding is not implemented; synchronize and run canonical CI.
6. **#675/#656:** synchronize accumulated recovery/webhook and iCalendar branches with current main while preserving the Telegram card/scripts.
7. **#692/#691:** private staging/no-replace desktop publication and URL-free failure IPC pass Desktop/Android/contracts/device-artifact CI; physical desktop GUI remains untested.
8. **#671/#678:** complete the actual redirect-validating, pinned, bounded Android download transport; keep current downloads fail-closed.
9. **#659/#687 and #686/#685:** accessible malformed-extension recovery UI and Service Worker Online/Offline compatibility.

### P2 — infrastructure and cross-platform behavior
10. **#696:** generate a real Electron package lock only when npm registry DNS is available; current lockfile is absent and CI uses `npm install`.
11. **#684/#476:** align Android/web recurrence validation, anchors, catch-up, Doze/reboot/timezone semantics.
12. **#348/#325:** resume broader browser UX and cross-platform architecture after P0/P1 gates.

Recent main merges: #697 Telegram task-digest card, #695 platform support matrix, #688 Node test-registration guard. Latest published release remains v1.5 (2026-10-23); no release/tag is authorized or created.

## Current execution queue — 2026-11-10T06:04:17Z (main 469b29edea69)

Latest whole-project snapshot: [CURRENT_STATUS_20261110T060417Z.md](docs/CURRENT_STATUS_20261110T060417Z.md).

Current main is `469b29edea6993b19c0f50d427b9d48605b2a4c7`; root AGENTS blob is `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Live inventory: **15 open PRs / 23 open issues**. Main Android CI and Ubuntu/Windows contracts pass on the exact main SHA. Main protection is disabled; rulesets are empty; detailed protection endpoint is HTTP 403.

### P0 — runtime, data integrity and governance
1. **#677/#613:** API 29/36 full lifecycle, selector gestures and Task Editor IME/Cancel pass on exact #677 head; synchronize with main and obtain independent review.
2. **#683/#689/#690:** finish task, Focus and webhook Web Locks/clear ordering, import/recovery/undo concurrency and same-tab invalidation.
3. **#646/#160:** owner-approved required CI/independent review governance and physical Android/WebView acceptance.

### P1 — security, integration and correctness
4. **#84/#665:** direct action pins and signing-secret separation pass; flow-style YAML trigger detection is already implemented and tested. Remaining work is independent release/provenance review and a fresh transitive SLSA generator runtime audit.
5. **#694/#693:** callback declaration/dead-branch bypass is addressed in code/tests, but exact-head Actions are absent; synchronize and run canonical CI.
6. **#675/#656:** synchronize accumulated recovery/webhook and iCalendar branches with current main while preserving the Telegram card/scripts.
7. **#692/#691:** private staging/no-replace desktop publication and URL-free failure IPC pass Desktop/Android/contracts/device-artifact CI; physical desktop GUI remains untested.
8. **#671/#678:** complete the actual redirect-validating, pinned, bounded Android download transport; keep current downloads fail-closed.
9. **#659/#687 and #686/#685:** accessible malformed-extension recovery UI and Service Worker Online/Offline compatibility.

### P2 — infrastructure and cross-platform behavior
10. **#696:** generate a real Electron package lock only when npm registry DNS is available; current lockfile is absent and CI uses `npm install`.
11. **#684/#476:** align Android/web recurrence validation, anchors, catch-up, Doze/reboot/timezone semantics.
12. **#348/#325:** resume broader browser UX and cross-platform architecture after P0/P1 gates.

Recent main merges: #697 Telegram task-digest card, #695 platform support matrix, #688 Node test-registration guard. Latest published release remains v1.5 (2026-10-23); no release/tag is authorized or created.

## Current execution queue — 2026-11-10T06:02:27Z (main 469b29edea69)

Latest whole-project snapshot: [CURRENT_STATUS_20261110T060227Z.md](docs/CURRENT_STATUS_20261110T060227Z.md).

Current main is `469b29edea6993b19c0f50d427b9d48605b2a4c7`; root AGENTS blob is `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Live inventory: **15 open PRs / 23 open issues**. Main Android CI and Ubuntu/Windows contracts pass on the exact main SHA. Main protection is disabled; rulesets are empty; detailed protection endpoint is HTTP 403.

### P0 — runtime, data integrity and governance
1. **#677/#613:** API 29/36 full lifecycle, selector gestures and Task Editor IME/Cancel now pass on exact #677 head; synchronize with current main and obtain independent review.
2. **#683/#689/#690:** finish task, Focus and webhook Web Locks/clear ordering, import/recovery/undo concurrency and same-tab invalidation.
3. **#646/#160:** owner-approved required CI/independent review governance and physical Android/WebView acceptance.

### P1 — security, integration and correctness
4. **#665/#84:** direct action pins and signing-secret separation pass; remaining work is independent release/provenance review and a fresh transitive SLSA generator runtime audit. The earlier flow-style trigger gap finding was retracted; current parser/tests already cover flow-style YAML.
5. **#694/#693:** callback declaration/dead-branch bypass is addressed in code/tests, but exact-head Actions are absent; synchronize and run canonical CI.
6. **#675/#656:** synchronize accumulated recovery/webhook and iCalendar branches with current main while preserving the Telegram card/scripts.
7. **#692/#691:** private staging/no-replace desktop publication and URL-free failure IPC pass Desktop/Android/contracts/device-artifact CI; physical desktop GUI remains untested.
8. **#671/#678:** complete the actual redirect-validating, pinned, bounded Android download transport; keep current downloads fail-closed.
9. **#659/#687 and #686/#685:** accessible malformed-extension recovery UI and Service Worker Online/Offline compatibility.

### P2 — infrastructure and cross-platform behavior
10. **#696:** generate a real Electron package lock only when npm registry DNS is available; current lockfile is absent and CI uses `npm install`.
11. **#684/#476:** align Android/web recurrence validation, anchors, catch-up, Doze/reboot/timezone semantics.
12. **#348/#325:** resume broader browser UX and cross-platform architecture after P0/P1 gates.

Recent main merges: #697 Telegram task-digest card, #695 platform support matrix, #688 Node test-registration guard. Latest published release remains v1.5 (2026-10-23); no release/tag is authorized or created.

## Current execution queue — 2026-11-10T05:57:31Z (main 469b29edea69)

Latest whole-project snapshot: [CURRENT_STATUS_20261110T055731Z.md](docs/CURRENT_STATUS_20261110T055731Z.md).

Current main is `469b29edea6993b19c0f50d427b9d48605b2a4c7`; root AGENTS blob is `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Live inventory: **15 open PRs / 23 open issues**. Main Android CI and Ubuntu/Windows contracts pass on the exact main SHA. Main protection is disabled; rulesets are empty; detailed protection endpoint is HTTP 403.

### P0 — runtime, data integrity and governance
1. **#677/#613:** diagnose the API 29 Countdown tap from the new parent/child touch trace; complete exact-head API 29/36, then Task Editor IME/Cancel. #648's API 29/36 gate is now green.
2. **#683/#689/#690:** finish task, Focus and webhook Web Locks/clear ordering, import/recovery/undo concurrency and same-tab invalidation.
3. **#646/#160:** owner-approved required CI/independent review governance and physical Android/WebView acceptance.

### P1 — security, integration and correctness
4. **#665/#84:** close flow-style YAML PR-trigger guard gap and independently review signing-secret isolation/provenance.
5. **#694/#693:** callback declaration/dead-branch bypass is addressed in code/tests, but exact-head Actions are absent; synchronize and run canonical CI.
6. **#675/#656:** synchronize accumulated recovery/webhook and iCalendar branches with current main while preserving the Telegram card/scripts.
7. **#692/#691:** private staging/no-replace desktop publication and URL-free failure IPC pass Desktop/Android/contracts/device-artifact CI; physical desktop GUI remains untested.
8. **#671/#678:** complete the actual redirect-validating, pinned, bounded Android download transport; keep current downloads fail-closed.
9. **#659/#687 and #686/#685:** accessible malformed-extension recovery UI and Service Worker Online/Offline compatibility.

### P2 — infrastructure and cross-platform behavior
10. **#696:** generate a real Electron package lock only when npm registry DNS is available; current lockfile is absent and CI uses `npm install`.
11. **#684/#476:** align Android/web recurrence validation, anchors, catch-up, Doze/reboot/timezone semantics.
12. **#348/#325:** resume broader browser UX and cross-platform architecture after P0/P1 gates.

Recent main merges: #697 Telegram task-digest card, #695 platform support matrix, #688 Node test-registration guard. Latest published release remains v1.5 (2026-10-23); no release/tag is authorized or created.

## Current execution queue — 2026-11-10T05:53:36Z (main 469b29edea69)

Latest whole-project snapshot: [CURRENT_STATUS_20261110T055336Z.md](docs/CURRENT_STATUS_20261110T055336Z.md).

Current main is `469b29edea6993b19c0f50d427b9d48605b2a4c7`; root AGENTS blob is `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Live inventory: **15 open PRs / 23 open issues**. Main Android CI and Ubuntu/Windows contracts pass on the exact main SHA. Main protection is disabled; rulesets are empty; the detailed protection endpoint is HTTP 403.

### P0 — runtime, data integrity and governance
1. **#677/#613:** finish the exact-head API 29/36 lifecycle, gesture and Task Editor IME gate after integrating #648's now-verified screen-coordinate helper. The new #677 lifecycle run is still in progress.
2. **#683/#689/#690:** complete task, Focus and webhook Web Locks/clear ordering, import/recovery/undo concurrency and same-tab invalidation.
3. **#646/#160:** owner-approved required CI/independent review governance and physical Android/WebView acceptance.

### P1 — security, integration and correctness
4. **#665/#84:** close flow-style YAML PR-trigger guard gap and independently review signing-secret isolation/provenance.
5. **#694/#693:** declaration-only/dead-branch callback bypass is now addressed in code/tests, but exact-head Actions are absent; synchronize and run canonical CI.
6. **#675/#656:** resolve accumulated branch integration with current main, preserving the Telegram card/scripts, task mutation contract and RFC/data-integrity behavior.
7. **#692/#691:** private staging/no-replace desktop publication and URL-free failure IPC now pass Desktop/Android/contracts/device-artifact CI; physical desktop GUI remains untested.
8. **#671/#678:** complete the actual redirect-validating, pinned, bounded Android download transport; keep current downloads fail-closed.
9. **#659/#687 and #686/#685:** accessible malformed-extension recovery UI and Service Worker Online/Offline compatibility.

### P2 — infrastructure and cross-platform behavior
10. **#696:** generate a real Electron package lock only when npm registry DNS is available; current lockfile is absent and CI uses `npm install`.
11. **#684/#476:** align Android/web recurrence validation, anchors, catch-up, Doze/reboot/timezone semantics.
12. **#348/#325:** resume broader browser UX and cross-platform architecture after P0/P1 gates.

Recent main merges: #697 Telegram task-digest card, #695 platform support matrix, #688 Node test-registration guard. Latest published release remains v1.5 (2026-10-23); no release/tag is authorized or created.

## Current execution queue — 2026-11-10T05:36:48Z (main 469b29edea69)

Latest whole-project snapshot: [CURRENT_STATUS_20261110T053648Z.md](docs/CURRENT_STATUS_20261110T053648Z.md).

Current main is `469b29edea6993b19c0f50d427b9d48605b2a4c7`; root AGENTS blob is `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Live inventory: **14 open PRs / 23 open issues**. Main Android CI and Ubuntu/Windows contracts pass on the exact main SHA. Main protection is disabled; rulesets are empty; the detailed protection endpoint is HTTP 403.

### P0 — runtime, data integrity and governance
1. **#648/#613 Focus instrumentation:** latest head `13933d6bb017d51475aa2e16bedefe1c78cdfa33` fixes the shared event-log fixture and derives UiAutomation touch rectangles from `getLocationOnScreen()`; Android CI/contracts/device artifact pass, API 29/36 lifecycle and device-test APK are still running. Keep strict gates.
2. **#677 reminders/gesture:** latest head `f50650a1984768f2729c28cc263568263586e84d`; API 36 fails at the same 153 px touch-coordinate mismatch. Reuse #648 only after its new exact-head lifecycle passes.
3. **#683/#689/#690:** finish task, webhook and Focus Web Locks/clear ordering, import/recovery/undo concurrency and same-tab invalidation.
4. **#646/#160:** owner-approved required CI/independent review governance and physical Android/WebView acceptance.

### P1 — security, integration and correctness
5. **#665:** signing-secret split has green exact-head CI, but flow-style YAML PR triggers are not recognized by its regression guard; fix and independently review.
6. **#694/#693:** AST test guard has no exact-head Actions run; declaration-only and statically dead callbacks can still satisfy the callback predicate.
7. **#692/#691:** private staging/no-replace desktop publication is green; add renderer-visible failure feedback after publication errors. Physical desktop GUI remains untested.
8. **#671/#678:** complete the actual redirect-validating, pinned, bounded Android download transport; keep current downloads fail-closed.
9. **#675/#656:** synchronize accumulated recovery/webhook and iCalendar branches with main, preserve the Telegram card, and obtain independent storage/RFC review.
10. **#659/#687 and #686/#685:** accessible malformed-extension recovery UI and Service Worker Online/Offline compatibility.

### P2 — infrastructure and cross-platform behavior
11. **#696:** generate a real Electron package lock only when npm registry DNS is available; current `package-lock.json` is absent and CI uses `npm install`.
12. **#684/#476:** align Android/web recurrence validation, anchors, catch-up, Doze/reboot/timezone semantics.
13. **#348/#325:** resume broader browser UX and cross-platform architecture after P0/P1 gates.

Recent main merges: #697 Telegram task-digest card, #695 platform support matrix, #688 Node test-integrity guard. Latest published release remains v1.5 (2026-10-23); no release/tag is authorized or created.

## Current execution queue — 2026-11-09T12:34:39.477Z (main 8d76584bc07e)

This queue supersedes older current-priority summaries below; historical planning and evidence remain intact.

1. **P0 — Focus Timer / browser download safety (#648, #613, #671):** synchronize the 120-ahead/7-behind Focus branch with current main, fix source-guard and host-input drift, then prove actual Countdown/Stopwatch taps, horizontal swipes and parent ScrollView vertical scrolling on API 29 and API 36. Keep API 36 ten-consecutive-run gate. New downloads remain fail-closed until a manual redirect-validating, bounded transport is integrated; do not restore DownloadManager opaque redirects.
2. **P1 — Recovery data integrity (#664, #640):** apply duplicate-key rejection to primary Focus storage, task/Focus outer recovery envelopes, every nested JSON string and user-selected imports. Preserve exact raw bytes and refuse ambiguous overwrite/import. Current head 5a1962c5 still has one guard call site (primary task loader); recovery/import regressions are missing.
3. **P1 — Storage health (#666, #603):** latest head 1579ce1d is 28 ahead/0 behind current main; Android CI and device APK checks are running, contracts pass. Complete independent fail-closed review; unreadable data must never be treated as absent or deleted.
4. **P1 — Release signing isolation (#665, #84):** latest head 7e4cd3e7 is 9 ahead/0 behind; exact-head Android/contracts/device workflows are running. Verify PR builds cannot access signing secrets and finish Node24/transitive action inventory.
5. **P1 — Webhook queue (#662, #639, #636):** final-attempt drop and Web Locks/session-only secret behavior pass exact-head Android/contracts/device checks on 2c8aa239; synchronize five commits behind main and obtain independent review.
6. **P1 — Import/export (#656):** exact-head Android/contracts/device checks pass on 199e9fa6; synchronize five commits behind main and obtain independent RFC 5545/data-loss review.
7. **P1 — Extension trust (#659):** exact-head Android/contracts/device checks pass on 6c7d50ab; synchronize five commits behind main and obtain independent security review.
8. **P0 — Physical acceptance (#160):** test current-main APK on real devices, recording model/API/WebView provider/version and APK SHA. Emulator/artifact builds are not physical-device acceptance.
9. **P1 — Governance (#646):** owner-approved required checks and independent-review protection for main; no settings changed in this cycle.
10. **P2 — Browser UX / cross-platform architecture (#348, #325):** resume after Focus/download safety and storage/data-integrity gates.

Recent integration: PR #673 merged at 8d76584bc07ed06388e46de8dd11bd39d7250d3a. Post-merge Android CI is in progress and Ubuntu/Windows contracts pass. No production release/tag was published.

---

## Current execution queue refresh — 2026-11-09T12:00:49Z (main 1d29085)

Latest whole-project snapshot: [CURRENT_STATUS_20261109T120049Z.md](docs/CURRENT_STATUS_20261109T120049Z.md).

Current main: `1d29085b9c4f9ff3489711fd7e18cc88ab368767`. Root AGENTS: `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Open inventory: **10 PRs / 11 issues**.

### P0 — security and runtime acceptance
1. **#665 signing-secret isolation:** exact head `530ba59607f944358f18f8bcd1f2881d9e0e8aaa`, Node 659/659 and Android/contracts/device-test PASS. Current main PR/debug build logs expose masked signing variables to PR-controlled Gradle build steps; no exfiltration evidence. Independent security review required.
2. **#648 Focus Timer:** exact head `49e4c1bee459dd0afb33d8bc0b3d2fc32de8cda2`, 101 ahead / 0 behind. Direct numeric-only UiAutomation shell input replaces the failed cross-UID bridge and status-marker wrapper. Local host smoke 8 assertions PASS. Exact-head Android/Focus API29+36 workflows queued/in progress; no emulator pass claimed.
3. **#662 webhook:** exact head `4c3252ee5b303184d2e7cac07deb6a3f18d9f865`, Node 684/684 and Android/contracts/device-test PASS. Session-only endpoint and Web Locks replace merged #655 localStorage secret/lock behavior. Independent review required.
4. **#664 recovery:** exact head `fc104fd590d3a61deb02efc1808439cbda1c6d41`, Android/contracts/device-test PASS; independent review and physical/manual export acceptance pending.
5. **#160 physical Android/WebView/OEM acceptance:** APK artifacts are not physical-device tests.

### P1 — data integrity, extension, recurrence and integration
- #656 import/export: exact head `60ed05002237f172a9f9931390b024f5d30756ad`, Node 679/679 and Android/contracts/device-test PASS; independent review pending.
- #659 extension import trust: exact head `3e95f41c5cad12474345875b8078d75249154dc9`; Android/contracts/device acceptance/device-test PASS; independent review pending.
- #666 storage health: exact head `4ebb8256926ae9a3d3fb7ba774da4cc517add7ec`, Node 671/671 and Android/contracts/device-test PASS.
- #657 recurrence: exact head `0bf58040c9186de574c3e760e61f1bf0cedd04ad`; CI/non-publishing acceptance PASS; actual Doze/reboot/timezone/OEM delivery pending.
- #670 CSS press feedback: exact head `59e8825fa1c36b6329a5a1a27212f478c70c2b30`, Node 658/658 and Android/contracts/device-test PASS; PR ready for review.
- #637 closed without merge after CSS transplant; stale status snapshots and duplicate HTTP guard were not copied.
- #669 docs snapshot/status index: preceding exact head passed Android/contracts/device-test; this refreshed snapshot commit requires new checks.

### P0 governance and release blockers
- #646: main protection disabled, rulesets empty, dedicated endpoint HTTP 403; require owner-side independent approvals and Android/contracts checks.
- Resolve application identity policy conflict between source/root AGENTS and user-mandated target; no identity change without explicit owner decision.
- v1.5 remains latest published; v1.4 draft. No release/tag/version/signing changes authorized.
- No physical-device tests claimed.

### Latest execution ledger
- #648: abandoned cross-UID file bridge after API29 EACCES and removed unreliable status marker; direct bounded UiAutomation shell input, host smoke 8 assertions, runner awk component discovery and source/mutation guards. Exact head `49e4c1bee459dd0afb33d8bc0b3d2fc32de8cda2`; Android CI/Focus API29+36 workflows in progress.
- #656: imported #618 storage-safety changes into iCalendar branch; exact head `60ed05002237f172a9f9931390b024f5d30756ad`; Node 679/679, Android/contracts/device-test PASS; not merged.
- #662: merged #663 markup/test into webhook branch; exact head `4c3252ee5b303184d2e7cac07deb6a3f18d9f865`; Node 684/684, Android/contracts/device-test PASS; not merged.
- #665: tag-only signing-secret environment; exact head `530ba59607f944358f18f8bcd1f2881d9e0e8aaa`; Node 659/659, Android/contracts/device-test PASS; not merged.
- #666: storage-health read-unknown behavior; exact head `4ebb8256926ae9a3d3fb7ba774da4cc517add7ec`; Node 671/671, Android/contracts/device-test PASS; not merged.
- #657/#659/#664: current-main-based branch sync completed with exact-head CI green.
- #670: CSS/accessibility transplant; exact head `59e8825fa1c36b6329a5a1a27212f478c70c2b30`; Node 658/658, Android/contracts/device-test PASS; ready for review, not merged.
- #669: retired-namespace documentation guard failure fixed; preceding head passed Android/contracts/device-test; current snapshot refresh is the new pending docs change.
- #618/#637/#668 closed without merge; #604/#650/#655/#663 merged by concurrent automation. No PR merged by this run.
- Issues updated: #84, #160, #325, #348, #476, #603, #613, #636, #639, #640, #646.
- No production release, tag, version bump, signing-key change, application identity change, or destructive migration.

## Current execution queue refresh — 2026-11-09T11:39:14Z (main 1d29085)

Latest whole-project snapshot: [CURRENT_STATUS_20261109T113914Z.md](docs/CURRENT_STATUS_20261109T113914Z.md).

Current main: `1d29085b9c4f9ff3489711fd7e18cc88ab368767`. Root AGENTS: `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Open inventory: **10 PRs / 11 issues**.

### P0 — security and runtime acceptance
1. **#665 signing-secret isolation:** exact head `530ba59607f944358f18f8bcd1f2881d9e0e8aaa`, Node 659/659 and Android/contracts/device-test PASS. Current main PR/debug build logs show masked signing variables in the build-step environment; no exfiltration evidence. Independent security review required.
2. **#648 Focus Timer:** exact head `94dbcc05bcc7cda8adba201697389b30a3866222`, 73 ahead / 0 behind. The failed cross-UID file bridge is removed; bounded shell tap/swipe now runs via UiAutomation. Local host smoke: 11 assertions PASS. Exact-head Android/contracts/device/Focus API29+36 workflows in progress; no emulator pass claimed.
3. **#662 webhook:** exact head `4c3252ee5b303184d2e7cac07deb6a3f18d9f865`, Node 684/684 and Android/contracts/device-test PASS. Session-only endpoint and Web Locks replace merged #655 localStorage secret/lock behavior. Independent review required.
4. **#664 recovery:** exact head `fc104fd590d3a61deb02efc1808439cbda1c6d41`, Android/contracts/device-test PASS; independent review and physical/manual export acceptance pending.
5. **#160 physical Android/WebView/OEM acceptance:** APK artifacts are not physical-device tests.

### P1 — data integrity, extension, recurrence and integration
- #656 import/export: exact head `60ed05002237f172a9f9931390b024f5d30756ad`, Node 679/679 and Android/contracts/device-test PASS; independent review pending.
- #659 extension import trust: exact head `3e95f41c5cad12474345875b8078d75249154dc9`; Android/contracts/device acceptance/device-test PASS; independent review pending.
- #666 storage health: exact head `4ebb8256926ae9a3d3fb7ba774da4cc517add7ec`, Node 671/671 and Android/contracts/device-test PASS.
- #657 recurrence: exact head `0bf58040c9186de574c3e760e61f1bf0cedd04ad`; CI/non-publishing acceptance PASS; actual Doze/reboot/timezone/OEM delivery pending.
- #637 CSS/status index: 12 ahead / 22 behind, mergeable=false; rebase or replace without losing historical links.
- #669 documentation snapshot: prior head `feded2159121a3a6c178967572d41cd873a1be08` passed Android/contracts/device-test; refreshed snapshot commit requires new checks.

### P0 governance and release blockers
- #646: main protection disabled, rulesets empty, dedicated endpoint HTTP 403; require owner-side independent approvals and Android/contracts checks.
- Resolve application identity policy conflict between source/root AGENTS and user-mandated target; no identity change without explicit owner decision.
- v1.5 remains latest published; v1.4 draft. No release/tag/version/signing changes authorized.
- No physical-device tests claimed.

### Latest execution ledger
- #648: removed cross-UID file bridge after API29 EACCES; direct UiAutomation shell input, bounded command grammar/status parser, host smoke (11 assertions), runner and guard updated. Exact head `94dbcc05bcc7cda8adba201697389b30a3866222`; workflows in progress.
- #656: imported #618 storage-safety changes into iCalendar branch; exact head `60ed05002237f172a9f9931390b024f5d30756ad`; Node 679/679, Android/contracts/device-test PASS; not merged.
- #662: merged #663 markup/test into webhook branch; exact head `4c3252ee5b303184d2e7cac07deb6a3f18d9f865`; Node 684/684, Android/contracts/device-test PASS; not merged.
- #665: tag-only signing-secret environment; exact head `530ba59607f944358f18f8bcd1f2881d9e0e8aaa`; Node 659/659, Android/contracts/device-test PASS; not merged.
- #666: storage-health read-unknown behavior; exact head `4ebb8256926ae9a3d3fb7ba774da4cc517add7ec`; Node 671/671, Android/contracts/device-test PASS; not merged.
- #657/#659/#664: current-main-based branch sync completed with exact-head CI green.
- #669: initial retired-namespace documentation guard failure fixed; corrected prior head passed Android/contracts/device-test. This snapshot refresh is the new pending docs change.
- #618/#668 closed without merge; #604/#655/#663 merged by concurrent automation. No PR merged by this run.
- Issues updated: #84, #160, #476, #603, #613, #636, #639, #640.
- No production release, tag, version bump, signing-key change, application identity change, or destructive migration.

## Current execution queue refresh — 2026-11-09T11:21:40Z (main 1d29085)

Latest whole-project snapshot: [CURRENT_STATUS_20261109T112140Z.md](docs/CURRENT_STATUS_20261109T112140Z.md).

Current baseline:
- Main: `1d29085b9c4f9ff3489711fd7e18cc88ab368767`.
- Root AGENTS: `492ed21e2219a8d1b80c7d6e63575525c98a5a91`.
- 9 open PRs; 11 open issues.
- Main protection disabled; no rulesets; independent approvals absent on critical open PRs.
- Main SHA direct workflow lookup returned no post-merge runs for #663; current-main-based PR branches #656/#657/#659/#662/#664/#665/#666 have fresh exact-head green Android/contracts/device-test checks.

### P0 — immediate security and runtime acceptance
1. #665 signing-secret isolation: current-main PR debug-build job logs expose masked signing-secret environment variables to PR-controlled Gradle execution. #665 removes them from debug steps and gates secrets to tag release only. Exact head `530ba59607f944358f18f8bcd1f2881d9e0e8aaa`, Node 659/659 and Android/contracts/device-test PASS. Independent security review required.
2. #648/#613 Focus Timer: align instrumentation checkpoints and host runner with `com.abrar.daymark.test`; exact head `d3fcf751ae4fbd3dd42a7dcb4116c562274ad27b`; Android CI in progress, contracts/device-test pending, API 29/36 emulator lifecycle queued. Do not claim pass until logs verify.
3. #662 webhook: current main contains #655's localStorage endpoint/lock implementation. #662 replaces it with session-only endpoint state and Web Locks. Exact head `4c3252ee5b303184d2e7cac07deb6a3f18d9f865`, Node 684/684 and Android/contracts/device-test PASS; independent review required.
4. #664 recovery: independent Task/Focus backup reads, UNKNOWN state and byte preservation. Exact head `fc104fd590d3a61deb02efc1808439cbda1c6d41`; Android/contracts/device-test PASS; physical recovery acceptance pending.
5. #160 physical Android/WebView/OEM acceptance; APK artifacts are not device tests.

### P1 — integration and data integrity
- #656 import/export + RFC 5545: exact head `60ed05002237f172a9f9931390b024f5d30756ad`, Node 679/679 and Android/contracts/device-test PASS; independent review pending.
- #659 extension import trust: exact head `3e95f41c5cad12474345875b8078d75249154dc9`; Android/contracts/device acceptance/device-test PASS; independent review pending.
- #666 storage health: exact head `4ebb8256926ae9a3d3fb7ba774da4cc517add7ec`, Node 671/671 and Android/contracts/device-test PASS; review pending.
- #657 recurrence terminal-fire persistence: exact head `0bf58040c9186de574c3e760e61f1bf0cedd04ad`; CI and non-publishing acceptance PASS; real Doze/reboot/timezone notification acceptance pending.
- #637 CSS/status index: 12 ahead / 22 behind, mergeable=false; rebase or replace without losing historical status links.
- Synchronize only branches with non-conflicting paths; #662 already has a manual merge of #663's index/test markup.

### P0 governance / release blockers
- Enable main branch protection and independent PR approvals (#646).
- Resolve application ID policy conflict: source/root AGENTS says `com.abrar.daymark`; user safety instruction says `the user-mandated target identifier`. No identity change without explicit owner decision.
- Keep v1.5 as latest published; v1.4 remains draft. No release/tag/version/signing changes authorized.
- No physical device tests claimed.

### This run's delivery and integration log
- #656: imported #618's six code-file storage-safety changes into the current-main iCalendar branch; added quota/write-failure regression and updated ICS UI validation fixture. Exact head `60ed05002237f172a9f9931390b024f5d30756ad`; Node 679/679; Android/contracts/device-test PASS; not merged.
- #662: merged current main #663 task-editor/toast markup and its contract test into the webhook branch; exact head `4c3252ee5b303184d2e7cac07deb6a3f18d9f865`; Node 684/684; Android/contracts/device-test PASS; not merged.
- #665/#666/#657/#659/#664/#656: merged current main #663 commit into each non-conflicting branch using ordinary merge commits; all now 0 behind current main and fresh exact-head CI green.
- #648: corrected source-guard mutation markers for the host input bridge, aligned Java checkpoint/phase-log storage with instrumentation test context, runner preflight/poll and fake-adb tests to `com.abrar.daymark.test`. Exact head `d3fcf751ae4fbd3dd42a7dcb4116c562274ad27b`; workflows pending/in progress; not merged.
- #618 closed without merge after its code was transplanted into #656; stale status snapshots were not copied.
- #668 opened as a duplicate Focus branch and closed without merge to avoid overlapping instrumentation PRs; #648 remains canonical.
- #604 merged earlier; a mistaken closure statement was corrected on the PR.
- #663 merged by concurrent automation at 11:03Z; exact-head CI passed before merge; post-merge main run not returned.
- Issues updated: #84, #160, #476, #603, #613, #636, #639, #640.
- No PR merged by this run; no production release, tag, version bump, signing-key change, application ID change or destructive migration.

# Daymark Project Plan

Daymark should remain a fast, simple, privacy-first task app that works offline, while letting interested users reveal more capability through task-specific workspaces. Engineering is technology-agnostic: use any language or tool that demonstrably gives the best result for a component, as defined in the [technology-agnostic engineering policy](docs/TECHNOLOGY_AGNOSTIC_ENGINEERING.md). Language examples are not a whitelist or requirement. The ordinary task flow must not require users to learn about AI, models, plugins, terminals, or Android internals. Advanced tools should be optional, visible, modular where the distribution channel permits, and bounded by user-approved scopes.

**Status snapshot.** This document contains a staged roadmap, not proof that a feature is implemented. Verify live `main`, open PRs/issues, `android-app/app/build.gradle.kts`, and the [Releases page](https://github.com/AbrarulHaque8541/daymark/releases) before making implementation or publication claims. CI/build success does not establish physical-device behavior; device acceptance is tracked separately in issue #160.

## Current execution queue refresh — 2026-11-09T02:36Z

This priority order supersedes the historical **Execution queue (checked 2026-10-13)** below. Older entries remain as audit history; they are not current implementation or workflow claims. Recheck the live status index and exact PR heads before each action.

### P0 — User-data and real-device acceptance

1. **Complete the physical Android acceptance matrix — issue #160.** No physical device was tested in this refresh. Record model, Android API, WebView provider/version, build SHA, APK SHA, scenario and result. Cover browser navigation/renderer recovery, Reader Mode, extensions, downloads/SAF, encrypted task recovery, same-signer upgrade, TalkBack, and notifications. CI/APK verification is not device acceptance.
2. **Finish Focus Timer API 29/36 lifecycle qualification — issue #613 / PR #648.** Current head `007b755103cab21fe38241ad6877192184278716` is 6 ahead / 0 behind main. Android build/host checks, Focus UI, Ubuntu/Windows contracts, manual QA APK and device-test APK verification pass. API 29 passes; API 36 fails on run 6/10 after runs 1–5 pass, with an empty MotionEvent trace for the horizontal selector swipe (exact job 128949878323). The in-app `sendPointerSync` path remains intermittently unreliable on API 36. Next implementation should coordinate host-side `adb shell input swipe` with an instrumentation request/result checkpoint and fake-adb protocol tests. Keep ten consecutive runs and real MotionEvent/mode-state assertions; no retries or weakened tests. Parent ScrollView vertical-scroll behavior and physical-device acceptance remain separate.
3. **Keep browser downloads fail-closed until a redirect-validating transport exists — issue #348 / PR #648.** New WebView download requests are deliberately rejected; existing download history/open/cancel behavior is retained. Do not re-enable DownloadManager or claim download completion without an app-owned HTTPS/redirect/credential-safe transport and SAF device tests.

### P1 — Integrate and independently review security/data work

4. **Bounded API streaming plus resilient data cards — PR #649.** Current-main head `a80e24b157c5fff4a7414e351e6ae8533284545e` is 2 ahead / 0 behind. Android build, Ubuntu/Windows contracts and device-test APK verification pass; release publication was skipped. The canonical Node suite is **567/567**. All four providers use the shared bounded reader and now explicitly omit credentials/referrers, disable caching and reject redirects; provider tests assert the request policy. Independent security/data review remains required before merge.
5. **Webhook privacy and recovery integrity — issues #636/#639/#640, PR #643.** Latest head `24398124ea1478d9c4dfd1df59c4a9a7013fbb65` is 51 ahead / 0 behind. Exact-head Android build, Ubuntu/Windows contracts and device-test APK verification **PASS**; Node **584/584 PASS**; release publication skipped. Endpoint URLs are session-only; task/Focus backups are read independently; task completion persists before webhook notification; queue overflow preserves existing events and refuses new events; cross-tab locks fail closed without Web Locks. The latest commit also cancels unused webhook response bodies on success and HTTP error. Independent security/data-integrity review is pending; PR #643 overlaps storage-health PR #604 in shared storage files.
6. **Storage health and durable status index — issue #603 / PR #604.** Preserve unreadable keys as UNKNOWN, never treat read errors as absent, and keep partial clear/rollback outcomes truthful. PR #604 is 16 ahead / 13 behind current main; its old-head green checks are not current-main integration evidence. It owns `docs/AGENT_STATUS.md`; refresh that index and add a new dated snapshot without deleting historical links. PR #637 is 11 ahead / 3 behind and also touches the index; its CSS active/hover cascade and historical-link preservation findings remain open. Coordinate one combined owner-reviewed tree rather than overwriting either branch.
7. **Remove Node 20 action warnings — issue #84 / PR #645.** Exact head `0d673077f79903acda1c698c8bfcc53106b1934e` is 7 ahead / 0 behind; Android build, contracts, QA/device APK and API 29 Focus pass, while API 36 Focus fails on the Task Editor Cancel/IME visibility gate. PR #645 pins the PGP-verified immutable Gradle Actions v6.4.1 commit `8da46b539cd8fe6ab27ca75128919a18d757604c`; its exact Android job log shows no Node 20 warning for those Gradle actions. Current main still has the older pin until #645 integrates. Separate release-assets, production-release and SLSA provenance workflows retain legacy v4 action refs and need independent release-workflow review.
8. **Complete recurrence/reminder acceptance — issue #476.** The long-gap arithmetic catch-up and four-digit date boundaries are source-tested. Real AlarmManager delivery, Doze, reboot, timezone changes, OEM battery policy and physical notifications remain NOT TESTED.
9. **Review browser/extension/feed/desktop security — PRs #626, #627, #631 and #638; issue #348.** Their exact heads are current-main descendants and their reported Android/contracts/device-artifact or desktop matrix checks pass. Independent security review and physical browser/desktop qualification remain pending. System WebView is not a full Chrome/Firefox extension engine; do not overstate support.

### P2 — Measured platform expansion

10. **Cross-platform architecture — issue #325.** Keep Android as the current shipped target. Desktop browser policy CI is not proof of a packaged desktop task app or GUI/device behavior. Windows/Linux task shell and secure-storage acceptance remain experimental; HarmonyOS/OpenHarmony remains unqualified until an actual ArkTS/native adapter and device evidence exist.

### Current repository baseline (verified 2026-11-09)

- Main: `fbcf1253b18669d36d060b679e1821cf17a6f3a9`; 15 open PRs and 11 open issues at this snapshot.
- Source identity: `com.abrar.daymark`, versionName `1.6`, versionCode `13`, minSdk `26`, targetSdk `36`. A run-level safety instruction names a different legacy package identifier and conflicts with root AGENTS.md and live Gradle; no application identity change is authorized or made.
- Latest published release: v1.5; v1.4 remains draft. No release/tag was created in this refresh.
- Main reports `protected: false`; rulesets API returned an empty list and the protection-detail endpoint returned HTTP 403. See issue #646; no repository settings were changed.
- Physical-device acceptance: **NOT TESTED**.


## Execution queue (checked 2026-10-13)

This is the actionable priority order. A roadmap entry is not an implementation claim; move an item to **Done** only after source review and the stated checks. Recheck live issues and PRs before opening work so agents do not duplicate one another.

### P0 — Stabilize the current browser before adding features

1. **Browser load watchdog recovery — merged (PR #241); device verification pending.** The watchdog is present on current `main`. Preserve its bounded retry/error behavior and the approved HTTP/HTTPS browser policy; keep the updater and other app-owned network clients HTTPS-only. CI/source evidence is not a device result; use the live status index for current workflow evidence.
2. **Blank browser viewport — source issue closed; device acceptance still unverified.** [Issue #221](https://github.com/AbrarulHaque8541/daymark/issues/221) is closed as completed, but its latest discussion does not establish physical-device rendering evidence. Keep normal HTTPS page/search rendering in the runtime matrix tracked by issue #160; capture WebView version, Android API/device, visible lifecycle status, and redacted logcat when tested. CI is not device verification.
3. **Complete the Android runtime acceptance matrix.** Track [issue #160](https://github.com/AbrarulHaque8541/daymark/issues/160). Record PASS / FAIL / NOT TESTED by scenario, device/API, variant, commit SHA, and APK SHA. Cover browser navigation/renderer recovery, Reader Mode, image blocking, extensions, downloads/SAF, encrypted task data/backup restore, and same-signer upgrade. Never label a built APK as device-tested.
4. **Regression/security audit.** Run the repository's prescribed host/source tests and Android CI after each focused change. The owner-approved `com.abrar.daymark` application identity is now on `main` via merged PR [#286](https://github.com/AbrarulHaque8541/daymark/pull/286); keep it, the production signer pin, monotonic `versionCode`, the owner-approved HTTP/HTTPS browser policy (owner decision 2026-11-06; on-device HTTP runtime verification pending), HTTPS-only updater/other app clients, encrypted user data, and the no-broad-JavaScript-bridge boundary unchanged without explicit owner/security review. The identity reset is a separate install; do not promise automatic local-data migration.
   - *Historical host run, 2026-10-10 (branch `arena/2564f1a3-daymark`, base `477b347`):* `npm test` — **PASS** (12/12); browser-watchdog check — **PASS**; core Java tests — **NOT TESTED** because `javac` was unavailable in that run. The PR #243/#246 overlap note describes the queue at that time only; check the live status index instead of treating those PR states as current.

### P1 — First feature after P0 stability evidence

5. **Selected-text actions in the browser.** Inspect current source first and implement only missing actions. Candidate actions: Copy, Explain, Translate, Summarize, and Create Task. Keep actions in a contextual/overflow menu rather than permanently consuming viewport space. Copy and Create Task should work locally; Explain/Translate/Summarize must clearly open a user-selected provider or disclose the required API/network path. Do not imply that Daymark already has an AI backend. Acceptance: selection survives menu invocation, actions handle empty/long text safely, task creation is explicit, HTTPS/provider disclosure is preserved, and automated/source tests cover the action routing.
6. **Per-site browser preferences.** Only proceed after checking what global controls already exist. Candidate per-origin settings: Reader preference, image loading, and theme/font choice. Keep an explicit reset/clear path; store only the minimum origin-level state, explain that current browser history/preferences may not be encrypted, and do not claim network-level ad/tracker blocking. Acceptance: preference is origin-scoped, survives the documented lifecycle, resets cleanly, and does not affect unrelated sites.
7. **User-facing browser diagnostics mode (still planned).** PR [#291](https://github.com/AbrarulHaque8541/daymark/pull/291) merged privacy-safe WebView visual-state/lifecycle log breadcrumbs, but not a user-triggered diagnostics screen or export. If that UI is proposed, redact query strings/fragments and credentials; export must be opt-in. CI logs are not proof that issue #221 is fixed.

### P2 — Consider after the core browser and task flows are reliable

8. **Command palette / quick actions.** Search existing tasks and invoke existing actions from one compact UI. Reuse current task APIs; do not create a second task store or duplicate commands. Acceptance: keyboard and touch access, accessible labels, deterministic ordering, and existing task regression tests.
9. **Research-to-task workflow.** Let a user explicitly save selected page text/link as a task or note, with a preview before writing. Keep it local-first; external AI analysis is optional and clearly disclosed. Acceptance: user confirms saved content, URL sanitization, bounded text size, no silent background capture, and backup/restore compatibility.
10. **Local model/runtime discovery — official source survey completed (2026-10-12); selection remains open.** Do not implement, bundle, or auto-download a model. The [source review](android-app/ANDROID_SOURCES.md#official-source-refresh-2026-10-12) distinguishes AICore/ML Kit, llama.cpp plus GGUF, and LiteRT-LM; no universal compatibility or current model-size claim is supported. Choose nothing until the target device matrix, exact checkpoint/runtime licenses, RAM/storage/size, performance/thermal/battery behavior, removal, and user-started transfer are verified. Decide separately whether AICore's system-managed model delivery fits explicit-download requirements. Never silently cloud-fallback.

### Delivery rules for every queue item

- One focused change per branch/PR where practical; inspect open work before starting.
- State exact tests run and their result. Distinguish **SOURCE-VERIFIED**, **PASS**, **NOT TESTED**, **DEVICE VERIFIED**, and **PUBLISHED** accurately.
- Add a feature to **Done** only when its acceptance criteria are met; otherwise leave it **In review**, **Blocked**, or **Planned** with the relevant PR/issue link.
- Do not bundle speculative features into a browser bug fix. Do not create a release tag without owner approval or an existing standing release instruction.

## Historical status snapshot (verified 2026-10-26)

**Verified against live `main` on 2026-10-26:** `main` is `cac2d7524491a3fce488e57b5cf810dc7b5c5017`. Current Android source uses application ID `com.abrar.daymark`, version `1.5`/code `12`, `compileSdk = 36`, and `targetSdk = 36`; the toolchain is AGP 8.12.2 / Gradle 8.13. The latest published release is [v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5), whose tag points at the earlier commit `ca6453374c46a1449c8bbec09a27a218d127d8e4`. v1.4 remains a draft. See the [status index](docs/AGENT_STATUS.md) and the current [API 36 readiness note](API36_MIGRATION_READINESS.md); recheck live GitHub before acting.

Current `main` includes encrypted task and attachment storage, explicit encrypted portable backup/import, the HTTP+HTTPS embedded WebView, browser workspaces and page-local extensions, reminders, and local natural-language quick add. v1.5 added internationalized-domain navigation, expanded quick-add date parsing, stricter extension import caps, and reliable attachment-stream error propagation. It remains a deterministic/local-first app: there is no GGUF model, inference runtime, model downloader, Termux/CLI bridge, or cloud fallback. The model, runtime, shell/bridge, and broad plugin phases remain deferred.

Current-main Android CI [run 39934982721](https://github.com/AbrarulHaque8541/daymark/actions/runs/39934982721) and cross-platform contract [run 39934982786](https://github.com/AbrarulHaque8541/daymark/actions/runs/39934982786) passed on `cac2d75`. The v1.5 production workflow [run 39932829832](https://github.com/AbrarulHaque8541/daymark/actions/runs/39932829832) failed only in its final draft-release lookup after creating the draft; the artifact was independently verified and published separately, and merged PR #337 corrected the lookup for future runs. Workflow/emulator evidence is not physical-device evidence.

Open PRs at this snapshot are [#333](https://github.com/AbrarulHaque8541/daymark/pull/333) (reminder/attachment instrumentation), [#338](https://github.com/AbrarulHaque8541/daymark/pull/338) (native palette), and [#339](https://github.com/AbrarulHaque8541/daymark/pull/339) (home-scroll/composer behavior). Open issues include [#160](https://github.com/AbrarulHaque8541/daymark/issues/160) (runtime acceptance), [#221](https://github.com/AbrarulHaque8541/daymark/issues/221) (reported blank viewport), [#325](https://github.com/AbrarulHaque8541/daymark/issues/325) (cross-platform architecture), and [#340](https://github.com/AbrarulHaque8541/daymark/issues/340) (vacuous `test*UnitTest` tasks with no app `src/test` sources). PR #333 also edits the Android CI workflow, so any fix for issue #340 must coordinate with that active change.

Owner physical-device acceptance remains **NOT TESTED** for app installation/upgrade, Android 16 UI and Back behavior, WebView/provider behavior, Keystore/backup, TalkBack, reminders, and update flow. Follow issue #160 and record device/model, Android API, WebView provider/version where relevant, build SHA, APK SHA, scenario, and result. Source checks, CI, and emulator cold launches are not substitutes.

## Product direction and architecture

Keep the core task experience small and local. Let a task expand into a workspace only when the user chooses. Preserve the current minimal UI with progressive disclosure rather than putting agent controls on the default home screen.

Use a stable, provider-neutral capability interface between the task/workspace layer and optional tools. Each capability should declare its purpose, typed input/output schema, version, permissions, data scope, online/offline needs, risk, resource limits, cancellation behavior, and license/terms. A broker—not model-generated tool code—checks that a request is within the current task’s granted scope. Keep model, search, and tool adapters replaceable; do not hard-wire task storage or UI to one vendor.

The core tasks, local search, filters, and existing data access must work without a network connection. Optional web search, browsing, or a user-selected hosted model
 may need the network and must say so before use. **No feature requires cloud fallback.** A local model that is unavailable, too large, or out of memory should report that limitation; it must not silently send the prompt to a cloud provider.

## Capability map and feasibility matrix

| Capability | Status | Evidence status | Feasible scope and boundary |
|---|---|---|---|
| Core tasks: title, notes, subtasks, due date/time, priority, completion, search/filter/sort, templates, attachments, deterministic suggestions | **Current** | **Source confirmed; device acceptance remains separate** | Keep task edits local and available offline. Do not describe the existing rule-based demo suggestions as AI. Reminder timing/platform delivery remains best-effort and device-dependent; see [`docs/TASK_REMINDERS.md`](docs/TASK_REMINDERS.md). |
| Offline natural-language quick add | **Current** | **Source merged; parser smoke passed 16 assertions; device UX remains untested** | Only the single-line capture path parses supported dates/times, priorities, and `#tag` tokens; unknown words remain title text and the regular editor is unchanged. See [`docs/NL_QUICK_ADD.md`](docs/NL_QUICK_ADD.md). |
| Encrypted local task storage, attachments, portable backup | **Current** | **Source confirmed** in `main` via current source/merged PRs; **untested on device** for this review | Preserve atomic recovery, encrypted app-private data, explicit file selection, migration safety, and user-controlled portable restore. Avoid absolute “zero data loss” promises. |
| Suggestion-card actions/navigation | **Needs current-source verification** | **Older PR #15 reference is historical; no current implementation claim is made here** | Verify the live source and UI tests before treating suggestion-card navigation as implemented. Keep distinct from future additions; the ten-feature slate is not tracked in public `main`. |
| Offline timed reminders | **Implemented in source; device behavior unverified** | **Current-source checks/documentation; no device acceptance** | Reminder prompts and best-effort OS notifications are implemented. Permission, Doze, reboot, time-zone, revocation, and delivery timing remain device-dependent; do not describe timing as guaranteed. |
| Release updater | **Source enabled and signer-pinned; device flow unverified** | **v1.5 is the latest published release; current `main` is version 1.5/code 12 and targets API 36** | The [release-signing contract](RELEASE_SIGNING.md) and updater source describe the sideload updater and pinned certificate. The user-directed handoff saves a verified APK for manual opening, not app-launched installation. Google's developer-verification rollout does not initially apply to direct sideloads, but global expansion is planned for 2027; review package/signing-key registration before broader distribution. Real provider/process-death and update behavior remain unverified. |
| HTTP+HTTPS browser, Reader Mode, bookmarks, filterable tabs, and network-image preference | **Source present; device/network behavior unverified** | **Source/host/CI checks; no WebView runtime testing** | Browser networking starts Online by default (owner decision 2026-11-05); requested navigation still needs a tap. Reader Mode extracts bounded text; image blocking is not network-level ad/tracker filtering. History stores origins only and is not encrypted. Platform Safe Browsing may make separate network requests. |
| WebView visual-state diagnostics | **Source log breadcrumbs merged; user-facing diagnostics mode remains planned** | **PR #291 CI passed; not device render-validated** | The merged privacy-safe log path is distinct from a diagnostic screen/export. Do not claim the blank viewport is fixed until #221 records device evidence. |
| Other task additions (share-in, research capture, widget) | **Future work** | **No ten-feature slate tracked in public `main`** | Natural-language quick add is already implemented; do not duplicate it. Treat other proposals as unaccepted until the owner adds acceptance criteria to the live queue. |
| User-approved file workspace | **Later feasible** | **Not implemented as an agent workspace in main** | Begin with app-private task/workspace files and Android’s user-selected document access, not arbitrary filesystem access. |
| Local model manager and on-device inference | **Research required** | **No implementation observed in main** | Evaluate runtime compatibility, model license, download size, RAM/storage, CPU/GPU/NPU support, thermal/battery cost, startup latency, and deletion before selecting a model. Never auto-download a large model. |
| Hosted model/provider adapters | **Research required** | **No model API connected in current source** | First-party adapter boundary only after provider terms, privacy, retention, region, price/rate limits, and data disclosure are reviewed. Hosted use is explicit and optional; no cloud fallback. |
| Computer vision, OCR, speech, camera/microphone features | **Research required** | **No implementation observed in main** | Prefer user-selected images/files and on-device processing when practical. Request microphone/camera or media access only for a user-invoked feature. Android's general `SpeechRecognizer` implementation is likely to stream audio to remote servers; on-device recognition availability varies by device/service. Keep typing as a first-class alternative and clearly disclose any audio leaving the device before recording or sending it. See the [SpeechRecognizer API](https://developer.android.com/reference/android/speech/SpeechRecognizer). |
| Downloadable language/model/data assets | **Later feasible** | **Architecture proposal only** | Treat weights and content as data, not remotely injected application code. Show size, license/source, compatibility, integrity, storage use, and removal/update behavior; require a user choice. |
| Play dynamic feature delivery | **Android-limited** | **Official platform constraint** | Play Feature Delivery separates feature modules inside an Android App Bundle and delivers them through Google Play. It is not a module downloader for a GitHub-sideloaded APK. Do not remotely inject executable modules into the GitHub APK. Google Play’s [Device and Network Abuse policy](https://support.google.com/googleplay/android-developer/answer/16559646?hl=en) also restricts downloading executable code outside Play, subject to its stated interpreter/VM distinctions. |
| General plugin system | **Android-limited** | **Architecture proposal only** | Prefer vetted, in-process capabilities shipped in the app, or Play-delivered modules where the app is actually distributed as an eligible AAB. A “plugin” label does not grant arbitrary code execution or Android API access. |
| General-purpose terminal and coding environment | **Research required** | **No implementation observed in main** | A userspace runtime is not a Linux host, root shell, or kernel-isolated container. Bound filesystem, process, CPU, memory, battery, and network access; do not promise arbitrary package installation or full builds on low-end phones. |
| Single-agent task workspace, permission broker, visible activity, cancellation, rollback | **Later feasible** | **Architecture proposal only** | Start with one task-scoped agent and a small stable tool contract. Require visible actions, least-privilege scopes, cancellable foreground work, preview/snapshot for mutations, and user approval for sensitive or external effects. |
| Memory, diagnostics, and device adaptation | **Later feasible** | **Architecture proposal only** | Keep task/session/workspace memory separate and user-resettable. Bound resource use; collect only needed device capability signals; redact logs and make diagnostic export opt-in. |
| Session recording and multi-agent coordination | **Deferred** | **No implementation observed in main** | Reconsider only after single-agent isolation, deletion, consent, audit redaction, and resource limits have been validated. Do not record screens by default. |
| Arbitrary Android app cloning/virtualized app containers | **Deferred** | **No implementation observed in main** | Do not promise unrestricted app cloning. If useful, research a narrower web-app or task-workspace alternative under Android and Play constraints. |

## Task evolution and near-term scope

Extend the task model through small, versioned, reversible migrations, preserving existing IDs, encrypted storage, backups, and undo behavior. Offline natural-language quick add is now implemented in the single-line capture path; see [`docs/NL_QUICK_ADD.md`](docs/NL_QUICK_ADD.md). The older ten-feature slate remains untracked in public `main`; share-in, research capture, and widgets are proposals, not in-flight work. Keep the simple add/edit/complete flow prominent, and make richer fields discoverable only when the user expands a task.

For every task-data migration, test old snapshot reading, interrupted writes, backup export/import, missing or invalid fields, undo/delete interactions, and recovery after process death. Avoid silently rewriting an 
existing task when a template changes, a recurrence advances, or a task is restored.

## Local-first data, security, and permissions

Keep task content in app-controlled storage and encrypted at rest. Android Keystore key material is designed to remain non-exportable; treat it as device-scoped rather than as a portable backup key. For device migration, use a separate authenticated encrypted export/recovery flow that can be decrypted with user-held recovery material and re-encrypted under the destination device’s key. Test missing-key, damaged-archive, interrupted-import, and duplicate-import cases. See Android’s [Keystore guidance](https://developer.android.com/privacy-and-security/keystore), [app-specific storage guidance](https://developer.android.com/training/data-storage/app-specific), and [backup security recommendations](https://developer.android.com/privacy-and-security/risks/backup-best-practices).

Use Android’s narrow system pickers/intents for user-selected files and calendar handoff. Keep app-private workspace files separate from task records and external documents. A permission broker should record the capability, purpose, requesting task/tool, granted scope, lifetime, revocation path, and data exposed. Explain permission requests in context and ask only when the user invokes a feature that needs them.

Do not seek root, hidden APIs, privilege escalation, permission bypasses, or an AccessibilityService as a general agent-control channel. Google Play’s [AccessibilityService policy](https://support.google.com/googleplay/android-developer/answer/10964491?hl=en) prohibits autonomous initiation, planning, and execution through the Accessibility API outside its dedicated accessibility-tool exception. Use accessible controls in Daymark itself and explicit Android APIs/intents for allowed handoffs. Background work must respect Android process, Doze, and battery limits; no permanent invisible agent loop or broad battery-optimization exemption is part of the design.

## Reminder-specific Android constraints

Historical reminder implementation references (PR #17/#19 in the old PR #15 stack) are not current live-queue evidence. Recheck the current source and live PR/issue state before claiming reminder implementation. Any reminder design must disclose platform limits:

- Android 13 (API 33) and later requires the `POST_NOTIFICATIONS` runtime permission for ordinary notifications. Ask in context when the user creates a reminder; if permission is denied or later revoked, state that no notification can be shown. See [notification runtime permission](https://developer.android.com/develop/ui/views/notifications/notification-permission).
- Prefer inexact alarms when exact timing is not essential. Exact scheduling is special access through `SCHEDULE_EXACT_ALARM` on relevant versions; request it only when the user explicitly chooses a precise reminder and explain that access can be denied/revoked. Do not assume `USE_EXACT_ALARM` is available to a general task app. See [exact-alarm access](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms) and [alarm scheduling](https://developer.android.com/develop/background-work/services/alarms).
- Alarms do not survive shutdown by default. Persist reminder intent and, only while reminders exist, reconstruct eligible alarms after boot and on wall-clock/time-zone changes. Android documents `BOOT_COMPLETED`, `TIME_SET`, and `TIMEZONE_CHANGED` cases in its [broadcast guidance](https://developer.android.com/develop/background-work/background-tasks/broadcasts/broadcast-exceptions).
- Calendar-style reminders need a defined local-time and timezone policy. Daylight-saving transitions can make a local time nonexistent (a gap) or ambiguous (an overlap with two offsets); choose and test a clear policy rather than silently guessing. Relative timers should use elapsed-time semantics where appropriate. See the [Java `ZoneRules` reference](https://docs.oracle.com/javase/8/docs/api/java/time/zone/ZoneRules.html).
- Doze defers ordinary alarms and background activity; even allow-while-idle alarm calls are constrained. Inexact notification timing can be late, so never promise exact delivery on every device. See [Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby).

The PR #15/#17/#19 stack described in the original planning snapshot is historical, not the current open PR queue. Recheck the current issue tracker before planning reminder work. No reminder device/emulator acceptance is established by this plan.

## Browser, models, providers, and terms

Keep the merged WebView inside Daymark’s own controlled browser. The owner-approved durable policy allows deliberate HTTP and HTTPS browsing, labels HTTP as **Not encrypted**, keeps the updater and other app-owned network clients HTTPS-only, and forbids a JavaScript-to-native bridge for untrusted content, form automation, background page loads, or control of the user’s other browser. Fresh installs now start Online by default; each Go/search/site navigation still requires a tap, and a saved Offline choice fails closed until the user accepts **Enable Online**. The owner-approved 2026-11-06 change aligns source, manifest, and UI: cleartext is enabled, redirect downgrades follow mainstream-browser behavior, and HTTP pages are labelled **Not encrypted**. On-device HTTP loading and the visible label are not yet device-verified under issue #348, so do not claim device-verified HTTP support until those tests pass. Clearly distinguish “Daymark page/resource loads are blocked” from “the device makes no network requests.” Chromium’s [Android WebView Safe Browsing implementation note](https://chromium.googlesource.com/chromium/src.git/+/refs/heads/main/android_webview/browser/safe_browsing/README.md) documents version-dependent checks: before WebView M126, V4 uses a periodically updated local blocklist and, on a local prefix match, requests matching full hashes; from M126, V5 real-time checks send a partial URL hash through a proxy, when that path is available and enabled. The full-URL real-time lookup mechanism is not currently supported in Android WebView. These checks are navigation-related; do not assume a URL blocked by Daymark’s Offline-mode policy necessarily triggers one. The live-check path depends on WebView version, device implementation, and user/system settings; it has not been measured for Daymark, so do not promise zero network traffic. WebView usage statistics and crash reports are separate: Android says diagnostics depend on user settings/consent and do not include URLs. See [WebView management](https://developer.android.com/develop/ui/views/layout/webapps/managing-webview) and [WebView reporting privacy](https://developer.android.com/develop/ui/views/layout/webapps/webview-privacy). Keep Safe Browsing on by default unless a deliberate, user-visible choice and security review justify otherwise.

Browser history contains at most 50 validated HTTP/HTTPS origins in app-private preferences; it is not encrypted and does not retain page paths, queries, fragments, credentials, or titles. Clearing browser data clears Daymark’s history and WebView-managed site data, not other apps’ browser/autofill data or remote site/provider logs. A query or requested URL and ordinary connection metadata go to its selected destination; pages may contact their own or third-party endpoints.

A future Model Manager should show model identity, license, source, capabilities, context limits, download size, approximate storage/RAM demand, and removal/update controls before download. A provider adapter must show whether a request leaves the device, what content is sent, relevant provider terms/retention, and cost or rate limits before the user opts in. Never imply local and hosted models have identical privacy or costs; never fall back to a hosted provider without a separate user choice. Review third-party SDK terms, code, and license compatibility before adopting them.

## Agent workspace, approvals, audit, and recovery

Keep each workspace scoped to a task and expose a structured capability list rather than arbitrary device control. Every tool should have a typed contract, permission declaration, risk tier, resource/time limits, cancellation behavior, and bounded output. A model proposes tool calls; application code validates parameters and permission scope before execution.

Use proportionate approvals: local read/search can normally proceed within the task scope; creating or editing workspace files should be previewable and recoverable; deleting data, exporting/sharing it, accessing sensitive device resources, installing software, or causing an external/irreversible effect requires explicit approval at the point of action. Keep a visible activity timeline with the current action and target. Redact secrets and task text from diagnostic logs by default. Provide pause/cancel for long work and undo/snapshot/rollback for changes the app controls. Clearly state that rollback cannot undo an external effect already completed.

Use task, workspace, and session memory as separate stores with user-visible inspection, deletion, and reset. Recording should be opt-in, narrowly scoped, and redact sensitive content; defer it until retention and access controls are designed. Multi-agent coordination should wait until per-task capability grants and shared-workspace boundaries are tested.

## Release and verification gates

Separate these evidence levels in every release note and handoff:

1. Source inspection or source-contract tests.
2. Host/JDK tests.
3. Compile-only checks, with the exact API level and toolchain stated.
4. Gradle build/APK assembly and artifact/signature verification.
5. Emulator tests.
6. Real-device testing across relevant Android versions and at least representative vendor power-management behavior.

A passing source script is not a Gradle build; an API 35 build is not an API 36 build; neither proves device behavior. The repository does not track APK/AAB release binaries. Main Android CI runs automated checks and builds debug variants; the exact-tag production workflow builds, signs, and verifies the release APK/AAB before publication. Releases and assets are listed on the Releases page. No emulator or real device was tested during this audit.

Google Play's published guidance requires ordinary mobile new submissions and updates to target Android 16 / API 36 or higher from 2026-08-31, subject to exceptions. This is a **conditional Play-submission requirement**, not a blanket requirement for local review or GitHub sideloading. See [Google Play's target API requirement](https://developer.android.com/google/play/requirements/target-sdk). Current `main` uses API 36 with AGP 8.12.2 / Gradle 8.13; the toolchain and release-workflow SDK gates are merged. Neither a successful build nor targeting API 36 proves runtime/device behavior. Keep Android 16 device acceptance and exact signed-artifact verification before any Play submission.

Before any production release, verify signing/release provenance, backup restore and upgrade migration, permissions and revocation, file-provider recovery, offline behavior, low-storage/resource limits, accessibility, and device behavior. Keep debug artifacts clearly labeled and do not call a build production-ready without the relevant signing, release, and device evidence.

## Staged roadmap

1. **Protect the current core.** Reconcile README claims with current source and release artifacts; preserve task data, encryption, undo, backup, and the minimal UI. Recheck live issue/PR status before each implementation change.
2. **Verify merged network-facing features.** The updater and WebView from PRs #12/#13 are in `main`; confirm the fail-closed updater gate, signer configuration, HTTPS/network controls, Safe Browsing disclosures, history handling, and device behavior before enabling or promoting them. Issue #14 is closed, but real provider/process-death recovery still needs validation. Separately recheck reminder implementation and current issues against live `main`; do not infer current status from the historical PR #15/#19 stack. Keep suggestion navigation distinct from reminder work and require device evidence before describing reminders as reliable.
3. **Reconcile remaining capture/research proposals.** NL quick add is implemented on `main` via PR #292; do not duplicate it. Share-in, research-to-task, and widget ideas remain proposals until the owner adds them to the live queue with acceptance criteria. Keep each migration reversible and offline-first.
4. 
**Design the agent foundation.** Define the task-scoped workspace, capability schemas, permission broker, local audit trail, cancellation, and rollback before connecting a model.
5. **Research optional runtimes.** Evaluate model weights, browser, OCR/speech, user-space terminal, coding tools, and any plugin mechanism against device budgets, policy, license, and maintenance cost before committing to a delivery design.
6. **Defer high-risk breadth.** Do not start arbitrary app containers, unrestricted multi-agent control, persistent background autonomy, or screen recording until the narrower single-agent workspace is proven safe and useful.

## Deferred capabilities

Defer arbitrary Android app cloning, unrestricted cross-app automation, root-like control, remote executable plugin/module injection, silent model downloads, cloud fallback, background autonomous agents, default screen recording, and broad multi-agent access. These are not necessary to make the local task core useful and carry platform, privacy, resource, or maintenance costs that are not justified by the current evidence.

## AI handoff rules

A future contributor or AI agent should read [AGENTS.md](AGENTS.md), the [technology-agnostic engineering policy](docs/TECHNOLOGY_AGNOSTIC_ENGINEERING.md), and this plan and the [README](https://github.com/AbrarulHaque8541/daymark/blob/main/README.md), then recheck the live `main` SHA, relevant open issues/PRs, current source, and release artifacts before proposing work. Verify every assumption against the checked-out implementation; do not duplicate merged or in-flight work. Never expose secrets, private chat/audit history, personal emails, or unrelated local workspace details in public documentation.

Preserve user data and the minimal core; use small, reversible, modular changes with tests. Make a recoverable snapshot before risky mutations. Do not bypass Android security or claim an API/device test that was not performed on that API/device. Report source checks, host tests, API-level compile/build results, APK/release status, and device tests as separate 
evidence. Keep user approvals, permission scopes, provider/network choices, and cancellation explicit. Recheck exact branch and PR heads because public status may have changed since this draft was written.

---

## Plan expansion (master architecture addendum)

> Added 2026-10-08 (UTC) after re-audit against the master product vision. This part extends the plan above without replacing any of it. Sections map the vision's required topic list that the base plan did not yet cover in detail.

### Modular download-on-demand system

The base APK stays minimal; every capability beyond the core is an installable **module**. Nothing is bundled "just in case."

**Module manifest (signed index entry):**

```json
{
  "id": "lang.ur",
  "version": "1.0.0",
  "coreCompat": ">=2.0 <3",
  "type": "data",
  "sizeBytes": 4400000,
  "minRamMb": 0,
  "sha256": "…",
  "signature": "ed25519(daymark-release-key)",
  "license": "string-resources license",
  "deps": [],
  "uninstallable": true,
  "offlineCapable": true
}
```

**Lifecycle:** discover → verify signature + hash → compatibility check (RAM/storage/ABI/SDK) → explicit user consent (size shown) → resumable download → re-verify → install → update → rollback to previous version → uninstall. The previous version is kept until the new one verifies; removal never breaks the core app.

**Phase order:** data-only modules first (language packs such as Urdu/Hindi, model weights, prompt packs). Code-bearing modules (DexClassLoader) are RESEARCH REQUIRED and security-gated; no promise is made until a signed, sandboxed design is reviewed.

### Model Manager

A registry of open-source, redistributable model candidates with metadata: size, quantization, minimum RAM, context length, capabilities, license. The manager profiles the device (ActivityManager memory class, ABI, free storage, SDK level) and classifies it low/mid/high end, then **recommends** matching quantized models (for example 0.5B–1B q4 for low-end). It never downloads without explicit consent showing size and RAM cost. Lifecycle: download → verify → smoke-test prompt → activate/switch → update → remove. Low-end devices cap concurrent models at one.

### Standard tool interface and capability discovery

Every agent-facing tool exposes a predictable schema: `name, description, input_schema, output_schema, permissions, risk_level, timeout, cancellation, error_codes`. A small model learns WHAT a tool does and HOW to call it — never Android internals. `agent.capabilities()` returns a structured availability report (browser available, terminal installed, python not-installed, microphone denied) so quantized models can reason reliably. The Java implementation may change; this interface is the stability contract.

### Search provider abstraction

No hard-coded provider. A `SearchProvider` interface (query in, ranked structured results out) with user-selectable implementations. Feasibility: API-key providers are READY; scraping-based providers are ToS/fragility-limited and RESEARCH. Offline searches honestly report "network required."

### Risk levels and confirmation policy

- LOW (no prompt): read, search, analyze inside the workspace.
- MEDIUM (configurable): create/edit workspace files, download modules, modify workspace state.
- HIGH (always confirm): delete, install software, external messages, data sharing, sensitive resources, irreversible operations.

Users can configure policies per level; the Permission Broker enforces and audits every decision.

### Memory layers

Scoped and user-clearable: task memory, workspace memory, session memory, user-approved preferences, project memory, tool memory, model context. Agents read/write only within granted scope; each layer has explicit deletion controls. No ambient cross-scope access.

### Update channels

Separate channels for CORE APP, MODULES, MODELS, PLUGINS, TOOLS — each with version, integrity verification, compatibility check, rollback strategy, and update history. New capability never grows the base APK.

### Explicitly not feasible / deferred (unchanged)

- Arbitrary Android app cloning/containers: NOT FEASIBLE under modern Android security; PWAs and sandboxed web workspaces are the alternative.
- Full Linux terminal on low-end devices: DEFERRED pending a restricted-shell research spike.
- Python bundling (~30–60 MB): ANDROID-LIMITED, download-on-demand only if the module system proves code-module safety.

---

## Suggested features — proposal only (not accepted, not implemented)

> Added 2026-10-10 (UTC). These are **suggestions**, not queue items and not implementation claims. Each one needs an owner decision and an entry in the execution queue (with acceptance criteria) before any work starts. "Verified absent" means a grep of the current branch found no matching code; it is not a device or product-usage finding.

Assumed user profile: a developer who uses Daymark for personal task tracking alongside GitHub work, values speed and privacy, and wants capture without leaving the current app. Adjust this table once the owner states the real use case.

| # | Suggestion | Why it helps this profile | Current code (checked 2026-10-10) | Fit with plan |
|---|---|---|---|---|
| S1 | **Inbound share target**: "Share to Daymark" creates a task from shared text or URL | Capture a GitHub issue link or a snippet from any app in one step | **Verified absent**: no `ACTION_SEND` / share `intent-filter` in `AndroidManifest.xml`; only outbound browser-URL share exists | Fits the "quick capture" direction. Keep it local; prefill the title only, never auto-save |
| S2 | **Task link field** for an issue/PR/doc URL, HTTPS-only, with one-tap open in the in-app browser | Ties a task to its GitHub item without copy-paste | Not verified; existing `notes` field can hold a URL but has no link semantics | Must reuse HTTPS-only policy in `BrowserAddress`; migration needs old-snapshot and backup tests (plan §Task evolution) |
| S3 | **Home-screen widget** showing today's open tasks, with a quick-add button | Fastest daily check without opening the app | **Verified absent**: no `appwidget` declarations in the manifest | Needs a new receiver and must read the encrypted store safely. Consider after the P0 device matrix (#160), because a widget adds a new process-death/locked-device path |
| S4 | **Plain-text / Markdown export** (opt-in, user-chosen file) for personal notes or a git repo | Developers often want tasks in a diffable format | Not verified. Current portable backup is encrypted, which is correct for backups but not for reading | Must clearly warn that plaintext leaves encryption. Opt-in only; no automatic writes |
| S5 | **Keyboard and hardware-keyboard shortcuts** (new task, search, complete, next/previous task) | Power users on tablets or Bluetooth keyboards | Partially: keyboard-related code exists in Android sources, but a shortcut map was not verified | Folds into P2 #8 (command palette). Do not build a second command system |
| S6 | **Focus timer on a task** (local, no network, no notifications by default) | Time-boxing dev work | Not verified | Low risk. Must respect Doze and battery limits; any notification uses the existing reminder rules |
| S7 | **Diagnostics export for bug reports** (WebView version, last load error code, redacted URL) | Makes issue #221-style reports actionable | User-facing screen/export remains planned; privacy-safe lifecycle logs are in source | Already a proposal; logs do not provide an owner-visible export or prove the viewport renders |

**Already present in code, so not suggested as new work:** recurrence (`TaskLogic`, `Task`), subtasks (`Subtask.java`), notes, due time with reminder lead time (`Task.java`), task templates, encrypted backup and import, attachments with a CSV/Markdown/PDF MIME allow-list, Reader Mode, and dark theme. The plan's older text saying time-of-day and notes are absent is out of date for those fields. Update the capability table when the owner confirms them on a device.

**Recommended order if the owner approves:** S1 (small, offline, clear value) → S2 (needs a migration test) → S4 (privacy-sensitive, so design first) → S5 (after P2 #8 is designed) → S3 and S6 (after device evidence for #160). S7 remains a proposal for a user-facing diagnostics/export flow; privacy-safe lifecycle logs are already in source but do not fulfill that UI proposal.

**Decision needed from the owner:** (a) which of S1–S7 to queue; (b) the real day-to-day use case, so the profile above can be corrected.


---
Current-source refresh:
Work by: Cue
Model: not disclosed by runtime
Tooling: GitHub connector CLI, git, local source/workflow/documentation review
Timestamp (UTC): 2026-10-13T14:42:14Z


## Current-source refresh — 2026-11-09 (updates to the 2026-10-10 suggestion table)

The suggestion table above is historical as of 2026-10-10; these two entries are no longer “verified absent” or “not verified”:

- **S1 Inbound share target:** implemented and merged via PR #635. Shared text/URLs enter the task capture flow; line-ending normalization is covered by source/host tests. Physical share-sheet acceptance across third-party apps remains pending issue #160.
- **S6 Focus timer on a task:** the Focus Timer exists in current source. Its gesture/IME/instrumentation integration is under PR #648; API 29/API 36 emulator completion and physical acceptance are still pending. Do not describe the timer as device-verified.

Other suggestions remain proposals unless their acceptance criteria are added to the live execution queue. This refresh does not silently accept or implement S2/S3/S4/S5/S7.

Work by: ChatGPT (OpenAI)  
Model: GPT-6  
Tooling: GitHub connector via Code Mode; live main/PR/issue/Actions/release/source inspection  
Timestamp (UTC): 2026-11-09T02:36:57.068Z
