package com.abrar.daymark;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Pure-Java touchscreen sample builder shared by Android instrumentation and host smoke tests. */
final class PlatformTouchSequence {
    static final int ACTION_DOWN = 0;
    static final int ACTION_UP = 1;
    static final int ACTION_MOVE = 2;
    static final int MAX_COORDINATE = 10000;
    static final int MAX_DURATION_MS = 5000;
    static final int DEFAULT_TAP_DURATION_MS = 60;
    static final int DEFAULT_SWIPE_DURATION_MS = 360;
    static final int SWIPE_MOVE_STEPS = 8;
    static final int MIN_SWIPE_DURATION_MS = SWIPE_MOVE_STEPS + 1;

    private PlatformTouchSequence() { }

    static List<Sample> tap(float x, float y, long downTime) {
        checkPoint(x, y);
        checkDownTime(downTime);
        ArrayList<Sample> samples = new ArrayList<>();
        samples.add(new Sample(ACTION_DOWN, downTime, x, y));
        samples.add(new Sample(ACTION_UP, downTime + DEFAULT_TAP_DURATION_MS, x, y));
        return Collections.unmodifiableList(samples);
    }

    static List<Sample> swipe(float startX, float startY, float endX, float endY,
                              long downTime, int durationMs) {
        checkPoint(startX, startY);
        checkPoint(endX, endY);
        checkDownTime(downTime);
        if (durationMs < MIN_SWIPE_DURATION_MS || durationMs > MAX_DURATION_MS) {
            throw new IllegalArgumentException("swipe duration is outside " + MIN_SWIPE_DURATION_MS + ".." + MAX_DURATION_MS);
        }
        ArrayList<Sample> samples = new ArrayList<>();
        samples.add(new Sample(ACTION_DOWN, downTime, startX, startY));
        for (int step = 1; step <= SWIPE_MOVE_STEPS; step++) {
            float fraction = (float) step / (SWIPE_MOVE_STEPS + 1);
            long eventTime = downTime + (durationMs * step) / (SWIPE_MOVE_STEPS + 1);
            float x = startX + (endX - startX) * fraction;
            float y = startY + (endY - startY) * fraction;
            samples.add(new Sample(ACTION_MOVE, eventTime, x, y));
        }
        samples.add(new Sample(ACTION_UP, downTime + durationMs, endX, endY));
        return Collections.unmodifiableList(samples);
    }

    static long delayUntil(long eventTime, long now) {
        if (eventTime < 0L || now < 0L) {
            throw new IllegalArgumentException("touch event and current times must be non-negative");
        }
        return Math.max(0L, eventTime - now);
    }

    private static void checkPoint(float x, float y) {
        if (!Float.isFinite(x) || !Float.isFinite(y)
                || x < 0 || y < 0 || x > MAX_COORDINATE || y > MAX_COORDINATE) {
            throw new IllegalArgumentException("touch coordinates are outside 0.." + MAX_COORDINATE);
        }
    }

    private static void checkDownTime(long downTime) {
        if (downTime < 0) throw new IllegalArgumentException("down time must be non-negative");
    }

    static final class Sample {
        final int action;
        final long eventTime;
        final float x;
        final float y;

        Sample(int action, long eventTime, float x, float y) {
            this.action = action;
            this.eventTime = eventTime;
            this.x = x;
            this.y = y;
        }
    }
}
