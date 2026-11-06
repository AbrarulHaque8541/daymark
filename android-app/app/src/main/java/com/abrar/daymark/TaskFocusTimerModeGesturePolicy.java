package com.abrar.daymark;

/** Pure gesture classification for the Focus Timer's two-mode selector. */
final class TaskFocusTimerModeGesturePolicy {
    enum Result { NONE, VERTICAL, TO_STOPWATCH, TO_COUNTDOWN }

    private TaskFocusTimerModeGesturePolicy() { }

    /**
     * Classifies displacement in pixels. A horizontal swipe selects Countdown when moving left
     * and Stopwatch when moving right; vertical-dominant movement is never a mode change.
     */
    static Result classify(float deltaX, float deltaY, float minimumDistancePx) {
        if (!Float.isFinite(deltaX) || !Float.isFinite(deltaY)
                || !Float.isFinite(minimumDistancePx) || minimumDistancePx < 0f) {
            return Result.NONE;
        }
        float horizontal = Math.abs(deltaX);
        float vertical = Math.abs(deltaY);
        if (Math.max(horizontal, vertical) == 0f
                || Math.max(horizontal, vertical) < minimumDistancePx) {
            return Result.NONE;
        }
        if (vertical >= horizontal) return Result.VERTICAL;
        return deltaX < 0f ? Result.TO_COUNTDOWN : Result.TO_STOPWATCH;
    }
}
