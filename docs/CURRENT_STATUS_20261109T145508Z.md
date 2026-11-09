# Daymark whole-project engineering status — 2026-11-09T14:55:08Z

## Repository baseline and governance

- Repository: `AbrarulHaque8541/daymark`; default branch: `main`.
- Current main SHA: `59e6961c0645a423eb736d16d129eb0e9cc871f7`.
- Root `AGENTS.md` blob: `492ed21e2219a8d1b80c7d6e63575525c98a5a91`; read in full.
- `docs/TECHNOLOGY_AGNOSTIC_ENGINEERING.md` blob: `71282a4e0789d1180b18cb915f7ad5878829bdee`; read in full.
- Main Android CI #42619910395: **PASS**. Main Ubuntu/Windows contracts #42619910295: **PASS**.
- Live inventory: **6 open PRs / 12 open issues**. All six open PRs are based on the current main SHA (zero commits behind).
- Main branch API reports `protected=false`; rulesets API returns `[]`; detailed branch-protection endpoint returns HTTP 403 to this integration. No repository settings changed.
- No independent approval is recorded for any open PR; requested-reviewer lists are empty. All six remain unmerged.
- Root AGENTS.md and Gradle specify the repository's owner-approved package identity; the run-level safety directive specifies a different package ID. No applicationId, namespace, manifest, signer or package migration was changed. Explicit owner reconciliation is required before any identity change.
- Releases: v1.5 published (2026-10-23); v1.4 draft. No release/tag/version bump was created in this run.

## Exact open PR inventory

All bases are `main@59e6961c0645a423eb736d16d129eb0e9cc871f7`.

