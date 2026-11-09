package com.abrar.daymark;

/** Builds bounded, numeric-only shell input commands for platform instrumentation. */
final class PlatformShellInputCommand {
    static final int MAX_COORDINATE = 10000;
    static final int MAX_DURATION_MS = 5000;

    private PlatformShellInputCommand() { }

    static String tap(int x, int y) {
        checkCoordinate(x, "tap x");
        checkCoordinate(y, "tap y");
        return "/system/bin/input tap " + x + " " + y + " 2>&1";
    }

    static String swipe(int startX, int startY, int endX, int endY, int durationMs) {
        checkCoordinate(startX, "swipe start x");
        checkCoordinate(startY, "swipe start y");
        checkCoordinate(endX, "swipe end x");
        checkCoordinate(endY, "swipe end y");
        if (durationMs < 1 || durationMs > MAX_DURATION_MS) {
            throw new IllegalArgumentException("swipe duration is outside 1.." + MAX_DURATION_MS);
        }
        return "/system/bin/input swipe " + startX + " " + startY + " " + endX + " " + endY + " " + durationMs + " 2>&1";
    }

    private static void checkCoordinate(int value, String label) {
        if (value < 0 || value > MAX_COORDINATE) {
            throw new IllegalArgumentException(label + " is outside 0.." + MAX_COORDINATE);
        }
    }
}
