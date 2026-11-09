# Daymark whole-project engineering status — 2026-11-09T15:17:00Z

## Baseline and governance

- Repository: `AbrarulHaque8541/daymark`; default branch: `main`.
- Main SHA: `59e6961c0645a423eb736d16d129eb0e9cc871f7`.
- Root `AGENTS.md` blob: `492ed21e2219a8d1b80c7d6e63575525c98a5a91`; read in full.
- `docs/TECHNOLOGY_AGNOSTIC_ENGINEERING.md` blob: `71282a4e0789d1180b18cb915f7ad5878829bdee`; read in full.
- Main Android CI #42619910395 and Ubuntu/Windows contracts #42619910295: **PASS**.
- Live inventory: **7 open PRs / 12 open issues**. All seven PR bases equal current main (zero commits behind).
- No independent approval is recorded for any open PR; requested-reviewer lists are empty.
- Main branch API reports `protected=false`; rulesets API returns `[]`; detailed branch-protection endpoint returns HTTP 403 to this integration. No repository settings changed.
- Root AGENTS/Gradle specify the repository's owner-approved package identity; the run-level safety directive specifies a different package ID. No applicationId, namespace, manifest, signer or package migration was changed. Explicit owner reconciliation is required before any identity change.
- Releases: v1.5 published (2026-10-23); v1.4 draft. No release/tag/version bump was created in this run.

## Exact open PR inventory

All bases are `main@59e6961c0645a423eb736d16d129eb0e9cc871f7`.

