# Daymark status snapshot — 2026-10-30T10:50Z

Live refresh after rereading root AGENTS.md, the status index and latest linked snapshot, then verifying live main, exact PR heads, workflow runs, releases/tags, and relevant issues. This snapshot supersedes the earlier 10:16Z draft snapshot; historical snapshots remain unchanged.

## Main and production release

- Live main: `c9bc8311b8b04535eb6d54432463fe49045f467b`.
- Verified from `android-app/app/build.gradle.kts`: namespace/applicationId `com.abrar.daymark`, versionName `1.5`, versionCode `12`, minSdk 26, targetSdk 36.
- Latest published production release: [v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5), tag commit `ca6453374c46a1449c8bbec09a27a218d127d8e4`; APK SHA-256 `496280987fc910d3a9dde9e4ecac79c5f9286b6c2a88f2f18df75e45d9702bc8`. Main is 40 commits ahead of that tag; main is not the published v1.5 artifact.
- v1.4 remains a draft release. No merge, tag, version bump, signing change, production build or publication was performed.

## Exact-head PR and CI state

- **#346 MainActivity owner** — open draft, head `74c1ef65fb9685f5484fbf7266172b04faba21cd`, owns `MainActivity.java`. Android CI #844, device APK #544, cross-platform #83 PASS on that exact head. Focus UI/controller and responsive Tasks Home must wait for ownership release or explicit coordination.
- **#351 reminder BigText + Dismiss** — open draft, head `2a033402d64425eb0fe6a9fb32d186dd9a4d97e9`. Android CI #852, device APK #552, cross-platform #91 PASS. Overlaps #353 receiver/lifecycle guard; keep unmerged. A coordination comment was updated with #353's actual current head and failure/retry state.
- **#352 monotonic timer engine** — open draft, head `c9eeeac2a29a29115b9d95421caf6b5230a8e47e`. Android CI #853, device APK #553, cross-platform #92 PASS. Engine-only; no task UI, persistent focus session integration, notification actions or Live Updates.
- **#353 active reminder owner** — open, head `6d7d78adc33c40c5d939bff00122a3b3f9ba57eb`. Cross-platform #112 PASS; device APK #570 PASS; Android CI #873 previously FAILED at `Cold-launch current debug APK on Android 16 (API 36)`. The API 29 steps were skipped after that failure. GitHub accepted a retry of the failed Android CI job; run #873 is currently IN_PROGRESS. Do not claim green until the retry completes and the required API 36/API 29 gates pass. #353 owns the reminder receiver, scheduler, lifecycle guard, and Android workflow.
- **#354 Live Update adapter** — open draft, head `1772786e144f1028c20325f14e428f1e290c8a96`, stacked on #352. Its dedicated focus-adapter workflow #15 passed. Canonical `sh android-app/tools/check-v1-source.sh` is NOT RUN on this head because #349 owns that guard and its promoted-notification permission allowlist needs reconciliation. Keep draft until the canonical guard passes on the combined head. API 36 OEM promotion is OS/OEM-controlled, not universal.
- **#355 documentation refresh** — open draft, head before this snapshot update `fa8229dc20eed172cb11dc4776904222ea1f8855`. Android CI #879, cross-platform #118 and device APK #576 all PASS on that earlier exact head. This update will move the PR head and trigger new checks; do not carry those PASS claims forward to the new head until its runs finish.
- **#349** owns `check-v1-source.sh`; **#350** owns `run-core-tests.sh`. #347 also changes the latter, so ownership must be reconciled before integration.

## Issues and device acceptance

- [#160](https://github.com/AbrarulHaque8541/daymark/issues/160) is OPEN: physical-device acceptance matrix. CI/emulator results are not physical-device tests.
- [#221](https://github.com/AbrarulHaque8541/daymark/issues/221) is OPEN: owner-reported blank browser viewport; device/WebView details and reproduction logs remain needed.
- Reminder notification action dispatch, focus-session process-death/reboot behavior, encrypted-store runtime round-trip, Android 8–15 fallback rendering, Android 16 OEM promotion, responsive Tasks Home, font scaling/RTL/TalkBack, and owner-device task-data preservation remain NOT TESTED.

## Safe next action

Wait for #353 Android CI #873 retry. If it passes, replay #351's BigText + Dismiss delta onto #353's owner branch and rerun exact-head checks. Keep #346 as the sole MainActivity owner; coordinate the #354 promoted-notification permission with #349 before canonical guard verification. Only after #346 releases the file should task UI, focus controller lifecycle and responsive Tasks Home be integrated. No task data or production identity/signing/release state may be risked.

---
Work by: ChatGPT
Model: GPT-6
Tooling: GitHub MCP tools via functions runtime
Timestamp (UTC): 2026-10-30T10:50Z (runtime clock precision: minute)
