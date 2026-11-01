package com.abrar.daymark;

/**
 * Host regression smoke for BrowserDownloadProgress.percent.
 * Covers ordinary, unknown, negative, overshoot, and near-Long.MAX_VALUE cases.
 */
public final class BrowserDownloadProgressSmoke {
    private BrowserDownloadProgressSmoke() {}

    public static void main(String[] args) {
        assertPercent(0, 0, 0);
        assertPercent(0, -1, 100);
        assertPercent(0, 50, 0);
        assertPercent(0, 50, -1);
        assertPercent(50, 50, 100);
        assertPercent(99, 99, 100);
        assertPercent(100, 100, 100);
        assertPercent(100, 101, 100);
        assertPercent(1, 1, 100);
        assertPercent(0, 0, Long.MAX_VALUE);
        // Near overflow boundary
        long almost = Long.MAX_VALUE / 100L;
        assertPercent(50, almost, almost * 2);
        // Very large: half of MAX is ~50%
        assertPercent(49, Long.MAX_VALUE / 2, Long.MAX_VALUE);
        System.out.println("BrowserDownloadProgressSmoke: 12 cases PASS");
    }

    private static void assertPercent(int expected, long downloaded, long total) {
        int actual = BrowserDownloadProgress.percent(downloaded, total);
        if (actual != expected) {
            throw new AssertionError("percent(" + downloaded + ", " + total + ") expected " + expected + " but was " + actual);
        }
    }
}
