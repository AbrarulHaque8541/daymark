# Daymark status snapshot — 2026-10-30T19:04:16Z

Live refresh after the 2026-10-30T11:59:44.268Z snapshot. Historical snapshots are preserved; current GitHub evidence wins over older SHA/status entries.

## Repository and release

- Default branch: `main`.
- Current main SHA: `76277adba7ad26521f60b7a4da408bb31f5f48ce` (merge of PR #380).
- Current Gradle identity/version from `android-app/app/build.gradle.kts`: applicationId/namespace `com.abrar.daymark`, versionName `1.6`, versionCode `13`, minSdk `26`, targetSdk `36`.
- Main SHA check-runs: Android CI build, Ubuntu shared contracts and Windows shared contracts all **PASS**. No legacy commit-status contexts are registered.
- Latest published release: [v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5), tag resolves to `ca6453374c46a1449c8bbec09a27a218d127d8e4`; APK asset present.
- [v1.4](https://github.com/AbrarulHaque8541/daymark/releases/tag/untagged-77a0ed471ede5c065f10) remains a draft release.
- No `v1.6` tag or release exists as of this snapshot. Do not tag or publish without owner authorization.

## Requested reminder PRs

### #351 — expanded reminder quick actions

- State: **CLOSED, NOT MERGED**, superseded by #353.
- Exact head: `2a033402d64425eb0fe6a9fb32d186dd9a4d97e9`.
- Android CI #852: **PASS**; device-test APK #552: **PASS**; cross-platform #91: Ubuntu + Windows **PASS**. Release publication job skipped as expected for a PR.
- The BigText + Dismiss delta was replayed into #353. Do not reopen or merge #351 separately.

### #352 — monotonic focus timer core

- State: **CLOSED, MERGED**; merge commit `14957ca7e24ddb1f4ed07ad66c7e8c9522615659`.
- Exact current PR head: `3ab455d2ca030de8b3969ddaf3b26905b4c369bf`. Do not reuse the older `c9eeeac...` pass record as evidence for this current head.
- Android CI #920: **FAIL**; device-test APK #613: **FAIL**; cross-platform #159: Ubuntu + Windows **PASS**; production release job skipped.
- Both failing jobs stopped in `check-v1-source.sh` / reminder lifecycle source guard before Gradle/device APK execution. The stale assertion expected `alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt,`; the reminder scheduler now uses the persisted snooze occurrence `snoozeFire.toEpochMilli()`. This is a guard expectation mismatch, not evidence that the monotonic timer engine tests failed.
- The pure-Java `TaskFocusTimer.java` engine is present on current main. The current main reminder guard and scheduler now agree on the `snoozeFire` call.

## Reminder implementation owner

### #353 — reminder lifecycle replay

- State: **CLOSED, MERGED**; merge commit `c39127c6eada931407324a301a14dc8d385772b0`.
- Exact head: `0c96e464013a1f9d799ea361a6beb53f7bc73761`.
- Android CI #914: **FAIL**; device-test APK #609: **FAIL**; cross-platform #153: Ubuntu + Windows **PASS**. Both failures were the same stale `fireAt` source-guard assertion described above; the failed jobs stopped before Android build/device APK execution.
- Current main `TaskReminderReceiver.java` contains tap-to-open, durable 10-minute Snooze, and Dismiss with canonical task/notification ID validation; BigText, reminder category and private lock-screen visibility are present. Dismiss clears only the visible notification, not the task or schedule.
- Physical-device notification shade, lock-screen privacy and action dispatch remain **NOT TESTED**.

## Focus timer integration and adaptive Tasks Home

### #382 — current integration PR

- State: **OPEN**; exact head `d80859f48e14f94e71d0e8762607a05cd2455926`.
- Exact-head checks: Android CI #1041 **PASS**; cross-platform #280 (Ubuntu + Windows) **PASS**; Focus Timer UI and Sound #45 **PASS**; Live Update adapter #43 **PASS**; emulator lifecycle #10 **PASS** (API 29: 144 assertions; API 36: 147 assertions; both returned `INSTRUMENTATION_RESULT: result=passed`); device-test APK #716 **PASS**. Production release-asset job skipped as expected for a PR.
- The PR wires the monotonic engine to Tasks Home, a separate encrypted AES-GCM/AtomicFile focus record, explicit Start/Pause/Resume/Finish controls, and a width-based layout policy (two columns at >=840dp; one column below that). Task snapshot schema and encrypted task bytes are not changed by the proposed integration.
- Live Update request is gated to Android 16.1+ (API 36 extension 1), GitHub sideload flavor and `NotificationManager.canPostPromotedNotifications()`. Play/unsupported/ineligible paths use a normal progress notification. Process restoration only restores a previously persisted running session; it does not create or auto-start a new session.
- **Integration blocker:** PR base is `c4bccb35042147f7126fd2ab36aa978d41b8777d`; current main is `76277adba7ad26521f60b7a4da408bb31f5f48ce`. Compare is 19 commits ahead / 12 behind and diverged. Synchronize with current main, preserve the newer browser changes, then rerun the full required matrix on the resulting exact head. Do not merge based only on this stale-base green run.
- Physical-device notification delivery, OEM Live Update presentation, battery-manager behavior, adaptive layout on owner devices, accessibility/audio acceptance and real-device reboot/process-death behavior remain **NOT TESTED**. No universal Dynamic Island/OEM promotion is guaranteed.

## Open PRs and file ownership

- #382 is the only open app-code PR and owns the focus integration changes, including `MainActivity.java`, focus notification/runtime files, the sideload manifest, source/core-test guards and its new workflows. Do not edit those shared files in another PR while #382 remains open.
- #383 is an open draft documentation-only PR adding `docs/CROSS_PLATFORM_DEVICE_MATRIX.md`; it does not overlap app source.
- #333 is closed unmerged and superseded by #353. #346, #349 and #350 are merged; their former MainActivity/source-guard/core-test ownership is no longer an active competing PR.
- No merge, tag, version bump, signing change, APK/AAB publication or release authorization occurred in this refresh.

## Relevant issues and device acceptance

- #160: **OPEN** — physical-device acceptance matrix; emulator/CI evidence does not close it.
- #221: **OPEN** — owner-reported blank WebView viewport; device/WebView reproduction evidence is still required.
- #325: **OPEN** — cross-platform architecture and browser-engine spike.
- #187: **CLOSED** — API 36 / Play target qualification issue.
- Android API 29/36 emulator timer instrumentation passed on #382; owner physical-device acceptance is still outstanding.

## Next safe step

1. Synchronize #382 with current main `76277ad...` without overwriting newer browser work.
2. On the new exact head, run `sh android-app/tools/check-v1-source.sh`, `npm test`, Android CI, cross-platform Ubuntu/Windows, device-test APK, Focus Timer UI, Live Update adapter and API 29/36 instrumentation.
3. Review the resulting diff/file ownership and physical-device acceptance separately. Do not merge, tag or publish until the owner-approved gates are met.

---

Work by: ChatGPT
Model: GPT-6
Tooling: GitHub connector; live PR/check-run/job-log, source, issue, release and tag inspection
Timestamp (UTC): 2026-10-30T19:04:16.745Z
