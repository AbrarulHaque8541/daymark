package com.abrar.daymark;

import java.util.Locale;

/** Immutable, platform-free view of one timer sample used to build a notification. */
final class TaskFocusTimerNotificationState {
    final boolean countdown;
    final boolean running;
    final boolean paused;
    final boolean expired;
    final long elapsedMs;
    final long remainingMs;
    final int progressPermille;
    final String contentText;

    private TaskFocusTimerNotificationState(boolean countdown, boolean running, boolean paused,
                                            boolean expired, long elapsedMs, long remainingMs,
                                            int progressPermille, String contentText) {
        this.countdown = countdown;
        this.running = running;
        this.paused = paused;
        this.expired = expired;
        this.elapsedMs = elapsedMs;
        this.remainingMs = remainingMs;
        this.progressPermille = progressPermille;
        this.contentText = contentText;
    }

    static TaskFocusTimerNotificationState from(TaskFocusTimer timer, long nowElapsedRealtimeMs) {
        if (timer == null || timer.isFinished()) return null;
        boolean running = timer.isRunning();
        boolean paused = timer.isPaused();
        if (running == paused) return null;

        boolean countdown = timer.isCountdown();
        long elapsed = timer.elapsedMsAt(nowElapsedRealtimeMs);
        long remaining = countdown ? timer.remainingMsAt(nowElapsedRealtimeMs) : 0L;
        int progress = countdown ? timer.progressPermilleAt(nowElapsedRealtimeMs) : 0;
        boolean expired = countdown && remaining == 0L;
        String content = running
                ? countdown ? "Countdown running" : "Focus session running"
                : countdown ? "Paused · " + formatDuration(remaining, true) + " remaining"
                : "Paused · " + formatDuration(elapsed) + " focused";

        return new TaskFocusTimerNotificationState(countdown, running, paused, expired,
                elapsed, remaining, progress, content);
    }

    boolean shouldPublish() {
        return !expired && (running || paused);
    }

    boolean shouldUseChronometer() {
        return running;
    }

    /** Only a paused countdown has a progress bar: its clock and progress are both frozen. */
    boolean shouldShowProgressBar() {
        return countdown && paused;
    }

    boolean shouldShowPauseAction() {
        return running;
    }

    boolean shouldShowResumeAction() {
        return paused;
    }

    boolean shouldShowFinishAction() {
        return running || paused;
    }

    private static String formatDuration(long durationMs) {
        long seconds = Math.max(0L, durationMs / 1000L);
        return formatSeconds(seconds);
    }

    private static String formatDuration(long durationMs, boolean roundUp) {
        long safeDurationMs = Math.max(0L, durationMs);
        long seconds = roundUp ? (safeDurationMs + 999L) / 1000L : safeDurationMs / 1000L;
        return formatSeconds(seconds);
    }

    private static String formatSeconds(long seconds) {
        long hours = seconds / 3600L;
        long minutes = (seconds % 3600L) / 60L;
        long remainder = seconds % 60L;
        return hours > 0
                ? String.format(Locale.ROOT, "%d:%02d:%02d", hours, minutes, remainder)
                : String.format(Locale.ROOT, "%02d:%02d", minutes, remainder);
    }
}
