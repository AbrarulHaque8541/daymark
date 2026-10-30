package com.abrar.daymark;

/**
 * UI-independent, monotonic focus-session timer.
 *
 * <p>This tracks a user-started work session, not task completion. A finished timer never changes
 * the underlying Task. The Android adapter supplies elapsedRealtime(), wall-clock time and the
 * platform boot count when saving/restoring this value.
 */
final class TaskFocusTimer {
    static final long MAX_COUNTDOWN_MS = 24L * 60L * 60L * 1000L;
    static final long MAX_ELAPSED_MS = 30L * 24L * 60L * 60L * 1000L;
    static final long MAX_REBOOT_GAP_MS = 7L * 24L * 60L * 60L * 1000L;

    enum Mode { STOPWATCH, COUNTDOWN }
    enum Status { RUNNING, PAUSED, FINISHED }

    private final String taskId;
    private final Mode mode;
    private final Status status;
    private final long targetDurationMs;
    private final long accumulatedElapsedMs;
    private final long runStartedAtElapsedRealtimeMs;

    private TaskFocusTimer(String taskId, Mode mode, Status status, long targetDurationMs,
                           long accumulatedElapsedMs, long runStartedAtElapsedRealtimeMs) {
        this.taskId = taskId;
        this.mode = mode;
        this.status = status;
        this.targetDurationMs = targetDurationMs;
        this.accumulatedElapsedMs = accumulatedElapsedMs;
        this.runStartedAtElapsedRealtimeMs = runStartedAtElapsedRealtimeMs;
    }

    static TaskFocusTimer start(String taskId, Mode mode, long targetDurationMs,
                                long nowElapsedRealtimeMs) {
        if (taskId == null || taskId.trim().isEmpty() || taskId.length() > 128) {
            throw new IllegalArgumentException("A valid task id is required.");
        }
        if (mode == null || nowElapsedRealtimeMs < 0) {
            throw new IllegalArgumentException("Timer mode and monotonic start time are required.");
        }
        if (mode == Mode.STOPWATCH && targetDurationMs != 0) {
            throw new IllegalArgumentException("A stopwatch must not have a target duration.");
        }
        if (mode == Mode.COUNTDOWN
                && (targetDurationMs < 1000L || targetDurationMs > MAX_COUNTDOWN_MS)) {
            throw new IllegalArgumentException("Countdown duration must be between one second and 24 hours.");
        }
        return new TaskFocusTimer(taskId, mode, Status.RUNNING, targetDurationMs, 0,
                nowElapsedRealtimeMs);
    }

    String taskId() { return taskId; }
    Mode mode() { return mode; }
    Status status() { return status; }
    long targetDurationMs() { return targetDurationMs; }
    boolean isRunning() { return status == Status.RUNNING; }
    boolean isPaused() { return status == Status.PAUSED; }
    boolean isFinished() { return status == Status.FINISHED; }
    boolean isCountdown() { return mode == Mode.COUNTDOWN; }

    long elapsedMsAt(long nowElapsedRealtimeMs) {
        if (nowElapsedRealtimeMs < 0) {
            throw new IllegalArgumentException("Monotonic time cannot be negative.");
        }
        long elapsed = accumulatedElapsedMs;
        if (status == Status.RUNNING && nowElapsedRealtimeMs > runStartedAtElapsedRealtimeMs) {
            elapsed = saturatedAdd(elapsed, nowElapsedRealtimeMs - runStartedAtElapsedRealtimeMs);
        }
        return Math.min(elapsed, MAX_ELAPSED_MS);
    }

    /** Returns zero for a stopwatch; callers should use isCountdown() to decide whether to show it. */
    long remainingMsAt(long nowElapsedRealtimeMs) {
        if (!isCountdown()) return 0;
        return Math.max(0, targetDurationMs - elapsedMsAt(nowElapsedRealtimeMs));
    }

    /** Returns elapsed/target progress in 0..1000; a stopwatch has no bounded progress and returns 0. */
    int progressPermilleAt(long nowElapsedRealtimeMs) {
        if (!isCountdown()) return 0;
        long elapsed = Math.min(targetDurationMs, elapsedMsAt(nowElapsedRealtimeMs));
        return (int) Math.min(1000L, (elapsed * 1000L) / targetDurationMs);
    }

    boolean isExpiredAt(long nowElapsedRealtimeMs) {
        return isCountdown() && elapsedMsAt(nowElapsedRealtimeMs) >= targetDurationMs;
    }

    TaskFocusTimer pause(long nowElapsedRealtimeMs) {
        requireStatus(Status.RUNNING, "Only a running focus timer can be paused.");
        return new TaskFocusTimer(taskId, mode, Status.PAUSED, targetDurationMs,
                elapsedMsAt(nowElapsedRealtimeMs), 0);
    }

