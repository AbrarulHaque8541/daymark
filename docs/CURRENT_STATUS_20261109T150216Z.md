# Daymark whole-project engineering status — 2026-11-09T15:02:16Z

## Baseline

- Repository: `AbrarulHaque8541/daymark`; default branch: `main`.
- Main SHA: `59e6961c0645a423eb736d16d129eb0e9cc871f7`.
- Root `AGENTS.md` blob: `492ed21e2219a8d1b80c7d6e63575525c98a5a91`; read in full.
- `docs/TECHNOLOGY_AGNOSTIC_ENGINEERING.md` blob: `71282a4e0789d1180b18cb915f7ad5878829bdee`; read in full.
- Main Android CI #42619910395 and Ubuntu/Windows contracts #42619910295: **PASS**.
- Live inventory: **6 open PRs / 12 open issues**. All six PRs are based on the current main SHA (zero commits behind).
- No independent approval is recorded for any open PR; requested-reviewer lists are empty.
- Main branch API reports `protected=false`; rulesets API returns `[]`; detailed branch-protection endpoint returns HTTP 403 to this integration. No repository settings changed.
- Root AGENTS/Gradle specify the repository's owner-approved package identity; the run-level safety directive specifies a different package ID. No applicationId, namespace, manifest, signer or package migration was changed. Explicit owner reconciliation is required before any identity change.
- Releases: v1.5 published (2026-10-23); v1.4 draft. No release/tag/version bump was created in this run.

## Exact open PR inventory

All bases are `main@59e6961c0645a423eb736d16d129eb0e9cc871f7`.

