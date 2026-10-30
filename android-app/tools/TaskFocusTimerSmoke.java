package com.abrar.daymark;

public final class TaskFocusTimerSmoke {
    private static int assertions;

    private TaskFocusTimerSmoke() { }

    public static void main(String[] args) {
        stopwatchPauseResumeAndFinish();
        countdownProgressAndExpiry();
        sameBootRestoreUsesMonotonicClock();
        rebootRestoreUsesBoundedWallClockDelta();
        unsafeClockAndUnknownBootFailClosed();
        invalidInputsAndTransitionsAreRejected();
        System.out.println("PASS task focus timer smoke tests: " + assertions + " assertions");
    }

    private static void stopwatchPauseResumeAndFinish() {
        TaskFocusTimer timer = TaskFocusTimer.start("task-1", TaskFocusTimer.Mode.STOPWATCH, 0, 1_000);
        check(timer.isRunning(), "new stopwatch starts running");
        check(timer.elapsedMsAt(1_000) == 0, "stopwatch starts at zero");
        check(timer.elapsedMsAt(6_500) == 5_500, "stopwatch uses monotonic elapsed time");

        TaskFocusTimer paused = timer.pause(6_500);
        check(paused.isPaused() && paused.elapsedMsAt(20_000) == 5_500,
                "paused stopwatch does not accumulate background time");
        TaskFocusTimer resumed = paused.resume(30_000);
        check(resumed.elapsedMsAt(32_500) == 8_000, "resume continues from the accumulated elapsed time");
        TaskFocusTimer finished = resumed.finish(35_000);
        check(finished.isFinished() && finished.elapsedMsAt(99_000) == 13_000,
                "finished stopwatch is frozen");
        check(finished.taskId().equals("task-1"), "timer retains task identity");
        check(!finished.isCountdown(), "stopwatch does not pretend to have bounded progress");
    }

    private static void countdownProgressAndExpiry() {
        long twentyFiveMinutes = 25L * 60_000L;
        TaskFocusTimer timer = TaskFocusTimer.start("task-2", TaskFocusTimer.Mode.COUNTDOWN,
                twentyFiveMinutes, 10_000);
        check(timer.remainingMsAt(10_000) == twentyFiveMinutes, "countdown begins at its full duration");
        check(timer.remainingMsAt(5L * 60_000L + 10_000L) == 20L * 60_000L,
                "countdown remaining time is derived from monotonic elapsed time");
        check(timer.progressPermilleAt(5L * 60_000L + 10_000L) == 200,
                "countdown exposes accurate per-mille progress");
        check(!timer.isExpiredAt(24L * 60_000L + 10_000L), "countdown is not early");
        check(timer.isExpiredAt(25L * 60_000L + 10_000L), "countdown expires at its target");
        check(timer.progressPermilleAt(30L * 60_000L + 10_000L) == 1000,
                "progress is capped after expiry");

        TaskFocusTimer.SavedState saved = timer.save(25L * 60_000L + 10_000L,
                1_800_000L, 3);
        TaskFocusTimer restored = TaskFocusTimer.restore(saved, 5, 1_900_000L, 4);
        check(restored.isFinished(), "an expired countdown restores as finished");
        check(restored.remainingMsAt(5) == 0, "finished countdown has no negative remaining time");
    }

    private static void sameBootRestoreUsesMonotonicClock() {
        TaskFocusTimer timer = TaskFocusTimer.start("task-3", TaskFocusTimer.Mode.STOPWATCH, 0, 2_000);
        TaskFocusTimer.SavedState saved = timer.save(12_000, 1_000_000, 41);
        TaskFocusTimer restored = TaskFocusTimer.restore(saved, 17_000, 1L, 41);
        check(restored.isRunning(), "same-boot running session stays running");
        check(restored.elapsedMsAt(17_000) == 15_000,
                "same-boot restore ignores wall-clock jumps and uses monotonic time");

        TaskFocusTimer paused = timer.pause(7_000);
        TaskFocusTimer.SavedState pausedState = paused.save(7_000, 1_000_000, 41);
        TaskFocusTimer pausedRestore = TaskFocusTimer.restore(pausedState, 90_000, 9_000_000, 41);
        check(pausedRestore.isPaused() && pausedRestore.elapsedMsAt(90_000) == 5_000,
                "paused session remains paused after process restart");
    }

