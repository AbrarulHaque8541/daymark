# Daymark status snapshot — 2026-10-30T13:37:00.880Z

Live refresh after rereading root `AGENTS.md`, `docs/AGENT_STATUS.md` and the latest linked snapshot, then checking live main, exact PR heads/workflows, file ownership, releases/tags and relevant issues. Historical snapshots are preserved.

## Repository and release

- Current `main`: `465aa2deafd87945d6df197ae380e6c01dbbc119` (latest commit is PR #365 browser watchdog v2 / HTTP policy / download tracker).
- Gradle identity/version on main: applicationId and namespace `com.abrar.daymark`, versionName `1.6`, versionCode `13`, minSdk 26, targetSdk 36.
- Latest published production release: [v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5), tag commit `ca6453374c46a1449c8bbec09a27a218d127d8e4`; APK SHA-256 `496280987fc910d3a9dde9e4ecac79c5f9286b6c2a88f2f18df75e45d9702bc8`. v1.4 remains draft. No v1.6 release/tag exists in the current releases/tags listing.
- No merge, tag, version bump, signing change, production APK/AAB publication or release authorization occurred in this refresh.

## Requested PRs

### PR #351 — expanded reminder quick actions

- Closed **unmerged**; exact current head `2a033402d64425eb0fe6a9fb32d186dd9a4d97e9`.
- Exact-head Android CI #852 PASS, device APK #552 PASS, cross-platform #91 PASS.
- Its delta was replayed through reminder owner PR #353, which is merged to main. Current main `TaskReminderReceiver.java` contains BigText, Snooze and Dismiss, separate immutable action PendingIntents, occurrence/canonical-ID validation, private lock-screen visibility and reminder category. Do not reopen/merge #351 as a second owner.

### PR #352 — monotonic focus timer engine

- Closed **merged**; current feature-branch head `3ab455d2ca030de8b3969ddaf3b26905b4c369bf`; merge commit `14957ca7e24ddb1f4ed07ad66c7e8c9522615659`.
- Exact current branch-head workflows: cross-platform #159 PASS; Android CI #920 FAIL; device APK #613 FAIL.
- Both failing workflows stop in the host/source guard. Exact error: `required marker not found in TaskReminderScheduler.java: alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt,`. This is a stale branch-head reminder marker: current main's scheduler uses `nextFire.toEpochMilli()` and `snoozeFire.toEpochMilli()`, and current main's lifecycle guard checks the snooze path. Do not claim the current #352 branch head is green. The merged timer engine itself is present on main as `TaskFocusTimer.java`; the tested #358 `TaskFocusSessionCoordinator.java` is also present on main.

## Active focus integration

### PR #362 — task-linked focus timer, persistence, notification and adaptive Tasks Home

- Open draft; exact current head after a focused CI fix: `7119aa7bb8a5029973b6a1b6664bd1811776426a`.
- Base SHA `8eab5bb7fafc0f1a6811d4b499276512dff8e305`; current main is one commit ahead (PR #365) and GitHub currently reports the PR mergeable.
- This is the sole open owner of `MainActivity.java` and the integrated focus UI/runtime files. No other open PR changes `MainActivity.java`.
- Scope in this draft: explicit task-linked Start/Pause/Resume/Finish; independent AES-GCM/AtomicFile `focus-session.enc` (task snapshot remains untouched); restore only a previously saved valid session; deletion/rename/backup reconciliation; ongoing notification publication only after durable user Start/Resume or valid restoration; Android 16 promotion only when the sideload flavor and platform permit it; ordinary notification fallback on Play and API 26–35; width-adaptive Tasks Home with two columns at >=840dp.
- Previous head `7a9981a9832df191858faa539cf980909d2c23b4` failed Android CI #960 and device APK #646 because `check-release-identity.sh` required the device-test workflow to inspect the built APK target SDK, but `.github/workflows/android-device-test-release.yml` had no APK-manifest inspection step.
- I added a post-build `aapt dump badging` verification step to that tag-only workflow. It asserts the APK exists, application ID `com.abrar.daymark`, min SDK 26 and target SDK 36. This does not create or publish a tag.
- New exact-head workflow state at 2026-10-30T13:37:00.880Z: Android CI #964 IN PROGRESS; device APK #649 IN PROGRESS; cross-platform #203 IN PROGRESS (Ubuntu job PASS, Windows job IN PROGRESS); Focus Live Update #27 IN PROGRESS; Focus Timer UI #29 IN PROGRESS. **No overall green claim** until every workflow on this exact head completes.
- The new tag-only device-test release workflow step itself is NOT RUN because no tag was created. The PR checks validate the workflow source via the canonical guard.
- PR #362 keeps the focus record separate from `tasks.enc`; no task snapshot schema migration or task-data reset is included. Device behavior remains NOT TESTED.

## Other open PRs and ownership

- Open PRs at this refresh: #362 (focus integration, sole MainActivity owner), #364 (documentation snapshot only), #366 (CI test-honesty updates to production/release-assets workflows and Node tests).
- PR #366 does not overlap #362's MainActivity, focus runtime or device-test-release workflow.
- PRs #346, #349 and #350 are merged; their former MainActivity, canonical source guard and core runner ownership is released. PR #353 is merged; it owns the reminder replay already on main. PR #358 is merged to main. PRs #354 and #360 were stacked/merged into feature branches, not directly into main; their integrated notification/UI files are brought forward by #362.
- #351 remains closed unmerged; #352 remains closed merged. Do not reintroduce their old file ownership constraints as if those PRs were still open.

## Issues and NOT TESTED behavior

- [#160](https://github.com/AbrarulHaque8541/daymark/issues/160) remains OPEN: current-main physical-device acceptance matrix.
- [#221](https://github.com/AbrarulHaque8541/daymark/issues/221) remains OPEN: owner-reported blank browser viewport; physical device/WebView details and reproduction logs remain required.
- No dedicated open focus-timer issue appeared in the current open-issue list.
- Physical-device focus start/pause/resume/finish, AndroidKeyStore/AtomicFile runtime round-trip, process-death/reboot restoration, notification permission-denied behavior, Android 8–15 fallback rendering, Android 16 OEM promotion, actual reminder Snooze/Dismiss dispatch, responsive Tasks Home on real devices, RTL/font scaling/TalkBack, sound behavior and owner-device task-data preservation remain **NOT TESTED**. Emulator/CI results are not physical-device acceptance.

## Next safe sequence

1. Wait for all five #362 exact-head workflows on `7119aa7...`; inspect any failing job log before changing source.
2. If all checks pass, review the merged manifest per flavor and focus-session restore/task-deletion paths; keep the PR draft until owner review and physical-device acceptance.
3. Do not merge while CI is pending/failing. Do not create a v1.6 tag or publish any artifact.
4. Never promise universal Dynamic Island presentation; Android 16 promotion remains OS/OEM-controlled.

---
Work by: ChatGPT
Model: GPT-6
Tooling: GitHub MCP tools via functions runtime
Timestamp (UTC): 2026-10-30T13:37:00.880Z
