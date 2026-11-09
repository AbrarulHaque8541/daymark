package com.abrar.daymark;

import java.util.List;

/** Host-side regression smoke for touchscreen sample ordering, timing and bounds. */
public final class PlatformTouchSequenceSmoke {
    private static int assertions;

    public static void main(String[] args) {
        List<PlatformTouchSequence.Sample> tap = PlatformTouchSequence.tap(12, 34, 1000L);
        equal(2, tap.size(), "tap sample count");
        equal(PlatformTouchSequence.ACTION_DOWN, tap.get(0).action, "tap starts with DOWN");
        equal(PlatformTouchSequence.ACTION_UP, tap.get(1).action, "tap ends with UP");
        equal(1060L, tap.get(1).eventTime, "tap duration");
        equal(12f, tap.get(1).x, "tap x remains stable");
        equal(34f, tap.get(1).y, "tap y remains stable");

        List<PlatformTouchSequence.Sample> swipe =
                PlatformTouchSequence.swipe(10, 20, 810, 620, 2000L, 360);
        equal(10, swipe.size(), "swipe has DOWN, eight MOVE samples and UP");
        equal(PlatformTouchSequence.ACTION_DOWN, swipe.get(0).action, "swipe starts with DOWN");
        equal(PlatformTouchSequence.ACTION_UP, swipe.get(9).action, "swipe ends with UP");
        equal(2360L, swipe.get(9).eventTime, "swipe duration");
        equal(810f, swipe.get(9).x, "swipe final x");
        equal(620f, swipe.get(9).y, "swipe final y");
        List<PlatformTouchSequence.Sample> shortestSwipe =
                PlatformTouchSequence.swipe(0, 0, 9, 9, 3000L, 9);
        for (int index = 1; index < shortestSwipe.size(); index++) {
            assertions++;
            if (shortestSwipe.get(index).eventTime <= shortestSwipe.get(index - 1).eventTime) {
                throw new AssertionError("minimum-duration swipe timestamps must increase strictly");
            }
        }
        for (int index = 1; index < swipe.size(); index++) {
            assertions++;
            if (swipe.get(index).eventTime <= swipe.get(index - 1).eventTime) {
                throw new AssertionError("swipe event times must increase strictly");
            }
        }
        rejects(() -> PlatformTouchSequence.tap(-1, 0, 0L), "negative coordinate");
        rejects(() -> PlatformTouchSequence.tap(10001, 0, 0L), "oversized coordinate");
        rejects(() -> PlatformTouchSequence.swipe(0, 0, 1, 1, 0L, 0), "zero duration");
        rejects(() -> PlatformTouchSequence.swipe(0, 0, 1, 1, 0L, 5001), "oversized duration");
        System.out.println("PASS PlatformTouchSequenceSmoke: " + assertions + " assertions");
    }

    private static void equal(Object expected, Object actual, String label) {
        assertions++;
        if (!expected.equals(actual)) throw new AssertionError(label + ": expected " + expected + ", got " + actual);
    }

    private static void rejects(Runnable action, String label) {
        assertions++;
        try {
            action.run();
        } catch (IllegalArgumentException expected) {
            return;
        }
        throw new AssertionError(label + ": expected IllegalArgumentException");
    }
}
