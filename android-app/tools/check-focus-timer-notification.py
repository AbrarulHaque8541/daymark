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
    ("Notification.ProgressStyle" not in source
     and "android.requestPromotedOngoing" not in source
     and "canPostPromotedNotifications()" not in source,
     "Focus notifications do not request static API 36 progress promotion"),
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
     and "coordinator.restoreAfterProcessStart(" in runtime,
     "new sessions enter through explicit user action and restore only existing records"),
    ("store.load(" in runtime and "findTask(tasks" in runtime,
     "restoration resolves persisted task IDs against the loaded encrypted task list"),
    ("coordinator.refreshNotification(task.title)" in runtime
     and "coordinator.clearIfTaskDeleted(" in runtime,
     "task rename/deletion reconciliation updates or clears only the independent focus session"),
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
])
for ok, message in checks[-11:]:
    if not ok:
        raise AssertionError(message)
print(f"PASS focus timer notification source checks: {len(checks)} assertions")
