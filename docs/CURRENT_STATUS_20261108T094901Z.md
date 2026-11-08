# Daymark whole-project engineering snapshot — 2026-11-08T09:49:01Z

This snapshot records live repository state and exact-head evidence for this engineering cycle. It distinguishes merged mainline work, open PR work, CI, emulator/device artifacts, and physical-device acceptance.

## Repository baseline and durable rules

- Repository: `AbrarulHaque8541/daymark`; default branch: `main`.
- Current main SHA: `3d121bf4fc14011ab1c8ae112ae72a31c9b7ab1b` (PR #599 merge commit; PR #600 is also merged in its history).
- `AGENTS.md` blob SHA: `492ed21e2219a8d1b80c7d6e63575525c98a5a91`; rules require source-backed changes, meaningful tests, exact-head evidence, independent review for risky storage/security/release changes, and no false device/release claims.
- Live Gradle identity: namespace/applicationId `com.abrar.daymark`; versionName `1.6`, versionCode `13`, minSdk `26`, targetSdk `36`. The automation guard says `com.cue.daymark`; this conflicts with live AGENTS.md and build source. No identity, signer, version, manifest, or data migration was changed. Preserve the live owner-approved identity until explicit migration authorization.
- Latest published production release: `v1.5`, published 2026-10-23T09:42:55Z, one APK asset. No release/tag/publication action occurred in this cycle.
- Branch protection endpoint returned HTTP 403 to this integration; rulesets query returned an empty list. Required protection/approval rules are therefore **NOT VERIFIED**. Do not merge based on assumptions.

## Mainline integration

### PR #600 — merged

- PR #600 merged at 2026-11-08T09:38:49Z as `a70472e1dca083a4e58c82212c8338c6edb938e6`.
- PR #602 had merged into PR #600's branch; its work is included in main.
- Main tree SHA matched tested PR #600 head tree `dfa37c5d6885af22b006611d5b3f3fa1471ce1f6`.
- Exact-head Android CI, Ubuntu/Windows contracts, browser-cookie safety, Focus UI/Sound, Focus Live Update, API 29/API 36 emulator lifecycle, non-publishing device acceptance artifact, and device-test APK build all passed. The GitHub Release publish job was skipped.
- Non-publishing debug artifact ID `13612322624`: `Daymark-githubSideload-debug.apk`, 1,863,924 bytes, SHA-256 `b6398aac82b0f57380945e6ccd5e396b82f489c8fef78fd7a05280d9e67ba93a`. Metadata: `com.abrar.daymark`, version 1.6/code 13, debug certificate (NOT production-signed), manual QA only. Physical device acceptance remains NOT TESTED.

### PR #599 — merged

- PR #599 merged at 2026-11-08T09:46:03Z as current main `3d121bf4fc14011ab1c8ae112ae72a31c9b7ab1b`.
- Merge tree exactly matches tested PR head `6511c1927ac34500930e18aabcd130964bdaf7e4`.
- It fixes the same-day weekday reminder trigger boundary. Only changed files were `TaskLogic.java` and `TaskLogicSmoke.java`.
- Exact-head Android CI **PASS**: Android core logic smoke 208 assertions; ReminderSchedulePolicySmoke 46 assertions; Node suite 484/484; Gradle builds successful.
- Cross-platform Ubuntu/Windows **PASS**; non-publishing device-acceptance artifact **PASS**; device-test APK/manifest checks **PASS**; release publication job **SKIPPED**.
- Physical Android AlarmManager/notification delivery **NOT TESTED**.

## Open PRs and exact-head state

### PR #601 — bare IP, IPv6, localhost browser navigation

- Head: `c59d957fd98eac7f5888eaf2198e4dc31dacbecb`; branch contains main only through `a70472e1`, not the newly merged `3d121bf4`. Refresh against current main before merge.
- Android CI **PASS**: canonical source guard ran, browser-address host smoke passed, Node suite 486/486, Gradle builds successful.
- Cross-platform Ubuntu/Windows **PASS**; non-publishing device-acceptance APK **PASS**; device-test APK/manifest workflow **PASS**.
- Android/web reject legacy leading-zero IPv4 forms (bare, HTTP, HTTPS) before WHATWG URL normalization; regression passed. IPv6 trailing-compression invalidity is covered and review thread resolved.
- PR API still reports base SHA `01daaa3b` and a changed-file list containing files already merged through #600; verify refreshed diff is limited to browser-address scope.
- Physical Android WebView navigation **NOT TESTED**. No independent approval is recorded.

### PR #604 — storage health unreadable-key correctness

- Tested code head: `02a35faa94d054d774e67a8141510ac2fadd6415`; PR base ref `main`.
- Changes: `storage-logic.js` reports unreadable keys/scan completeness separately from absent data; `storage-ui.js` displays unknown/partial states and avoids false empty-store claims; explicit retry still fails closed when a read fails; logic/UI tests cover partial and total read failures and confirm values remain untouched.
- Exact code-head checks **PASS**: cross-platform Ubuntu/Windows (`npm test` 488/488 each); Android CI (canonical source guard, Node 488/488, Android core smoke 205 assertions, Gradle builds successful); device-test APK/manifest workflow **PASS**, release-publish job **SKIPPED**.
- This branch is now being refreshed with current main and a durable status snapshot; the new merge/status-only head must complete its own checks before it is considered green.
- Local tests were NOT RUN in this connector runtime. Physical device testing is not applicable to the web-prototype localStorage code.
- No independent review is submitted; branch protection details are not verified. PR remains open/unmerged.

### PR #605 — edit-dialog accessibility follow-up

- Head `7bd66e0fbd13c7985f08bcd35f66a8f1c8dd0b29`, base snapshot `01daaa3b`, GitHub reports mergeable false.
- Removes `edit-form` (already fixed by merged PR #600) and adds useful `aria-labelledby="edit-heading"` to the edit dialog.
- Branch needs current-main integration so only the accessibility delta remains. Its `15:05:00Z` attribution/status timestamp was future-dated relative to this snapshot; a coordination comment requests correction. Agent-reported Node 462/462 is not independent evidence for current main.

## Open durable issues / backlog

- #160 physical Android/WebView acceptance: emulator API 29/36 and debug artifact are available, but physical device, real WebView, notifications, storage/restore, and same-signer upgrade remain NOT TESTED. Debug APK is not production-signed; do not install over an existing production-signed app or uninstall user data to test it.
- #348 browser reliability: complete redirects/cookies/forms/target=_blank/history, downloads/SAF, app-link return paths, TLS/offline consent, renderer recovery, accessibility, and performance matrix; PR #601 is a focused address slice only.
- #476 recurrence parity: weekday fix merged; real AlarmManager delivery and time-zone/device behavior remain to be validated.
- #325 cross-platform architecture: platform support matrix, shared-core boundaries, desktop proof-of-concept and browser-engine ADR remain open.
- #603 storage health: PR #604 code-head CI green; independent review and merge gates remain open.

## Safety / release state

- No package/applicationId change, signer change, version bump, release tag, production APK/AAB publication, destructive migration, or data deletion.
- No PR was merged by this automation run. PR #600 and #599 merges were performed on GitHub before this snapshot and independently verified.
- Physical-device acceptance: NOT TESTED. Emulator API 29/API 36: PASS only for the PR #600 lifecycle run; this does not prove physical-device behavior.

## Next priorities

1. Obtain independent review and verify required protection rules for PR #604; merge only after all required gates are freshly confirmed.
2. Refresh PR #601 against current main, verify the diff is only browser-address scope, and perform physical WebView address/navigation acceptance.
3. Rebase PR #605 onto current main, preserve the dialog accessibility improvement, and correct its timestamp/status snapshot.
4. Run physical-device QA from a safe spare/test installation; never replace a production-signed install with a debug-signed APK.
5. Continue the wider browser redirect/download/security/accessibility/performance matrix and #325 cross-platform architecture spike.

Work by: ChatGPT
Model: GPT-6
Tooling: GitHub connector (live source/PR/issue/Actions/artifact inspection, Git tree/commit/ref APIs) and local ZIP/SHA-256 inspection
Timestamp (UTC): 2026-11-08T09:49:01Z
