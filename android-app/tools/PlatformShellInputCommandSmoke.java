package com.abrar.daymark;

/** Host-side regression smoke for the exact command policy used by instrumentation. */
public final class PlatformShellInputCommandSmoke {
    private static int assertions;

    public static void main(String[] args) {
        equal("input tap 12 34", PlatformShellInputCommand.tap(12, 34), "tap command");
        equal("input swipe 1 2 300 400 360",
                PlatformShellInputCommand.swipe(1, 2, 300, 400, 360), "swipe command");
        equal("input tap 12 34; code=$?; printf '\\n__DAYMARK_INPUT_STATUS__=%s\\n' \"$code\"",
                PlatformShellInputCommand.withStatus(PlatformShellInputCommand.tap(12, 34)),
                "status wrapper");
        equal(0, PlatformShellInputCommand.parseStatus("input tap 12 34\\n__DAYMARK_INPUT_STATUS__=0\\n"),
                "zero exit status");
        equal(7, PlatformShellInputCommand.parseStatus("input failed\\r\\n__DAYMARK_INPUT_STATUS__=7\\r\\n"),
                "non-zero exit status");
        rejects(() -> PlatformShellInputCommand.tap(-1, 0), "negative tap coordinate");
        rejects(() -> PlatformShellInputCommand.swipe(0, 0, 1, 1, 5001), "oversized swipe duration");
        rejects(() -> PlatformShellInputCommand.parseStatus("no status marker"), "missing status marker");
        rejects(() -> PlatformShellInputCommand.parseStatus("__DAYMARK_INPUT_STATUS__=999"), "invalid status value");
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
