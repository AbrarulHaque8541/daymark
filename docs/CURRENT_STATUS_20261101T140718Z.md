# Daymark whole-project engineering status — 2026-11-01T14:07:18Z

## Fresh remote baseline
- Repository: `AbrarulHaque8541/daymark`; default branch `main`.
- Current `main` SHA: `60dc7ea8b272c3581fab81cf11c2fb90ca9c0b94` (PR #487 merge; includes merged PR #488).
- Live Android identity read from `android-app/app/build.gradle.kts`: `applicationId = com.abrar.daymark`, `namespace = com.abrar.daymark`, `versionName = 1.6`, `versionCode = 13`, `compileSdk/targetSdk = 36`, `minSdk = 26`. No identity/version/signing edits.
- Root `AGENTS.md` read fully; `docs/AGENT_STATUS.md` and its indexed 2026-11-01 12:57 UTC snapshot read; `PROJECT_PLAN.md` and `android-app/ANDROID_SOURCES.md` reviewed. No scoped AGENTS files found under changed paths.

## Live PRs and ownership
- [PR #475 — cross-platform recurrence parity](https://github.com/AbrarulHaque8541/daymark/pull/475): open; head `ca82f5d351644cbc11ce940b5f5f57fbda3ce625`; base/current main `60dc7ea8b272c3581fab81cf11c2fb90ca9c0b94`; 23 commits ahead / 2 behind; diverged. Recurrence agent owns `app.js`, `repeat-logic.js`, recurrence fixtures/tests, `TaskLogicSmoke.java`, and `run-core-tests.sh`. No changes made to that branch.
- [PR #489 — Android App Link approval gate](https://github.com/AbrarulHaque8541/daymark/pull/489): open; head `1cebd06aa38fe837d1ca2d1bff6da94071742b9f`; base `main` `60dc7ea8b272c3581fab81cf11c2fb90ca9c0b94`; 9 commits ahead / 0 behind; mergeable at last check. Own scope: `DaymarkWebView.java`, new `BrowserAppLinkApproval.java`, JDK smoke/runner/source guard, `check-v1-source.sh`, this status snapshot and index.
- No unresolved review threads on #475 or #489 at last fetch; no formal reviews.
- Recent merged PRs rechecked: #486 (Offline renderer teardown isolation), #487 (multiline backup/Reader clip compatibility), #488 (overflow-safe DownloadManager progress), #485 (Focus natural-expiry logging), #484 (bounded DownloadManager tracker runtime integration), #481 (architecture ADR). PR #487/#488 exact-head CI evidence is summarized below.

## Independent engineering — Android App Link trust gate (#348 / PR #489)
### Root cause
`DaymarkWebView.handOffVerifiedAppLink()` used `ResolveInfo.isDefault` plus an exact non-wildcard host authority filter to launch a resolved HTTP(S) app directly. A default/browsable filter is not proof that Android verified the domain or that the user selected that package.

### Implementation
- New pure `BrowserAppLinkApproval`: direct approval requires API 31+, platform link-handling enabled, and exact normalized host state `DOMAIN_STATE_VERIFIED` or `DOMAIN_STATE_SELECTED`.
- `DaymarkWebView` obtains `DomainVerificationUserState` for the resolved activity's package and gates direct launch. Missing state, invalid/conflicting host normalization, unverified/unselected host, or user-disabled link handling fails closed; the URL remains in Daymark.
- API 26–30 stay in Daymark because public equivalent approval state is unavailable. No unverified package is directly launched.
- New JDK smoke covers verified/selected/none, global opt-out, exact-host isolation, API <31, missing/empty state, IDN/case/root-dot normalization, conflicting normalized entries, invalid hosts, and unknown state.
- New isolated test runner and source guard are included in canonical `android-app/tools/check-v1-source.sh`. Android CI already invokes this canonical guard; no duplicate workflow step remains.
- No new package-visibility queries, manifest permissions, external dependencies, network requests, storage, or data migration.

### Local validation
- `javac -encoding UTF-8 --release 17` for policy + smoke: **PASS**.
- `BrowserAppLinkApprovalSmoke`: **PASS**.
- Source/runner/workflow integration assertions inspected: **PASS**.
- Full canonical `check-v1-source.sh` / `npm test`: **NOT RUN locally** (connector runtime has no repository checkout); exact-head GitHub CI is executing canonical checks.
- Physical-device App Link resolver/chooser/return-flow matrix (API 26/30/31+): **NOT TESTED**.

## Exact-head CI for PR #489
Latest exact code/test head: `1cebd06aa38fe837d1ca2d1bff6da94071742b9f`.
- Android CI [#41314527850](https://github.com/AbrarulHaque8541/daymark/actions/runs/41314527850): **IN PROGRESS**; host/source regression step still running.
- Cross-platform contracts [#41314527833](https://github.com/AbrarulHaque8541/daymark/actions/runs/41314527833): **IN PROGRESS** (Ubuntu + Windows).
- Non-publishing QA APK [#41314527839](https://github.com/AbrarulHaque8541/daymark/actions/runs/41314527839): **PENDING**.
- Device-test APK [#41314527860](https://github.com/AbrarulHaque8541/daymark/actions/runs/41314527860): **PENDING**.
- Focus lifecycle [#41314527829](https://github.com/AbrarulHaque8541/daymark/actions/runs/41314527829) and Live Update [#41314527830](https://github.com/AbrarulHaque8541/daymark/actions/runs/41314527830): **IN PROGRESS**.
- No exact-head failure evidenced at last query; all results pending/in progress.

## Cross-agent audit — PR #475
- Fresh PR metadata, complete changed-file patch, and exact-head Android CI logs inspected.
- Android CI [#41313153967](https://github.com/AbrarulHaque8541/daymark/actions/runs/41313153967) **FAILS** in `Run Android host regression checks`; Node, UiFeedbackPolicy, and Gradle steps are skipped.
- Exact compiler output from job #124867574940:
  ```
  android-app/tools/TaskLogicSmoke.java:1: error: reached end of file while parsing
  PLACEHOLDER_TOO_LARGE_USE_LOCAL
  ```
- PR patch removes 628 lines from `TaskLogicSmoke.java` and shows a one-line placeholder. `run-core-tests.sh` still compiles/runs that class; this is a real branch/CI defect, not a test infrastructure failure.
- Evidence-backed comment posted in #475: restore full `TaskLogicSmoke.java` from current main and reapply only recurrence additions; preserve existing task/reminder/snapshot assertions; do not remove/disable the smoke. Rerun Android, Node, Ubuntu/Windows contract, QA and APK workflows on the new exact head.
- I did not modify the recurrence-owned branch/files to avoid collision.

## Repo-wide prioritized backlog
1. **P0 #160 — Android/WebView physical-device acceptance.** Owner/device tester must record device model, Android API, WebView provider/version, tested commit SHA, APK SHA, scenario, and result. **NOT TESTED**.
2. **P1 #475 / #476 — Recurrence parity.** Repair the current CI regression, reconcile with #487/#488, preserve Android and web recurrence assertions, rerun exact-head Android + Node + Ubuntu/Windows contracts + QA/device APK workflows, then review/merge only when eligible.
3. **P1 #348 — Browser reliability and safe link handoff.** PR #489 covers only direct App Link trust. Remaining scope: user-choice/return UX, DownloadManager/SAF races, redirects/cookies/forms/back-forward, renderer recovery, keyboard/insets/accessibility and device acceptance.
4. **P2 #325 — Cross-platform architecture.** Evidence-first desktop core/POC and compatibility matrix; no speculative framework rewrite.

## Safety
No release/tag publication, version bump, signing/key modification, manifest permission change, package identity change, destructive migration, or user-data operation. CI/emulator evidence is not physical-device acceptance.

---
Work by: ChatGPT (OpenAI)  
Model: GPT-6  
Tooling: GitHub MCP (live repo/branch/PR/source/Actions); local JDK 21 `javac --release 17`  
Timestamp (UTC): 2026-11-01T14:07:18Z
