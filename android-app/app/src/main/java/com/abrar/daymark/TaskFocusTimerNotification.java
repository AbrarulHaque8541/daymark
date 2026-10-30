package com.abrar.daymark;

import android.annotation.TargetApi;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import java.util.Locale;

/**
 * Publishes an explicitly started focus session as a progress notification.
 *
 * Android 16+ requests Live Update promotion only when the user has enabled it.
 * The platform/OEM still decides whether to promote; a normal progress notification
 * is posted otherwise. Callers own the timer lifecycle and should refresh this
 * notification when the timer state/progress changes.
 */
final class TaskFocusTimerNotification {
    static final String CHANNEL_ID = "daymark_focus_sessions";
    private static final int PROGRESS_MAX = 1000;
    private static final String EXTRA_REQUEST_PROMOTED_ONGOING = "android.requestPromotedOngoing";

    private TaskFocusTimerNotification() { }

    static boolean publish(Context context, TaskFocusTimer timer, String taskTitle,
                           int notificationId, long nowElapsedRealtimeMs) {
        if (context == null || timer == null || !timer.isRunning()
                || notificationId <= 0 || nowElapsedRealtimeMs < 0) {
            return false;
        }

        if (timer.isCountdown() && timer.isExpiredAt(nowElapsedRealtimeMs)) {
            cancel(context, notificationId);
            return false;
        }

        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || !manager.areNotificationsEnabled()
                || !hasNotificationPermission(context)) {
            return false;
        }

        ensureChannel(context, manager);
        long elapsed = timer.elapsedMsAt(nowElapsedRealtimeMs);
        long remaining = timer.remainingMsAt(nowElapsedRealtimeMs);
        int progress = timer.isCountdown() ? timer.progressPermilleAt(nowElapsedRealtimeMs) : 0;
        String safeTitle = safeTitle(taskTitle);
        String content = timer.isCountdown()
                ? formatDuration(remaining) + " remaining"
                : formatDuration(elapsed) + " focused";

        Notification.Builder builder = new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(safeTitle)
                .setContentText(content)
                .setCategory(Notification.CATEGORY_PROGRESS)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setWhen(timer.isCountdown()
                        ? System.currentTimeMillis() + remaining
                        : Math.max(0, System.currentTimeMillis() - elapsed))
                .setUsesChronometer(true)
                .setShowWhen(true);
        if (timer.isCountdown()) {
            builder.setChronometerCountDown(true);
            builder.setTimeoutAfter(remaining);
        }

        if (Build.VERSION.SDK_INT >= 36 && canRequestLiveUpdate(context, manager)) {
            Api36.applyLiveUpdateStyle(builder, timer.isCountdown(), progress);
        } else {
            // Android 8–15, or Android 16 when Live Updates are disabled/unavailable.
            builder.setProgress(PROGRESS_MAX, progress, !timer.isCountdown());
        }

        manager.notify(notificationId, builder.build());
        return true;
    }

    static void cancel(Context context, int notificationId) {
        if (context == null || notificationId <= 0) return;
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(notificationId);
    }

    private static boolean hasNotificationPermission(Context context) {
        return Build.VERSION.SDK_INT < 33
                || context.checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                == PackageManager.PERMISSION_GRANTED;
    }

    private static void ensureChannel(Context context, NotificationManager manager) {
        if (Build.VERSION.SDK_INT < 26 || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Focus sessions", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Progress for focus sessions you explicitly start.");
        channel.setSound(null, null);
        channel.enableVibration(false);
        manager.createNotificationChannel(channel);
    }

    private static boolean canRequestLiveUpdate(Context context, NotificationManager manager) {
        // Live Update promotion is enabled only in the GitHub sideload flavor, which declares
        // POST_PROMOTED_NOTIFICATIONS. Play keeps the ordinary progress notification fallback.
        return Build.VERSION.SDK_INT >= 36
                && "githubSideload".equals(BuildConfig.FLAVOR)
                && Api36.canPromote(manager);
    }

    private static String safeTitle(String title) {
        if (title == null || title.trim().isEmpty()) return "Focus session";
        String normalized = title.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() > 120 ? normalized.substring(0, 120) : normalized;
    }

    private static String formatDuration(long durationMs) {
        long seconds = Math.max(0, durationMs / 1000L);
        long hours = seconds / 3600L;
        long minutes = (seconds % 3600L) / 60L;
        long remainder = seconds % 60L;
        return hours > 0
                ? String.format(Locale.ROOT, "%d:%02d:%02d", hours, minutes, remainder)
                : String.format(Locale.ROOT, "%02d:%02d", minutes, remainder);
    }

    @TargetApi(36)
    private static final class Api36 {
        private Api36() { }

        static boolean canPromote(NotificationManager manager) {
            return manager.canPostPromotedNotifications();
        }

        static void applyLiveUpdateStyle(Notification.Builder builder,
                                         boolean countdown, int progress) {
            Notification.ProgressStyle style = new Notification.ProgressStyle()
                    .setProgressIndeterminate(!countdown)
                    .setStyledByProgress(true);
            if (countdown) style.setProgress(Math.max(0, Math.min(100, progress / 10)));
            builder.setStyle(style);
            builder.getExtras().putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING, true);
        }
    }
}
