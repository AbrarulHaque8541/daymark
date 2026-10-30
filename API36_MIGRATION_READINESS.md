# Android 16 / API 36 target and release readiness

> **Checked 2026-10-26 against live `main` and GitHub release metadata.** Current `main` is `cac2d7524491a3fce488e57b5cf810dc7b5c5017`. The Android app uses application ID/namespace `com.abrar.daymark`, `versionName = 1.5`, `versionCode = 12`, `compileSdk = 36`, and `targetSdk = 36`, with AGP 8.12.2 and Gradle 8.13. API 36 is already the current source target; physical-device acceptance is still **NOT TESTED**.

## Google Play target policy

Google Play's [target API requirement](https://developer.android.com/google/play/requirements/target-sdk) says that, starting 2026-08-31, ordinary mobile new apps and app updates must target API 36 or higher, subject to stated category exceptions. This is a Play-submission requirement, not a blanket requirement for local builds or GitHub sideloading. Current source and the latest published release both target API 36.

## Android developer verification and direct distribution

Android's [developer-verification rollout](https://developer.android.com/developer-verification) began 2026-09-30 for apps installed from participating stores in Brazil, Indonesia, Singapore, and Thailand on certified Android 7+ devices; Google says global expansion is planned for 2027. Its [FAQ](https://developer.android.com/developer-verification/guides/faq) explicitly says direct sideloads and stores outside the initial list are not in that initial enforcement phase, while recommending preparation before the global rollout. The current Daymark path is a direct GitHub APK download, so this is a **future distribution gate, not an immediate block on v1.5**.

Before wider distribution as the global rollout approaches, the owner should review Google's [Android Developer Console guide](https://developer.android.com/developer-verification/guides/android-developer-console) for identity verification and registration of `com.abrar.daymark` plus the existing production signing-certificate SHA-256. The [open-source app guide](https://developer.android.com/developer-verification/guides/open-source-app-registration) has a specific repository distribution path; do not assume its exception covers direct GitHub downloads. No account was registered, personal identity information was collected, signer was changed, or installer flow was tested in this review.

## Current source and release evidence

- Current `main` is `cac2d7524491a3fce488e57b5cf810dc7b5c5017`; it includes the release-draft lookup fix from [PR #337](https://github.com/AbrarulHaque8541/daymark/pull/337). The Android CI [run 39934982721](https://github.com/AbrarulHaque8541/daymark/actions/runs/39934982721) and cross-platform contract [run 39934982786](https://github.com/AbrarulHaque8541/daymark/actions/runs/39934982786) passed on this exact commit.
- The latest published production release is [v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5), published 2026-10-23. Its tag points to `ca6453374c46a1449c8bbec09a27a218d127d8e4`, before the later PR #337 workflow fix. Its only APK asset is `Daymark-v1.5-githubSideload.apk` (253,936 bytes; SHA-256 `496280987fc910d3a9dde9e4ecac79c5f9286b6c2a88f2f18df75e45d9702bc8`). The release metadata records package `com.abrar.daymark`, version 1.5/code 12, min SDK 26, target SDK 36, and the pinned production signer.
- Production workflow [run 39932829832](https://github.com/AbrarulHaque8541/daymark/actions/runs/39932829832) ended **FAIL** in its final draft-release verification: the draft was created, but the workflow used an endpoint that does not return draft releases. The artifact was independently verified and v1.5 was published separately; merged PR #337 fixes the lookup for future runs. Do not describe that workflow run itself as fully passing.
- The v1.4 release remains a draft; v1.5 is the latest published release. Verify the live Releases page before any later publication claim.

## Gates still open

- [Issue #160](https://github.com/AbrarulHaque8541/daymark/issues/160) tracks the Android runtime acceptance matrix. [Issue #221](https://github.com/AbrarulHaque8541/daymark/issues/221) tracks a reported WebView blank-viewport failure. Browser rendering/lifecycle, edge-to-edge, predictive Back, keyboard/insets, accessibility, storage/backup, reminders, and install/update behavior remain **NOT TESTED on an owner physical device** unless separately recorded there.
- API-29/API-36 CI or emulator checks do not establish physical-device behavior. Record device model, Android API, WebView provider/version when relevant, build SHA, APK SHA, scenario, and result for each runtime check.

## Historical context

The 2026-10-16 status in the previous version of this document described `targetSdk = 35`, published v1.3, and a proposed v1.4 migration. Those statements were accurate only for that dated snapshot and are superseded by the current source and published v1.5 described above.

---
Work by: Cue
Model: not disclosed by runtime
Tooling: Git, GitHub CLI, official Android developer sources
Timestamp (UTC): 2026-10-26T03:51:30Z
