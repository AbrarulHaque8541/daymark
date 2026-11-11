# Daymark whole-project engineering status

Snapshot timestamp: 2026-11-11T01:36:56.051Z  
Default branch: `main`  
Main SHA: `5148232a7165f840fa895707890b829bcdc1657b`  
Root `AGENTS.md` blob: `7747504267d7330a4a51bf04fde494dd750a6023`  
Technology policy: `docs/TECHNOLOGY_AGNOSTIC_ENGINEERING.md`

**Work by:** ChatGPT (OpenAI)  
**Model:** GPT-6  
**Tooling:** GitHub connector via Code Mode; Git Data API; V8 exact-source storage contract harness; GitHub Actions API  
**Timestamp (UTC):** 2026-11-11T01:36:56.051Z

## 1. Live repository and governance

- Repository: `AbrarulHaque8541/daymark`; default branch `main`; live main SHA `5148232a7165f840fa895707890b829bcdc1657b`.
- Open PRs: **13**. Open issues: **24**.
- Main branch metadata: `protected=false`; repository rulesets endpoint returned an empty list. The detailed branch-protection endpoint returns HTTP 403 to the connected integration; no settings were changed.
- Main Android CI: PASS on exact SHA `5148232a7165f840fa895707890b829bcdc1657b` — [run #42933214990](https://github.com/AbrarulHaque8541/daymark/actions/runs/42933214990).
- Main cross-platform contracts: PASS on exact SHA `5148232a7165f840fa895707890b829bcdc1657b` — [run #42933214965](https://github.com/AbrarulHaque8541/daymark/actions/runs/42933214965).
- No requested reviewers are recorded on the 13 open PRs. #725 has no review submissions; #722 has only an owner-authored COMMENTED review, not an independent approval. Other PR review submissions were not exhaustively fetched in this snapshot.
- Releases: v1.5 is the latest published release (2026-10-23); v1.4 remains draft. No release or tag was created.
- Gradle and root AGENTS approve namespace/applicationId `com.abrar.daymark`, versionName `1.6`, versionCode `13`. The run-level safety text says `com.cue.daymark`, which conflicts. Preserve live approved source identity; no package/signing/migration changes without an explicit owner-approved continuity plan.

## 2. Recent mainline integrations verified

- PR #719 export script-order correction is on main; issue #717 remains open for actual browser/WebView file-download acceptance.
- PR #721 webhook endpoint session-only privacy and endpoint-fingerprinted queue are on main.
- PR #728 Telegram chat-preference/storage test correction is merged (merge commit `66c47b22801b93a84d61c774240d405cf1700422`).
- Main commit `5148232a` adds a polite accessibility announcement when the remembered Telegram chat destination is restored. Token remains session-only.
- Current main source has the remembered chat key `daymark.telegram.lastChat.v1`; it must be represented in storage-health inventory and Clear All.

## 3. All open PRs — exact base/head from live GitHub API

| PR | Base SHA | Head SHA | Area / current note |
|---|---|---|---|
| #727 | `39b1047a2d4888e5c1adb56b6a798e030d10f1b5` | `0eb1f7e88e86cacd141fe456905d0741ea1a2c3b` | Focus selector instrumentation |
| #726 | `39b1047a2d4888e5c1adb56b6a798e030d10f1b5` | `ea5067370caf43140069708655a85c1336251a37` | Intent handoff gesture gate |
| #725 | `5148232a7165f840fa895707890b829bcdc1657b` | `6a1a410ff5093d262d60ce08f4f0a0ef6d45caa9` | Storage health / Telegram preference inventory |
| #724 | `5148232a7165f840fa895707890b829bcdc1657b` | `<this snapshot commit>` | Whole-project documentation |
| #723 | `39b1047a2d4888e5c1adb56b6a798e030d10f1b5` | `4b53dc0bc86f17e25f7226e9cd4653e27d6115e8` | Intent URI contract |
| #722 | `5148232a7165f840fa895707890b829bcdc1657b` | `a0a93db83c80854a006e14b6d1ffb499ff3bfee8` | Task instant contract |
| #713 | `08b6eece1f8c2ff84a14fa2130c20c04298e81f4` | `2af963ad44c49e693ce982c4b99476cc23222b1b` | Intent URI web parity |
| #706 | `08b6eece1f8c2ff84a14fa2130c20c04298e81f4` | `cdbf3574e5f8abc4c21c5a03e64db33eccb11795` | Status documentation |
| #705 | `08b6eece1f8c2ff84a14fa2130c20c04298e81f4` | `c13c6238023cc4a27224c8284341de83a487d3fa` | Signing/provenance |
| #676 | `08b6eece1f8c2ff84a14fa2130c20c04298e81f4` | `546695a168c340666677558efafd77a6bbbf25e0` | Extension SPA security |
| #675 | `08b6eece1f8c2ff84a14fa2130c20c04298e81f4` | `6a16b291fea7b27de9c4868feb01cba86ca8c50d` | Recovery/webhook integration |
| #656 | `08b6eece1f8c2ff84a14fa2130c20c04298e81f4` | `e2f20d84eab17ac0f6ed55a024666298cf493680` | Import/export and iCalendar |
| #648 | `469b29edea6993b19c0f50d427b9d48605b2a4c7` | `239b180d398f50d5f06812e706220b5367e7afbd` | Focus/download integration |

All 13 are open and draft in the live pull request listing. #725 and #722 now target the current main SHA as base; the remaining branches retain older recorded bases and require owner-aware synchronization before merge. #648 is especially stale and touches shared Android Focus/download integration; do not blindly merge or transplant its MainActivity changes.

## 4. Exact-head checks for work performed in this cycle

### PR #725 — storage health

- Base: `5148232a7165f840fa895707890b829bcdc1657b`; head: `6a1a410ff5093d262d60ce08f4f0a0ef6d45caa9`; compare: 6 ahead / 0 behind; GitHub reports mergeable true, mergeable_state unstable while checks run.
- A two-parent merge commit brought current main into the branch. The four PR-owned files were byte-identical between old base `39b1047a` and current main, so no intervening source edits were overwritten.
- Added a dedicated non-secret `telegram-preference` category for `daymark.telegram.lastChat.v1`. Added the expected-key fixture, exact category plan, scan/presence/byte assertion, category-clear regression and Clear All regression.
- Exact-source V8 harness: PASS for key discovery, exactly-one-category membership, category scan, per-category deletion and Clear All deletion. The first harness attempt selected an unrelated first storage constant; the harness was corrected to select the exact `CHAT_STORAGE_KEY` and the final run passed.
- Exact-head workflows: [Android CI #42939745498](https://github.com/AbrarulHaque8541/daymark/actions/runs/42939745498) IN PROGRESS; [contracts #42939745520](https://github.com/AbrarulHaque8541/daymark/actions/runs/42939745520) PASS; [device artifact #42939745513](https://github.com/AbrarulHaque8541/daymark/actions/runs/42939745513) IN PROGRESS; [unsigned validation #42939745517](https://github.com/AbrarulHaque8541/daymark/actions/runs/42939745517) IN PROGRESS.
- PR remains draft/unmerged pending exact-head completion and independent data-integrity review. Physical browser/device acceptance NOT TESTED.

### PR #722 — task timestamp contract

- Base: `5148232a7165f840fa895707890b829bcdc1657b`; head: `a0a93db83c80854a006e14b6d1ffb499ff3bfee8`; compare: 10 ahead / 0 behind; raw GitHub mergeable true, mergeable_state unstable while checks run.
- Current main was added as second parent. The only mainline changes since old base `39b1047a` were Telegram UI/test files; none overlap the six contract files.
- Retains 58 shared cases, signed expanded-year Java Instant compatibility, exact epoch-day/second/nanosecond ordering without Date range loss, and the original PortableBackupSmoke maximum-metadata archive test. Do not weaken or replace that test.
- Seven exact-head workflows were IN PROGRESS at last poll: Android CI #42939911378; Ubuntu/Windows contracts #42939911370; Focus lifecycle API 29/36 #42939911406; Focus UI/Sound #42939911391; Focus Live Update #42939911431; device artifact #42939911590; unsigned device validation #42939911585. No pass is claimed for this synchronized head.
- PR remains draft pending exact-head CI and independent review.

## 5. Current open issue inventory

- #646 — Main branch protection and independent review
- #613 — Focus API 29/36 lifecycle acceptance
- #683 — Cross-tab task mutation integrity
- #700 — Telegram real browser/WebView CORS and token acceptance
- #689 — Clear All / webhook queue synchronization
- #603 — Storage health and unreadable-state handling
- #671 — Redirect-validating browser download transport
- #715 — Intent handoff gesture gate
- #84 — GitHub Actions runtime/deprecation maintenance
- #684 — Repeat-task completion semantics
- #712 — Web Intent planner strict URI policy
- #707 — Android/web task instant contract
- #717 — Web export format acceptance
- #640 — Recovery backup visibility
- #690 — Focus state and storage-clear synchronization
- #685 — Service Worker Offline policy
- #702 — Extension metadata privacy
- #348 — Browser UX and compatibility
- #679 — Application identity reconciliation
- #160 — Physical Android/WebView acceptance
- #696 — Electron lockfile/reproducible installs
- #680 — Extension SPA scope reevaluation
- #476 — Repeat scheduling parity
- #325 — Cross-platform architecture spike

## 6. Prioritized project backlog

### P0 — data integrity, security and runtime
1. #683: prevent stale cross-tab task writers from silently overwriting newer data or resurrecting tasks after Clear Tasks/Clear All. Current main still has direct task writes; #675's generation/lock fix is heavily diverged and not delivered.
2. #613/#727/#648: resolve Focus API 29/36 touch/lifecycle reliability; preserve real touch injection, vertical scrolling and ten-consecutive-run API 36 gate.
3. #671/#708: complete DNS-pinned, hostname-verified, manually redirect-validating download transport, credential stripping and atomic MediaStore/SAF publication. Keep current fail-closed behavior.
4. #689/#690: coordinate Clear All, task mutation, Focus state and webhook delivery/queue locks with explicit ordering and rollback.
5. #646: enable required CI and independent review protection on main; currently unprotected, no rulesets.
6. #160: perform physical Android/System WebView acceptance with device/API/provider/build SHA recorded.

### P1 — cross-platform contracts and security
7. #603/#725: complete storage-health unknown-state review and keep every non-secret key, including Telegram destination, in exactly one category.
8. #707/#722: finish expanded-year timestamp parity after exact-head CI.
9. #656: finish RFC 5545/import/export and malformed/duplicate property/recovery integrity.
10. #712/#715/#723/#726: complete strict Intent URI parity and actual WebView main-frame/user-gesture acceptance.
11. #680/#702/#676: complete extension SPA match/exclude reevaluation and metadata privacy on real System WebView.
12. #705/#84: configure production-signing environment protections and finish action-runtime/provenance maintenance.
13. #700: test real Telegram CORS and delivery in browser/WebView; never expose bot token.
14. #684/#476: align repeat completion and scheduling semantics.

### P2 — maintainability/platform qualification
15. #696: commit Electron lockfile and restore reproducible install path.
16. #325/#348: measured desktop/browser architecture qualification; do not claim HarmonyOS or universal platform support without native/device evidence.

## 7. Device and release evidence

- Emulator/device-acceptance APK artifacts are not physical-device acceptance.
- Physical Android, System WebView, OEM background behavior, SAF, actual Telegram delivery, and real browser download acceptance remain NOT TESTED in this cycle.
- No production release/tag, version bump, signing-key/signer-pin change, application identity change, destructive migration, force merge or protection bypass occurred.
- No PR was merged by this cycle. Main was not modified by this cycle.
