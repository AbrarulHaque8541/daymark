# Daymark status snapshot — 2026-10-30T11:59:44.268Z

Live refresh after the previous snapshot: PR #353 advanced to a new instrumentation-fix head while the exact-head workflows are still running. Historical snapshots are preserved.

## Repository / release

- Current main: `2b5b7bd5d9b7ef2eee89f83d1b8606685b3d61d9`.
- Current Gradle identity/version: `com.abrar.daymark`, versionName `1.5`, versionCode `12`, minSdk 26, targetSdk 36.
- Published v1.5 tag resolves to `ca6453374c46a1449c8bbec09a27a218d127d8e4`; v1.4 remains a draft release.
- No PR merge, production tag, version bump, signer change, APK/AAB publication or release authorization occurred.

## Requested PRs — exact current heads

### #351 — expanded reminder actions

- Head `2a033402d64425eb0fe6a9fb32d186dd9a4d97e9`.
- Android CI #852 PASS; device APK #552 PASS; cross-platform #91 PASS (Ubuntu + Windows).
- Diverged from current main: 2 ahead / 14 behind.
- Overlaps #353's receiver and lifecycle guard. Keep unmerged until #353 passes and BigText + Dismiss is replayed onto the final reminder owner.

### #352 — monotonic focus timer engine

- Head `c9eeeac2a29a29115b9d95421caf6b5230a8e47e`.
- Android CI #853 PASS; device APK #553 PASS; cross-platform #92 PASS (Ubuntu + Windows).
- Diverged from current main: 8 ahead / 14 behind.
- Engine/test foundation only; not connected to UI, persistence, notifications or Live Updates.

## Current reminder owner — PR #353

- PR #333 is closed unmerged; #353 is the active replay.
- New exact head: `6dfcd73d2497859c141493ee1d4cff686a9735f9`.
- This head adds a fix for the prior API-36 instrumentation timeout: `DaymarkPlatformInstrumentation.onCreate(Bundle)` now calls `super.onCreate(arguments)`, emits a marker and dispatches `start()`. Do not treat the fix as verified until the new workflow finishes.
- Exact-head checks now: cross-platform #130 PASS; Android CI #891 IN PROGRESS (job `build`, currently at debug variant build); device APK #586 PENDING (no job reported yet).
- Historical previous head `604bb916e234788b39cf21950ade8c923c03a237`: Android CI #887 FAILED at API-36 cold-launch; API-29 was skipped. The failure is historical and is not evidence about the new head.
- #353 owns `.github/workflows/android.yml`, `TaskReminderReceiver.java`, `TaskReminderScheduler.java`, `check-reminder-lifecycle.py` and its instrumentation files. Keep #351 unmerged.

## Focus timer implementation stack

- #354 exact head `1772786e144f1028c20325f14e428f1e290c8a96`: dedicated focus adapter workflow #15 PASS. Its canonical root source guard is NOT VERIFIED because the manifest adds `POST_PROMOTED_NOTIFICATIONS` while #349 owns an exact manifest-permission guard that has not yet been reconciled.
- #357 exact head `63ec5d981fc7f0074899c7b2c4c72f9882a632a4`: concrete Android controller on #354; no workflow runs on this exact head.
- #358 exact head `b0e688fe07900f8acb7b75757194db40dbcd8baa`: pure-Java lifecycle coordinator. Android CI #882 PASS, cross-platform #121 PASS (Ubuntu + Windows), device APK #579 PASS. It is 14 commits behind current main. It validates task identity, persists before notification publication, and clears only focus state for deleted/mismatched tasks. Recommend this as canonical lifecycle semantics over unverified duplicate #357, with a narrow adapter to #354.
- #360 exact head `65cc533a875ee6e57f2f5fcd851e86672ac814d1`: dedicated Focus Timer UI/Sound workflow #17 PASS. It adds the panel/soundscape but does not mount it in MainActivity; no standard Android CI, cross-platform or device APK workflow is associated with this exact head.
- Android 16 promotion remains OS/OEM controlled; no universal Dynamic Island guarantee. Physical notification, audio, reboot/process-death and device UI behavior are NOT TESTED.

## MainActivity / other ownership

- #346 is merged; MainActivity.java ownership is released. #356 is also merged. No open PR currently changes MainActivity.java.
- #349 owns `check-v1-source.sh`; #350 owns `run-core-tests.sh`. #347 also changes `run-core-tests.sh`, so coordinate before integration.
- #351/#352 and #358 are stale relative to current main and require safe synchronization before integration. Dependent #354/#360 stacks must not be broken by rebasing.

## Issues / physical-device state

- #160 OPEN: physical-device acceptance matrix.
- #221 OPEN: owner-reported blank browser viewport; device/WebView details and reproduction logs still required.
- Reminder action dispatch, focus timer process-death/reboot, encrypted store runtime round-trip, Android 8–15 notification fallback, Android 16 OEM promotion, responsive Tasks Home, font scaling/RTL/TalkBack and owner-device task-data preservation remain NOT TESTED.

## Next safe sequence

1. Wait for #353 exact-head Android CI #891 and device APK #586. If either fails, inspect the actual log before retrying.
2. Only after #353 passes, replay #351 BigText + Dismiss onto #353 and rerun exact-head workflows.
3. Consolidate #357/#358; prefer the tested #358 coordinator and integrate a narrow adapter for #354.
4. Synchronize the #352/#354/#358/#360 stack with current main without losing parent commits.
5. Use released MainActivity ownership for one coordinated focus panel/controller integration; then implement responsive/adaptive Tasks Home.
6. Reconcile #349's promoted-notification permission guard and run canonical root guards/CI on the combined exact head; complete physical-device acceptance separately.

---
Work by: ChatGPT
Model: GPT-6
Tooling: GitHub MCP tools via functions runtime
Timestamp (UTC): 2026-10-30T11:59:44.268Z
