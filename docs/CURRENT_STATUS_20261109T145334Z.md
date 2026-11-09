# Daymark whole-project engineering status — 2026-11-09T14:53:34.079Z

## Repository baseline and governance

- Repository: AbrarulHaque8541/daymark; default branch: `main`.
- Current main SHA: `59e6961c0645a423eb736d16d129eb0e9cc871f7`.
- Root `AGENTS.md` blob: `492ed21e2219a8d1b80c7d6e63575525c98a5a91`; read in full. Latest linked historical snapshot was also read.
- Main Android CI #42619910395: **PASS**. Main Ubuntu/Windows contracts #42619910295: **PASS**.
- Live inventory: **6 open PRs / 12 open issues**.
- Main branch API reports `protected=false`; required status-check enforcement is `off`; rulesets API returns an empty list. Detailed branch-protection endpoint returns HTTP 403 (`Resource not accessible by integration`). No repository settings changed.
- No independent approval is recorded for any of the six open PRs. All remain unmerged.
- Current Gradle/manifest identity follows the repository's root policy. A run-level instruction names a different legacy identity; no applicationId, namespace, manifest, signer or package source was changed. Explicit owner reconciliation is required before any identity change.

## Current open PR inventory

| PR | Exact head / base | Exact-head checks | State / blocker |
|---|---|---|---|
| [#648 Focus + fail-closed downloads](https://github.com/AbrarulHaque8541/daymark/pull/648) | `05c361adef7b7498120a68c1b01724ea10e69cbb` / main `59e6961c0645a423eb736d16d129eb0e9cc871f7` | Current Focus lifecycle #42638600989, Android CI #42638601002, contracts #42638600998, device APK #42638601005 and device acceptance #42638601190 are **IN PROGRESS/PENDING**; Focus UI/Sound #42638600995 and Live Update #42638600980 **PASS**. Prior head `dd73640`: API 29 **PASS**, API 36 **FAIL** at run 1/10. | Draft. API 36 post-vertical-drag tap remains unverified. Root-coordinate versus screen-coordinate mismatch is documented in #613 and PR #648. Downloads are fail-closed only on this unmerged branch. |
| [#656 iCalendar/import-export](https://github.com/AbrarulHaque8541/daymark/pull/656) | `abc85397ebf13375238e6004acd1bd6b6e38b8d8` / main `59e6961c0645a423eb736d16d129eb0e9cc871f7` | Android CI #42633721799, contracts #42633722495 and device APK #42633721795 **PASS**. | Open, not draft. Independent RFC 5545/data-integrity review pending. |
| [#659 extension trust](https://github.com/AbrarulHaque8541/daymark/pull/659) | `8c96abd770f679796a0ad9fc5e8f5c12cda9e4cd` / main `59e6961c0645a423eb736d16d129eb0e9cc871f7` | Android CI #42622038075, contracts #42622038055, device acceptance #42622038156 and device APK #42622038116 **PASS**. | Draft. Independent extension-security review pending. |
| [#665 signing-secret isolation / Node24](https://github.com/AbrarulHaque8541/daymark/pull/665) | `d3cf902b36e47d1eca512df095fc883bbcd4ebbd` / main `59e6961c0645a423eb736d16d129eb0e9cc871f7` | Android CI #42622047147, contracts #42622047145 and device APK #42622047583 **PASS**; release publication skipped. | Draft. Independent release-security/provenance review pending; trusted SLSA generator's transitive action runtime still needs review. |
| [#675 webhook/storage/recovery](https://github.com/AbrarulHaque8541/daymark/pull/675) | `b55ee396d4488211303aadbf73f6db13f7dda5df` / main `59e6961c0645a423eb736d16d129eb0e9cc871f7` | Android CI #42638489859, contracts #42638489934 and device APK #42638489813 **PASS**. Underlying code head `dbbf2b9b0852fe00feca89396e7ef3fe36aedb04`: Node **726/726**, Android CI, contracts and device APK **PASS**. | Draft. Independent data-storage/security review pending. Status index and project plan have been refreshed on this branch. |
| [#676 page-bound extension injection](https://github.com/AbrarulHaque8541/daymark/pull/676) | `59830d290f023c7b0b2cf2828a10de8bedaf195a` / main `59e6961c0645a423eb736d16d129eb0e9cc871f7` | Android CI #42637746064, contracts #42637746292, device acceptance #42637746399 and device APK #42637746704 **PASS**. | Draft. Independent review pending; CI/artifact verification is not physical-device acceptance. |

## Open issues (12)

- #613 Focus Timer API 36 lifecycle/touch acceptance.
- #636 webhook endpoint secret privacy.
- #84 GitHub Actions Node/runtime deprecation and signing workflow audit.
- #603 storage health must distinguish unreadable from absent.
- #640 recovery backup discovery and ambiguous JSON preservation.
- #348 browser compatibility, downloads, app links, proxy options and performance.
- #671 redirect-validating browser download transport.
- #476 Android/web repeat scheduling, anchors, long-gap catch-up and real alarm acceptance.
- #160 physical Android runtime acceptance matrix.
- #639 cross-tab webhook queue correctness.
- #325 cross-platform architecture spike.
- #646 main branch required CI and independent-review protection.

## Verified engineering findings this cycle

### Focus/API 36 (#648/#613)

- The preceding exact head `dd73640ebdd5b9b12ee668812f9a7c6600de57b7` failed API 36 run #42637328004 at run 1/10; API 29 passed.
- Failure: Countdown tap after vertical drag left Stopwatch selected. Exact trace: root-relative bounds `[519,1688][938,1814]`, `getLocationOnScreen=(540,1904)`, injected tap center `(728,1751)`.
- Android documents `getGlobalVisibleRect()` in root-view coordinates, while `getLocationOnScreen()` is in device-screen coordinates. The instrumentation injects the former directly via `UiAutomation.injectInputEvent()`. The likely correction is to offset the root-relative visible rectangle by the root view's screen origin before display injection, preserving clipping and all gesture assertions. This diagnosis is recorded in #613 and PR #648.
- New head `05c361a` adds a mutation guard for the scroll-content precondition, but its API 29/API 36 workflows are still running. No API 36 pass is claimed.
- Physical-device Focus acceptance: **NOT TESTED**.

### Recovery, storage and webhook (#675; #640/#603/#639/#636)

- Code head `dbbf2b9` rejects duplicate JSON keys across primary task/Focus state, outer and nested recovery payloads, and selected imports. Ambiguous bytes remain opaque; no auto-restore or destructive clear.
- Exact code-head Node tests: **726/726 PASS**; Android CI, Ubuntu/Windows contracts and device-test APK **PASS**.
- `task-logic.js` helper blob is byte-identical between #675 and #656.
- Independent backup reads, unknown-vs-absent storage health, task-persist-before-webhook, Web Locks and session-only endpoint secrets remain on the draft branch pending independent review and merge.
- Physical browser/recovery acceptance: **NOT TESTED**.

### Extension trust and injection (#659/#676)

- #659 parser warnings are shown in both active import review paths; new user packs are installed disabled until the user explicitly enables them. Existing-pack preservation and archive limits have host-test coverage. Independent security review pending.
- #676 host tests now verify page-bound bootstrap ordering, CSS and JS-only userscript behavior, and the two-submission bound. Exact-head Android/contracts/device-artifact checks all **PASS**. No physical device tested.

### Signing secrets and Actions runtimes (#665/#84)

- Main `.github/workflows/android-release-assets.yml` is triggered by `pull_request` and currently exports repository signing-secret expressions into the environment of the Gradle build step. PR-controlled Gradle code can read that environment even though the shell only uses it for tag pushes.
- #665 removes signing secrets from PR/debug build environments and gates them to trusted tag-release steps; exact-head Android/contracts/device APK checks **PASS**. Independent security review is pending. No secret value was read, printed, changed or copied.
- Main still contains old direct action pins in release-assets/SLSA workflows until #665 is merged. The trusted SLSA generator's transitive Node 20 action remains a separate provenance review item.

### Browser download security (#671)

- Current main still creates a `DownloadManager.Request`, forwards the WebView Cookie header, and lets DownloadManager follow redirects internally.
- PR #648's fail-closed policy blocks new downloads only on its unmerged branch. The mitigation is not on main yet.
- Keep downloads fail-closed in the integration branch until Daymark-owned redirect-by-redirect validation, same-origin-only cookies, no ambient credentials/referrer, bounded streaming, temporary-file completion and cancellation/error cleanup are implemented. Do not create a competing MainActivity edit while #648 owns that file.

## Prioritized whole-project backlog

1. **P0 — Focus interaction (#648/#613):** fix root-relative/screen-coordinate conversion; prove taps, horizontal swipes, parent vertical scrolling and post-drag taps on API 29/36. Preserve the API 36 ten-consecutive-run gate; no blind retries.
2. **P0 — Download security (#671):** keep fail-closed until a Daymark-owned redirect-validating transport is complete; current main remains exposed through opaque DownloadManager redirects and Cookie forwarding.
3. **P0/P1 — Signing and Node24 (#665/#84):** independently review secret isolation and transitive action runtimes before merging.
4. **P1 — Recovery/storage/webhook (#675; #640/#603/#639/#636):** independent review; keep ambiguous bytes and unreadable state safe; merge only with exact-head checks.
5. **P1 — iCalendar/import-export (#656):** independent RFC 5545 review; no silent category/date/timezone loss.
6. **P1 — Extension trust/injection (#659/#676):** independent security review of opt-in, match scope, page binding and import preservation.
7. **P0 — Governance (#646):** owner configures PR-only main, independent approval, stable required Android/Ubuntu/Windows checks, stale-review dismissal, conversation resolution and force-push/deletion restrictions. No settings changed.
8. **P0 — Physical Android acceptance (#160):** current-main APK on real devices with model/API/WebView provider/version and APK SHA. CI/emulator artifacts are not physical-device acceptance.
9. **P1 — Reminder parity (#476):** recurrence anchors, long-gap catch-up, AlarmManager/Doze/reboot/timezone/OEM behavior.
10. **P2 — Browser UX/architecture (#348/#325):** compatibility, Reader Mode, app links, performance and measured cross-platform contracts.

## Work completed in this cycle

- Read root AGENTS.md and the latest linked status snapshot; rechecked live main, all six open PRs, all 12 open issues, exact heads, checks and recent mainline history.
- On #676, corrected CSS bootstrap guard-order assertions (commits `fd34e50ca6366fa2dab0054edb997cbf781dc105` and `1c11500fb47b79b39578649439c5567906e51ff6`). The branch later added JS-only bootstrap coverage and corrected the stale two-submission expectation; current head `59830d2` has all four exact-head checks **PASS**.
- On #675, refreshed `PROJECT_PLAN.md` and this status index/snapshot. An initial docs-only attempt tripped the retired-package guard because the legacy identifier was included in the new text; the literal was removed before the corrected head `b55ee39`. Current #675 exact-head Android CI, contracts and device APK checks **PASS**.
- Verified #675 code head `dbbf2b9` duplicate-key/recovery implementation and Node **726/726**; posted updated evidence to #640.
- Reproduced the #648 API 36 tap failure and posted the coordinate-space diagnosis to #613 and PR #648. No competing instrumentation/MainActivity edits were made.
- Verified current-main download redirect/cookie exposure and posted the unmerged fail-closed/transport distinction to #671.
- Verified current-main PR-triggered signing-secret environment exposure and posted evidence to #84; no secret values accessed.
- Rechecked extension trust review paths, iCalendar parser envelopes, exact-head CI for #656/#659/#665, and live main protection state; posted governance evidence to #646.
- No PR merged by this run. No production release/tag/version bump, application identity, signer, permissions, database schema, migration or user data changed. No automatic restore or destructive operation.
- Physical-device acceptance: **NOT TESTED**.

**Work by:** ChatGPT (OpenAI)  
**Model:** GPT-6  
**Tooling:** GitHub connector via Code Mode; exact-source and Actions/job-log inspection; official Android View API reference  
**Timestamp (UTC):** 2026-11-09T14:53:34.079Z
