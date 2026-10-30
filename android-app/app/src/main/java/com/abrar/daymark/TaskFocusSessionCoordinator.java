package com.abrar.daymark;

/**
 * Coordinates one task-linked focus session across explicit user actions, persistence and
 * notification publication.
 *
 * <p>This class has no Android dependency so its lifecycle rules can be host-tested. The Android
 * layer supplies a monotonic clock, the independent focus-session store and a notification sink.
 * A new session can only be created through startFromUserAction(). Process restoration never
 * starts or resumes a timer; it only restores a previously persisted session and republishes a
 * notification when that session is still running and its task still exists.
 *
 * <p>The Store must be private to this coordinator. It must not be used by startup code to create
 * sessions or by task CRUD code to write task snapshots. The focus record is separate from task
 * data, and finishing/clearing it never completes or deletes a task.
 */
final class TaskFocusSessionCoordinator {
    interface Clock {
        long elapsedRealtimeMs();
        long wallClockMs();
        int bootCount();
    }

    interface Store {
        TaskFocusTimer load(long nowElapsedRealtimeMs, long nowWallClockMs,
                            int currentBootCount) throws Exception;
        void save(TaskFocusTimer timer, long nowElapsedRealtimeMs,
                  long nowWallClockMs, int bootCount) throws Exception;
        void clear(long nowElapsedRealtimeMs, long nowWallClockMs,
                   int bootCount) throws Exception;
    }

    interface NotificationSink {
        /**
         * Publishes an already-running session. Return false when notification access is not
         * available; this must not change the persisted timer state.
         */
        boolean publish(TaskFocusTimer timer, String currentTaskTitle,
                        long nowElapsedRealtimeMs);

        /** Cancels only the focus-session notification, never a reminder or task record. */
        void cancel();
    }

    static final class Snapshot {
        final TaskFocusTimer timer;
        final boolean notificationPublished;
        final boolean restored;

        private Snapshot(TaskFocusTimer timer, boolean notificationPublished, boolean restored) {
            this.timer = timer;
            this.notificationPublished = notificationPublished;
            this.restored = restored;
        }

        boolean isRunning() { return timer != null && timer.isRunning(); }
        boolean isPaused() { return timer != null && timer.isPaused(); }
        boolean isFinished() { return timer != null && timer.isFinished(); }
    }

    private final Clock clock;
    private final Store store;
    private final NotificationSink notifications;

    private TaskFocusTimer current;
    private String currentTaskTitle;
    private boolean notificationPublished;
    private boolean initialized;

    TaskFocusSessionCoordinator(Clock clock, Store store, NotificationSink notifications) {
        if (clock == null || store == null || notifications == null) {
            throw new IllegalArgumentException("Clock, focus store and notification sink are required.");
        }
        this.clock = clock;
        this.store = store;
        this.notifications = notifications;
    }

    /**
     * Starts a session only in response to an explicit Start control selected by the user.
     * Persistence succeeds before an ongoing notification can be published.
     */
    synchronized Snapshot startFromUserAction(String taskId, String taskTitle,
                                              TaskFocusTimer.Mode mode, long targetDurationMs)
            throws Exception {
        requireInitialized();
        if (current != null && !current.isFinished()) {
            throw new IllegalStateException("Finish the current focus session before starting another.");
        }

        ClockReading now = readClock();
        TaskFocusTimer started = TaskFocusTimer.start(
                taskId, mode, targetDurationMs, now.elapsedRealtimeMs);
        store.save(started, now.elapsedRealtimeMs, now.wallClockMs, now.bootCount);

        current = started;
        currentTaskTitle = taskTitle;
        notificationPublished = notifications.publish(
                started, currentTaskTitle, now.elapsedRealtimeMs);
        return snapshot(false);
    }

    /**
     * Loads the independent focus record after the task list is available.
     *
     * <p>currentTaskId must be the ID of the task resolved from the current task snapshot. Passing
     * null, or a different ID, clears only the stale focus-session record and its notification.
     * The method never creates a timer. A restored RUNNING record is eligible for notification
     * publication because this coordinator is the only writer and new records are created only by
     * startFromUserAction().
     */
    synchronized Snapshot restoreAfterProcessStart(String currentTaskId, String currentTaskTitle)
            throws Exception {
        ClockReading now = readClock();
        final TaskFocusTimer restored;
        try {
            restored = store.load(now.elapsedRealtimeMs, now.wallClockMs, now.bootCount);
        } catch (Exception failure) {
            notifications.cancel();
            resetMemory(false);
            throw failure;
        }

        if (restored == null) {
            notifications.cancel();
            resetMemory(true);
            return null;
        }

        if (currentTaskId == null || !currentTaskId.equals(restored.taskId())) {
            notifications.cancel();
            try {
                store.clear(now.elapsedRealtimeMs, now.wallClockMs, now.bootCount);
            } catch (Exception failure) {
                resetMemory(false);
                throw failure;
            }
            resetMemory(true);
            return null;
        }

        current = restored;
        this.currentTaskTitle = currentTaskTitle;
        initialized = true;

        if (restored.isRunning()) {
            notificationPublished = notifications.publish(
                    restored, currentTaskTitle, now.elapsedRealtimeMs);
        } else {
            notifications.cancel();
            notificationPublished = false;
        }
        return snapshot(true);
    }

