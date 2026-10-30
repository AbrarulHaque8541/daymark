#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
main = root / "app/src/main"
source = (main / "java/com/abrar/daymark/TaskFocusTimerNotification.java").read_text(encoding="utf-8")
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
     "Live Update promotion permission is limited to the GitHub sideload flavor"),
    ("Build.VERSION.SDK_INT >= 36" in source and "canPostPromotedNotifications()" in source
     and '"githubSideload".equals(BuildConfig.FLAVOR)' in source,
     "Live Update promotion is gated by API 36, sideload flavor and user setting"),
    ("Build.getMinorSdkVersion(Build.VERSION.SDK_INT_FULL) < 1" in source
     and "return Api36.canPromote(manager);" in source,
     "API 36.0 safely falls back; extension-only promotion APIs are called only on Android 16 extension 36.1+"),
    ("android.requestPromotedOngoing" in source and "getExtras().putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING, true)" in source and "Notification.ProgressStyle" in source,
     "API 36 notification requests promotion using the documented extra and ProgressStyle"),
    ("builder.setProgress(PROGRESS_MAX, progress, !timer.isCountdown())" in source,
     "standard progress notification fallback remains available"),
    ("NotificationManager.IMPORTANCE_LOW" in source,
     "focus notification channel is not IMPORTANCE_MIN"),
    ("Math.min(100, progress / 10)" in source,
     "Android 16 ProgressStyle uses its default 0..100 progress scale"),
    ("setVisibility(Notification.VISIBILITY_PRIVATE)" in source,
     "task title remains private on lock screen"),
    ("timer.isRunning()" in source and "timer.elapsedMsAt(nowElapsedRealtimeMs)" in source,
     "only an active user-started timer is published using monotonic elapsed time"),
    ("setUsesChronometer(true)" in source and "setChronometerCountDown(true)" in source
     and ".setWhen(" in source and "setTimeoutAfter(remaining)" in source,
     "system chronometer keeps time live and countdown notifications expire without a polling service"),
    ("manager.areNotificationsEnabled()" in source and "hasNotificationPermission(context)" in source,
     "notifications are skipped when permission or app-level notification access is unavailable"),
    ("setCustomContentView" not in source and "setColorized(true)" not in source,
     "Live Update eligibility is not invalidated by custom views or colorized notifications"),
    ('"focus-session.enc"' in store and '"daymark.focus-timer.aes-gcm.v1"' in store and "new EncryptedBlobStore" in store,
     "focus session uses a dedicated AES-GCM encrypted file and key alias"),
    ('FILE_NAME = "focus-session.enc"' in store and "new File(context.getFilesDir(), FILE_NAME)" in store
     and "new EncryptedBlobStore" in store,
     "focus session uses its own file and encrypted blob adapter, not the task snapshot path"),
    ("new EncryptedTaskStore(" not in store and "TaskSnapshotCodec." not in store,
     "focus session persistence does not call the task snapshot store or codec"),
    ("TaskFocusTimerSnapshotCodec.encode" in store and "TaskFocusTimerSnapshotCodec.restore" in store,
     "focus store persists and restores the monotonic timer snapshot"),
    ("MAX_PAYLOAD_BYTES" in codec and "requireEnd(in)" in codec,
     "focus snapshot codec is bounded and rejects trailing data"),
]
for ok, message in checks:
    if not ok:
        raise AssertionError(message)
checks.extend([
    ("TaskFocusTimerNotification.publish(" in runtime,
     "only the Android runtime notification sink publishes focus notifications"),
    ("coordinator.startFromUserAction(" in runtime
     and "coordinator.restoreAfterProcessStart(" in runtime,
     "new sessions enter through the explicit user-action coordinator and restore only existing records"),
    ("store.load(" in runtime and "findTask(tasks" in runtime,
     "restoration resolves the persisted task ID against the loaded encrypted task list"),
    ("coordinator.refreshNotification(task.title)" in runtime
     and "coordinator.clearIfTaskDeleted(" in runtime,
     "task rename/deletion reconciliation updates or clears only the independent focus session"),
])
for ok, message in checks[-4:]:
    if not ok:
        raise AssertionError(message)
print(f"PASS focus timer notification source checks: {len(checks)} assertions")
