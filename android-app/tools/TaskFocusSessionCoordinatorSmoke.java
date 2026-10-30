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
        anActiveSessionCannotBeReplaced();
        processRestorePublishesOnlyAnExistingRunningSession();
        aMissingTaskClearsOnlyTheFocusRecord();
        expiredAndUnknownBootRestoresFailClosed();
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
        check(fixture.events().equals(list("save", "cancel")),
                "Pause persists before cancelling the ongoing notification");

        fixture.clock.advance(60_000);
        fixture.notifications.events.clear();
        fixture.store.events.clear();
        TaskFocusSessionCoordinator.Snapshot resumed =
                fixture.coordinator.resumeFromUserAction("Write project notes");
        check(resumed.isRunning(), "Resume returns the session to running");
        check(resumed.timer.elapsedMsAt(fixture.clock.elapsed) == 4_500,
                "paused wall time is not counted as focus time");
        check(fixture.store.saved.status == TaskFocusTimer.Status.RUNNING,
                "the resumed state is persisted");
        check(fixture.events().equals(list("save", "publish")),
                "Resume persists before republishing the ongoing notification");

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
        check(afterProcessDeath.store.saveCount == first.store.saveCount,
                "restoration reads the existing record without inventing a new Start or rewriting task data");

        afterProcessDeath.coordinator.pauseFromUserAction();
        Fixture pausedAfterDeath = new Fixture(afterProcessDeath.clock, afterProcessDeath.store);
        TaskFocusSessionCoordinator.Snapshot paused =
                pausedAfterDeath.coordinator.restoreAfterProcessStart("task-restore", "Renamed task");
        check(paused != null && paused.isPaused(), "a persisted paused session restores as paused");
        check(!paused.notificationPublished && !pausedAfterDeath.notifications.active,
                "a paused session never republishes an ongoing notification");
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
        check(!safe.notificationPublished && !afterUnknownBoot.notifications.active,
                "unknown boot identity does not promote an uncertain session");
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
        check(fixture.events().equals(list("save", "unused")) == false
                        && fixture.events().size() == 1
                        && "save".equals(fixture.events().get(0)),
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

        FakeNotifications(List<String> events) { this.events = events; }

        @Override
        public boolean publish(TaskFocusTimer timer, String currentTaskTitle, long nowElapsed) {
            events.add("publish");
            publishCount++;
            lastTitle = currentTaskTitle;
            active = available && timer != null && timer.isRunning();
            return active;
        }

        @Override
        public void cancel() {
            events.add("cancel");
            active = false;
        }
    }

    private static List<String> list(String first, String second) {
        List<String> values = new ArrayList<>();
        values.add(first);
        values.add(second);
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
