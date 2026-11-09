# Daymark whole-project engineering status — 2026-11-09T11:21:40Z

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

There are **9 open PRs**. Exact heads below are the latest inspected at snapshot time.

| PR | Head SHA | Current base | Ahead / behind current main | Exact-head status |
|---|---|---|---:|---|
| #637 | `5f1a94d9d5d6b6de1ab43debd1486befc201e2bc` | `60713561597aa594661b7e497bb14d06a1028c68` | 12 / 22 | Stale/diverged; GitHub reports mergeable=false. CSS press feedback and historical status-index cleanup still need a conflict-aware replacement/rebase. |
| #648 | `d3fcf751ae4fbd3dd42a7dcb4116c562274ad27b` | `cad95fc9a5f2de0fd4ec84e952d94a0beb9572f6` | 42 / 1 | Android CI in progress; contracts/device artifacts pending; Focus emulator queued. API 29/36 not yet passed. |
| #656 | `60ed05002237f172a9f9931390b024f5d30756ad` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 26 / 0 | Android CI, Ubuntu/Windows contracts and device-test APK PASS; Node **679/679 PASS**. |
| #657 | `0bf58040c9186de574c3e760e61f1bf0cedd04ad` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 4 / 0 | Android, contracts, device-test APK and non-publishing acceptance workflows PASS. |
| #659 | `3e95f41c5cad12474345875b8078d75249154dc9` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 13 / 0 | Android, contracts, device acceptance and device-test APK workflows PASS. |
| #662 | `4c3252ee5b303184d2e7cac07deb6a3f18d9f865` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 6 / 0 | Android CI, contracts and device-test APK PASS; Node **684/684 PASS**. Independent security review pending. |
| #664 | `fc104fd590d3a61deb02efc1808439cbda1c6d41` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 7 / 0 | Android CI, contracts and device-test APK PASS. Physical recovery acceptance not tested. |
| #665 | `530ba59607f944358f18f8bcd1f2881d9e0e8aaa` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 3 / 0 | Android CI, contracts and device-test APK PASS; Node **659/659 PASS**. Ready for independent security review. |
| #666 | `4ebb8256926ae9a3d3fb7ba774da4cc517add7ec` | `1d29085b9c4f9ff3489711fd7e18cc88ab368767` | 10 / 0 | Android CI, contracts and device-test APK PASS; Node **671/671 PASS**. Draft/open, review pending. |

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

- Host-input request/result bridge uses bounded numeric-only tap/swipe requests and shell-side `adb input`.
- Latest source now writes request/result checkpoints and phase logs under the instrumentation test package context; runner preflights and polls `com.abrar.daymark.test`.
- Fake-adb protocol tests and mutation guards target the new host bridge.
- Vertical Focus gestures must hand control back to the parent Tasks ScrollView; horizontal mode gestures remain separate.
- Task Editor IME and accessibility checks remain in the suite.
- Previous API 29 failure was a preflight failure because `run-as com.abrar.daymark` was not accessible. The current head aligns Java writer and host reader to the instrumentation package, but the new exact-head emulator run is still pending. No API 29/36 pass is claimed.
- Current exact-head workflow run IDs: Android CI #42608163336 (in progress), cross-platform #42608163421 (pending), device-test #42608163438 (pending), device acceptance #42608163741 (pending), Focus lifecycle #42608163243 (queued), Focus UI #42608163180 (in progress), Live Update #42608163330 (queued).

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
9. **P1 — #637:** replace/rebase stale CSS/status-index work; preserve historical status snapshots and resolve active/hover cascade.
10. **P0 — #646:** owner-side main branch protection, required independent approval and required Android/contract checks.
11. **P0 — #160:** physical Android/WebView/OEM acceptance.
12. **P2 — #325:** resolve package identity policy and cross-platform compatibility matrix.

## Evidence ledger

- #656: 8-file import/export integration; exact head `60ed05002237f172a9f9931390b024f5d30756ad`; Node 679/679; Android/contracts/device-test PASS; open, not merged.
- #648: Java/runner/guard/fake-adb alignment; exact head `d3fcf751ae4fbd3dd42a7dcb4116c562274ad27b`; workflows pending/in progress; open, not merged; physical device not tested.
- #662: webhook session privacy/queue integration; exact head `4c3252ee5b303184d2e7cac07deb6a3f18d9f865`; Node 684/684; Android/contracts/device-test PASS; open, not merged.
- #664: independent backup reads; exact head `fc104fd590d3a61deb02efc1808439cbda1c6d41`; Android/contracts/device-test PASS; open, not merged.
- #665: signing-secret isolation; exact head `530ba59607f944358f18f8bcd1f2881d9e0e8aaa`; Node 659/659; Android/contracts/device-test PASS; open, not merged; independent security review pending.
- #666: storage health; exact head `4ebb8256926ae9a3d3fb7ba774da4cc517add7ec`; Node 671/671; Android/contracts/device-test PASS; open, not merged.
- #657: recurrence terminal fire; exact head `0bf58040c9186de574c3e760e61f1bf0cedd04ad`; Android/contracts/device-test/non-publishing acceptance PASS; open, not merged.
- #659: extension import trust; exact head `3e95f41c5cad12474345875b8078d75249154dc9`; Android/contracts/device acceptance/device-test PASS; open, not merged.
- #663: merged by concurrent automation; exact-head CI passed before merge; no post-merge main run returned.
- #618 and #668: closed without merge; no code is counted as merged from those PRs.