    private static void rebootRestoreUsesBoundedWallClockDelta() {
        TaskFocusTimer timer = TaskFocusTimer.start("task-4", TaskFocusTimer.Mode.STOPWATCH, 0, 1_000);
        TaskFocusTimer.SavedState saved = timer.save(61_000, 10_000_000, 8);
        TaskFocusTimer restored = TaskFocusTimer.restore(saved, 500, 13_000_000, 9);
        check(restored.isRunning(), "known reboot keeps a running stopwatch active");
        check(restored.elapsedMsAt(500) == 181_000,
                "reboot downtime is included using wall time when boot count changes");

        TaskFocusTimer.SavedState longGap = timer.save(61_000, 10_000_000, 8);
        TaskFocusTimer bounded = TaskFocusTimer.restore(longGap, 500,
                10_000_000 + TaskFocusTimer.MAX_REBOOT_GAP_MS * 2, 9);
        check(bounded.elapsedMsAt(500) == 61_000 + TaskFocusTimer.MAX_REBOOT_GAP_MS,
                "reboot wall-clock jumps are bounded");
    }

    private static void unsafeClockAndUnknownBootFailClosed() {
        TaskFocusTimer timer = TaskFocusTimer.start("task-5", TaskFocusTimer.Mode.STOPWATCH, 0, 1_000);
        TaskFocusTimer.SavedState saved = timer.save(11_000, 500_000, 12);
        TaskFocusTimer backwards = TaskFocusTimer.restore(saved, 10, 400_000, 13);
        check(backwards.elapsedMsAt(10) == 10_000,
                "backwards wall-clock movement never subtracts elapsed time");

        TaskFocusTimer.SavedState unknown = timer.save(11_000, 500_000, -1);
        TaskFocusTimer safe = TaskFocusTimer.restore(unknown, 10, 900_000, -1);
        check(safe.isPaused() && safe.elapsedMsAt(10) == 10_000,
                "unknown boot identity restores running timer as paused without guessing elapsed time");
    }

    private static void invalidInputsAndTransitionsAreRejected() {
        expectIllegalArgument(() -> TaskFocusTimer.start(" ", TaskFocusTimer.Mode.STOPWATCH, 0, 0),
                "blank task id rejected");
        expectIllegalArgument(() -> TaskFocusTimer.start("task", TaskFocusTimer.Mode.STOPWATCH, 1, 0),
                "stopwatch cannot have a countdown duration");
        expectIllegalArgument(() -> TaskFocusTimer.start("task", TaskFocusTimer.Mode.COUNTDOWN, 0, 0),
                "zero-length countdown rejected");
        expectIllegalArgument(() -> TaskFocusTimer.start("task", TaskFocusTimer.Mode.COUNTDOWN,
                TaskFocusTimer.MAX_COUNTDOWN_MS + 1, 0), "countdown above 24 hours rejected");

        TaskFocusTimer running = TaskFocusTimer.start("task-6", TaskFocusTimer.Mode.STOPWATCH, 0, 0);
        expectIllegalState(() -> running.resume(1), "running timer cannot be resumed twice");
        TaskFocusTimer paused = running.pause(1);
        expectIllegalState(() -> paused.pause(2), "paused timer cannot be paused twice");
        expectIllegalState(() -> paused.finish(-1), "invalid finish clock rejected");
        check(paused.finish(2).isFinished(), "paused timer can be finished");
        expectIllegalState(() -> paused.resume(-1), "negative monotonic time rejected on resume");
        expectIllegalArgument(() -> running.save(-1, 1, 1), "negative save clock rejected");
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private static void expectIllegalArgument(Runnable action, String message) {
        assertions++;
        try {
            action.run();
        } catch (IllegalArgumentException expected) {
            return;
        }
        throw new AssertionError(message);
    }

    private static void expectIllegalState(Runnable action, String message) {
        assertions++;
        try {
            action.run();
        } catch (IllegalStateException expected) {
            return;
        }
        throw new AssertionError(message);
    }
}
