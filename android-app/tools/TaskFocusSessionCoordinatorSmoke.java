package com.abrar.daymark;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public final class TaskFocusSessionCoordinatorSmoke {
    private static int assertions;

    private TaskFocusSessionCoordinatorSmoke() { }

    public static void main(String[] args) throws Exception {
        restoreMustPrecedeAnyUserStart();
        explicitStartPauseResumeFinishIsDurableAndOrdered();
        staleRuntimeReplacesNotificationWhenPresentationChanges();
        pausedTaskSwitchPersistsIdentityAcrossRestoreAndResume();
        failedPausedTaskSwitchLeavesOriginalSessionUntouched();
        anActiveSessionCannotBeReplaced();
        processRestorePublishesOnlyAnExistingRunningSession();
        restoreLoadedSnapshotUsesCallerResolvedRecord();
        aMissingTaskClearsOnlyTheFocusRecord();
        expiredAndUnknownBootRestoresFailClosed();
        failedNotificationPublicationCancelsPriorVisibleState();
        repeatedExpiryDoesNotCompleteOrRestartAgain();
        persistenceFailureDoesNotPublishOrMutateTheCurrentSession();
        notificationDenialDoesNotLoseTheRunningSession();
        System.out.println("PASS task focus session coordinator smoke tests: " + assertions + " assertions");
    }

    private static void restoreMustPrecedeAnyUserStart() throws Exception {
        Fixture fixture = new Fixture();
        expectIllegalState(() -> fixture.coordinator.startFromUserAction(
                "task-a", "Task A", TaskFocusTimer.Mode.STOPWATCH, 0),
                "the caller must restore the persisted session before starting");
        check(fixture.store.saved == null, "a premature start does not overwrite the focus store");
        check(fixture.notifications.events.isEmpty(), "a premature start does not publish a notification");
    }

    private static void explicitStartPauseResumeFinishIsDurableAndOrdered() throws Exception {
        Fixture fixture = new Fixture();
        fixture.initializeWithoutSession();
        fixture.notifications.events.clear();
        fixture.store.events.clear();

        TaskFocusSessionCoordinator.Snapshot started = fixture.coordinator.startFromUserAction(
                "task-1", "Write project notes", TaskFocusTimer.Mode.STOPWATCH, 0);
        check(started.isRunning(), "explicit user Start creates a running stopwatch");
        check(started.notificationPublished, "the running session is published when notification access exists");
        check(fixture.store.saved.status == TaskFocusTimer.Status.RUNNING,
                "the running state is persisted");
        check(fixture.events().equals(list("save", "publish")),
                "the encrypted-session store is written before notification publication");

        fixture.clock.advance(4_500);
        fixture.notifications.events.clear();
        fixture.store.events.clear();
        TaskFocusSessionCoordinator.Snapshot paused = fixture.coordinator.pauseFromUserAction();
        check(paused.isPaused(), "Pause transitions the session to paused");
        check(paused.timer.elapsedMsAt(fixture.clock.elapsed) == 4_500,
                "Pause freezes the accumulated elapsed duration");
        check(fixture.store.saved.status == TaskFocusTimer.Status.PAUSED,
                "the paused state is persisted");
        check(paused.notificationPublished && fixture.notifications.active
                        && fixture.notifications.lastStatus == TaskFocusTimer.Status.PAUSED,
                "Pause retains a Resume/Finish notification after persistence");
        check(fixture.events().equals(list("save", "cancel", "publish")),
                "Pause persists, removes the old running presentation, then publishes the paused notification");

        fixture.clock.advance(60_000);
        fixture.notifications.events.clear();
        fixture.store.events.clear();
        TaskFocusSessionCoordinator.Snapshot resumed =
                fixture.coordinator.resumeFromUserAction("task-1", "Write project notes");
        check(resumed.isRunning(), "Resume returns the session to running");
        check(resumed.timer.elapsedMsAt(fixture.clock.elapsed) == 4_500,
                "paused wall time is not counted as focus time");
        check(fixture.store.saved.status == TaskFocusTimer.Status.RUNNING,
                "the resumed state is persisted");
        check(fixture.events().equals(list("save", "cancel", "publish")),
                "Resume persists, removes the paused presentation, then republishes the running notification");

        fixture.clock.advance(2_000);
        fixture.notifications.events.clear();
        fixture.store.events.clear();
        TaskFocusSessionCoordinator.Snapshot finished = fixture.coordinator.finishFromUserAction();
        check(finished.isFinished(), "Finish freezes the focus session");
        check(finished.timer.elapsedMsAt(fixture.clock.elapsed) == 6_500,
                "Finish preserves the accumulated focus duration");
        check(fixture.store.saved.status == TaskFocusTimer.Status.FINISHED,
                "the finished state is persisted");
        check(fixture.events().equals(list("save", "cancel")),
                "Finish persists before cancelling the ongoing notification");

        fixture.notifications.events.clear();
        fixture.store.events.clear();
        fixture.coordinator.clearFinishedSessionFromUserAction();
        check(fixture.store.saved == null, "clearing a completed session writes an empty focus record");
        check(fixture.coordinator.currentSnapshot() == null, "clearing removes the in-memory focus session");
        check(fixture.events().equals(list("cancel", "clear")),
                "clearing cancels only the focus notification and then clears its separate record");
    }

    private static void staleRuntimeReplacesNotificationWhenPresentationChanges() throws Exception {
        Fixture original = new Fixture();
        original.initializeWithoutSession();
        original.coordinator.startFromUserAction(
                "task-a", "Task A", TaskFocusTimer.Mode.STOPWATCH, 0);

        Fixture secondRuntime = new Fixture(original.clock, original.store);
        secondRuntime.coordinator.restoreAfterProcessStart("task-a", "Task A");
        secondRuntime.coordinator.pauseFromUserAction();

        original.store.events.clear();
        original.notifications.events.clear();
        TaskFocusSessionCoordinator.Snapshot reconciled =
                original.coordinator.restoreAfterProcessStart("task-a", "Task A");
        check(reconciled != null && reconciled.isPaused(),
                "the stale runtime adopts the durable paused session");
        check(original.events().equals(list("load", "cancel", "publish")),
                "a stale running notification is cancelled before the paused presentation is republished");
        check(original.notifications.active
                        && original.notifications.lastStatus == TaskFocusTimer.Status.PAUSED,
                "the notification sink ends with the paused session presentation");
    }

    private static void pausedTaskSwitchPersistsIdentityAcrossRestoreAndResume() throws Exception {
        Fixture fixture = new Fixture();
        fixture.initializeWithoutSession();
        fixture.coordinator.startFromUserAction(
                "task-a", "Task A", TaskFocusTimer.Mode.STOPWATCH, 0);
        fixture.clock.advance(4_500);
        fixture.coordinator.pauseFromUserAction();
        fixture.clock.advance(60_000);
        fixture.notifications.events.clear();
        fixture.store.events.clear();

        TaskFocusSessionCoordinator.Snapshot switched =
                fixture.coordinator.switchTaskWhilePausedFromUserAction("task-b", "Task B");
        check(switched.isPaused() && "task-b".equals(switched.timer.taskId()),
                "choosing another task while paused updates the session identity without resuming it");
        check(switched.timer.elapsedMsAt(fixture.clock.elapsed) == 4_500,
                "paused task switch preserves accumulated focus time");
        check("task-b".equals(fixture.store.saved.taskId)
                        && fixture.store.saved.status == TaskFocusTimer.Status.PAUSED,
                "the selected task ID and paused state are durably saved before returning");
        check(fixture.events().equals(list("save", "cancel", "publish"))
                        && fixture.notifications.active
                        && fixture.notifications.lastStatus == TaskFocusTimer.Status.PAUSED,
                "switch persists, cancels the old notification identity, then publishes the paused replacement");
        check("Task B".equals(fixture.notifications.lastTitle),
                "paused task switch updates the title before publishing its notification");

        int savesBeforeRejectedResume = fixture.store.saveCount;
        int publicationsBeforeRejectedResume = fixture.notifications.publishCount;
        expectIllegalState(() -> fixture.coordinator.resumeFromUserAction("task-a", "Task A"),
                "a stale task ID cannot resume a session after another task has been selected");
        check(fixture.store.saveCount == savesBeforeRejectedResume
                        && fixture.notifications.publishCount == publicationsBeforeRejectedResume
                        && "task-b".equals(fixture.coordinator.currentSnapshot().timer.taskId()),
                "a mismatched resume cannot overwrite the switched task or publish a wrong-title notification");

        Fixture afterProcessDeath = new Fixture(fixture.clock, fixture.store);
        TaskFocusSessionCoordinator.Snapshot restored =
                afterProcessDeath.coordinator.restoreAfterProcessStart("task-b", "Task B");
        check(restored != null && restored.isPaused() && restored.restored
                        && "task-b".equals(restored.timer.taskId()),
                "the switched task identity survives process death and restores as paused");
        check(restored.notificationPublished && afterProcessDeath.notifications.active
                        && afterProcessDeath.notifications.lastStatus == TaskFocusTimer.Status.PAUSED,
                "restoring a switched paused session republishes Resume/Finish actions");

        afterProcessDeath.store.events.clear();
        afterProcessDeath.notifications.events.clear();
        TaskFocusSessionCoordinator.Snapshot resumed =
                afterProcessDeath.coordinator.resumeFromUserAction("task-b", "Task B");
        check(resumed.isRunning() && "task-b".equals(resumed.timer.taskId()),
                "the selected task resumes the same persisted focus session");
        check("Task B".equals(afterProcessDeath.notifications.lastTitle)
                        && afterProcessDeath.notifications.active,
                "the resumed notification title belongs to the newly selected task");
        check(afterProcessDeath.events().equals(list("save", "cancel", "publish")),
                "resume persists the running state, cancels the paused presentation, then publishes the running notification");
    }

    private static void failedPausedTaskSwitchLeavesOriginalSessionUntouched() throws Exception {
        Fixture fixture = new Fixture();
        fixture.initializeWithoutSession();
        fixture.coordinator.startFromUserAction(
                "task-a", "Task A", TaskFocusTimer.Mode.STOPWATCH, 0);
        fixture.coordinator.pauseFromUserAction();
        fixture.notifications.events.clear();
        fixture.store.events.clear();
        fixture.store.failNextSave = true;

        expectIOException(() -> fixture.coordinator.switchTaskWhilePausedFromUserAction(
                "task-b", "Task B"), "a failed task rebind is reported");
        TaskFocusSessionCoordinator.Snapshot current = fixture.coordinator.currentSnapshot();
        check(current.isPaused() && "task-a".equals(current.timer.taskId())
                        && "task-a".equals(fixture.store.saved.taskId),
                "a failed rebind leaves both memory and persisted session linked to the original task");
        check(fixture.events().equals(java.util.Collections.singletonList("save"))
                        && fixture.notifications.active
                        && fixture.notifications.lastStatus == TaskFocusTimer.Status.PAUSED,
                "a failed rebind leaves the existing paused notification unchanged");
    }

    private static void anActiveSessionCannotBeReplaced() throws Exception {
        Fixture fixture = new Fixture();
        fixture.initializeWithoutSession();
        fixture.coordinator.startFromUserAction(
                "task-a", "Task A", TaskFocusTimer.Mode.STOPWATCH, 0);
        int writesBefore = fixture.store.saveCount;
        int publishesBefore = fixture.notifications.publishCount;

        expectIllegalState(() -> fixture.coordinator.startFromUserAction(
                "task-b", "Task B", TaskFocusTimer.Mode.COUNTDOWN, 25 * 60_000L),
                "a second task cannot silently replace an active focus session");
        check(fixture.store.saveCount == writesBefore, "rejected replacement does not overwrite the stored session");
        check(fixture.notifications.publishCount == publishesBefore,
                "rejected replacement does not publish a second ongoing notification");
        check("task-a".equals(fixture.store.saved.taskId), "the original task remains linked to the session");
    }

    private static void processRestorePublishesOnlyAnExistingRunningSession() throws Exception {
        Fixture first = new Fixture();
        first.initializeWithoutSession();
        first.coordinator.startFromUserAction(
                "task-restore", "Original title", TaskFocusTimer.Mode.STOPWATCH, 0);
        first.clock.advance(3_000);

        Fixture afterProcessDeath = new Fixture(first.clock, first.store);
        // The durable store is intentionally reused, but its event log also
        // contains the prior process's Start writes. Reset only the observation
        // log so this assertion covers the restore sequence, not the earlier process.
        afterProcessDeath.store.events.clear();
        TaskFocusSessionCoordinator.Snapshot restored =
                afterProcessDeath.coordinator.restoreAfterProcessStart("task-restore", "Renamed task");
        check(restored != null && restored.restored, "a stored session is identified as restored, not newly started");
        check(restored.isRunning(), "a previously user-started running session remains running");
        check(restored.timer.elapsedMsAt(afterProcessDeath.clock.elapsed) == 3_000,
                "process restoration preserves monotonic elapsed time");
        check(restored.notificationPublished && afterProcessDeath.notifications.active,
                "only the previously persisted running session republishes its notification");
        check("Renamed task".equals(afterProcessDeath.notifications.lastTitle),
                "the current task title is resolved at restore time and is not stored in the timer record");
        check(afterProcessDeath.events().equals(list("load", "cancel", "publish")),
                "first restore cancels a stale prior-process notification before publishing the resolved title");
        check(afterProcessDeath.store.saveCount == first.store.saveCount,
                "restoration reads the existing record without inventing a new Start or rewriting task data");

        afterProcessDeath.coordinator.pauseFromUserAction();
        Fixture pausedAfterDeath = new Fixture(afterProcessDeath.clock, afterProcessDeath.store);
        TaskFocusSessionCoordinator.Snapshot paused =
                pausedAfterDeath.coordinator.restoreAfterProcessStart("task-restore", "Renamed task");
        check(paused != null && paused.isPaused(), "a persisted paused session restores as paused");
        check(paused.notificationPublished && pausedAfterDeath.notifications.active
                        && pausedAfterDeath.notifications.lastStatus == TaskFocusTimer.Status.PAUSED,
                "a restored paused session republishes its Resume/Finish notification");
    }

    private static void restoreLoadedSnapshotUsesCallerResolvedRecord() throws Exception {
        Fixture writer = new Fixture();
        writer.initializeWithoutSession();
        writer.coordinator.startFromUserAction(
                "task-a", "Task A", TaskFocusTimer.Mode.STOPWATCH, 0);
        writer.coordinator.pauseFromUserAction();

        // Model an older Activity/runtime that still believes Task A owns the
        // paused session while another runtime switches the durable record.
        Fixture staleRuntime = new Fixture(writer.clock, writer.store);
        TaskFocusSessionCoordinator.Snapshot stale = staleRuntime.coordinator
                .restoreAfterProcessStart("task-a", "Task A");
        check(stale != null && stale.isPaused()
                        && "task-a".equals(stale.timer.taskId()),
                "the stale runtime first adopts the original paused task");

        writer.store.events.clear();
        TaskFocusSessionCoordinator.Snapshot switched =
                writer.coordinator.switchTaskWhilePausedFromUserAction("task-b", "Task B");
        check(switched != null && switched.isPaused()
                        && "task-b".equals(switched.timer.taskId()),
                "the writer durably switches the paused session to Task B");

        TaskFocusTimer latest = writer.store.load(
                writer.clock.elapsed, writer.clock.wall, writer.clock.boot);
        check(latest != null && "task-b".equals(latest.taskId()),
                "the caller resolves the latest stored task identity before reconciliation");
        writer.store.events.clear();

        TaskFocusSessionCoordinator.Snapshot adopted = staleRuntime.coordinator
                .restoreLoadedSnapshot(latest, "task-b", "Task B");
        check(adopted != null && adopted.isPaused()
                        && "task-b".equals(adopted.timer.taskId()),
                "a stale runtime adopts the already-resolved latest durable focus record");
        check("Task B".equals(staleRuntime.notifications.lastTitle)
                        && staleRuntime.notifications.active,
                "the adopted record publishes the current task title, not a cached title");
        check(staleRuntime.events().equals(list("cancel", "publish")),
                "changing notification identity cancels the old title before publishing without a second storage read/write");
    }

    private static void aMissingTaskClearsOnlyTheFocusRecord() throws Exception {
        Fixture first = new Fixture();
        first.initializeWithoutSession();
        first.coordinator.startFromUserAction(
                "deleted-task", "Task that was deleted", TaskFocusTimer.Mode.STOPWATCH, 0);

        Fixture afterDelete = new Fixture(first.clock, first.store);
        TaskFocusSessionCoordinator.Snapshot restored =
                afterDelete.coordinator.restoreAfterProcessStart(null, null);
        check(restored == null, "a missing task cannot retain a focus session");
        check(afterDelete.store.saved == null, "only the independent focus record is cleared");
        check(!afterDelete.notifications.active, "a stale focus notification is cancelled");
        check(afterDelete.store.clearCount == 1, "the stale focus record is cleared exactly once");
    }

    private static void expiredAndUnknownBootRestoresFailClosed() throws Exception {
        Fixture countdown = new Fixture();
        countdown.initializeWithoutSession();
        countdown.coordinator.startFromUserAction(
                "task-countdown", "Short focus", TaskFocusTimer.Mode.COUNTDOWN, 1_000);
        countdown.clock.advance(1_500);

        Fixture afterExpiry = new Fixture(countdown.clock, countdown.store);
        TaskFocusSessionCoordinator.Snapshot expired =
                afterExpiry.coordinator.restoreAfterProcessStart("task-countdown", "Short focus");
        check(expired != null && expired.isFinished(), "an expired countdown restores as finished");
        check(!expired.notificationPublished && !afterExpiry.notifications.active,
                "an expired countdown never republishes an ongoing notification");

        FakeClock unknownBootClock = new FakeClock();
        unknownBootClock.boot = -1;
        FakeStore unknownBootStore = new FakeStore(new ArrayList<>());
        Fixture unknownBoot = new Fixture(unknownBootClock, unknownBootStore);
        unknownBoot.initializeWithoutSession();
        unknownBoot.coordinator.startFromUserAction(
                "task-unknown-boot", "Unknown boot", TaskFocusTimer.Mode.STOPWATCH, 0);

        Fixture afterUnknownBoot = new Fixture(unknownBootClock, unknownBootStore);
        TaskFocusSessionCoordinator.Snapshot safe =
                afterUnknownBoot.coordinator.restoreAfterProcessStart("task-unknown-boot", "Unknown boot");
        check(safe != null && safe.isPaused(), "unknown boot identity restores a running session as paused");
        check(safe.notificationPublished && afterUnknownBoot.notifications.active
                        && afterUnknownBoot.notifications.lastStatus == TaskFocusTimer.Status.PAUSED,
                "unknown boot identity remains paused and offers explicit Resume/Finish actions");
    }

    private static void repeatedExpiryDoesNotCompleteOrRestartAgain() throws Exception {
        Fixture fixture = new Fixture();
        fixture.initializeWithoutSession();
        fixture.coordinator.startFromUserAction(
                "task-zero", "Zero boundary", TaskFocusTimer.Mode.COUNTDOWN, 1_000L);
        fixture.clock.advance(1_000L);
        int savesBeforeExpiry = fixture.store.saveCount;
        int publishesBeforeExpiry = fixture.notifications.publishCount;
        fixture.store.events.clear();
        fixture.notifications.events.clear();

        TaskFocusSessionCoordinator.Snapshot finished =
                fixture.coordinator.refreshNotification("Zero boundary");
        check(finished != null && finished.isFinished() && !finished.notificationPublished,
                "first zero refresh durably finishes and clears the running notification");
        check(fixture.store.saveCount == savesBeforeExpiry + 1,
                "the zero boundary writes one finished snapshot");
        check(fixture.events().equals(list("save", "cancel")),
                "completion persists once before cancelling notification state");

        int savesAfterFinish = fixture.store.saveCount;
        int publicationsAfterFinish = fixture.notifications.publishCount;
        fixture.clock.advance(1_000L);
        fixture.store.events.clear();
        fixture.notifications.events.clear();
        TaskFocusSessionCoordinator.Snapshot repeated =
                fixture.coordinator.refreshNotification("Zero boundary");
        check(repeated != null && repeated.isFinished() && !repeated.notificationPublished,
                "later zero refreshes leave the finished session terminal");
        check(fixture.store.saveCount == savesAfterFinish
                        && fixture.notifications.publishCount == publicationsAfterFinish
                        && fixture.events().isEmpty(),
                "repeated zero refresh neither rewrites completion nor republishes/restarts a timer");
        check(!fixture.notifications.active,
                "no notification remains active after repeated zero refreshes");
    }

    private static void failedNotificationPublicationCancelsPriorVisibleState() throws Exception {
        Fixture fixture = new Fixture();
        fixture.initializeWithoutSession();
        fixture.coordinator.startFromUserAction(
                "task-a", "Task A", TaskFocusTimer.Mode.STOPWATCH, 0L);
        fixture.store.events.clear();
        fixture.notifications.events.clear();
        fixture.notifications.available = false;

        TaskFocusSessionCoordinator.Snapshot paused = fixture.coordinator.pauseFromUserAction();
        check(paused.isPaused() && !paused.notificationPublished && !fixture.notifications.active,
                "failed paused publication cancels the previously visible running notification");
        check(fixture.events().equals(list("save", "cancel", "publish", "cancel")),
                "pause persistence precedes old-style cancellation, attempted replacement publication and fail-closed cancellation");

        fixture.notifications.available = true;
        check(fixture.coordinator.refreshNotification("Task A").notificationPublished
                        && fixture.notifications.active,
                "a later refresh can publish the paused state again");
        fixture.store.events.clear();
        fixture.notifications.events.clear();
        fixture.notifications.available = false;
        TaskFocusSessionCoordinator.Snapshot switched =
                fixture.coordinator.switchTaskWhilePausedFromUserAction("task-b", "Task B");
        check(switched.isPaused() && !switched.notificationPublished
                        && "task-b".equals(fixture.store.saved.taskId)
                        && !fixture.notifications.active,
                "failed task-switch publication cancels the old-title notification");
        check("Task A".equals(fixture.notifications.lastTitle),
                "the fake notification retained its old title until cancellation");
        check(fixture.events().size() == 4 && "save".equals(fixture.events().get(0))
                        && "cancel".equals(fixture.events().get(1))
                        && "publish".equals(fixture.events().get(2))
                        && "cancel".equals(fixture.events().get(3)),
                "task switch persists, removes the old title, publishes the replacement, and fails closed if publication fails");

        fixture.notifications.available = true;
        check(fixture.coordinator.refreshNotification("Task B").notificationPublished
                        && "Task B".equals(fixture.notifications.lastTitle),
                "refresh publishes the new paused-task title when access returns");
        fixture.notifications.events.clear();
        fixture.notifications.available = false;
        TaskFocusSessionCoordinator.Snapshot refreshed =
                fixture.coordinator.refreshNotification("Task B renamed");
        check(!refreshed.notificationPublished && !fixture.notifications.active,
                "failed title refresh also removes the stale visible notification");
        check(fixture.notifications.events.size() == 3
                        && "cancel".equals(fixture.notifications.events.get(0))
                        && "publish".equals(fixture.notifications.events.get(1))
                        && "cancel".equals(fixture.notifications.events.get(2)),
                "a changed title removes the old notification before attempting publication and remains fail-closed");
    }

    private static void persistenceFailureDoesNotPublishOrMutateTheCurrentSession() throws Exception {
        Fixture fixture = new Fixture();
        fixture.initializeWithoutSession();
        fixture.store.failNextSave = true;

        expectIOException(() -> fixture.coordinator.startFromUserAction(
                "task-fail", "Task", TaskFocusTimer.Mode.STOPWATCH, 0),
                "a failed durable Start is reported");
        check(fixture.coordinator.currentSnapshot() == null,
                "a failed Start does not create an in-memory running session");
        check(!fixture.notifications.active && fixture.notifications.publishCount == 0,
                "a failed Start never publishes an ongoing notification");

        fixture.coordinator.startFromUserAction(
                "task-fail", "Task", TaskFocusTimer.Mode.STOPWATCH, 0);
        fixture.store.failNextSave = true;
        fixture.notifications.events.clear();
        expectIOException(fixture.coordinator::pauseFromUserAction,
                "a failed Pause persistence is reported");
        check(fixture.coordinator.currentSnapshot().isRunning(),
                "a failed Pause leaves the last known running state intact");
        check(fixture.notifications.active,
                "a failed Pause does not cancel the notification for the still-running persisted session");
        check(fixture.events().size() == 1 && "save".equals(fixture.events().get(0)),
                "a failed Pause records only the attempted store write and performs no notification side effect");
    }

    private static void notificationDenialDoesNotLoseTheRunningSession() throws Exception {
        Fixture fixture = new Fixture();
        fixture.initializeWithoutSession();
        fixture.notifications.available = false;

        TaskFocusSessionCoordinator.Snapshot started = fixture.coordinator.startFromUserAction(
                "task-no-permission", "Task", TaskFocusTimer.Mode.STOPWATCH, 0);
        check(started.isRunning(), "notification denial does not stop the focus timer");
        check(!started.notificationPublished, "the snapshot reports that no notification was published");
        check(fixture.store.saved.status == TaskFocusTimer.Status.RUNNING,
                "the running session remains persisted when notifications are unavailable");

        fixture.notifications.available = true;
        TaskFocusSessionCoordinator.Snapshot refreshed =
                fixture.coordinator.refreshNotification("Task");
        check(refreshed.notificationPublished && fixture.notifications.active,
                "a later lifecycle refresh can publish the existing session without starting a new one");
        check(fixture.store.saveCount == 1,
                "notification refresh does not rewrite the persisted timer or task data");
    }

    private static final class Fixture {
        final FakeClock clock;
        final FakeStore store;
        final List<String> eventLog;
        final FakeNotifications notifications;
        final TaskFocusSessionCoordinator coordinator;

        Fixture() {
            this(new FakeClock(), null);
        }

        Fixture(FakeClock clock, FakeStore existingStore) {
            this.clock = clock;
            this.eventLog = existingStore == null ? new ArrayList<>() : existingStore.events;
            this.store = existingStore == null ? new FakeStore(eventLog) : existingStore;
            this.notifications = new FakeNotifications(eventLog);
            this.coordinator = new TaskFocusSessionCoordinator(clock, store, notifications);
        }

        void initializeWithoutSession() throws Exception {
            coordinator.restoreAfterProcessStart(null, null);
            store.events.clear();
            notifications.events.clear();
        }

        List<String> events() {
            return new ArrayList<>(eventLog);
        }
    }

    private static final class FakeClock implements TaskFocusSessionCoordinator.Clock {
        long elapsed = 1_000;
        long wall = 10_000_000;
        int boot = 7;

        void advance(long durationMs) {
            elapsed += durationMs;
            wall += durationMs;
        }

        @Override public long elapsedRealtimeMs() { return elapsed; }
        @Override public long wallClockMs() { return wall; }
        @Override public int bootCount() { return boot; }
    }

    private static final class FakeStore implements TaskFocusSessionCoordinator.Store {
        final List<String> events;
        TaskFocusTimer.SavedState saved;
        int saveCount;
        int clearCount;
        boolean failNextSave;

        FakeStore(List<String> events) { this.events = events; }

        @Override
        public TaskFocusTimer load(long nowElapsed, long nowWall, int bootCount) {
            events.add("load");
            return saved == null ? null : TaskFocusTimer.restore(saved, nowElapsed, nowWall, bootCount);
        }

        @Override
        public void save(TaskFocusTimer timer, long nowElapsed, long nowWall, int bootCount)
                throws IOException {
            events.add("save");
            if (failNextSave) {
                failNextSave = false;
                throw new IOException("synthetic focus-store write failure");
            }
            saved = timer.save(nowElapsed, nowWall, bootCount);
            saveCount++;
        }

        @Override
        public void clear(long nowElapsed, long nowWall, int bootCount) {
            events.add("clear");
            saved = null;
            clearCount++;
        }
    }

    private static final class FakeNotifications implements TaskFocusSessionCoordinator.NotificationSink {
        final List<String> events;
        boolean available = true;
        boolean active;
        int publishCount;
        String lastTitle;
        TaskFocusTimer.Status lastStatus;

        FakeNotifications(List<String> events) { this.events = events; }

        @Override
        public boolean publish(TaskFocusTimer timer, String currentTaskTitle, long nowElapsed) {
            events.add("publish");
            publishCount++;
            if (!available || timer == null || (!timer.isRunning() && !timer.isPaused())) return false;
            lastTitle = currentTaskTitle;
            lastStatus = timer.status();
            active = true;
            return true;
        }

        @Override
        public void cancel() {
            events.add("cancel");
            active = false;
        }
    }

    private static List<String> list(String... entries) {
        List<String> values = new ArrayList<>();
        for (String entry : entries) values.add(entry);
        return values;
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private static void expectIllegalState(ThrowingAction action, String message) throws Exception {
        assertions++;
        try {
            action.run();
        } catch (IllegalStateException expected) {
            return;
        }
        throw new AssertionError(message);
    }

    private static void expectIOException(ThrowingAction action, String message) throws Exception {
        assertions++;
        try {
            action.run();
        } catch (IOException expected) {
            return;
        }
        throw new AssertionError(message);
    }

    @FunctionalInterface
    private interface ThrowingAction {
        void run() throws Exception;
    }
}
