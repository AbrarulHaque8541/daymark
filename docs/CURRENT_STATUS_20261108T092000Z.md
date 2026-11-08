# Daymark whole-project engineering snapshot — 2026-11-08T09:20:00Z

This is the authoritative handoff for the current engineering cycle. It is based on live GitHub source, branch, PR, issue, and Actions state fetched at this timestamp. Older snapshots in the index include known future/mislabeled timestamps; do not treat them as current state.

## Repository baseline and instructions

- Repository: [AbrarulHaque8541/daymark](https://github.com/AbrarulHaque8541/daymark)
- Current `main`: `01daaa3b3cef768a273085cd32f096145519bb47`.
- `AGENTS.md` was fetched and read. It requires source-backed changes, meaningful tests, durable status snapshots, agent attribution, no weakening tests, and independent review for security/build/release-sensitive changes.
- Live Android build configuration declares `namespace = "com.abrar.daymark"` and `applicationId = "com.abrar.daymark"`. The run-level safety instruction names a different legacy package identifier. This identity conflict is unresolved. No package ID, namespace, version, manifest permission, signing, or data migration was changed; do not attempt identity work without explicit owner resolution.
- Existing draft release v1.4 was observed and left untouched. No release, tag, or publication action was performed.

## Work delivered in this cycle

### PR #600 — World-clock Save as text, style coverage, Gradle CI reliability

[PR #600](https://github.com/AbrarulHaque8541/daymark/pull/600)

- Current head: `fe5103351ad7b0a80a96880851c3e35016ef01be`.
- Base: `01daaa3b3cef768a273085cd32f096145519bb47`.
- OPEN, currently mergeable; 15 changed files, 37 commits; no submitted reviews or unresolved inline threads.
- Restored the full `tests/zones-ui.test.js` regression suite (426 lines) and retained Save-as-text tests; Node suite previously passed 484/484 on an earlier code-equivalent head.
- Save-as-text now uses injected Blob/URL capabilities, requires a usable document body and an actual anchor click before reporting success, removes the temporary anchor, defers object-URL revocation, and always clears `aria-busy`. Tests no longer mutate global URL state.
- Removed the unused `edit-form` class that caused the mainline style-coverage test to fail.
- Gradle 8.13 wrapper now pins the official distribution SHA-256 `20f1b1176237254a6fc204d8434196fa11a4cfb387567519c61556e8710aed78`, keeps a 120-second timeout and URL validation. A direct `downloads.gradle.org` experiment still redirected to GitHub Releases and returned HTTP 504, so it was reverted.
- A Huawei Cloud mirror is retained only as wrapper transport fallback; the official SHA-256 remains the integrity gate. The official Gradle Actions v4.4.3 commit `48b5f213c81028ace310571dc5ec0fbbca0b2947` is pinned for wrapper validation and setup/cache. Fork PR cache writes remain read-only; same-repository branches may seed the cache.
- Added `run-gradle-with-retry.sh`: prefers action-provisioned Gradle 8.13, otherwise uses the checksum-pinned wrapper; retries only HTTP 5xx for the Gradle binary ZIP, at most three total attempts with 2s/4s backoff. Ordinary compile/test/build failures are not retried.
- Added `run-gradle-with-retry-tests.sh` covering action-installed Gradle selection, wrong-version fallback, transient 504 retry, no retry on build failure, bounded exhaustion, and backoff validation. The canonical `check-v1-source.sh` invokes this Bash-only smoke with `bash` and guards all six workflow integrations.
- Six non-publishing Android CI workflows use the setup/cache + retry path: `android.yml`, `android-device-acceptance.yml`, `android-device-test-release.yml`, `browser-cookie-import-safety.yml`, `focus-live-update.yml`, and `focus-timer-ui.yml`.
- Local source-equivalent fake-wrapper smoke passed before the final cached-Gradle test additions. The current exact repository smoke is exercised by the current Android CI run.

Exact-head Actions for `fe510335`:
- [Android CI #42466545173](https://github.com/AbrarulHaque8541/daymark/actions/runs/42466545173): **IN PROGRESS**. Wrapper validation and Gradle 8.13 provisioning **PASS**; Android host regressions, UiMotionPolicy, UiFeedbackPolicy, and Node tests **PASS**; debug variant builds in progress.
- [Non-publishing QA APK #42466545171](https://github.com/AbrarulHaque8541/daymark/actions/runs/42466545171): **IN PROGRESS**. Wrapper validation, Gradle provisioning, and canonical repository checks **PASS**; sideload APK/instrumentation build in progress.
- [Device-test APK workflow #42466545098](https://github.com/AbrarulHaque8541/daymark/actions/runs/42466545098): **IN PROGRESS**; SDK setup in progress; no artifact yet.
- [Cross-platform contracts #42466545150](https://github.com/AbrarulHaque8541/daymark/actions/runs/42466545150): **PASS** (Ubuntu and Windows).
- [Focus Live Update #42466545160](https://github.com/AbrarulHaque8541/daymark/actions/runs/42466545160): **PASS**.
- [Focus UI/Sound #42466545102](https://github.com/AbrarulHaque8541/daymark/actions/runs/42466545102): **PASS**.
- [Focus emulator lifecycle #42466545115](https://github.com/AbrarulHaque8541/daymark/actions/runs/42466545115): **IN PROGRESS** on API 29 and API 36.
- Browser cookie import safety #42466545108: **PENDING**.

Independent review of the third-party mirror and cache boundary is requested before merge. PR #600 is not merged. No release/tag action.

### PR #599 — Same-day weekday reminder trigger

[PR #599](https://github.com/AbrarulHaque8541/daymark/pull/599)

- Head: `110b1b85494402414f2e68be9af9fabdd6e1298c`; base `01daaa3b3cef768a273085cd32f096145519bb47`.
- Branch was reconciled with current main using a non-force merge commit; comparison is 2 ahead / 0 behind.
- Recurrence-specific Android host tests, UiMotionPolicy and UiFeedbackPolicy passed.
- Exact-head Android CI, cross-platform Ubuntu/Windows, QA and device-source workflows fail at the existing mainline style-coverage defect (unused `edit-form`). PR #600 removes that class. Do not merge #599 until #600 lands; then merge new main into #599 and rerun all exact-head checks.
- Physical AlarmManager/notification delivery: **NOT TESTED**.

### PR #601 — Bare IPv4/IPv6/localhost address parsing

[PR #601](https://github.com/AbrarulHaque8541/daymark/pull/601)

- Current head: `cb437cb494c05eb52d5ec0f59d26498bfa18fcbe`; base main `01daaa3b3cef768a273085cd32f096145519bb47`; 3 ahead / 0 behind.
- Adds Android/web bare IPv4, bracketed IPv6 and localhost recognition with port/authority validation.
- Independent review found and documented an IPv6 trailing-compression bug: `[192.0.2.1::]` was accepted. The other agent fixed it and added regression coverage; the corresponding inline thread is resolved.
- A second cross-platform issue remains: Android and web IPv4 validators accept leading-zero octets, while WHATWG URL parsing normalizes `010.0.0.1` to `8.0.0.1` and `001.002.003.004` to `1.2.3.4`. A review comment records the reproduction and requests rejection/canonicalization tests for bare and explicit-scheme inputs.
- Earlier exact-head CI failed on the same mainline `edit-form` style-coverage issue; no fresh CI for the latest `cb437` head was observed. Physical Android WebView navigation: **NOT TESTED**.

## Open issues and integration coordination

- [#160 — Physical Android/WebView acceptance](https://github.com/AbrarulHaque8541/daymark/issues/160): **NOT TESTED**. Needs actual device model/API, WebView provider/version, APK SHA, and scenario evidence.
- [#348 — Browser reliability](https://github.com/AbrarulHaque8541/daymark/issues/348): updated with PR #601 bare-address work, IPv6 trailing-compression fix, and leading-zero IPv4 review finding.
- [#476 — Cross-platform recurrence parity](https://github.com/AbrarulHaque8541/daymark/issues/476): updated with PR #599 base/CI state and dependency on PR #600.
- [#325 — Cross-platform architecture](https://github.com/AbrarulHaque8541/daymark/issues/325): noted stale HTTPS-only browser wording; issue #348 and merged policy PR #368 establish browser HTTP + HTTPS with an explicit “Not encrypted” label, while updater/other app clients remain HTTPS-only and TLS failures are never bypassed.

## Next ranked work

1. **P0 — #160 physical device acceptance:** wait for the exact-head non-publishing QA APK and metadata, then run the actual Android/WebView/DownloadManager/Offline/reader/notification matrix. Do not label CI emulator or APK build as physical-device acceptance.
2. **P1 — PR #600:** finish exact-head Android CI, QA APK, device-test workflow, browser-cookie and API 29/36 emulator checks; obtain independent review of Huawei mirror/checksum and cache policy; merge only when every required check and review gate is satisfied.
3. **P1 — PR #601:** fix leading-zero IPv4 ambiguity in Android and web (including explicit-scheme URLs), add regression tests, then reconcile/retest after #600 merges.
4. **P1 — PR #599 / #476:** after #600 merges, merge new main into #599 and rerun Android, Node, Ubuntu/Windows contracts, QA APK and device-test workflows; then verify reminder delivery on a real device.
5. **P1 — #348:** continue broader WebView navigation, renderer recovery, DownloadManager/SAF, redirect/cookie/site-data, keyboard/insets, accessibility and HTTP/HTTPS policy validation.
6. **P2 — #325:** align the architecture issue with the current browser HTTP/HTTPS policy before any platform POC; no speculative framework rewrite.

## Safety and completion boundaries

- No releases/tags published, no version bump, no signing changes, no package identity change, no manifest permission change, no destructive migration or user-data operation.
- PR #600 is OPEN; PR #599 is OPEN; PR #601 is OPEN. No merge performed in this snapshot.
- CI emulator/API tests and APK builds are not physical-device acceptance.
- Work continues beyond any single PR or issue; the repository-wide backlog above is the handoff.


Follow-up correction: the exact-head source guard rejected the earlier literal legacy package identifier in this snapshot as a retired path. The identifier has been removed from this document; the underlying instruction/build-configuration conflict remains documented without copying the retired token.
