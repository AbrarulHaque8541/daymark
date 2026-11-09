# Daymark whole-project engineering status — 2026-11-09T12:00:49Z

## Repository baseline

- Repository: `AbrarulHaque8541/daymark`
- Default branch: `main`
- Main SHA: `1d29085b9c4f9ff3489711fd7e18cc88ab368767`
- Root `AGENTS.md` SHA: `492ed21e2219a8d1b80c7d6e63575525c98a5a91` (read in full for this run)
- Main branch protection: `protected=false`; rulesets listing empty; dedicated protection endpoint returned HTTP 403.
- Main SHA direct workflow lookup returned no runs. The immediately preceding merged PR #663 had successful exact-head Android CI, Ubuntu/Windows contracts and device-test APK checks; no post-merge run was returned for the merge SHA.

## Recent integration events

- PR #663 — task-editor/toast markup contract — merged at 2026-11-09T11:03:22Z. Exact head `d22b843f131ba503bcec365f7101b48064c0fa7e`; Android CI, Ubuntu/Windows contracts and device-test APK workflows PASS. Merge is present in main `1d29085`; post-merge workflow run not returned.
- PR #655 — webhook automation card — merged at approximately 08:44Z. Its localStorage endpoint/lock implementation is now in main; this leaves a security/data-integrity exposure until #662 is independently reviewed and integrated.
- PR #604 — storage-health/status-index work — merged at 08:43:04Z with merge commit `0d1f47f1a9ad1086094f3c92a106c0e49f994993`. My earlier comment incorrectly described it as closed without merge; I posted a correction confirming the live merged state. Its historical snapshots remain in main.
- PR #650 — project-plan refresh — merged around 08:43Z.
- Other recent merged work includes #653 iCalendar import, #647 device-QA quoting, #644 HTTP security-label guard, #635 share-intake normalization, #634 recurrence boundaries, #633 proxy validation, #632 offline proxy planner, #622 weather response limits, #615 DST reminder tests, #614 Focus gesture correction, #660 and earlier browser/task work.

## Current open PR inventory

There are **10 open PRs**. Exact heads below are the latest inspected at snapshot time.

| PR | Head SHA | Current base | Ahead / behind current main | Exact-head status |
|---|---|---|---:|---|

| #648 | `49e4c1bee459dd0afb33d8bc0b3d2fc32de8cda2` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 101 / 0 | Android CI and API 29/36 Focus emulator workflows queued/in progress; direct numeric-only UiAutomation shell input is current. No API 29/36 pass yet. |
| #656 | `60ed05002237f172a9f9931390b024f5d30756ad` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 26 / 0 | Android CI, Ubuntu/Windows contracts and device-test APK PASS; Node **679/679 PASS**. |
| #657 | `0bf58040c9186de574c3e760e61f1bf0cedd04ad` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 4 / 0 | Android, contracts, device-test APK and non-publishing acceptance workflows PASS. |
| #659 | `3e95f41c5cad12474345875b8078d75249154dc9` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 13 / 0 | Android, contracts, device acceptance and device-test APK workflows PASS. |
| #662 | `4c3252ee5b303184d2e7cac07deb6a3f18d9f865` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 6 / 0 | Android CI, contracts and device-test APK PASS; Node **684/684 PASS**. Independent security review pending. |
| #664 | `fc104fd590d3a61deb02efc1808439cbda1c6d41` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 7 / 0 | Android CI, contracts and device-test APK PASS. Physical recovery acceptance not tested. |
| #665 | `530ba59607f944358f18f8bcd1f2881d9e0e8aaa` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 3 / 0 | Android CI, contracts and device-test APK PASS; Node **659/659 PASS**. Ready for independent security review. |
| #666 | `4ebb8256926ae9a3d3fb7ba774da4cc517add7ec` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 10 / 0 | Android CI, contracts and device-test APK PASS; Node **671/671 PASS**. Draft/open, review pending. |
| #670 | `59e8825fa1c36b6329a5a1a27212f478c70c2b30` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 2 / 0 | Android CI Node 658/658 PASS; Ubuntu/Windows contracts PASS; device-test APK PASS. CSS press feedback and reduced-motion regression checks. |
| #669 | `feded2159121a3a6c178967572d41cd873a1be08` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 5 / 0 | Docs status/backlog PR; Android CI, Ubuntu/Windows contracts and device-test APK PASS on this exact head. A newer snapshot refresh is being added and requires fresh checks. |

