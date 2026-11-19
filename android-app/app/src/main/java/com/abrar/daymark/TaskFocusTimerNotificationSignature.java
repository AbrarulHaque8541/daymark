package com.abrar.daymark;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Opaque identity for the complete rendered payload and action set of a paused Focus notification.
 * Bump RENDER_VERSION whenever the renderer's fixed presentation or action definitions change.
 */
final class TaskFocusTimerNotificationSignature {
    private static final String RENDER_VERSION = "focus-notification-render-v1";

    private TaskFocusTimerNotificationSignature() { }

    static String forPaused(TaskFocusTimer timer, String taskTitle, int notificationId,
                            long nowElapsedRealtimeMs) {
        if (timer == null || !timer.isPaused() || notificationId <= 0
                || nowElapsedRealtimeMs < 0) {
            return null;
        }
        TaskFocusTimerNotificationState state =
                TaskFocusTimerNotificationState.from(timer, nowElapsedRealtimeMs);
        if (state == null || !state.shouldPublish() || !state.paused) return null;

        StringBuilder payload = new StringBuilder();
        field(payload, "renderer", RENDER_VERSION);
        field(payload, "notificationId", notificationId);
        field(payload, "channel", "daymark_focus_sessions");
        field(payload, "smallIcon", "android.R.drawable.ic_media_play");
        field(payload, "category", "progress");
        field(payload, "visibility", "private");
        field(payload, "ongoing", true);
        field(payload, "onlyAlertOnce", true);
        field(payload, "showWhen", false);
        field(payload, "usesChronometer", false);
        field(payload, "contentIntent", "MainActivity|FOCUS_OPEN|9411");
        field(payload, "taskId", timer.taskId());
        field(payload, "rawTaskTitle", taskTitle);
        field(payload, "renderedTaskTitle", safeTitle(taskTitle));
        field(payload, "mode", timer.mode().name());
        field(payload, "status", timer.status().name());
        field(payload, "targetDurationMs", timer.targetDurationMs());
        field(payload, "countdown", state.countdown);
        field(payload, "running", state.running);
        field(payload, "paused", state.paused);
        field(payload, "expired", state.expired);
        field(payload, "contentText", state.contentText);
        field(payload, "elapsedMs", state.elapsedMs);
        field(payload, "remainingMs", state.remainingMs);
        field(payload, "showProgress", state.shouldShowProgressBar());
        field(payload, "progressMax", state.shouldShowProgressBar() ? 1000 : 0);
        field(payload, "progressPermille", state.progressPermille);
        field(payload, "showPauseAction", state.shouldShowPauseAction());
        field(payload, "showResumeAction", state.shouldShowResumeAction());
        field(payload, "showFinishAction", state.shouldShowFinishAction());
        if (state.shouldShowResumeAction()) {
            field(payload, "resumeAction",
                    "Resume|android.R.drawable.ic_media_play|9413|FOCUS_RESUME");
        }
        if (state.shouldShowFinishAction()) {
            field(payload, "finishAction",
                    "Finish|android.R.drawable.ic_menu_close_clear_cancel|9414|FOCUS_FINISH");
        }
        return sha256(payload.toString());
    }

    /** Must stay byte-for-byte aligned with the title rendered by TaskFocusTimerNotification. */
    static String safeTitle(String title) {
        if (title == null || title.trim().isEmpty()) return "Focus session";
        String normalized = title.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() > 120 ? normalized.substring(0, 120) : normalized;
    }

    private static void field(StringBuilder payload, String name, Object value) {
        append(payload, name);
        append(payload, value == null ? null : String.valueOf(value));
    }

    private static void append(StringBuilder payload, String value) {
        if (value == null) {
            payload.append("-1:");
            return;
        }
        payload.append(value.length()).append(':').append(value);
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte element : digest) {
                hex.append(Character.forDigit((element >>> 4) & 0x0f, 16));
                hex.append(Character.forDigit(element & 0x0f, 16));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException unavailable) {
            throw new AssertionError("SHA-256 is required by the Android runtime.", unavailable);
        }
    }
}