    synchronized Snapshot pauseFromUserAction() throws Exception {
        requireInitialized();
        requireCurrent();
        if (current.isFinished()) {
            throw new IllegalStateException("A finished focus session cannot be paused.");
        }

        ClockReading now = readClock();
        TaskFocusTimer next;
        if (current.isCountdown() && current.isExpiredAt(now.elapsedRealtimeMs)) {
            next = current.finish(now.elapsedRealtimeMs);
        } else {
            next = current.pause(now.elapsedRealtimeMs);
        }
        store.save(next, now.elapsedRealtimeMs, now.wallClockMs, now.bootCount);
        current = next;
        notifications.cancel();
        notificationPublished = false;
        return snapshot(false);
    }

    synchronized Snapshot resumeFromUserAction(String currentTaskTitle) throws Exception {
        requireInitialized();
        requireCurrent();
        if (!current.isPaused()) {
            throw new IllegalStateException("Only a paused focus session can be resumed.");
        }

        ClockReading now = readClock();
        TaskFocusTimer next = current.isCountdown() && current.isExpiredAt(now.elapsedRealtimeMs)
                ? current.finish(now.elapsedRealtimeMs)
                : current.resume(now.elapsedRealtimeMs);
        store.save(next, now.elapsedRealtimeMs, now.wallClockMs, now.bootCount);
        current = next;
        this.currentTaskTitle = currentTaskTitle;

        if (next.isRunning()) {
            notificationPublished = notifications.publish(
                    next, currentTaskTitle, now.elapsedRealtimeMs);
        } else {
            notifications.cancel();
            notificationPublished = false;
        }
        return snapshot(false);
    }

    synchronized Snapshot finishFromUserAction() throws Exception {
        requireInitialized();
        requireCurrent();
        if (current.isFinished()) return snapshot(false);

        ClockReading now = readClock();
        TaskFocusTimer next = current.finish(now.elapsedRealtimeMs);
        store.save(next, now.elapsedRealtimeMs, now.wallClockMs, now.bootCount);
        current = next;
        notifications.cancel();
        notificationPublished = false;
        return snapshot(false);
    }

    /**
     * Refreshes an existing notification after a task-title change or a UI lifecycle return.
     * It never starts a session and never promotes a paused/finished timer.
     */
    synchronized Snapshot refreshNotification(String currentTaskTitle) throws Exception {
        requireInitialized();
        if (current == null || !current.isRunning()) {
            notifications.cancel();
            notificationPublished = false;
            return snapshot(false);
        }

        ClockReading now = readClock();
        if (current.isCountdown() && current.isExpiredAt(now.elapsedRealtimeMs)) {
            TaskFocusTimer finished = current.finish(now.elapsedRealtimeMs);
            store.save(finished, now.elapsedRealtimeMs, now.wallClockMs, now.bootCount);
            current = finished;
            notifications.cancel();
            notificationPublished = false;
            return snapshot(false);
        }

        this.currentTaskTitle = currentTaskTitle;
        notificationPublished = notifications.publish(
                current, currentTaskTitle, now.elapsedRealtimeMs);
        return snapshot(false);
    }

    /** Clears only the focus record when its task is deleted; task storage is never accessed. */
    synchronized boolean clearIfTaskDeleted(String deletedTaskId) throws Exception {
        requireInitialized();
        if (current == null || deletedTaskId == null || !deletedTaskId.equals(current.taskId())) {
            return false;
        }

        ClockReading now = readClock();
        notifications.cancel();
        notificationPublished = false;
        try {
            store.clear(now.elapsedRealtimeMs, now.wallClockMs, now.bootCount);
        } catch (Exception failure) {
            resetMemory(false);
            throw failure;
        }
        resetMemory(true);
        return true;
    }

    /** Removes a completed focus record after the user dismisses its completed state. */
    synchronized void clearFinishedSessionFromUserAction() throws Exception {
        requireInitialized();
        requireCurrent();
        if (!current.isFinished()) {
            throw new IllegalStateException("Only a finished focus session can be cleared.");
        }

        ClockReading now = readClock();
        notifications.cancel();
        store.clear(now.elapsedRealtimeMs, now.wallClockMs, now.bootCount);
        resetMemory(true);
    }

    synchronized Snapshot currentSnapshot() {
        return current == null ? null : snapshot(false);
    }

    private Snapshot snapshot(boolean restored) {
        return current == null ? null : new Snapshot(current, notificationPublished, restored);
    }

    private void requireInitialized() {
        if (!initialized) {
            throw new IllegalStateException(
                    "Restore the saved focus session after loading tasks before starting or controlling a timer.");
        }
    }

    private void requireCurrent() {
        if (current == null) throw new IllegalStateException("There is no active focus session.");
    }

    private ClockReading readClock() {
        long elapsed = clock.elapsedRealtimeMs();
        long wall = clock.wallClockMs();
        int boot = clock.bootCount();
        if (elapsed < 0 || wall < 0 || boot < -1) {
            throw new IllegalStateException("The focus-session clock returned invalid values.");
        }
        return new ClockReading(elapsed, wall, boot);
    }

    private void resetMemory(boolean markInitialized) {
        current = null;
        currentTaskTitle = null;
        notificationPublished = false;
        initialized = markInitialized;
    }

    private static final class ClockReading {
        final long elapsedRealtimeMs;
        final long wallClockMs;
        final int bootCount;

        ClockReading(long elapsedRealtimeMs, long wallClockMs, int bootCount) {
            this.elapsedRealtimeMs = elapsedRealtimeMs;
            this.wallClockMs = wallClockMs;
            this.bootCount = bootCount;
        }
    }
}
