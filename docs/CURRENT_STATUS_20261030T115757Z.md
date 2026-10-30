# Daymark status snapshot — 2026-10-30T11:57:57.578Z

Live refresh after verifying repository policy, latest status snapshot, main, PR exact heads/workflows, current file ownership, releases/tags and relevant issues. Historical snapshots are preserved.

## Main and release

- Live main: `2b5b7bd5d9b7ef2eee89f83d1b8606685b3d61d9` (verified from GitHub commit API).
- Current Gradle identity/version: `applicationId = com.abrar.daymark`, namespace `com.abrar.daymark`, `versionName = 1.5`, `versionCode = 12`, minSdk 26, targetSdk 36.
- Published production release: [v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5), published 2026-10-23; tag resolves to `ca6453374c46a1449c8bbec09a27a218d127d8e4`. The v1.4 release remains a draft. No new tag, merge, version bump, signing change, APK/AAB publication or release authorization was performed.
- The previous main status index pointed only to the 06:08Z snapshot; that snapshot's PR #333/main facts are stale. Live evidence supersedes it.

## Reminder PRs

### PR #351 — expanded reminder quick actions

- Exact head: `2a033402d64425eb0fe6a9fb32d186dd9a4d97e9`.
- Exact-head workflows: Android CI #852 PASS; device-test APK #552 PASS; cross-platform #91 PASS (Ubuntu + Windows).
- Compare against current main: diverged, 2 commits ahead / 14 behind.
- Changes `TaskReminderReceiver.java` and `check-reminder-lifecycle.py`; it overlaps active PR #353. Keep draft/unmerged until the BigText + Dismiss delta is replayed onto the final reminder owner and all exact-head checks pass.

### PR #333 / #353 — reminder lifecycle owner

- PR #333 is CLOSED unmerged; PR #353 is its active replay onto current main.
- PR #353 exact head: `604bb916e234788b39cf21950ade8c923c03a237`.
- Cross-platform #126 PASS; device APK #582 PASS; Android CI #887 FAIL.
- Android CI job `build` (job ID `124037261044`) failed at step 11, `Cold-launch current debug APK on Android 16 (API 36)`. Host regression checks, Node tests, debug builds/lint and API-36 emulator provisioning passed before that step. API-29 provisioning/cold-launch were skipped because the API-36 gate failed. The job metadata does not expose the underlying instrumentation/ADB error; inspect the run log/trace before another blind retry.
- #353 owns `.github/workflows/android.yml`, `TaskReminderReceiver.java`, `TaskReminderScheduler.java`, `check-reminder-lifecycle.py`, and reminder/attachment instrumentation scripts. Do not edit those shared files while #353 is open.

## Focus timer PRs and current implementation stack

### PR #352 — monotonic timer engine

- Exact head: `c9eeeac2a29a29115b9d95421caf6b5230a8e47e`.
- Exact-head workflows: Android CI #853 PASS; device-test APK #553 PASS; cross-platform #92 PASS (Ubuntu + Windows).
- Compare against current main: diverged, 8 commits ahead / 14 behind.
- Contains only the UI-independent timer engine and host tests. No task UI, encrypted persistence, notification actions or Live Update wiring.

### PR #354 — encrypted store + notification adapter

- Exact head: `1772786e144f1028c20325f14e428f1e290c8a96`; stacked on #352.
- Dedicated focus adapter workflow #15 PASS.
- Canonical `sh android-app/tools/check-v1-source.sh` has NOT been verified on the combined head. Its manifest adds `android.permission.POST_PROMOTED_NOTIFICATIONS`; current main guard still asserts an exact shared permission set without that permission. PR #349 owns the guard and has been asked to reconcile it without weakening Play-flavor or security assertions.
- Android Keystore/AtomicFile runtime, notification permission-denied UX, Android 8–15 rendering, Android 16 OEM promotion, process-death/reboot and physical-device behavior remain NOT TESTED. Promotion is best-effort OS/OEM behavior, never a universal Dynamic Island guarantee.