| PR | Exact head | Exact-head checks and evidence | State / blocker |
|---|---|---|---|
| [#648 Focus lifecycle + fail-closed downloads](https://github.com/AbrarulHaque8541/daymark/pull/648) | `4e1199bcf4336144f04fe5c204a7aa08f2d173c9` | Android CI #42638970746 **PASS**; Focus UI/Sound #42638970840 **PASS**; Live Update #42638970935 **PASS**. Focus lifecycle #42638970727 **IN PROGRESS**; contracts #42638970829 **PENDING**; device-test APK #42638970792 and device acceptance #42638970744 **IN PROGRESS**. Previous head `dd73640`: API29 **PASS**, API36 **FAIL** at run 1/10. | Draft. New head adds real-control positioning, scroll content before the first tap, root-view-to-screen coordinate conversion for `UiAutomation` touch injection, and guards/mutation tests. API36 ten-run result is still unverified. Downloads remain fail-closed only on this unmerged branch. |
| [#656 iCalendar/import-export integrity](https://github.com/AbrarulHaque8541/daymark/pull/656) | `abc85397ebf13375238e6004acd1bd6b6e38b8d8` | Android CI #42633721799, contracts #42633722495, device APK #42633721795 **PASS**; Node suite **687/687 PASS**. | Open, not draft. Independent RFC 5545/data-integrity review pending. |
| [#659 extension trust and storage preservation](https://github.com/AbrarulHaque8541/daymark/pull/659) | `8c96abd770f679796a0ad9fc5e8f5c12cda9e4cd` | Android CI #42622038075, contracts #42622038055, device acceptance #42622038156 and device APK #42622038116 **PASS**; Node suite **541/541 PASS**; ExtensionStore smoke **12 assertions PASS**; source-guard mutation cases **16/16 rejected**. | Draft. Independent extension-security/data-preservation review pending. |
| [#665 signing-secret isolation / Node24](https://github.com/AbrarulHaque8541/daymark/pull/665) | `d3cf902b36e47d1eca512df095fc883bbcd4ebbd` | Android CI #42622047147, contracts #42622047145, device APK #42622047583 **PASS**; tag-only signed release/publication steps skipped. | Draft (converted to draft in this run). PR/debug Gradle receives no signing secrets; signed build is tag-only with temp-keystore cleanup. Independent security/provenance review pending. Upstream SLSA reusable workflow v1.4.0 still embeds upload-artifact v4.6.0 (Node20); do not change trusted builder identity without provenance review. |
| [#675 webhook/storage/recovery integration](https://github.com/AbrarulHaque8541/daymark/pull/675) | `a8d57946cee0645db99304a52b34071e022c3b31` | Current Android CI #42639203215 **IN PROGRESS**; contracts #42639203217 **IN PROGRESS**; device APK #42639203090 **PENDING**. Previous code/docs head `b55ee396`: Node **726/726 PASS**, Android CI #42638489859, contracts #42638489934 and device APK #42638489813 **PASS**. Current head adds two WebCrypto-unavailable fail-closed tests; exact-head checks must finish before reporting them as passed. | Draft. Independent data-storage/security review pending. |
| [#676 page-bound extension injection](https://github.com/AbrarulHaque8541/daymark/pull/676) | `59830d290f023c7b0b2cf2828a10de8bedaf195a` | Android CI #42637746064, contracts #42637746292, device acceptance #42637746399 and device APK #42637746704 **PASS**; ExtensionInjectorSmoke **41 assertions PASS**. | Draft. Independent extension-security review and physical browser acceptance pending. |

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
- #655 webhook automation card/cross-tab implementation (the unsafe endpoint-partition gap is being corrected on #675).

No PR was merged by this run.

## Engineering delivered or advanced in this run

### PR #675 — webhook endpoint isolation and fail-closed behavior

- `webhook-logic.js`: compute SHA-256 over the normalized HTTPS destination (fragment removed); new events store only the digest, never the endpoint URL. `flushQueue` recomputes the digest from the actual URL and rejects mismatched or unassigned events before fetch.
- `webhook-ui.js`: only events matching the current tab's endpoint are sent; other-endpoint events remain queued. Legacy unassigned events require explicit confirmation; declining preserves the exact queue bytes. Clear action explicitly clears all saved queued events on this device.
- If Web Crypto SHA-256 is unavailable, queueing/delivery fails closed. Two new tests now verify no event is persisted or sent in that environment; their current exact-head CI is still pending.
- Cross-tab tests verify a tab configured with endpoint B cannot deliver endpoint A's event.
- Existing branch work also preserves session-only endpoint configuration, Web Locks coordination, persist-task-before-notify ordering, storage-clear preflight/unknown-state handling, and independent task/Focus backup reads.
- Prior exact code head passed Node **726/726**, Android CI, Ubuntu/Windows contracts and device APK. Current head adds two more security tests and is awaiting exact-head reruns.

### PR #648 — Focus instrumentation coordinate correction

- Latest instrumentation trace showed `getGlobalVisibleRect()` bounds are root-view-relative while `UiAutomation.injectInputEvent()` consumes screen coordinates.
- Latest head translates visible bounds by `getRootView().getLocationOnScreen()` before pointer injection and reports parent ScrollView bounds in the same screen coordinate space.
- Scrollable content is inserted before initial taps; actual Countdown/Stopwatch controls are centered inside the parent ScrollView before initial taps and re-centered after vertical drags before follow-up taps.
- Source guard and mutation tests require root-to-screen conversion, scroll-range precondition, and control-positioning order.
- Previous API36 failure remains the last completed runtime evidence; latest head's API36 ten-run gate is still in progress. No gesture assertion was weakened and no retry workaround was added.

### PR #676 — extension page-scope and JS-only userscripts

- Injection checks the finished page URL before queueing and rechecks it inside CSS/bootstrap and JS submissions.
- JS-only userscripts now receive the page-bound bootstrap that defines `GM_addStyle`, even when CSS payload is empty; total remains at most two submissions, empty packs remain a no-op.
- Host smoke verifies bootstrap-before-script ordering; exact-head ExtensionInjectorSmoke **41 assertions PASS** and Android/contracts/device artifact workflows PASS.

### PR #656 — import/export integrity

- RFC5545 CATEGORIES handles repeated properties, escaped commas and semicolon text correctly.
- VTODO completion metadata requires valid STATUS/COMPLETED pairing and valid UTC DATE-TIME; unsupported timezone/seconds precision loss is disclosed.
- CSV nested subtask JSON uses duplicate-key detection; malformed/duplicate-key rows are skipped without modifying the existing task store.
- Exact-head Node **687/687 PASS**, Android/contracts/device APK PASS.

### PR #659 — extension storage preservation

- Existing packs over 200 KB are rejected, never silently truncated.
- File-read errors are separated from parse errors; an unreadable existing path is never overwritten by an import.
- Imported extensions remain disabled until explicit activation.
- Exact-head Android/contracts/device workflows PASS; 12 smoke assertions and 16 source-guard mutation cases pass.

### PR #665 — CI signing boundary and Node24

- PR/debug builds receive no production keystore/password/alias environment.
- Signed release build and signing secrets are tag-only; temporary keystore cleanup is trapped.
- Release workflows use verified Node24 action pins.
- Exact-head Android/contracts/device APK checks PASS. PR remains draft pending independent security/provenance review.
- Daymark-owned standard workflows inspected use Node24 actions; remaining Node20 dependency is transitive inside the trusted upstream SLSA reusable generator v1.4.0.

## Prioritized repo-wide backlog

1. **P0 — Focus API36 (#648/#613):** complete the latest root-to-screen/viewport fix; inspect exact API36 ten-run logs. If it passes, continue actual parent-scroll and post-drag tap assertions; if it fails, use the exact new screen-space diagnostics. Do not weaken tests.
2. **P0 — Webhook/storage/recovery (#675; #636/#639/#640/#603):** finish current exact-head tests, obtain independent security/data-integrity review, reconcile the integrated automation card with endpoint-partitioned queue semantics, and verify no cross-endpoint send.
3. **P0 — Signing boundary (#665/#84):** independent review of PR/debug secret isolation and trusted SLSA transitive action runtime before any merge.
4. **P1 — Extension injection/import (#676/#659):** independent review of page matching, stale navigation, GM_addStyle, opt-in activation and preservation of existing packs; physical browser/device acceptance.
5. **P1 — iCalendar/import-export (#656):** independent RFC5545/data-integrity review for recurrence, category, timezone and completion metadata.
6. **P0 — Browser downloads (#671/#648):** keep current-main downloads blocked until a Daymark-owned redirect-by-redirect HTTPS transport enforces downgrade/private-address/host checks, same-origin cookies, no referrer/ambient credentials, bounded streaming, temp-file cleanup and cancellation/error handling. Do not use preflight-then-DownloadManager.
7. **P0 — Physical Android acceptance (#160):** test current-main APK on real devices with model/API/WebView provider/version, APK SHA and evidence for browser, extensions, SAF, updates, reminders and downloads. CI/emulator artifacts are not physical-device acceptance.
8. **P1 — Reminder parity (#476):** recurrence anchors, long-gap catch-up, AlarmManager/Doze/reboot/timezone/OEM behavior.
9. **P0 — Main governance (#646):** owner-side PR-only protection, independent approval, required Android and Ubuntu/Windows checks, stale-review dismissal, resolved conversations, force-push/deletion restrictions. No settings changed.
10. **P2 — Cross-platform/browser architecture (#325/#348):** measured compatibility and performance work.

## Safety and verification limitations

- No force merge/protection bypass.
- No PR merged by this run; no production release, tag, version bump, signing-key change, applicationId change, destructive migration or user-data operation.
- Physical Android/device/browser testing: **NOT TESTED**.
- Local Node/Gradle tests were not run in this environment; JavaScript source syntax was parsed in the tool runtime. Canonical GitHub Actions evidence is listed above.
- The GitHub integration cannot set a separate commit author/committer identity; commit metadata follows the authenticated repository account. Work attribution is disclosed in PR comments.
- No local clone was available for independent Gradle/emulator execution; exact-head GitHub Actions remain the canonical test evidence.

**Work by:** ChatGPT (OpenAI)  
**Model:** GPT-6  
**Tooling:** GitHub connector via Code Mode; exact-source review, PR/issue inventory, Actions/job-log inspection, JavaScript syntax parsing  
**Timestamp (UTC):** 2026-11-09T14:55:08Z