| PR | Exact head | Verified checks | State / remaining gate |
|---|---|---|---|
| [#648 Focus lifecycle + fail-closed downloads](https://github.com/AbrarulHaque8541/daymark/pull/648) | `4e1199bcf4336144f04fe5c204a7aa08f2d173c9` | Android CI #42638970746, Focus lifecycle #42638970727, contracts #42638970829, Focus UI/Sound #42638970840, Live Update #42638970935, device acceptance artifact #42638970744 and device-test APK #42638970792 **PASS**. API29 **367 assertions PASS**; API36 **10/10 consecutive runs PASS**, 370 assertions each. | Draft, unmerged. Root-view visible bounds are translated to screen coordinates before UiAutomation injection; actual controls are positioned inside the ScrollView. Emulator acceptance complete; physical device acceptance pending. Downloads remain fail-closed; redirect-validating transport is not implemented. |
| [#656 iCalendar/import-export integrity](https://github.com/AbrarulHaque8541/daymark/pull/656) | `abc85397ebf13375238e6004acd1bd6b6e38b8d8` | Android CI #42633721799, contracts #42633722495, device APK #42633721795 **PASS**; Node **687/687 PASS**. | Open, not draft. Independent RFC5545/data-integrity review pending. |
| [#659 extension trust and storage preservation](https://github.com/AbrarulHaque8541/daymark/pull/659) | `8c96abd770f679796a0ad9fc5e8f5c12cda9e4cd` | Android CI #42622038075, contracts #42622038055, device acceptance #42622038156 and device APK #42622038116 **PASS**; Node **541/541 PASS**; ExtensionStore smoke **12 assertions PASS**; source-guard mutations **16/16 rejected**. | Draft. Independent extension-security/data-preservation review pending. |
| [#665 signing-secret isolation / Node24](https://github.com/AbrarulHaque8541/daymark/pull/665) | `d3cf902b36e47d1eca512df095fc883bbcd4ebbd` | Android CI #42622047147, contracts #42622047145, device APK #42622047583 **PASS**; tag-only signed release/publication steps skipped. | Draft. PR/debug builds receive no signing secrets; signed build is tag-only with temporary-keystore cleanup. Independent security/provenance review pending. Trusted upstream SLSA v1.4.0 still embeds upload-artifact v4.6.0 (Node20). |
| [#675 webhook/storage/recovery integration](https://github.com/AbrarulHaque8541/daymark/pull/675) | `f55ffb2e4e96ad51245ad833a6b76030792224c0` | Android CI #42640818091, contracts #42640818105, device-test APK #42640818066 **PASS**; code/test head `9bda5bf` Node **728/728 PASS**, Gradle debug build PASS. Release-publication job skipped. | Draft. Endpoint fingerprint isolation, WebCrypto fail-closed tests, storage-clear preflight and independent task/Focus backup reads pass. Independent security/data-integrity review pending. |
| [#676 page-bound extension injection](https://github.com/AbrarulHaque8541/daymark/pull/676) | `59830d290f023c7b0b2cf2828a10de8bedaf195a` | Android CI #42637746064, contracts #42637746292, device acceptance #42637746399 and device APK #42637746704 **PASS**; ExtensionInjectorSmoke **41 assertions PASS**. | Draft. Page-bound CSS/JS injection and JS-only GM_addStyle bootstrap verified; independent review and physical browser acceptance pending. |
| [#677 reminder system-time rescheduling](https://github.com/AbrarulHaque8541/daymark/pull/677) | `925930b88649c25017c2cd8f00af72dbf090e6fa` | Current Android CI #42642913013, contracts #42642913080, Focus Live Update #42642912574, Focus emulator #42642912604, device-test APK #42642912723 and device acceptance #42642912754: **IN PROGRESS/PENDING**. Previous head `b596f0`: Android CI, contracts, Focus Live Update and device acceptance artifact PASS; Focus emulator/device APK still in progress. Intermediate head `98900a2`: host regression/Node/contracts passed before the final documentation-only clarification. | Draft; 14 commits, 9 files, 0 behind. Adds TIME_SET/TIMEZONE_CHANGED rescheduling through the existing encrypted-store/rescheduleAll path, pure policy smoke assertions, manifest/source guards and mutation tests. Current exact-head CI must finish; physical clock/timezone transition testing remains pending. |

## Open issues (12)

- #671 redirect-validating browser download transport.
- #646 main branch protection and independent review.
- #640 recovery backup discovery when one backup key is unreadable.
- #639 webhook queue concurrency and delivery acknowledgement.
- #636 webhook endpoint secret privacy.
- #613 Focus Timer API36 lifecycle/touch acceptance.
- #603 storage health must distinguish unreadable from absent.
- #476 Android/web repeat scheduling, anchors, long-gap catch-up and reminder parity.
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
- #655 webhook automation card/cross-tab implementation (endpoint partitioning is corrected in #675).

No PR was merged by this run.

## Engineering delivered or advanced in this run

### Focus instrumentation — PR #648

- API36 trace exposed that `getGlobalVisibleRect()` returns root-view-relative bounds while `UiAutomation.injectInputEvent()` consumes screen coordinates.
- Latest instrumentation translates bounds by root-view `getLocationOnScreen()`, adds scrollable content before initial taps, and positions actual Countdown/Stopwatch controls inside the ScrollView.
- Source guards/mutation tests protect coordinate conversion, scroll-range precondition and control positioning.
- API29 367 assertions PASS; API36 10/10 consecutive runs PASS, 370 assertions per run. No gesture assertion was weakened.
- Physical device acceptance remains NOT TESTED. Downloads remain fail-closed until a complete redirect-validating transport exists.

### Webhook/storage/recovery — PR #675

- New queue events store only a SHA-256 fingerprint of the normalized HTTPS destination; raw endpoint URLs remain session-only.
- Delivery recomputes the fingerprint from the actual URL and rejects mismatched/unassigned events before fetch. Different tabs/endpoints cannot deliver each other's events.
- Legacy unassigned events require explicit confirmation; declining preserves exact queue bytes. Clear action explicitly clears all saved queued events.
- WebCrypto SHA-256 unavailable: fail closed without queue persistence or network send. Both tests pass.
- Storage clear preflights all managed keys and distinguishes unreadable/unknown from absent. Task and Focus backup keys are read independently; one unreadable key does not hide the other readable opaque backup.
- Task persistence occurs before external completion notification.
- Exact code/test head Node 728/728, Android CI/build, contracts and device-test APK PASS. Docs-only head f55ffb reran Android CI, contracts and device APK PASS; release publication skipped.

### Extension page scope — PR #676

- Injection checks the finished page URL before queueing and rechecks it inside CSS/bootstrap and JS submissions.
- JS-only userscripts receive the page-bound GM_addStyle bootstrap even with empty CSS; two-submission ceiling preserved.
- ExtensionInjectorSmoke 41 assertions PASS; Android/contracts/device artifact workflows PASS.

### Import/export — PR #656

- RFC5545 CATEGORIES handles repeated properties, escaped commas and semicolon text.
- VTODO completion metadata requires valid STATUS/COMPLETED pairing and UTC DATE-TIME; seconds precision/timezone loss is disclosed.
- CSV nested subtask JSON duplicate-key detection rejects malformed/ambiguous rows without modifying task storage.
- Node 687/687, Android/contracts/device APK PASS.

### Extension storage — PR #659

- Existing packs over 200 KB are rejected, never silently truncated.
- File-read errors are separate from parse errors; unreadable existing paths are never overwritten by imports.
- Imported extensions remain disabled until explicit activation.
- Node 541/541, Android/contracts/device workflows PASS; 12 smoke assertions and 16 source-guard mutation cases pass.

### CI signing boundary — PR #665

- PR/debug builds receive no production keystore/password/alias environment.
- Signed release build and signing secrets are tag-only; temporary-keystore cleanup is trapped.
- Release workflows use verified Node24 action pins.
- Exact-head Android/contracts/device APK PASS. Draft pending independent security/provenance review.
- Remaining Node20 dependency is inside trusted upstream SLSA reusable generator v1.4.0.

### Reminder system-time recovery — PR #677

- Current main only re-armed Android reminder alarms after boot/quick-boot, task saves and app open, although the scheduler resolves due times with `ZoneId.systemDefault()`.
- PR #677 adds `TIME_SET` and `TIMEZONE_CHANGED` to the existing non-exported receiver and routes them through the existing encrypted task read and idempotent `rescheduleAll()` path.
- Adds a pure `ReminderSchedulePolicy` classifier, smoke assertions for four accepted system actions and unrelated/null actions, manifest/source guards and mutation cases for each action/dispatch.
- No permission, service, exact-alarm permission, poller, storage format or migration added; existing inexact Doze-delay limitation remains.
- Browser reminder docs now accurately describe the in-page check as nominally every 30 seconds while open, subject to background timer throttling, with no OS/background delivery after tab close.
- Android official docs list TIME_SET and TIMEZONE_CHANGED as API26+ implicit-broadcast exceptions for alarm updates: https://developer.android.com/develop/background-work/background-tasks/broadcasts/broadcast-exceptions.
- Current exact head 925930 workflows are in progress/pending; previous head b596f passed Android CI/contracts/device acceptance artifact, but Focus emulator and device APK had not completed. No physical clock/timezone transition test yet.

## Prioritized repo-wide backlog

1. **P0 — Independent review/integration:** #675 webhook endpoint isolation/storage/recovery; #665 signing-secret boundary; #656 import/data semantics; #659/#676 extension security; #648 Focus/download boundary; #677 reminder system-time rescheduling. No merge without fresh independent approval and exact-head CI.
2. **P0 — Physical Android acceptance (#160):** current-main APK on real devices with model/API/WebView provider/version, APK SHA and scenario evidence for browser, extensions, SAF, updates, reminders and downloads. CI/emulator artifacts are not physical-device acceptance.
3. **P0 — Browser downloads (#671/#648):** keep current-main downloads blocked until a Daymark-owned redirect-by-redirect HTTPS transport enforces downgrade/private-address/host checks, same-origin cookies, no referrer/ambient credentials, bounded streaming, temp-file cleanup and cancellation/error handling. Do not use preflight-then-DownloadManager.
4. **P1 — Reminder delivery (#476/#677):** finish exact-head CI, test actual clock/timezone changes and reboot/Doze/OEM behavior on physical devices; retain browser background-throttling limitations.
5. **P0 — Main governance (#646):** owner-side PR-only protection, independent approval, required Android and Ubuntu/Windows checks, stale-review dismissal, resolved conversations and force-push/deletion restrictions. No settings changed.
6. **P1 — Finish Node24/provenance (#84):** preserve trusted SLSA identity; wait for upstream Node24-compatible reusable workflow or perform a separately reviewed provenance migration.
7. **P2 — Cross-platform/browser architecture (#325/#348):** measured compatibility and performance work.

## Safety and verification limitations

- No force merge/protection bypass.
- No PR merged by this run; no production release, tag, version bump, signing-key change, applicationId change, destructive migration or user-data operation.
- Physical Android/device/browser testing: **NOT TESTED**.
- Local Node/Gradle tests were not run in this environment; canonical GitHub Actions were used. A local clone attempt was blocked by outbound DNS resolution. JavaScript source syntax was parsed in the tool runtime.
- GitHub integration cannot set a separate commit author/committer identity; commit metadata follows the authenticated repository account. Work attribution is disclosed in PR bodies/comments/commit messages.

**Work by:** ChatGPT (OpenAI)  
**Model:** GPT-6  
**Tooling:** GitHub connector via Code Mode; live repo/PR/issue inventory, source review, Actions/job-log inspection, Android official documentation  
**Timestamp (UTC):** 2026-11-09T15:17:00Z