    TaskFocusTimer resume(long nowElapsedRealtimeMs) {
        requireStatus(Status.PAUSED, "Only a paused focus timer can be resumed.");
        if (nowElapsedRealtimeMs < 0) {
            throw new IllegalArgumentException("Monotonic time cannot be negative.");
        }
        return new TaskFocusTimer(taskId, mode, Status.RUNNING, targetDurationMs,
                accumulatedElapsedMs, nowElapsedRealtimeMs);
    }

    /** Finishes the focus session only; task completion remains an explicit separate action. */
    TaskFocusTimer finish(long nowElapsedRealtimeMs) {
        if (status == Status.FINISHED) return this;
        if (status == Status.RUNNING) {
            return new TaskFocusTimer(taskId, mode, Status.FINISHED, targetDurationMs,
                    elapsedMsAt(nowElapsedRealtimeMs), 0);
        }
        if (status == Status.PAUSED) {
            return new TaskFocusTimer(taskId, mode, Status.FINISHED, targetDurationMs,
                    accumulatedElapsedMs, 0);
        }
        throw new IllegalStateException("An idle timer cannot be finished.");
    }

    SavedState save(long nowElapsedRealtimeMs, long nowWallClockMs, int bootCount) {
        if (nowElapsedRealtimeMs < 0 || nowWallClockMs < 0 || bootCount < -1) {
            throw new IllegalArgumentException("Invalid timer persistence clock values.");
        }
        return new SavedState(taskId, mode, status, targetDurationMs,
                elapsedMsAt(nowElapsedRealtimeMs), nowElapsedRealtimeMs, nowWallClockMs, bootCount);
    }

    /**
     * Restores a saved session. Same-boot elapsed time uses the monotonic clock. Across a reboot,
     * wall time is used only when both boot counters are known; an unknown boot counter fails safe
     * by restoring a running timer as paused rather than inventing elapsed time.
     */
    static TaskFocusTimer restore(SavedState saved, long nowElapsedRealtimeMs,
                                  long nowWallClockMs, int currentBootCount) {
        if (saved == null || nowElapsedRealtimeMs < 0 || nowWallClockMs < 0
                || currentBootCount < -1) {
            throw new IllegalArgumentException("A valid saved timer and current clock values are required.");
        }
        long elapsed = Math.min(saved.elapsedMs, MAX_ELAPSED_MS);
        Status restoredStatus = saved.status;
        if (restoredStatus == Status.RUNNING) {
            if (saved.bootCount >= 0 && currentBootCount >= 0
                    && saved.bootCount == currentBootCount) {
                long delta = Math.max(0, nowElapsedRealtimeMs - saved.savedAtElapsedRealtimeMs);
                elapsed = Math.min(MAX_ELAPSED_MS, saturatedAdd(elapsed, delta));
            } else if (saved.bootCount >= 0 && currentBootCount >= 0) {
                long delta = Math.max(0, nowWallClockMs - saved.savedAtWallClockMs);
                delta = Math.min(delta, MAX_REBOOT_GAP_MS);
                elapsed = Math.min(MAX_ELAPSED_MS, saturatedAdd(elapsed, delta));
            } else {
                restoredStatus = Status.PAUSED;
            }
        }
        if (saved.mode == Mode.COUNTDOWN && elapsed >= saved.targetDurationMs) {
            restoredStatus = Status.FINISHED;
        }
        long runStarted = restoredStatus == Status.RUNNING ? nowElapsedRealtimeMs : 0;
        return new TaskFocusTimer(saved.taskId, saved.mode, restoredStatus,
                saved.targetDurationMs, elapsed, runStarted);
    }

    private void requireStatus(Status expected, String message) {
        if (status != expected) throw new IllegalStateException(message);
    }

    private static long saturatedAdd(long left, long right) {
        if (right > 0 && left > Long.MAX_VALUE - right) return Long.MAX_VALUE;
        return left + right;
    }

    static final class SavedState {
        final String taskId;
        final Mode mode;
        final Status status;
        final long targetDurationMs;
        final long elapsedMs;
        final long savedAtElapsedRealtimeMs;
        final long savedAtWallClockMs;
        final int bootCount;

        private SavedState(String taskId, Mode mode, Status status, long targetDurationMs,
                           long elapsedMs, long savedAtElapsedRealtimeMs,
                           long savedAtWallClockMs, int bootCount) {
            this.taskId = taskId;
            this.mode = mode;
            this.status = status;
            this.targetDurationMs = targetDurationMs;
            this.elapsedMs = elapsedMs;
            this.savedAtElapsedRealtimeMs = savedAtElapsedRealtimeMs;
            this.savedAtWallClockMs = savedAtWallClockMs;
            this.bootCount = bootCount;
        }
    }
}
