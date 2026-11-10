package com.abrar.daymark;

import android.content.Context;
import android.os.SystemClock;
import android.provider.Settings;

import java.util.List;

/**
 * Android boundary for the UI-independent focus coordinator.
 *
 * The only path to publish a focus notification is through the coordinator, which persists
 * explicit Start/Pause/Resume transitions before invoking the sink.
 * Focus state is stored independently from the encrypted task snapshot.
 */
final class TaskFocusSessionRuntime {
    private static final int NOTIFICATION_ID = 0x44464F43;

    private final Context appContext;
    private final TaskFocusTimerStore store;
    private final TaskFocusSessionCoordinator coordinator;

    TaskFocusSessionRuntime(Context context) {
        if (context == null) throw new IllegalArgumentException("An application context is required.");
        appContext = context.getApplicationContext();
        store = new TaskFocusTimerStore(appContext);
        coordinator = new TaskFocusSessionCoordinator(
                new TaskFocusSessionCoordinator.Clock() {
                    @Override public long elapsedRealtimeMs() {
                        return SystemClock.elapsedRealtime();
                    }

                    @Override public long wallClockMs() {
                        return System.currentTimeMillis();
                    }

                    @Override public int bootCount() {
                        return readBootCount();
                    }
                },
                new TaskFocusSessionCoordinator.Store() {
                    @Override
                    public TaskFocusTimer load(long elapsed, long wall, int boot) throws Exception {
                        return store.load(elapsed, wall, boot);
                    }

                    @Override
                    public void save(TaskFocusTimer timer, long elapsed, long wall, int boot)
                            throws Exception {
                        store.save(timer, elapsed, wall, boot);
                    }

                    @Override
                    public void clear(long elapsed, long wall, int boot) throws Exception {
                        store.clear(elapsed, wall, boot);
                    }
                },
                new TaskFocusSessionCoordinator.NotificationSink() {
                    @Override
                    public boolean publish(TaskFocusTimer timer, String title, long elapsed) {
                        return TaskFocusTimerNotification.publish(
                                appContext, timer, title, NOTIFICATION_ID, elapsed);
                    }

                    @Override
                    public void cancel() {
                        TaskFocusTimerNotification.cancel(appContext, NOTIFICATION_ID);
                    }
                });
    }

    /**
     * Resolve the saved task ID against the successfully loaded encrypted task list before
     * allowing the coordinator to restore or republish a running session.
     */
    TaskFocusSessionCoordinator.Snapshot restoreAfterProcessStart(List<Task> tasks)
            throws Exception {
        long elapsed = SystemClock.elapsedRealtime();
        long wall = System.currentTimeMillis();
        int boot = readBootCount();
        final TaskFocusTimer saved;
        try {
            saved = store.load(elapsed, wall, boot);
        } catch (Exception failure) {
            return coordinator.restoreLoadFailure(failure);
        }
        Task currentTask = findTask(tasks, saved == null ? null : saved.taskId());
        return coordinator.restoreLoadedSnapshot(
                saved,
                currentTask == null ? null : currentTask.id,
                currentTask == null ? null : currentTask.title);
    }

    /**
     * Reconcile from the latest durable record, not this runtime instance's cached coordinator
     * snapshot. A prior Activity/runtime may have switched or cleared the session while this
     * instance was stopped; reusing its old task title can republish a stale notification.
     */
    TaskFocusSessionCoordinator.Snapshot reconcileTasks(List<Task> tasks) throws Exception {
        return restoreAfterProcessStart(tasks);
    }
    TaskFocusSessionCoordinator.Snapshot startFromUserAction(
            String taskId, String title, TaskFocusTimer.Mode mode, long targetDurationMs)
            throws Exception {
        return coordinator.startFromUserAction(taskId, title, mode, targetDurationMs);
    }

    TaskFocusSessionCoordinator.Snapshot pauseFromUserAction() throws Exception {
        return coordinator.pauseFromUserAction();
    }

    TaskFocusSessionCoordinator.Snapshot switchTaskWhilePausedFromUserAction(
            String taskId, String title) throws Exception {
        return coordinator.switchTaskWhilePausedFromUserAction(taskId, title);
    }

    TaskFocusSessionCoordinator.Snapshot resumeFromUserAction(String taskId, String title)
            throws Exception {
        return coordinator.resumeFromUserAction(taskId, title);
    }

    TaskFocusSessionCoordinator.Snapshot finishFromUserAction() throws Exception {
        return coordinator.finishFromUserAction();
    }

    TaskFocusSessionCoordinator.Snapshot currentSnapshot() {
        return coordinator.currentSnapshot();
    }

    private int readBootCount() {
        try {
            return Settings.Global.getInt(
                    appContext.getContentResolver(), Settings.Global.BOOT_COUNT, -1);
        } catch (RuntimeException unavailable) {
            return -1;
        }
    }

    private static Task findTask(List<Task> tasks, String taskId) {
        if (tasks == null || taskId == null) return null;
        for (Task task : tasks) {
            if (task != null && taskId.equals(task.id)) return task;
        }
        return null;
    }
}
