#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
main = root / "app/src/main"
source = (main / "java/com/abrar/daymark/TaskFocusTimerNotification.java").read_text(encoding="utf-8")
store = (main / "java/com/abrar/daymark/TaskFocusTimerStore.java").read_text(encoding="utf-8")
codec = (main / "java/com/abrar/daymark/TaskFocusTimerSnapshotCodec.java").read_text(encoding="utf-8")
manifest = (main / "AndroidManifest.xml").read_text(encoding="utf-8")

checks = [
    ("android.permission.POST_PROMOTED_NOTIFICATIONS" in manifest,
     "Android 16 Live Updates permission is declared"),
    ("Build.VERSION.SDK_INT >= 36" in source and "canPostPromotedNotifications()" in source,
     "Live Update promotion is gated by API 36 and user setting"),
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
    ("setUsesChronometer(true)" in source and "setChronometerCountDown(true)" in source and ".setWhen(" in source,
     "system chronometer keeps the countdown/stopwatch time live without a polling service"),
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
print(f"PASS focus timer notification source checks: {len(checks)} assertions")
