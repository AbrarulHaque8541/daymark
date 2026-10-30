#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
main = root / "app/src/main"
source = (main / "java/com/abrar/daymark/TaskFocusTimerNotification.java").read_text(encoding="utf-8")
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
    ("manager.areNotificationsEnabled()" in source and "hasNotificationPermission(context)" in source,
     "notifications are skipped when permission or app-level notification access is unavailable"),
    ("setCustomContentView" not in source and "setColorized(true)" not in source,
     "Live Update eligibility is not invalidated by custom views or colorized notifications"),
]
for ok, message in checks:
    if not ok:
        raise AssertionError(message)
print(f"PASS focus timer notification source checks: {len(checks)} assertions")
