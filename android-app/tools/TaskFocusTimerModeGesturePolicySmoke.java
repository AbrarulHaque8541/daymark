package com.abrar.daymark;

/** Deterministic host tests for Focus Timer mode-selector gesture classification. */
public final class TaskFocusTimerModeGesturePolicySmoke {
    private int assertions;

    public static void main(String[] args) {
        new TaskFocusTimerModeGesturePolicySmoke().run();
    }

    private void run() {
        check(classify(5f, 4f, 10f) == TaskFocusTimerModeGesturePolicy.Result.NONE,
                "movement below the slop threshold is not a mode gesture");
        check(classify(0f, 0f, 0f) == TaskFocusTimerModeGesturePolicy.Result.NONE,
                "a stationary pointer is not a gesture even with a zero threshold");
        check(classify(16f, 0f, 16f) == TaskFocusTimerModeGesturePolicy.Result.TO_STOPWATCH,
                "rightward movement at the threshold selects Stopwatch");
        check(classify(-72f, 4f, 12f) == TaskFocusTimerModeGesturePolicy.Result.TO_COUNTDOWN,
                "leftward horizontal movement selects Countdown");
        check(classify(3f, 72f, 12f) == TaskFocusTimerModeGesturePolicy.Result.VERTICAL,
                "vertical movement is classified separately from a mode change");
        check(classify(18f, 40f, 12f) == TaskFocusTimerModeGesturePolicy.Result.VERTICAL,
                "vertical-dominant diagonal movement is rejected");
        check(classify(-40f, 18f, 12f) == TaskFocusTimerModeGesturePolicy.Result.TO_COUNTDOWN,
                "horizontal-dominant diagonal movement selects by horizontal direction");
        check(classify(8f, 3f, 12f) == TaskFocusTimerModeGesturePolicy.Result.NONE,
                "horizontal movement below threshold remains a tap-sized gesture");
        check(classify(Float.NaN, 40f, 12f) == TaskFocusTimerModeGesturePolicy.Result.NONE,
                "non-finite pointer coordinates fail closed");
        check(classify(40f, 0f, -1f) == TaskFocusTimerModeGesturePolicy.Result.NONE,
                "an invalid negative threshold fails closed");
        System.out.println("PASS Focus Timer mode gesture policy: " + assertions + " assertions");
    }

    private TaskFocusTimerModeGesturePolicy.Result classify(float deltaX, float deltaY, float threshold) {
        return TaskFocusTimerModeGesturePolicy.classify(deltaX, deltaY, threshold);
    }

    private void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        assertions++;
    }
}