### Closed without merge in this run

- #618 was closed after its six code-file storage-failure changes were transplanted into current-main-based #656. Its stale status snapshots were not copied.
- #668 was opened as a replacement Focus instrumentation branch, then closed without merge after the original #648 branch advanced concurrently. To avoid overlapping Focus instrumentation PRs, #648 remains the sole active delivery path.
- #604 was NOT closed; it was already merged. The correction was posted on #604.

## Substantive engineering delivered in this run

### Import/export subsystem — PR #656

Expanded the current-main-based iCalendar work to include the useful storage-failure protections from #618.

Files now integrated in #656:
- `import-logic.js`, `import-ui.js`
- `browser-download-ui.js`, `export-ui.js`
- `tests/ics-import.test.js`, `tests/import-ui.test.js`
- `tests/browser-download-ui.test.js`, `tests/export-ui.test.js`

Behavior:
- RFC 5545 CATEGORIES split only on unescaped commas; escaped commas and semicolons remain in values.
- Repeated category properties, completion metadata, recurrence, timezone and seconds disclosures are covered.
- Import validates the existing store before reading the selected file.
- Corrupt/invalid/duplicate existing data fails closed and remains byte-preserved.
- The raw store is re-read immediately before write; an intervening tab change aborts.
- A storage quota/write failure does not emit a success refresh event.
- Open-format export fails closed on blocked/unreadable storage rather than creating a misleading empty export.
- Browser-download UI reports storage persistence failures while retaining local planning/copy/save/share affordances.
- Exact-head canonical CI after current-main sync: Node 679/679, Android, Ubuntu/Windows and device-test APK PASS.

### Focus Timer and browser downloads — PR #648

The earlier file-based host bridge was abandoned after API 29 cross-UID EACCES; the status-marker wrapper was also removed after `UiAutomation.executeShellCommand` returned no parseable marker. Current implementation uses direct bounded numeric commands:
- `PlatformShellInputCommand` generates only `input tap` / `input swipe` commands; coordinates are limited to 0–10000 and swipe duration to 1–5000 ms.
- Instrumentation executes the generated command directly through `UiAutomation.executeShellCommand`, reads/closes the bounded output descriptor, logs the command and waits for UI idle. Actual UI state/gesture assertions remain authoritative.
- Host-side Java smoke covers command generation and bounds: **8 assertions PASS locally**.
- Runner discovers the installed instrumentation component through an awk parser verified against actual `pm list instrumentation` output. Runner/guard syntax and mutation checks are included.
- Latest head: `49e4c1bee459dd0afb33d8bc0b3d2fc32de8cda2`, base current main `1d29085b9c4f9ff3489711fd7e18cc88ab368767`, **101 ahead / 0 behind**. This is a long-lived branch with a focused 18-file PR diff; its history count is noted for reviewer awareness.
- Exact-head workflow run IDs: Android CI #42613287732 (in progress), cross-platform #42613287486 (queued), device-test #42613287401 (pending), device acceptance #42613287411 (pending), Focus lifecycle #42613287280 (queued), Focus UI #42613287435 (in progress), Live Update #42613287288 (in progress).
- Previous runs exposed and fixed: cross-UID test-data EACCES, an unavailable status marker, instrumentation-component discovery failure, and stale guard assertions. The current head is the first run with direct numeric-only shell input and the corrected runner/guard. **No API 29/36 pass is claimed.**
- Physical-device testing remains NOT TESTED.

### Webhook security — PR #662

- Session-only endpoint; no endpoint URL/token in localStorage.
- Web Locks coordination; fail closed when unavailable.
- Queue re-read after POST; no silent eviction; persist task before external completion notification.
- At-least-once delivery only: successful POST followed by failed queue acknowledgement can still produce a duplicate.
- Current main includes merged #655's weaker localStorage implementation until #662 is safely integrated.
- Exact-head CI passes; independent security review is a blocker.

