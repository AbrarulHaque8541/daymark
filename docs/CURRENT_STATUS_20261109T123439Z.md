# Daymark whole-project engineering status — 2026-11-09T12:34:39.477Z

## Repository baseline

- Repository: AbrarulHaque8541/daymark; default branch: main.
- Current main SHA: 8d76584bc07ed06388e46de8dd11bd39d7250d3a (PR #673 squash merge).
- Root AGENTS.md blob: 492ed21e2219a8d1b80c7d6e63575525c98a5a91; read in full.
- Branches enumerated: **648** (7 pages: 100, 100, 100, 100, 100, 100, 48).
- Open PRs: **8**. Open issues: **12**. Recent closed PRs/issues were also enumerated; latest 20 PRs and 20 issues inspected.
- Workflow definitions: **14**.
- Issue #646 remains open for owner-approved main protection and independent-review rules. No settings changed.

## Verified mainline integration this cycle

### PR #673 — nightly placeholder guard path safety

- PR: https://github.com/AbrarulHaque8541/daymark/pull/673
- Branch head before merge: 68f90af8a99e61e7eb54782b4ec879c4231fdeb1; synchronized to main 3f9e50e77ef7913f143e53121df317694ef01e10 (2 ahead / 0 behind).
- Changed files: .github/workflows/nightly-main-audit.yml and tests/nightly-placeholder-guard.test.js.
- Fix: replaced output-line filtering (grep -v "tests/") with directory-aware --exclude-dir=tests, preserving matches on source lines that merely mention a path under tests/.
- Added a GNU grep integration regression covering RFC 5545 VTODO, real source placeholders, excluded test/dependency directories, and a source TODO on a line containing tests/README.md.
- Exact-head checks: Android CI #42617176282 PASS; Ubuntu/Windows contracts #42617176236 PASS; device-test APK #42617176237 PASS (PR artifact only; no release publication).
- Local isolated Node regression: **2/2 PASS**. Local GNU grep fixture: **PASS**.
- Merged by squash with expected head SHA; merge commit/current main: 8d76584bc07ed06388e46de8dd11bd39d7250d3a.
- Post-merge main Android CI #42617732358: **IN PROGRESS** at snapshot time. Post-merge contracts #42617732347: **PASS**.

### Earlier recent merged work still on main

- #663 task-editor/toast markup contract — merge SHA 1d29085b9c4f9ff3489711fd7e18cc88ab368767.
- #657 terminal recurring reminder persistence — merge SHA 14d893eefa73786e166734d8bf4d8e8688f73e0d; physical AlarmManager/Doze/reboot/timezone/OEM acceptance remains open under #476.
- #672 VTODO whole-word guard — merge SHA b1bcff1d8c1ab5666459eb157fc6280429623f30.
- #670 accessible press feedback — merge SHA 9260dd683d9d101079f3a7276c475e3dd47ef075.
- #660 recovery discovery — merge SHA 947214e2913323f8842551bf1046187724a5c163.
- #668, #667, #637 and #604 were closed without merging; do not treat their branches as delivered.

## Current main verification

- Android CI on 8d76584bc07ed06388e46de8dd11bd39d7250d3a: run #42617732358 **IN PROGRESS**.
- Cross-platform Ubuntu/Windows contracts on 8d76584bc07ed06388e46de8dd11bd39d7250d3a: run #42617732347 **PASS**.
- Previous main SHA 3f9e50e77ef7913f143e53121df317694ef01e10 had Android CI #42616912752 PASS and contracts #42616912871 PASS.

## Current open PR inventory and blockers

| PR | Exact inspected head | Base / comparison | Current evidence / blocker |
|---|---|---|---|
| #648 | 6ded70e3efa230e163a393609473d0415e68e41e | Base 1d29085b...; 120 ahead / 7 behind; diverged | Focus/Downloads integration. New head pushed 12:32:38Z; no checks returned yet. Previous head eb08af2...: Android CI FAIL, contracts/UI/Live Update PASS, Focus emulator still running. Earlier heads failed real API29 mode taps and API36 parent ScrollView scrolling. Source-guard mismatch was documented in comment #6740077072. Do not merge until current-main sync, Android CI and API29/API36 gesture/lifecycle acceptance pass. Downloads stay fail-closed until #671 transport exists. |
| #666 | 1579ce1de6a02bceddac6bc216857fd4ca0eccff | Base current main; 28 ahead / 0 behind | Storage health distinguishes unreadable/unknown from absent and fails closed on deletion. Latest Android/device workflows in progress; contracts PASS. Draft; independent data-storage review required. |
| #669 | bc00f3909e327d23429dbe346b8a107b15875d8d | Base 14d893e...; 14 ahead / 5 behind | This status/documentation PR is being refreshed on its existing branch with current main, a new dated snapshot, updated index and execution queue. Prior exact-head Android/contracts/device checks PASS on older head; new head needs fresh checks. |
| #665 | 7e4cd3e7aee36fab1955ee6282db812bce0a0104 | Base current main; 9 ahead / 0 behind | PR-build signing-secret isolation and Node24 action updates. Exact-head Android/contracts/device workflows in progress. Independent security review required; do not expose production secrets to PR builds. |
| #664 | 5a1962c5b6e166a551cfc2a4e8498d328e98fd88 | Base 14d893e...; 11 ahead / 5 behind | Independent task/Focus backup reads and exact-byte preservation. Exact-head Android/contracts/device workflows PASS. **Blocking data-integrity defect:** hasDuplicateJsonKeys is defined at app.js line 30 and called only at line 168 in primary task loading. Recovery readers, nested payload strings, primary Focus storage and user imports still parse ambiguous JSON. Duplicate task title can be overwritten; duplicate Focus session can become null. Keep #640 open and PR draft until all boundaries reject duplicates and preserve bytes. |
| #662 | 2c8aa23978fd1ab7cc2c01f09adb61cb2628e8e2 | Base 14d893e...; 12 ahead / 5 behind | Web Locks, session-only endpoint secrets, persist-task-first and final retry-drop fix. Exact-head Android/contracts/device workflows PASS. Sync with main and obtain independent security review. |
| #659 | 6c7d50ab0eb6d53343dda6b68450ff74b0122886 | Base 14d893e...; 15 ahead / 5 behind | Imported extensions default disabled; unsafe replacement preserves existing packs. Exact-head Android/contracts/device workflows PASS. Independent extension security review required. |
| #656 | 199e9fa6bff760f778c1d1d3ee5ee6c5d0518e8f | Base 14d893e...; 28 ahead / 5 behind | iCalendar/open-format import/export hardening; exact-head Android/contracts/device workflows PASS. Sync with main and obtain independent RFC 5545/data-integrity review. |

## Current open issues (12)

- #613 Focus Timer and task-editor API36 emulator lifecycle acceptance.
- #636 webhook endpoint secret persistence/privacy.
- #84 GitHub Actions Node/runtime deprecation cleanup.
- #603 storage health must distinguish unreadable from absent.
- #640 recovery export and ambiguous JSON preservation.
- #348 browser compatibility, downloads, app links, proxy options and performance.
- #671 redirect-validating browser download transport (new downloads remain fail-closed until implemented).
- #476 Android/web repeat scheduling, anchors, long-gap catch-up and real alarm acceptance.
- #160 physical Android runtime acceptance matrix.
- #639 cross-tab webhook queue correctness.
- #325 cross-platform architecture spike.
- #646 main branch required CI and independent-review protection.

## Prioritized whole-project backlog

1. **P0 — Focus interaction/lifecycle (#648/#613):** reconcile the 120-ahead/7-behind branch with current main; resolve instrumentation/source-guard drift; capture actual MotionEvent dispatch at ScrollView, ModeSelector and children; prove taps toggle both ways, horizontal swipes select modes, vertical drag scrolls the parent, and post-drag taps work. Keep API36 ten-run gate; no blind retries or weakened assertions.
2. **P1 — Recovery ambiguity (#664/#640):** validate duplicate JSON keys at every outer/nested recovery and import boundary, including primary Focus. Preserve raw bytes and refuse overwrite/import on ambiguity.
3. **P1 — Storage health (#666/#603):** independent review and safe integration; unreadable storage must never be treated as absent or cleared.
4. **P1 — Signing isolation/Node24 (#665/#84):** ensure PR builds cannot access signing secrets; verify all direct/transitive action runtimes.
5. **P1 — Webhook queue (#662/#639/#636):** sync and independently review durable cross-tab retry/secret behavior.
6. **P1 — iCalendar/import/export (#656):** sync and independent RFC 5545 review; no silent category/date loss.
7. **P1 — Extension trust (#659):** independent review of opt-in, match/exclude and replacement semantics.
8. **P1 — Secure downloads (#671):** implement Daymark-owned redirect-by-redirect validation, HTTPS downgrade rejection, bounded streaming, same-origin cookie policy and partial-file cleanup; retain fail-closed behavior until complete.
9. **P0 — Physical acceptance (#160):** current-main APK on actual Android devices, recording model/API/WebView provider/version, build SHA and APK SHA. **NOT TESTED** in this cycle.
10. **P1 — Governance (#646):** owner-approved required CI and independent review protection.
11. **P2 — Browser UX/cross-platform architecture (#348/#325):** continue after security/data-integrity blockers.

## Identity, release and safety

- Current Gradle identity: namespace/applicationId com.abrar.daymark; minSdk 26; targetSdk 36; versionName 1.6; versionCode 13. Build file blob: b42c93ea1ff2317ec7b2afc5fed7876543dd9964.
- Root AGENTS.md approves com.abrar.daymark and signer pin ad6be60bd89c076c2d3985ec20c30533dd9ff10e07418d64ad1d825418030580. The run-level safety instruction also mentions a different legacy application identifier; no identity was changed. Resolve any future identity change only with explicit owner approval.
- Latest published release: v1.5. v1.4 remains draft. No release or tag was published in this cycle.
- No signing keys/secrets, package identity, version, manifest permissions, database schema, migration or user data were changed.
- Physical-device acceptance: **NOT TESTED**. Emulator workflow/artifact checks are not physical-device verification.

## Work completed in this cycle

- Read root AGENTS.md and the latest linked historical status snapshot; refreshed live GitHub state.
- Enumerated 648 branches; reviewed all 8 open PRs, 12 open issues and recent closed PRs/issues; inspected all 14 workflow definitions.
- Fixed and merged PR #673 (workflow + regression test only). Exact PR-head Android, contracts and device-artifact checks PASS; local Node 2/2 and GNU grep fixture PASS. Post-merge Android CI is still in progress; post-merge contracts PASS.
- Reproduced the recovery duplicate-key gap on exact PR #664 source; current app.js has one guard call site only. Posted updated evidence on #664.
- Reviewed Focus PR #648 source/guard drift and posted exact CI failure evidence; branch is actively changing, so no overlapping MainActivity edits were made.
- No local full Gradle suite or full repository npm suite was run. No physical device was tested.

**Work by:** ChatGPT (OpenAI)  
**Model:** GPT-6  
**Tooling:** GitHub connector via Code Mode; exact-source V8/CI inspection; container Node.js and GNU grep regression execution  
**Timestamp (UTC):** 2026-11-09T12:34:39.477Z
