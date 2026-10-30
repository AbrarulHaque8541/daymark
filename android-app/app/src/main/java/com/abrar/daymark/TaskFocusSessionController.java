package com.abrar.daymark;

import android.content.Context;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;

/**
 * Coordinates the user-driven focus timer with its independent encrypted snapshot and notification.
 *
 * <p>Only start() and resume() create a newly-running state, and both persist it before publishing
 * any notification. restore() republishes only a previously persisted RUNNING session; it never
 * creates or starts a session. Task completion is deliberately outside this controller.
 */
final class TaskFocusSessionController {
    private static final int NOTIFICATION_ID = 0x464F4355;

    interface Clock {
        long elapsedRealtimeMs();
        long wallClockMs();
        int bootCount();
    }

    interface NotificationSink {
        boolean publish(TaskFocusTimer timer, String taskTitle, long nowElapsedRealtimeMs);
        void cancel();
    }

    private final TaskFocusTimerStore store;
    private final Clock clock;
    private final NotificationSink notifications;

    TaskFocusSessionController(Context context) {
        this(new TaskFocusTimerStore(context), new AndroidClock(context),
                new AndroidNotificationSink(context));
    }

    TaskFocusSessionController(TaskFocusTimerStore store, Clock clock,
                               NotificationSink notifications) {
        if (store == null || clock == null || notifications == null) {
            throw new IllegalArgumentException("Focus session dependencies are required.");
        }
        this.store = store;
        this.clock = clock;
        this.notifications = notifications;
    }

    /** Starts a new session only in response to an explicit task-UI Start action. */
    synchronized TaskFocusTimer start(String taskId, String taskTitle,
                                      TaskFocusTimer.Mode mode, long targetDurationMs)
            throws Exception {
        TaskFocusTimer existing = loadCurrent();
        if (existing != null && !existing.isFinished()) {
            throw new IllegalStateException("Finish the existing focus session before starting another.");
        }
        long now = clock.elapsedRealtimeMs();
        TaskFocusTimer timer = TaskFocusTimer.start(taskId, mode, targetDurationMs, now);
        persist(timer);
        publishIfRunning(timer, taskTitle, now);
        return timer;
    }

    /** Pauses a running session and removes its ongoing notification. */
    synchronized TaskFocusTimer pause(TaskFocusTimer timer) throws Exception {
        TaskFocusTimer current = requireCurrent(timer, TaskFocusTimer.Status.RUNNING);
        TaskFocusTimer paused = current.pause(clock.elapsedRealtimeMs());
        persist(paused);
        notifications.cancel();
        return paused;
    }

    /** Resumes only a paused session after an explicit user Resume action. */
    synchronized TaskFocusTimer resume(TaskFocusTimer timer, String taskTitle) throws Exception {
        TaskFocusTimer current = requireCurrent(timer, TaskFocusTimer.Status.PAUSED);
        long now = clock.elapsedRealtimeMs();
        TaskFocusTimer running = current.resume(now);
        persist(running);
        publishIfRunning(running, taskTitle, now);
        return running;
    }

    /**
     * Restores an existing encrypted session without ever starting one.
     * A restored RUNNING state may refresh its notification; paused/finished/expired states cancel it.
     */
    synchronized TaskFocusTimer restore(String taskTitle) throws Exception {
        long nowElapsed = clock.elapsedRealtimeMs();
        final TaskFocusTimer restored;
        try {
            restored = store.load(nowElapsed, clock.wallClockMs(), clock.bootCount());
        } catch (Exception exception) {
            // Fail closed: a corrupt/unreadable snapshot must not leave an old ongoing notification.
            notifications.cancel();
            throw exception;
        }
        if (restored == null) {
            notifications.cancel();
            return null;
        }
        TaskFocusTimer current = restored;
        if (current.isRunning() && current.isCountdown() && current.isExpiredAt(nowElapsed)) {
            current = current.finish(nowElapsed);
            persist(current);
        }
        if (current.isRunning()) {
            publishIfRunning(current, taskTitle, nowElapsed);
        } else {
            notifications.cancel();
        }
        return current;
    }

    /** Finishes the focus session only; it never marks the task complete. */
    synchronized TaskFocusTimer finish(TaskFocusTimer timer) throws Exception {
        requireTimer(timer);
        TaskFocusTimer persisted = loadCurrent();
        if (persisted == null || !persisted.taskId().equals(timer.taskId())
                || persisted.isFinished()) {
            throw new IllegalStateException("The focus session is no longer active.");
        }
        TaskFocusTimer finished = persisted.finish(clock.elapsedRealtimeMs());
        store.clear(clock.elapsedRealtimeMs(), clock.wallClockMs(), clock.bootCount());
        notifications.cancel();
        return finished;
    }

    private TaskFocusTimer loadCurrent() throws Exception {
        return store.load(clock.elapsedRealtimeMs(), clock.wallClockMs(), clock.bootCount());
    }

    private TaskFocusTimer requireCurrent(TaskFocusTimer timer, TaskFocusTimer.Status expected)
            throws Exception {
        requireTimer(timer);
        TaskFocusTimer persisted = loadCurrent();
        if (persisted == null || !persisted.taskId().equals(timer.taskId())
                || persisted.status() != expected) {
            throw new IllegalStateException("The saved focus session changed; restore it before acting.");
        }
        return persisted;
    }

    private void persist(TaskFocusTimer timer) throws Exception {
        store.save(timer, clock.elapsedRealtimeMs(), clock.wallClockMs(), clock.bootCount());
    }

    private void publishIfRunning(TaskFocusTimer timer, String taskTitle, long nowElapsed) {
        if (timer != null && timer.isRunning()
                && !(timer.isCountdown() && timer.isExpiredAt(nowElapsed))) {
            // A false return means notification access is unavailable; the encrypted timer remains
            // saved and usable in the task UI. Android 16 promotion is still platform/OEM controlled.
            notifications.publish(timer, taskTitle, nowElapsed);
        } else {
            notifications.cancel();
        }
    }

    private static void requireTimer(TaskFocusTimer timer) {
        if (timer == null) throw new IllegalArgumentException("An active focus session is required.");
    }

    private static final class AndroidClock implements Clock {
        private final Context appContext;

        AndroidClock(Context context) {
            appContext = context.getApplicationContext();
        }

        @Override public long elapsedRealtimeMs() {
            return SystemClock.elapsedRealtime();
        }

        @Override public long wallClockMs() {
            return System.currentTimeMillis();
        }

        @Override public int bootCount() {
            if (Build.VERSION.SDK_INT < 24) return -1;
            try {
                return Settings.Global.getInt(appContext.getContentResolver(), Settings.Global.BOOT_COUNT);
            } catch (Settings.SettingNotFoundException exception) {
                return -1;
            }
        }
    }

    private static final class AndroidNotificationSink implements NotificationSink {
        private final Context appContext;

        AndroidNotificationSink(Context context) {
            appContext = context.getApplicationContext();
        }

        @Override public boolean publish(TaskFocusTimer timer, String taskTitle,
                                         long nowElapsedRealtimeMs) {
            return TaskFocusTimerNotification.publish(
                    appContext, timer, taskTitle, NOTIFICATION_ID, nowElapsedRealtimeMs);
        }

        @Override public void cancel() {
            TaskFocusTimerNotification.cancel(appContext, NOTIFICATION_ID);
        }
    }
}
