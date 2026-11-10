from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
main = root / "app/src/main"
source = (main / "java/com/abrar/daymark/TaskFocusTimerNotification.java").read_text(encoding="utf-8")
state = (main / "java/com/abrar/daymark/TaskFocusTimerNotificationState.java").read_text(encoding="utf-8")
coordinator = (main / "java/com/abrar/daymark/TaskFocusSessionCoordinator.java").read_text(encoding="utf-8")
store = (main / "java/com/abrar/daymark/TaskFocusTimerStore.java").read_text(encoding="utf-8")
codec = (main / "java/com/abrar/daymark/TaskFocusTimerSnapshotCodec.java").read_text(encoding="utf-8")
manifest = (main / "AndroidManifest.xml").read_text(encoding="utf-8")
sideload_manifest = (root / "app/src/githubSideload/AndroidManifest.xml").read_text(encoding="utf-8")
play_manifest = (root / "app/src/play/AndroidManifest.xml").read_text(encoding="utf-8")
runtime = (main / "java/com/abrar/daymark/TaskFocusSessionRuntime.java").read_text(encoding="utf-8")
checks = [
    ("android.permission.POST_PROMOTED_NOTIFICATIONS" in sideload_manifest
     and "android.permission.POST_PROMOTED_NOTIFICATIONS" not in manifest
     and "android.permission.POST_PROMOTED_NOTIFICATIONS" not in play_manifest,
     "Live Update promotion permission remains limited to the GitHub sideload flavor"),
    ("state.countdown && state.running && Build.VERSION.SDK_INT >= 36" in source
     and "Notification.ProgressStyle" in source and "setShortCriticalText(" in source
     and 'setShortCriticalText("Focus")' in source
     and '"Paused" : "Focus"' not in source,
     "running countdown notifications build an API 36 ProgressStyle chip; paused keeps the compat bar"),
    ('EXTRA_REQUEST_PROMOTED_ONGOING_KEY = "android.requestPromotedOngoing"' in source
     and "promotion.putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING_KEY, true);" in source
     and "builder.addExtras(promotion);" in source,
     "Live Update promotion is requested through the API 36.1 extras key (compileSdk 36 framework path)"),
    ("Build.VERSION.SDK_INT >= 36" in source and "canPostPromotedNotifications()" in source
     and "hasPromotableCharacteristics()" in source,
     "Live Update promotion is requested only when the platform admits promoted ongoing notifications (fail-closed)"),
    ("TaskFocusTimerNotificationState.from(timer, nowElapsedRealtimeMs)" in source
     and "state.elapsedMs" in source and "state.remainingMs" in source
     and "state.progressPermille" in source,
     "notification text, clock base, timeout and progress use one immutable monotonic-time sample"),
    ("state.contentText" in source
     and '"Focus session running"' in state and '"Countdown running"' in state
     and "setUsesChronometer(state.shouldUseChronometer())" in source,
     "running notifications keep text non-numeric so a live chronometer is the sole displayed clock"),
    ("state.shouldShowProgressBar()" in source
     and "builder.setProgress(PROGRESS_MAX, state.progressPermille, false)" in source
     and "return countdown && paused;" in state,
     "only paused countdowns show a frozen determinate progress bar"),
    ("state.countdown && state.running" in source
     and "setChronometerCountDown(true)" in source
     and "setTimeoutAfter(state.remainingMs)" in source
     and ".setShowWhen(state.running)" in source,
     "only running sessions use the live chronometer and countdown timeout"),
    ("state.shouldShowPauseAction()" in source and "state.shouldShowResumeAction()" in source
     and "state.shouldShowFinishAction()" in source
     and "ACTION_PAUSE" in source and "ACTION_RESUME" in source and "ACTION_FINISH" in source,
     "running notifications expose Pause/Finish and paused notifications expose Resume/Finish"),
    ("NotificationManager.IMPORTANCE_LOW" in source,
     "focus notification channel is not IMPORTANCE_MIN"),
    ("setVisibility(Notification.VISIBILITY_PRIVATE)" in source,
     "task title remains private on the lock screen"),
    ("timer.elapsedMsAt(nowElapsedRealtimeMs)" in state
     and "timer.remainingMsAt(nowElapsedRealtimeMs)" in state
     and "timer.progressPermilleAt(nowElapsedRealtimeMs)" in state,
     "elapsed, remaining and countdown progress share one monotonic timestamp"),
    ("manager.areNotificationsEnabled()" in source and "hasNotificationPermission(context)" in source,
     "notifications are skipped when permission or app-level notification access is unavailable"),
    ("setCustomContentView" not in source and "setColorized(true)" not in source,
     "notification keeps standard platform rendering"),
    ('"focus-session.enc"' in store and '"daymark.focus-timer.aes-gcm.v1"' in store
     and "new EncryptedBlobStore" in store,
     "focus session uses a dedicated AES-GCM encrypted file and key alias"),
    ('FILE_NAME = "focus-session.enc"' in store
     and "new File(context.getFilesDir(), FILE_NAME)" in store
     and "new EncryptedBlobStore" in store,
     "focus session uses its own encrypted file and blob adapter, not the task snapshot path"),
    ("new EncryptedTaskStore(" not in store and "TaskSnapshotCodec." not in store,
     "focus session persistence does not call the task snapshot store or codec"),
    ("TaskFocusTimerSnapshotCodec.encode" in store
     and "TaskFocusTimerSnapshotCodec.restore" in store,
     "focus store persists and restores the monotonic timer snapshot"),
    ("MAX_PAYLOAD_BYTES" in codec and "requireEnd(in)" in codec,
     "focus snapshot codec is bounded and rejects trailing data"),
    ("if (restored.isRunning() || restored.isPaused())" in coordinator
     and "if (next.isPaused())" in coordinator
     and "notifications.publish(" in coordinator,
     "pause and process restore publish a notification only after persistence"),
    ("if (current == null || current.isFinished())" in coordinator
     and "current.isRunning() && current.isCountdown()" in coordinator
     and "current.finish(now.elapsedRealtimeMs)" in coordinator,
     "finished sessions are terminal and running countdown expiry is persisted once"),
    ("publishOrCancel(" in coordinator and "if (!published) notifications.cancel();" in coordinator,
     "a failed notification update cancels stale content from the prior timer state"),
]
for ok, message in checks:
    if not ok:
        raise AssertionError(message)