### Recovery and storage health — PRs #664 and #666

- #664 reads Task and Focus backups independently; one read failure cannot hide the other readable backup; UNKNOWN is not treated as absent; bytes are preserved for manual export.
- #666 reports legacy webhook lock state and fails closed when health rescan cannot read the store.
- Both exact-head Android/contracts/device-test workflows pass.

### Signing-secret isolation — PR #665

- Current-main device-test logs from PR #656 run #42605422662 job #129120080916 and PR #666 run #42605467960 job #129120374818 show masked `RAW_KEYSTORE_PASSWORD`/`RAW_KEY_PASSWORD` (and other signing variables) present in a pull-request debug-build step environment. The shell selected unsigned debug tasks, but the Gradle process still inherited the environment.
- No exfiltration evidence was found; values were masked. This is an exposure risk, not a confirmed compromise.
- #665 moves signing secrets to the separate tag-gated signed-release step; PR/debug builds receive no signing-secret environment. Exact-head Android CI, contracts and device-test APK PASS.
- Independent security review required before merge.

### Extension import safety — PR #659

- Explicit user opt-in before activation.
- Oversized existing pack reads fail rather than truncate.
- Read/I/O failures are distinct from malformed JSON; failed reads do not overwrite existing files.
- Exact-head Android, contracts, device acceptance and device-test workflows PASS.

### Recurrence — PR #657

- Terminal recurring reminder fire is persisted.
- Source-level date/recurrence checks pass.
- Actual AlarmManager, Doze, reboot, timezone change, OEM and physical-device delivery remain untested.

### Durable status and backlog — PR #669

- Adds a dated whole-project snapshot, updates the status index while preserving historical links, and refreshes the top of the project execution queue.
- First exact-head CI attempt failed because the docs included the retired package fragment caught by the repository cleanliness guard. The literal was removed while retaining the policy conflict in generic wording; no application identity was changed.
- Corrected exact head `feded2159121a3a6c178967572d41cd873a1be08`: Android CI, Ubuntu/Windows contracts and device-test APK all PASS.
- This new snapshot refresh is being added; the resulting new head requires fresh exact-head checks.

### CSS press feedback — PR #670

- Transplants only the useful CSS/accessibility changes from stale #637 onto current main.
- Adds `.card:active` and `.task-row:active`; the task-row active rule follows hover so the pressed transform wins the cascade.
- Adds `prefers-reduced-motion: reduce` override.
- Adds `tests/press-feedback-css.test.js` for stylesheet completeness, placeholder absence, selector counts, cascade ordering, reduced-motion behavior and balanced braces.
- Exact head `59e8825fa1c36b6329a5a1a27212f478c70c2b30`: Node **658/658 PASS**, Android CI, Ubuntu/Windows contracts and device-test APK PASS. PR ready for review, not merged. No physical-device claim.

## Open issue inventory

11 open issues:
- #84 — GitHub Actions Node/deprecation and signing workflow security.
- #160 — physical Android/browser/device acceptance.
- #325 — cross-platform architecture and application identity qualification.
- #348 — browser reliability.
- #476 — recurrence/reminder runtime acceptance.
- #603 — storage health.
- #613 — Focus Timer API 29/36 instrumentation.
- #636 — webhook endpoint secret privacy.
- #639 — webhook cross-tab queue consistency.
- #640 — independent recovery backup availability.
- #646 — main branch governance and independent review.

Issue updates posted this run: #84, #160, #476, #603, #613, #636, #639, #640. PR #648 also has the exact API 29 run-as failure and sandbox-alignment findings.

## Governance and release readiness

- `main.protected=false`; repository rulesets empty; dedicated protection endpoint HTTP 403.
- Critical PRs have no independent approvals recorded. Passing CI is not a substitute for review.
- Main application ID in Gradle/root AGENTS is `com.abrar.daymark`; the user safety instruction says `the user-mandated target identifier`. No package/application ID change was made; explicit owner reconciliation is required.
- Latest published release v1.5; v1.4 draft.
- No release/tag/version bump, signing-key change, application ID change, destructive migration or production publication.
- Physical-device testing: NOT TESTED. Emulator APK artifacts and workflow checks are not physical-device acceptance.

