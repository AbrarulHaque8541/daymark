package com.abrar.daymark;

/** Deterministic, platform-free tests for the values used by Focus Timer notifications. */
public final class TaskFocusTimerNotificationStateSmoke {
    private int assertions;

    public static void main(String[] args) {
        new TaskFocusTimerNotificationStateSmoke().run();
    }

    private void run() {
        stopwatchUsesOneLiveChronometerAndNoProgressBar();
        runningCountdownUsesChronometerWithoutStaticProgress();
        pausedSessionsExposeResumeAndFinishWithoutAChronometer();
        zeroIsExpiredAndNeverEligibleForPublication();
        System.out.println("PASS focus timer notification snapshot tests: " + assertions + " assertions");
    }

    private void stopwatchUsesOneLiveChronometerAndNoProgressBar() {
        TaskFocusTimer timer = TaskFocusTimer.start(
                "notification-stopwatch", TaskFocusTimer.Mode.STOPWATCH, 0L, 1_000L);
        TaskFocusTimerNotificationState state =
                TaskFocusTimerNotificationState.from(timer, 356_000L);
        check(state != null && state.running && !state.paused,
                "running stopwatch produces a running notification state");
        check(state.elapsedMs == 355_000L,
                "stopwatch chronometer snapshot reflects 05:55 elapsed");
        check("Focus session running".equals(state.contentText),
                "stopwatch body does not freeze a second numeric time at 00:00 focused");
        check(state.shouldUseChronometer(), "running stopwatch uses the system chronometer");
        check(!state.shouldShowProgressBar(),
                "unbounded stopwatch shows no indeterminate or stale progress bar");
        check(state.shouldShowPauseAction() && !state.shouldShowResumeAction()
                        && state.shouldShowFinishAction(),
                "running notification offers Pause and Finish only");
    }

    private void runningCountdownUsesChronometerWithoutStaticProgress() {
        TaskFocusTimer timer = TaskFocusTimer.start(
                "notification-countdown", TaskFocusTimer.Mode.COUNTDOWN, 600_000L, 1_000L);
        TaskFocusTimerNotificationState state =
                TaskFocusTimerNotificationState.from(timer, 356_000L);
        check(state != null && state.countdown && state.running,
                "running countdown produces a running countdown state");
        check(state.elapsedMs == 355_000L && state.remainingMs == 245_000L,
                "countdown display time is derived from one monotonic sample");
        check(state.progressPermille == 591,
                "countdown snapshot progress remains calculable without showing a stale bar");
        check(state.shouldUseChronometer() && !state.shouldShowProgressBar(),
                "a live countdown chronometer is never paired with a static progress bar");
        check("Countdown running".equals(state.contentText),
                "countdown body avoids a second stale numeric timer value");
    }

    private void pausedSessionsExposeResumeAndFinishWithoutAChronometer() {
        TaskFocusTimer countdown = TaskFocusTimer.start(
                "notification-paused-countdown", TaskFocusTimer.Mode.COUNTDOWN,
                600_000L, 1_000L).pause(356_000L);
        TaskFocusTimerNotificationState pausedCountdown =
                TaskFocusTimerNotificationState.from(countdown, 900_000L);
        check(pausedCountdown != null && pausedCountdown.paused && !pausedCountdown.running,
                "paused countdown remains publishable with frozen timer state");
        check(pausedCountdown.remainingMs == 245_000L && pausedCountdown.progressPermille == 591,
                "paused countdown time and determinate progress share one frozen snapshot");
        check("Paused · 04:05 remaining".equals(pausedCountdown.contentText),
                "paused countdown exposes its frozen remaining time");
        check(!pausedCountdown.shouldUseChronometer() && pausedCountdown.shouldShowProgressBar(),
                "paused countdown has no moving clock and may retain determinate progress");
        check(!pausedCountdown.shouldShowPauseAction() && pausedCountdown.shouldShowResumeAction()
                        && pausedCountdown.shouldShowFinishAction(),
                "paused notification offers Resume and Finish");
        TaskFocusTimer almostExpired = TaskFocusTimer.start(
                "notification-paused-last-second", TaskFocusTimer.Mode.COUNTDOWN,
                1_000L, 1_000L).pause(1_999L);
        TaskFocusTimerNotificationState almostExpiredState =
                TaskFocusTimerNotificationState.from(almostExpired, 5_000L);
        check("Paused · 00:01 remaining".equals(almostExpiredState.contentText),
                "a positive sub-second countdown rounds up instead of falsely showing zero");

        TaskFocusTimer stopwatch = TaskFocusTimer.start(
                "notification-paused-stopwatch", TaskFocusTimer.Mode.STOPWATCH, 0L, 1_000L)
                .pause(356_000L);
        TaskFocusTimerNotificationState pausedStopwatch =
                TaskFocusTimerNotificationState.from(stopwatch, 900_000L);
        check("Paused · 05:55 focused".equals(pausedStopwatch.contentText),
                "paused stopwatch shows frozen elapsed time instead of a live clock");
        check(!pausedStopwatch.shouldUseChronometer() && !pausedStopwatch.shouldShowProgressBar(),
                "paused stopwatch has neither a chronometer nor an unbounded progress bar");
        check(pausedStopwatch.shouldShowResumeAction() && pausedStopwatch.shouldShowFinishAction(),
                "paused stopwatch also offers Resume and Finish");
    }

    private void zeroIsExpiredAndNeverEligibleForPublication() {
        TaskFocusTimer timer = TaskFocusTimer.start(
                "notification-zero", TaskFocusTimer.Mode.COUNTDOWN, 1_000L, 10_000L);
        TaskFocusTimerNotificationState zero =
                TaskFocusTimerNotificationState.from(timer, 11_000L);
        check(zero != null && zero.expired && zero.remainingMs == 0L,
                "zero countdown is represented as expired, not negative remaining time");
        check(zero.progressPermille == 1000 && !zero.shouldPublish(),
                "zero is complete progress and cannot publish an ongoing notification");
        check(TaskFocusTimerNotificationState.from(timer.finish(11_000L), 11_000L) == null,
                "a finished session cannot produce another notification state");
    }

    private void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError("assertion " + assertions + " failed: " + message);
    }
}
