# Daymark whole-repository status — 2026-11-09T12:58:13Z

## Repository baseline

- Repository: `AbrarulHaque8541/daymark`
- Default branch: `main`
- Current main SHA: `8d76584bc07ed06388e46de8dd11bd39d7250d3a`
- Root `AGENTS.md` SHA: `492ed21e2219a8d1b80c7d6e63575525c98a5a91`
- Main post-merge Android CI: run [42617732358](https://github.com/AbrarulHaque8541/daymark/actions/runs/42617732358) — PASS.
- Main post-merge Ubuntu/Windows contracts: run [42617732347](https://github.com/AbrarulHaque8541/daymark/actions/runs/42617732347) — PASS.
- Live inventory: **9 open PRs, 12 open issues**.
- Every open PR compares as **0 commits behind current main**; current-head ahead counts are listed below.
- Physical-device acceptance remains **NOT TESTED**.

## Recent merged work

- #673 — path-safe nightly placeholder exclusions.
- #672 — VTODO placeholder false-positive guard.
- #657 — recurrence terminal-fire behavior.
- #670 — CSS press feedback and reduced-motion behavior.
- #663 — webhook automation-card markup contract.
- #655 — webhook automation UI/queue implementation (subsequent review found security/data-loss defects; see below).
- #650 — project-plan refresh.
- #604 — storage-health/status-index work.

The #657, #670, #672 and #673 merges were performed by concurrent repository automation, not by this run. Their reported exact-head checks passed, but independent approvals were absent. Merge events are not counted as physical acceptance.

## Open PR inventory — exact current heads

| PR | Area | Head SHA | Ahead / behind current main | State | Exact-head checks |
|---|---|---|---:|---|---|
| #648 | Focus Timer + browser downloads | `762f551d467ef43a6ea4fd6822fbf0979928c24b` | 131 / 0 | DRAFT | No workflows returned for latest head; previous head failed vertical-scroll acceptance |
| #656 | iCalendar import/export semantics | `ae38db6e8ea8e13a4c65983e0aec40056e38ee54` | 31 / 0 | Ready | Android, Ubuntu/Windows, device APK PASS |
| #659 | Extension trust/storage | `3ae856f76d2af17457bf943ef23e68405e7d17a0` | 18 / 0 | DRAFT | Android, Ubuntu/Windows, device acceptance/APK PASS |
| #662 | Webhook session privacy/queue | `506246c60b7ed061e0c4375df5cf8f5fd064f292` | 13 / 0 | DRAFT | Android, Ubuntu/Windows, device acceptance/APK PASS |
| #664 | Independent recovery backup reads | `cb30fe49f8a6c325d4ccd9630f90d0c5e4cc76c8` | 12 / 0 | DRAFT | Android, Ubuntu/Windows, device acceptance/APK PASS |
| #665 | Signing-secret isolation + Node 24 release workflows | `87fd649516d1d2a16d34063661506b014697255c` | 10 / 0 | Ready | Android, Ubuntu/Windows, device APK PASS |
| #666 | Storage-health unknown/fail-closed handling | `a9c633f8d0ae9c0af01ce9eedc1344d0400a04f8` | 29 / 0 | DRAFT | Android, Ubuntu/Windows, device APK PASS |
| #669 | Status index and whole-project snapshot | `e2352780752bca2f87d3f2fc66b784c9aa22933b` | 16 / 0 | Ready | Android, Ubuntu/Windows, device APK PASS before this snapshot update |
| #674 | Corrective cleanup of accidental main files | `e022591340e1dc4ed95df5f0ab15231f59591ded` | 6 / 0 | Ready | Android, Ubuntu/Windows, device APK and device-acceptance artifact PASS |

PR #656, #659, #662, #664, #665, #666 and #669 were synchronized to current main using normal two-parent merge commits and expected-head ref updates. No force push was used. Their latest exact-head CI checks passed after synchronization.

## Focus Timer — highest active Android defect

PR #648 now uses `UiAutomation.adoptShellPermissionIdentity("android.permission.INJECT_EVENTS")` and `UiAutomation.injectInputEvent` on API 29+, dropping adopted identity in `finally`; pre-29 retains `sendPointerSync`. The earlier shell-command input bridge was removed.

A pure-Java `PlatformTouchSequence` builder generates bounded DOWN/MOVE/UP samples. It rejects non-finite/out-of-range coordinates and swipe durations below 9 ms so eight MOVE samples have strictly increasing timestamps. Host smoke: **35 assertions PASS locally**.

The latest completed API29/API36 run on the preceding head passed taps and horizontal mode selection but failed vertical parent-scroll acceptance: `canScrollDown=true`, yet parent `scrollY` remained `0 → 0`. The latest head adds:
- ModeSelector parent-interception release on ACTION_DOWN before direction is known.
- Temporary touch traces on ModeSelector descendants and the parent Tasks ScrollView.
- Separate assertions that the parent receives ACTION_MOVE and that scrollY changes in the expected direction.
- Existing API36 ten-run gate retained.

Latest head `762f551d...` has **no current-head Actions run returned yet**. No pass is claimed. Issue #613 tracks this. Physical-device Focus acceptance remains NOT TESTED.

Browser downloads remain fail-closed pending a safe redirect-validating app-owned transport. Issue #671 tracks the follow-up.

## Security and data-integrity priorities

### PR #665 — signing-secret isolation

The current main release-assets workflow previously passed production signing-secret environment variables to a PR/debug Gradle build step, even though that step selected unsigned debug variants. There is no evidence of exfiltration. PR #665 separates unsigned PR builds from tag-only signed release builds and keeps secrets inside the tag-gated step. Exact-head checks pass; independent security review is still required. Until merged, main retains the exposure risk.

### PR #662 — webhook privacy and queue integrity

The safer branch uses session-only endpoint secrets, Web Locks, fail-closed coordination, queue re-read/acknowledgement, overflow refusal and persist-before-notify ordering. Delivery remains at-least-once: a successful POST followed by failed acknowledgement can cause a duplicate.

Merged PR #655's current-main implementation is unsafe: endpoint URLs persist in localStorage, its localStorage lock is not atomic, the queue is removed before POST, unreadable storage can be treated as empty, and overflow can silently drop older events. The safe UI path is to port #655's automation-card/Clear-queue markup into #662, not its storage/locking implementation. Issues #636 and #639 track this.

### PR #664 and #666 — recovery/storage

PR #664 independently inspects task and Focus backups and preserves readable bytes when the other backup is unreadable. PR #666 improves storage-health handling for unknown/unreadable states. Both exact-head CI suites pass; manual export/recovery acceptance remains pending.

### PR #659 — extension import trust

The branch rejects oversized files instead of truncating, distinguishes I/O failures from parse errors, preserves unreadable existing extension paths, and keeps newly imported packs disabled until explicit activation. Exact-head checks pass; independent security review and real browser acceptance remain pending.

### PR #656 — iCalendar semantics

The branch preserves RFC 5545 comma-only CATEGORIES splitting, repeated properties, escaped commas and semicolons; validates VTODO completion metadata; and discloses unsupported timezone/seconds precision. Exact-head Android/Node/contracts/device APK checks pass. Calendar-provider acceptance remains NOT TESTED.

## Corrective governance PR #674 — accidental default-branch files

During this automation run, three Focus helper/test files were accidentally created directly on `main` because a GitHub create-file call omitted its branch argument:
- `android-app/app/src/androidTest/java/com/abrar/daymark/PlatformTouchSequence.java`
- `android-app/tools/PlatformTouchSequenceSmoke.java`
- `android-app/tools/run-platform-instrumentation-touch-sequence-tests.sh`

These files do not change app runtime behavior. This was a delivery-governance error; it is not counted as reviewed PR work. Draft/ready cleanup PR #674 removes exactly these three files. The actual implementation and tests are carried on #648. #674 is synchronized to main and its Android, Ubuntu/Windows, device APK and device-acceptance artifact workflows pass. It remains unmerged pending independent review.

## Open issues

`#84, #160, #325, #348, #476, #603, #613, #636, #639, #640, #646, #671`

- #84 — remaining Node 20 action/SLSA dependency.
- #160 — physical Android/browser acceptance.
- #325 — cross-platform architecture and package identity.
- #348 — browser reliability.
- #476 — actual AlarmManager/Doze/reboot/timezone reminder delivery.
- #603 — storage health.
- #613 — Focus Timer API29/36 gesture and vertical-scroll stability.
- #636 — webhook endpoint secret privacy.
- #639 — webhook cross-tab queue consistency.
- #640 — recovery backup availability.
- #646 — main branch governance.
- #671 — safe browser download transport.

## Governance, identity and release state

- GitHub reports `main.protected=false`; repository rulesets are empty. Dedicated branch-protection details returned HTTP 403.
- Independent approvals are absent on the current active PR set; several recent concurrent merges (#657/#670/#672/#673) also occurred without independent review. No merge was performed by this run.
- Required owner-side controls: independent PR approval, required Android CI and Ubuntu/Windows contracts, resolved conversations, blocked force-push/deletion.
- Root `AGENTS.md` and Gradle source specify `com.abrar.daymark`; the run-level safety instruction specifies `com.cue.daymark`. No applicationId/namespace/package/signing migration was performed. Owner reconciliation is required.
- Published release: v1.5. Draft release: v1.4.
- No release, tag, version bump, signing-key change or destructive migration.
- Physical Android/desktop/browser-extension acceptance: NOT TESTED.

## Next prioritized work

1. P0 — resolve #648 vertical ScrollView handoff using the new parent/selector traces; obtain current-head Android/API29/API36 CI.
2. P0 — independent security review and integration of #665 signing-secret isolation.
3. P0 — integrate #662 safe webhook implementation with #655 UI; never carry forward localStorage endpoint/lock/remove-before-POST behavior.
4. P0 — independent review and merge readiness for #674 cleanup.
5. P1 — complete #659 extension import review and #664/#666 storage/recovery integration.
6. P1 — verify #656 calendar semantics with provider/device acceptance.
7. P1 — finish Node 24 migration and resolve trusted SLSA Node 20 dependency (#84).
8. P0 — physical Android/browser acceptance (#160); reminder Doze/reboot/timezone testing (#476).
9. P1 — enforce main branch protection and independent reviews (#646).
10. P1 — maintain current status index and project-plan history through #669.

## Run ledger

- New PR opened this run: #674 corrective cleanup.
- New Focus code/tests pushed to existing PR #648; latest head `762f551d...`. Host smoke 35 assertions PASS; current-head CI not yet returned.
- Seven other active branches synchronized to current main with normal merge commits; their exact-head Android/contracts/device checks PASS.
- #657/#670/#672/#673 merged by concurrent automation, not by this run.
- PRs merged by this run: 0.
- Production releases/tags: 0.
- Physical-device tests: 0.
