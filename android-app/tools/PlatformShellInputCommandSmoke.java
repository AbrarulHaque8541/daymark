package com.abrar.daymark;

/** Host-side regression smoke for the exact numeric command policy used by instrumentation. */
public final class PlatformShellInputCommandSmoke {
    private static int assertions;

    public static void main(String[] args) {
        equal("/system/bin/input tap 12 34 2>&1", PlatformShellInputCommand.tap(12, 34), "tap command");
        equal("/system/bin/input swipe 1 2 300 400 360 2>&1",
                PlatformShellInputCommand.swipe(1, 2, 300, 400, 360), "swipe command");
        equal("/system/bin/input tap 0 0 2>&1", PlatformShellInputCommand.tap(0, 0), "minimum coordinates");
        equal("/system/bin/input tap 10000 10000 2>&1", PlatformShellInputCommand.tap(10000, 10000), "maximum coordinates");
        rejects(() -> PlatformShellInputCommand.tap(-1, 0), "negative tap coordinate");
        rejects(() -> PlatformShellInputCommand.tap(10001, 0), "oversized tap coordinate");
        rejects(() -> PlatformShellInputCommand.swipe(0, 0, 1, 1, 0), "zero swipe duration");
        rejects(() -> PlatformShellInputCommand.swipe(0, 0, 1, 1, 5001), "oversized swipe duration");
        System.out.println("PASS PlatformShellInputCommandSmoke: " + assertions + " assertions");
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
