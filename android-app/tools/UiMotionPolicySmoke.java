package com.abrar.daymark;

/** Host-only regression tests for the shared UI motion timing policy. */
public final class UiMotionPolicySmoke {
    private static int assertions;

    private UiMotionPolicySmoke() {}

    public static void main(String[] args) {
        check(UiMotionPolicy.TAB_SWITCH_MS == 220L, "workspace transition duration is pinned");
        check(UiMotionPolicy.TAB_INDICATOR_MS == 180L, "tab indicator duration is pinned");
        check(UiMotionPolicy.CARD_EXPAND_MS == 240L, "task-card expand duration is pinned");
        check(UiMotionPolicy.SHEET_PRESENT_MS == 260L, "sheet presentation duration is pinned");
        check(UiMotionPolicy.CHROME_HIDE_MS == 160L, "chrome hide duration is pinned");
        check(UiMotionPolicy.CHROME_SHOW_MS == 180L, "chrome show duration is pinned");
        check(UiMotionPolicy.EXPAND_DEBOUNCE_MS == 120L, "expand debounce duration is pinned");
        check(UiMotionPolicy.REDUCED_MOTION_FLOOR_MS == 50L, "reduced-motion floor is pinned");
        check(UiMotionPolicy.tabSlideFraction() > 0f && UiMotionPolicy.tabSlideFraction() < 1f,
                "tab slide fraction remains subtle and bounded");

        check(UiMotionPolicy.shouldAcceptCollapse(0L, 0L),
                "unknown expand start accepts collapse without blocking");
        check(!UiMotionPolicy.shouldAcceptCollapse(1_000L, 1_119L),
                "collapse is rejected before the debounce boundary");
        check(UiMotionPolicy.shouldAcceptCollapse(1_000L, 1_120L),
                "collapse is accepted exactly at the debounce boundary");
        check(!UiMotionPolicy.shouldAcceptCollapse(1_000L, 999L),
                "reversed small timestamps are not treated as a long elapsed duration");
        check(!UiMotionPolicy.shouldAcceptCollapse(Long.MAX_VALUE, Long.MIN_VALUE),
                "reversed extreme timestamps cannot overflow into an accepted collapse");
        check(UiMotionPolicy.shouldAcceptCollapse(Long.MAX_VALUE - 120L, Long.MAX_VALUE),
                "elapsed-time comparison remains correct near the long limit");

        check(UiMotionPolicy.durationFor(220L, false) == 220L,
                "normal motion keeps the full base duration");
        check(UiMotionPolicy.durationFor(220L, true) == 50L,
                "reduced motion collapses long animations to the floor");
        check(UiMotionPolicy.durationFor(30L, true) == 30L,
                "reduced motion does not lengthen already-short animations");
        check(UiMotionPolicy.durationFor(0L, true) == 0L,
                "zero base remains zero under reduced motion");
        check(UiMotionPolicy.durationFor(-1L, true) == -1L,
                "negative base is returned unchanged");

        System.out.println("PASS UiMotionPolicy host regression tests: " + assertions + " assertions");
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }
}