| PR | Head at capture | Exact-head CI and tests | State / remaining gate |
|---|---|---|---|
| [#648 Focus lifecycle + fail-closed downloads](https://github.com/AbrarulHaque8541/daymark/pull/648) | `4e1199bcf4336144f04fe5c204a7aa08f2d173c9` | Android CI #42638970746 **PASS**; Focus lifecycle #42638970727 **PASS**; Ubuntu/Windows contracts #42638970829 **PASS**; Focus UI/Sound #42638970840 **PASS**; Live Update #42638970935 **PASS**; device acceptance artifact #42638970744 and device-test APK #42638970792 **PASS**. API29: **367 assertions PASS**. API36: **10/10 consecutive runs PASS**, 370 assertions each. | Draft, unmerged. Root-view visible bounds are translated to screen coordinates before UiAutomation injection; scroll content exists before initial taps; actual controls are positioned inside the parent ScrollView and re-centered after vertical drags. Emulator acceptance is complete; physical device acceptance remains pending. Downloads remain fail-closed on this unmerged branch; redirect-validating transport is not implemented. |
| [#656 iCalendar/import-export integrity](https://github.com/AbrarulHaque8541/daymark/pull/656) | `abc85397ebf13375238e6004acd1bd6b6e38b8d8` | Android CI #42633721799, contracts #42633722495, device APK #42633721795 **PASS**; Node **687/687 PASS**. | Open, not draft. Independent RFC 5545/data-integrity review pending. |
| [#659 extension trust and storage preservation](https://github.com/AbrarulHaque8541/daymark/pull/659) | `8c96abd770f679796a0ad9fc5e8f5c12cda9e4cd` | Android CI #42622038075, contracts #42622038055, device acceptance #42622038156 and device APK #42622038116 **PASS**; Node **541/541 PASS**; ExtensionStore smoke **12 assertions PASS**; source-guard mutation cases **16/16 rejected**. | Draft, unmerged. Independent extension-security/data-preservation review pending. |
| [#665 signing-secret isolation / Node24](https://github.com/AbrarulHaque8541/daymark/pull/665) | `d3cf902b36e47d1eca512df095fc883bbcd4ebbd` | Android CI #42622047147, contracts #42622047145, device APK #42622047583 **PASS**; tag-only signed release/publication steps skipped. | Draft (converted to draft in this run). PR/debug builds receive no signing secrets; signed build is tag-only with temporary-keystore cleanup. Independent security/provenance review pending. Upstream SLSA reusable workflow v1.4.0 still embeds upload-artifact v4.6.0 (Node20); do not change trusted builder identity without provenance review. |
| [#675 webhook/storage/recovery integration](https://github.com/AbrarulHaque8541/daymark/pull/675) | `9bda5bfcc2278fdc60522e3492b383340b4b57f8` (before this snapshot/docs commit) | Android CI #42640046741 **PASS**; Node **728/728 PASS**; Gradle debug variants **BUILD SUCCESSFUL**; Ubuntu/Windows contracts #42640046736 **PASS**; device-test APK #42640046658 **PASS** (release publication skipped). | Draft, unmerged. Current exact-head code/tests are green. This status snapshot and index/plan updates are committed on the same PR branch, so the live PR head advances beyond the capture SHA and reruns CI. Independent security/data-integrity review remains required. |
| [#676 page-bound extension injection](https://github.com/AbrarulHaque8541/daymark/pull/676) | `59830d290f023c7b0b2cf2828a10de8bedaf195a` | Android CI #42637746064, Ubuntu/Windows contracts #42637746292, device acceptance #42637746399 and device APK #42637746704 **PASS**; ExtensionInjectorSmoke **41 assertions PASS**. | Draft, unmerged. Page-bound CSS/JS injection and JS-only GM_addStyle bootstrap verified; independent extension-security review and physical browser acceptance pending. |

## Open issues (12)

- #671 redirect-validating browser download transport.
- #646 main branch protection and independent review.
- #640 recovery backup discovery when one backup key is unreadable.
- #639 webhook queue concurrency and delivery acknowledgement.
- #636 webhook endpoint secret privacy.
- #613 Focus Timer API36 lifecycle/touch acceptance.
- #603 storage health must distinguish unreadable from absent.
- #476 Android/web recurrence, anchors, long-gap catch-up and reminder parity.
- #348 browser compatibility, downloads, app links, proxy options and performance.
- #325 cross-platform architecture/compatibility.
- #160 physical Android runtime acceptance matrix.
- #84 GitHub Actions runtime/deprecation and provenance workflow audit.

## Recent merged mainline work

- #674 reverted accidental main-branch touch-helper scaffolding; merge commit is current main SHA `59e6961`.
- #669 refreshed the whole-project status/backlog.
- #673 nightly placeholder guard path-safety.
- #672 VTODO false-positive guard.
- #657 terminal recurring-reminder fire persistence.
- #670 accessible press feedback.
- #604 status-index history.
- #663 task editor/toast markup contract.
- #655 webhook automation card/cross-tab implementation (the endpoint-partition gap is corrected in #675).

No PR was merged by this run.

## Engineering delivered or advanced in this run

### Focus Timer instrumentation — PR #648

- Exact API36 trace exposed a root-view/screen coordinate mismatch: `getGlobalVisibleRect()` returns root-view coordinates, while `UiAutomation.injectInputEvent()` consumes screen coordinates.
- Latest instrumentation translates visible bounds by the root view's `getLocationOnScreen()`, uses screen-space diagnostics, inserts scrollable content before initial taps, and positions the actual Countdown/Stopwatch controls before taps and after vertical drags.
- Source guards and mutation tests protect coordinate conversion, scroll-range precondition, and control-positioning order.
- Exact-head API29 367 assertions PASS; API36 ten consecutive runs PASS with 370 assertions per run. No gesture assertion was weakened and no retry workaround was added.

### Webhook, storage and recovery — PR #675

- New queue events store only a SHA-256 fingerprint of the normalized HTTPS destination; the raw endpoint URL remains session-only and is never persisted.
- `flushQueue` recomputes the fingerprint from the actual endpoint and rejects mismatched/unassigned events before fetch. Tabs configured with different endpoints cannot deliver each other's events.
- Legacy unassigned events require explicit confirmation; declining preserves exact queue bytes. Clear action explicitly says “Clear all queued events”.
- If Web Crypto SHA-256 is unavailable, task completion fails closed without queue persistence or network send. Both dedicated tests pass on exact head.
- Existing branch work preserves Web Locks coordination, persist-task-before-notify ordering, storage-clear preflight/unknown-state handling, and independent task/Focus backup reads.
- Exact-head Node 728/728, Android CI/build, Ubuntu/Windows contracts and device-test APK verification all PASS. Release publication skipped.

### Extension page-scope — PR #676

- Injection checks the finished page URL before queueing and rechecks it inside CSS/bootstrap and JS submissions.
- JS-only userscripts receive the page-bound bootstrap that defines `GM_addStyle`, even when CSS is empty; maximum two submissions and empty-pack no-op are preserved.
- ExtensionInjectorSmoke 41 assertions PASS; Android/contracts/device acceptance/device APK workflows PASS.

### Import/export integrity — PR #656

- RFC5545 CATEGORIES handles repeated properties, escaped commas and semicolon text correctly.
- VTODO completion metadata requires valid STATUS/COMPLETED pairing and UTC DATE-TIME; unsupported timezone/seconds precision loss is disclosed.
- CSV nested subtask JSON uses duplicate-key detection; malformed/duplicate-key rows are skipped without modifying the existing task store.
- Exact-head Node 687/687, Android, contracts and device APK PASS.

### Extension import/storage — PR #659

- Existing packs over 200 KB are rejected, never silently truncated.
- File-read errors are separate from parse errors; unreadable existing paths are never overwritten by an import.
- Imported extensions remain disabled until explicit activation.
- Exact-head Node 541/541, Android/contracts/device workflows PASS; 12 smoke assertions and 16 source-guard mutation cases pass.

### CI signing boundary — PR #665

- PR/debug builds receive no production keystore/password/alias environment.
- Signed release build and signing secrets are tag-only; temporary keystore cleanup is trapped.
- Release workflows use verified Node24 action pins.
- Exact-head Android/contracts/device APK checks PASS. PR remains draft pending independent security/provenance review.
- Daymark-owned standard workflows inspected use Node24 actions; remaining Node20 dependency is inside the trusted upstream SLSA reusable generator v1.4.0.

## Prioritized repo-wide backlog

1. **P0 — Independent review/integration:** #675 webhook endpoint isolation, storage-clear preflight and recovery; #665 signing-secret boundary; #656 import/data semantics; #659/#676 extension security. No PR merge without fresh independent approval and exact-head CI.
2. **P0 — Physical Android acceptance (#160):** current-main APK on real devices with model/API/WebView provider/version, APK SHA and scenario evidence for browser, extensions, SAF, updates, reminders and downloads. Emulator/CI artifacts are not physical-device acceptance.
3. **P0 — Browser downloads (#671/#648):** keep current-main downloads blocked until a Daymark-owned redirect-by-redirect HTTPS transport enforces downgrade/private-address/host checks, same-origin cookies, no referrer/ambient credentials, bounded streaming, temp-file cleanup and cancellation/error handling. Do not use preflight-then-DownloadManager.
4. **P1 — Reminder parity (#476):** recurrence anchors, long-gap catch-up, AlarmManager/Doze/reboot/timezone/OEM behavior.
5. **P0 — Main governance (#646):** owner-side PR-only protection, independent approval, required Android and Ubuntu/Windows checks, stale-review dismissal, resolved conversations and force-push/deletion restrictions. No settings changed.
6. **P1 — Finish Node24/provenance (#84):** preserve trusted SLSA identity; wait for upstream Node24-compatible reusable workflow or perform a separately reviewed provenance migration.
7. **P2 — Cross-platform/browser architecture (#325/#348):** measured compatibility and performance work.

## Safety and verification limitations

- No force merge/protection bypass.
- No PR merged by this run; no production release, tag, version bump, signing-key change, applicationId change, destructive migration or user-data operation.
- Physical Android/device/browser testing: **NOT TESTED**.
- Local Node/Gradle tests were not run in this environment; canonical GitHub Actions were used. A local clone attempt was blocked by outbound DNS resolution. JavaScript source syntax was parsed in the tool runtime.
- The GitHub integration cannot set a separate commit author/committer identity; commit metadata follows the authenticated repository account. Work attribution is disclosed in PR comments and commit messages.

**Work by:** ChatGPT (OpenAI)  
**Model:** GPT-6  
**Tooling:** GitHub connector via Code Mode; live repository inventory, source/PR diff review, Actions/job-log inspection, JavaScript syntax parsing  
**Timestamp (UTC):** 2026-11-09T15:02:16Z
