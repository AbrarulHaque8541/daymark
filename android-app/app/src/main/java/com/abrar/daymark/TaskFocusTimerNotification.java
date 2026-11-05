package com.abrar.daymark;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

/**
 * Publishes an explicitly started focus session as an ongoing notification.
 *
 * A running session has one live source of displayed time: Android's chronometer. No static
 * numeric text or progress snapshot is paired with that moving clock. A paused countdown may show
 * its frozen time and determinate progress together. Paused sessions expose Resume and Finish.
 */
final class TaskFocusTimerNotification {
    static final String CHANNEL_ID = "daymark_focus_sessions";
    private static final int PROGRESS_MAX = 1000;
    static final String ACTION_OPEN = "com.abrar.daymark.action.FOCUS_OPEN";
    static final String ACTION_PAUSE = "com.abrar.daymark.action.FOCUS_PAUSE";
    static final String ACTION_RESUME = "com.abrar.daymark.action.FOCUS_RESUME";
    static final String ACTION_FINISH = "com.abrar.daymark.action.FOCUS_FINISH";
    private static final int REQUEST_OPEN = 9411;
    private static final int REQUEST_PAUSE = 9412;
    private static final int REQUEST_RESUME = 9413;
    private static final int REQUEST_FINISH = 9414;

    private TaskFocusTimerNotification() { }

    static boolean publish(Context context, TaskFocusTimer timer, String taskTitle,
                           int notificationId, long nowElapsedRealtimeMs) {
        if (context == null || timer == null || notificationId <= 0 || nowElapsedRealtimeMs < 0) {
            return false;
        }

        TaskFocusTimerNotificationState state =
                TaskFocusTimerNotificationState.from(timer, nowElapsedRealtimeMs);
        if (state == null || !state.shouldPublish()) {
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
        Notification.Builder builder = new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(safeTitle(taskTitle))
                .setContentText(state.contentText)
                .setCategory(Notification.CATEGORY_PROGRESS)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setUsesChronometer(state.shouldUseChronometer())
                .setShowWhen(state.running)
                .setContentIntent(actionPendingIntent(context, REQUEST_OPEN, ACTION_OPEN));

        if (state.running) {
            long nowWallClockMs = System.currentTimeMillis();
            builder.setWhen(state.countdown
                    ? nowWallClockMs + state.remainingMs
                    : Math.max(0L, nowWallClockMs - state.elapsedMs));
        }
        if (state.shouldShowPauseAction()) {
            builder.addAction(android.R.drawable.ic_media_pause, "Pause",
                    actionPendingIntent(context, REQUEST_PAUSE, ACTION_PAUSE));
        } else if (state.shouldShowResumeAction()) {
            builder.addAction(android.R.drawable.ic_media_play, "Resume",
                    actionPendingIntent(context, REQUEST_RESUME, ACTION_RESUME));
        }
        if (state.shouldShowFinishAction()) {
            builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Finish",
                    actionPendingIntent(context, REQUEST_FINISH, ACTION_FINISH));
        }
        if (state.countdown && state.running) {
            builder.setChronometerCountDown(true);
            // Android removes the live countdown notification at zero; there is no polling loop
            // that can repost it, and coordinator refresh persists completion exactly once.
            builder.setTimeoutAfter(state.remainingMs);
        }
        if (state.shouldShowProgressBar()) {
            builder.setProgress(PROGRESS_MAX, state.progressPermille, false);
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

    /** Shade actions reuse the activity and use immutable, action-specific PendingIntents. */
    private static PendingIntent actionPendingIntent(Context context, int requestCode, String action) {
        Intent intent = new Intent(context, MainActivity.class)
                .setAction(action)
                .setPackage(context.getPackageName());
        return PendingIntent.getActivity(context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
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

    private static String safeTitle(String title) {
        if (title == null || title.trim().isEmpty()) return "Focus session";
        String normalized = title.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() > 120 ? normalized.substring(0, 120) : normalized;
    }
}