activity = (main / "java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
state_tests = (root / "tools/TaskFocusTimerNotificationStateSmoke.java").read_text(encoding="utf-8")
timer_tests = (root / "tools/TaskFocusTimerSmoke.java").read_text(encoding="utf-8")
coordinator_tests = (root / "tools/TaskFocusSessionCoordinatorSmoke.java").read_text(encoding="utf-8")
test_runner = (root / "tools/run-focus-timer-tests.sh").read_text(encoding="utf-8")
switch_start = coordinator.index("synchronized Snapshot switchTaskWhilePausedFromUserAction")
switch_end = coordinator.index("synchronized Snapshot resumeFromUserAction", switch_start)
switch_block = coordinator[switch_start:switch_end]
restore_start = coordinator.index("private Snapshot restoreLoadedSnapshot(TaskFocusTimer restored")
restore_end = coordinator.index("return snapshot(true);", restore_start)
restore_block = coordinator[restore_start:restore_end]
refresh_start = coordinator.index("synchronized Snapshot refreshNotification(String currentTaskTitle)")
refresh_end = coordinator.index("synchronized boolean clearIfTaskDeleted", refresh_start)
refresh_block = coordinator[refresh_start:refresh_end]

checks.extend([
    ("TaskFocusTimerNotificationState.java" in test_runner
     and "TaskFocusTimerNotificationStateSmoke.java" in test_runner
     and "TaskFocusTimerNotificationState.from" in state_tests,
     "host test runner executes notification snapshot regression tests"),
    ("runningCountdownUsesChronometerWithoutStaticProgress" in state_tests
     and "pausedSessionsExposeResumeAndFinishWithoutAChronometer" in state_tests
     and "zeroIsExpiredAndNeverEligibleForPublication" in state_tests,
     "notification-state tests cover running, paused and countdown-zero behavior"),
    ("failedNotificationPublicationCancelsPriorVisibleState" in coordinator_tests
     and "repeatedExpiryDoesNotCompleteOrRestartAgain" in coordinator_tests
     and "repeated zero refresh neither rewrites completion nor republishes/restarts a timer" in coordinator_tests
     and "finishedAtZero.finish(90L * 60_000L) == finishedAtZero" in timer_tests,
     "zero-boundary completion is idempotent in both timer and coordinator regression tests"),
    ("TaskFocusTimerNotification.publish(" in runtime,
     "only the Android runtime notification sink publishes focus notifications"),
    ("coordinator.startFromUserAction(" in runtime
     and "coordinator.restoreLoadedSnapshot(" in runtime
     and "coordinator.restoreLoadFailure(" in runtime,
     "new sessions enter through explicit user action and one caller-loaded record is restored fail-closed"),
    ("store.load(" in runtime and "findTask(tasks" in runtime
     and "coordinator.restoreLoadedSnapshot(" in runtime,
     "restoration resolves one persisted task snapshot against the loaded encrypted task list"),
    ("TaskFocusSessionCoordinator.Snapshot reconcileTasks(List<Task> tasks)" in runtime
     and "return restoreAfterProcessStart(tasks);" in runtime,
     "lifecycle reconciliation reloads durable Focus state instead of republishing a stale coordinator snapshot"),
    ("setContentIntent(actionPendingIntent(" in source and ".addAction(" in source
     and "PendingIntent.getActivity(" in source and "FLAG_IMMUTABLE" in source,
     "focus notification is tappable and carries immutable shade action PendingIntents"),
    ('ACTION_OPEN = "com.abrar.daymark.action.FOCUS_OPEN"' in source
     and 'ACTION_PAUSE = "com.abrar.daymark.action.FOCUS_PAUSE"' in source
     and 'ACTION_RESUME = "com.abrar.daymark.action.FOCUS_RESUME"' in source
     and 'ACTION_FINISH = "com.abrar.daymark.action.FOCUS_FINISH"' in source,
     "focus notification declares open/pause/resume/finish actions"),
    ("handleFocusNotificationIntent(getIntent());" in activity
     and "handleFocusNotificationIntent(intent);" in activity
     and "dispatchFocusNotificationAction" in activity
     and "pauseFocusSession();" in activity and "resumeFocusSession();" in activity
     and "finishFocusSession();" in activity,
     "MainActivity routes all notification actions to the existing focus runtime"),
    ("notificationIdentityChanged(next, currentTaskTitle)" in switch_block
     and switch_block.index("store.save(next") < switch_block.index("notifications.cancel();")
     < switch_block.index("publishOrCancel("),
     "paused task switch persists, cancels the old notification identity, then publishes the new task title"),
    ("!notificationPublished" in restore_block
     and "notificationIdentityChanged(restored, currentTaskTitle)" in restore_block
     and restore_block.index("notifications.cancel();") < restore_block.index("publishOrCancel("),
     "first restore and changed persisted task/title remove stale notification content before replacement"),
    ("sameTaskTitle(this.currentTaskTitle, currentTaskTitle)" in refresh_block
     and refresh_block.index("notifications.cancel();") < refresh_block.index("publishOrCancel("),
     "a changed task title cancels stale content before the refreshed notification is published"),
])
for ok, message in checks[-14:]:
    if not ok:
        raise AssertionError(message)
print(f"PASS focus timer notification source checks: {len(checks)} assertions")
