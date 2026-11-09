# Daymark whole-project engineering status — 2026-11-09T21:12:32.998Z

## Live repository baseline

- Repository: https://github.com/AbrarulHaque8541/daymark
- Current main SHA: `1532838c78ab350b18f95e96a2c547ba384f0831`
- Current audit: **663 branches** (all 8 pages enumerated), **11 open PRs**, **18 open issues**, 14 workflow definitions.
- Root `AGENTS.md` read in full (blob `492ed21e2219a8d1b80c7d6e63575525c98a5a91`); `docs/AGENT_STATUS.md` and the latest linked #675-branch snapshot read; live state rechecked.
- Main Android CI [#42654200287](https://github.com/AbrarulHaque8541/daymark/actions/runs/42654200287) PASS; main cross-platform contracts [#42654200808](https://github.com/AbrarulHaque8541/daymark/actions/runs/42654200808) PASS.
- Workflow inventory: android-device-acceptance, android-device-test-release, android-private-main-test-apk, android-production-release, android-release-assets, android, browser-cookie-import-safety, desktop-browser-ci, focus-live-update, focus-timer-emulator, focus-timer-ui, generator-generic-ossf-slsa3-publish, nightly-main-audit, platform-contract.
- Main branch protection endpoint returned HTTP 403; repository rulesets endpoint returned an empty list. Effective required-review/check enforcement is therefore not established.
- Releases: v1.5 published 2026-10-23T09:42:55Z; v1.4 remains draft. No release/tag action was taken.
- Gradle identity: `com.abrar.daymark`, versionName `1.6`, versionCode `13`, minSdk 26, targetSdk 36. Issue #679 tracks a conflicting stale application-identity directive; no identity change was made.

## Open PR inventory and exact-head evidence

| PR | Head SHA | Current evidence / blocker |
|---|---|---|
| [#648 Focus/download lifecycle](https://github.com/AbrarulHaque8541/daymark/pull/648) | `a25b4226a284f4051cd3ee7d2e89d4f576d52b3a` | Seven associated workflows PASS; API 29 373 assertions PASS; API 36 ten consecutive runs PASS (latest 376 assertions). Draft; independent approval and physical-device acceptance pending. |
| [#675 recovery/storage/webhook](https://github.com/AbrarulHaque8541/daymark/pull/675) | `7148857784ad643249caf47a819e5806eb4fecdb` | Android CI #42695065187, contracts #42695065121, device-test APK #42695065173 PASS; Node 764/764 PASS; Gradle debug build successful. Draft; independent data/security review and cross-tab task mutation remain. |
| [#677 reminder clock/timezone](https://github.com/AbrarulHaque8541/daymark/pull/677) | `9376bce84441d7261c88b9d6669a1d003877da99` | API 29 PASS; exact-head API 36 run #42682273638 FAIL in TaskEditorImeInstrumentation.awaitDialogButton(): Cancel action not reachable with IME visible, after 243 assertions. A previous horizontal-swipe failure belongs to a different run; PR comment #6751422118 was corrected with exact-head evidence. |
| [#659 extension import trust/recovery store](https://github.com/AbrarulHaque8541/daymark/pull/659) | `5d3f98341ed57dd9e007827c245d930ebac1ae22` | Four associated workflows PASS; ExtensionStoreSmoke 49 assertions PASS; Node 683/683 PASS. Parent-directory symlink checks are now present. Accessible malformed-pack manager UI remains open under #687. |
| [#686 Service Worker Offline policy](https://github.com/AbrarulHaque8541/daymark/pull/686) | `707b91584df0332e7b81ef7986eb173f63067d94` | Six associated workflows PASS; controlled API 26/API 36 runtime matrix passes for both githubSideload and Play variants. Policy blocks Service Worker network requests even while normal browsing is Online; owner compatibility decision/origin-scoped grant design remains. |
| [#676 extension SPA injection](https://github.com/AbrarulHaque8541/daymark/pull/676) | `e68e0d35a8a71e6874a8c4448383b4b4224c5b04` | Four associated workflows PASS; prior isolated V8 route-scope cases 7/7 PASS. Real WebView integration acceptance remains. |
| [#682 clear-action lifecycle](https://github.com/AbrarulHaque8541/daymark/pull/682) | `0e6d73f1535184553c7e2891f15fcb438f1dca27` | Three associated workflows PASS. Planner no longer treats a planned export as proof of a completed backup; integration review remains. |
| [#656 iCalendar/open-format import](https://github.com/AbrarulHaque8541/daymark/pull/656) | `77b65247857905d186ec5898834c059e7171fa4d` | Three associated workflows PASS; invalid date/time and duplicate singleton-property disclosure fixes are present. Import must join the same atomic task mutation contract as normal saves. |
| [#678 redirect policy](https://github.com/AbrarulHaque8541/daymark/pull/678) | `b27f8bab753ac621fe95a7481b4708c4c0b40e10` | Five associated workflows PASS. This is policy validation only; DNS-pinned transport, TLS hostname verification, bounded streaming, safe publication, cancellation and cleanup remain before downloads can be enabled. |
| [#665 signing-secret isolation](https://github.com/AbrarulHaque8541/daymark/pull/665) | `9ab50cb49876a71f87a7c21d22b4babdad1cec9a` | Three associated workflows PASS. Independent security/provenance review pending; upstream SLSA reusable workflow still has a transitive Node20 dependency. |
| [#688 test-source integrity guard](https://github.com/AbrarulHaque8541/daymark/pull/688) | `69c56da04dcbe0b6e98b3eea1e5f3fb48b6c89e4` | New draft PR. Ubuntu contracts PASS; Android host/source checks and npm test step PASS; Android debug build and device-test artifact jobs were still in progress at snapshot time. No merge. |

No independent APPROVED review was found in the inspected review inventory for the active engineering PRs; COMMENTED reviews are not approvals.

## Cross-tab task mutation — blocking branch review

Issue [#683](https://github.com/AbrarulHaque8541/daymark/issues/683) remains open.

Branch `fix/task-cross-tab-serialize-20261109` at `0e517fd010977ca513be7e3423168ced23e9e849` is **not a production fix**:
- `app.js` still performs synchronous snapshot `localStorage.setItem`; `import-ui.js` does not call the helper.
- `storage-lock.js` uses `getItem → setItem → getItem` as a localStorage lease. Two tabs can both read empty, A can set/read A and enter, then B can set/read B from its earlier empty observation and also enter. localStorage has no atomic compare-and-swap.
- `withWebLock()` is not used by production writers.
- The sequential lock test does not interleave contenders.
- Parent commit `3f1176e...` replaced the 202-line Focus-storage test and 169-line search-announcement test with placeholders. The current branch restored the Focus test, but `tests/search-announcement.test.js` remains the literal `placeholder`.
- A detailed blocking review was posted on #683 as comment [#6751482079](https://github.com/AbrarulHaque8541/daymark/issues/683#issuecomment-6751482079). Do not merge that branch until the production writers use a real origin-wide lock, unsafe fallback is removed, and deleted tests are restored.

PR [#688](https://github.com/AbrarulHaque8541/daymark/pull/688) adds a Node test-source guard so each top-level `tests/*.test.js` file must contain executable source and a named `test()` or `it()` registration. It catches placeholder/empty/helper-only replacements but does not detect a deleted file. The guard is intentionally not presented as the full task-lock fix.

## Newer review updates

- PR #677 exact-head API 36 failure was corrected in comment [#6751422118](https://github.com/AbrarulHaque8541/daymark/pull/677#issuecomment-6751422118): current exact head fails the IME Cancel action, not the older horizontal-swipe scenario.
- Issue #687 update [#6751493199](https://github.com/AbrarulHaque8541/daymark/issues/687#issuecomment-6751493199): parent-symlink protections and 49-assertion ExtensionStore smoke are present on #659; manager recovery UI remains.
- Main status index is stale (main still points to the 2026-11-09T16:17Z snapshot); this #675 branch index is being refreshed separately and is not yet merged.

## Prioritized repo-wide backlog

1. **P0 #683:** reject the unsafe localStorage lease approach; integrate one origin-wide `navigator.locks.request(..., {mode:'exclusive'})` contract across normal task writes, imports, recovery, clear and undo; read/validate/merge/write inside the lock; fail closed visibly if unavailable; add real two-context race coverage.
2. **P0 #613/#677/#648:** integrate #648's tested Focus/dialog/IME files sequentially into reminder work, preserve reminder receiver/manifest/scheduler, and rerun API 29 plus API 36 repeat gate. Current #677 API 36 exact head fails Cancel with IME visible.
3. **P0 #646/#160:** owner-side required checks/independent review and physical Android/WebView acceptance.
4. **P1 #675/#640/#636/#639:** independent recovery/webhook data-integrity review and exact-byte/manual recovery acceptance; do not conflate webhook queue locks with task mutation locks.
5. **P1 #687/#659:** accessible malformed-extension recovery row, exact-byte SAF export and fingerprint-checked confirmed removal, coordinated with MainActivity ownership.
6. **P1 #685/#686:** decide/implement safe Service Worker Online compatibility; retain Offline fail-closed behavior and multi-origin/lifecycle acceptance.
7. **P1 #671/#678:** finish app-owned DNS-pinned/TLS-verified bounded download transport; keep actual downloads fail-closed.
8. **P1 #684/#476:** align Android/web recurrence completion, anchors, missed occurrences and idempotency; validate alarms/Doze/reboot/timezone/OEM behavior.
9. **P1 #665/#84:** independent signing/provenance review and direct/transitive Actions runtime modernization.
10. **P1 #656/#676/#682:** independent import/export, extension and browser-data reviews; integrate import into task mutation serialization.
11. **P1 #688:** finish exact-head CI and independent review for the test-source integrity guard.
12. **P2 #325/#348:** measured cross-platform, browser UX, accessibility and performance work.

## Evidence and limitations

- Main CI run IDs and exact PR-head workflow runs are listed above; PR #688 was still in progress at snapshot time.
- No local full Node/Gradle suite was run in this runtime. CI results are reported only for the exact SHAs/runs identified above.
- Physical-device acceptance: **NOT TESTED**.
- No production source changes were made in this cycle. One test file was changed on the new #688 branch; two documentation commits from the preceding cycle remain on #675.
- No release/tag/version bump, signer/application identity change, manifest permission change, destructive migration/data change, force push, or protection bypass was performed.

Work by: ChatGPT (OpenAI)  
Model: GPT-6  
Tooling: GitHub connector via Code Mode; exact branch/PR/issue/Actions/source/test inspection  
Timestamp (UTC): 2026-11-09T21:12:32.998Z