### PR #357 vs #358 — duplicate coordinator implementations

- #357 exact head `63ec5d981fc7f0074899c7b2c4c72f9882a632a4`; adds `TaskFocusSessionController.java` on top of #354. No workflow runs are associated with this exact head.
- #358 exact head `b0e688fe07900f8acb7b75757194db40dbcd8baa`; adds the pure-Java `TaskFocusSessionCoordinator` plus host tests (and includes #352 engine files in its aggregate diff).
- #358 exact-head workflows: Android CI #882 PASS; cross-platform #121 PASS (Ubuntu + Windows); device APK #579 PASS.
- #358 compare against current main: diverged, 16 commits ahead / 14 behind.
- #358 validates task identity on restore, persists before notification publication, and handles task deletion/expired/paused sessions. #357 has a concrete Android adapter but less lifecycle validation and no current-head workflow evidence. A coordination comment recommends #358 as canonical lifecycle semantics and a narrow Android adapter to #354; do not expand both controllers in parallel.

### PR #360 — Focus Timer panel and sounds

- Exact head: `65cc533a875ee6e57f2f5fcd851e86672ac814d1`; stacked on #354.
- Dedicated Focus Timer UI and Sound workflow #17 PASS.
- It adds a self-contained timer panel and optional soundscape, but does not mount the panel in `MainActivity.java`; standard Android CI, cross-platform and device APK checks are not present on this exact head.
- Physical-device UI/audio behavior remains NOT TESTED.

## MainActivity and other shared ownership

- PR #346 is MERGED. Its MainActivity.java change is on current main at commit `2b5b7bd5d9b7ef2eee89f83d1b8606685b3d61d9`.
- PR #356 is also MERGED. No currently open PR lists `MainActivity.java` among its changed files; MainActivity ownership is released for one coordinated integration PR.
- PR #349 owns `check-v1-source.sh`; PR #350 owns `run-core-tests.sh`. PR #347 also edits `run-core-tests.sh`; reconcile that overlap before integrating either branch.
- PR #349 exact head `73113302c81a4daf6588d8440f1ac13fd7ec84fe`; PR #350 exact head `7b708e4d3587afecf6b6ec17a735b21d278d7d1e`. Their exact-head checks must be rechecked before integration.

## Relevant issues and device acceptance

- [#160](https://github.com/AbrarulHaque8541/daymark/issues/160) OPEN: physical-device acceptance matrix.
- [#221](https://github.com/AbrarulHaque8541/daymark/issues/221) OPEN: owner-reported blank browser viewport; phone model, API, WebView provider/version and reproduction log are still needed.
- Physical reminder action dispatch, task focus process-death/reboot, encrypted focus-store runtime round-trip, Android 8–15 notification fallback, Android 16 OEM promotion, responsive Tasks Home, font scaling/RTL/TalkBack, and owner-device task-data preservation remain NOT TESTED.

## Next safe sequence

1. Resolve #353's API-36 cold-launch failure; do not merge #351 until its BigText + Dismiss delta is replayed onto the final reminder owner.
2. Sync #352 and its dependent #354/#358/#360 stack to current main without losing stacked commits; rerun all required exact-head workflows after sync.
3. Consolidate duplicate coordinator #357/#358; prefer the tested #358 lifecycle semantics, with a narrow Android adapter for #354's store/notification.
4. Use the now-released MainActivity ownership for one coordinated integration of the focus panel, coordinator, encrypted session store, and explicit user-start/resume notification publication. Keep task completion separate.
5. Complete responsive/adaptive Tasks Home, reconcile #349's promoted-notification permission guard, and run canonical root guards on the exact combined head.
6. Perform physical-device acceptance separately. No CI/emulator result proves notification shade, OEM promotion, task-data preservation or adaptive UI on the owner's device.

---
Work by: ChatGPT
Model: GPT-6
Tooling: GitHub MCP tools via functions runtime
Timestamp (UTC): 2026-10-30T11:57:57.578Z