## Next prioritized backlog

1. **P0 — #665:** independent security review and safe integration of signing-secret isolation; do not leave PR-controlled Gradle execution with signing secrets in its environment.
2. **P0 — #648/#613:** verify the test-package host input bridge on API 29 and API 36; retain ten-run API 36 acceptance; fix any remaining gesture/IME/vertical-scroll failures without retries or weakened assertions.
3. **P0 — #662/#636/#639:** independent security review and integrate session-only endpoint/Web Locks implementation over the merged #655 localStorage version.
4. **P0 — #664/#640:** independent review of recovery behavior and physical/manual export acceptance.
5. **P1 — #656:** independent import/export data-integrity review; exact-head CI currently green.
6. **P1 — #659:** independent extension security review; preserve existing packs on I/O failure.
7. **P1 — #666/#603:** independent storage-health review; preserve UNKNOWN/read-failure semantics.
8. **P1 — #657/#476:** actual AlarmManager, Doze, reboot and timezone runtime testing.
9. **P1 — #670:** CSS press feedback is transplanted to current main and exact-head CI is green; #637 is closed without merge. Continue preserving status-index history through #669.
10. **P0 — #646:** owner-side main branch protection, required independent approval and required Android/contract checks.
11. **P0 — #160:** physical Android/WebView/OEM acceptance.
12. **P2 — #325:** resolve package identity policy and cross-platform compatibility matrix.

## Evidence ledger

- #656: 8-file import/export integration; exact head `60ed05002237f172a9f9931390b024f5d30756ad`; Node 679/679; Android/contracts/device-test PASS; open, not merged.
- #648: direct UiAutomation shell-input policy, bounded command/status parser, host smoke and instrumentation/runner/guard updates; exact head `94dbcc05bcc7cda8adba201697389b30a3866222`; Android/contracts/device/Focus workflows in progress; open, not merged; physical device not tested.
- #662: webhook session privacy/queue integration; exact head `4c3252ee5b303184d2e7cac07deb6a3f18d9f865`; Node 684/684; Android/contracts/device-test PASS; open, not merged.
- #664: independent backup reads; exact head `fc104fd590d3a61deb02efc1808439cbda1c6d41`; Android/contracts/device-test PASS; open, not merged.
- #665: signing-secret isolation; exact head `530ba59607f944358f18f8bcd1f2881d9e0e8aaa`; Node 659/659; Android/contracts/device-test PASS; open, not merged; independent security review pending.
- #666: storage health; exact head `4ebb8256926ae9a3d3fb7ba774da4cc517add7ec`; Node 671/671; Android/contracts/device-test PASS; open, not merged.
- #657: recurrence terminal fire; exact head `0bf58040c9186de574c3e760e61f1bf0cedd04ad`; Android/contracts/device-test/non-publishing acceptance PASS; open, not merged.
- #659: extension import trust; exact head `3e95f41c5cad12474345875b8078d75249154dc9`; Android/contracts/device acceptance/device-test PASS; open, not merged.
- #670: current-main CSS press feedback; exact head `59e8825fa1c36b6329a5a1a27212f478c70c2b30`; Node 658/658 and Android/contracts/device-test PASS; ready for review, not merged.
- #669: docs snapshot/status-index/project-plan refresh; exact prior head `feded2159121a3a6c178967572d41cd873a1be08`; Android/contracts/device-test PASS; newer snapshot refresh in progress; open, not merged.
- #663: merged by concurrent automation; exact-head CI passed before merge; no post-merge main run returned.
- #618, #637 and #668: closed without merge. #618's storage-safety code was transplanted into #656; #637's CSS press-feedback code was transplanted into #670 (stale docs/duplicate HTTP guard changes were not copied); #668 was a duplicate Focus branch closed to retain #648 as the sole instrumentation delivery path. #669 remains the docs snapshot/backlog PR.
