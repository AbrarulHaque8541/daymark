package com.abrar.daymark;

/** Regression tests for overflow-safe DownloadManager progress rendering. */
public final class BrowserDownloadProgressSmoke {
    private BrowserDownloadProgressSmoke() { }

    public static void main(String[] args) {
        check(BrowserDownloadProgress.percent(0L, 100L) == 0, "zero progress");
        check(BrowserDownloadProgress.percent(-1L, 100L) == 0, "negative bytes normalize to zero");
        check(BrowserDownloadProgress.percent(50L, 100L) == 50, "ordinary midpoint");
        check(BrowserDownloadProgress.percent(99L, 100L) == 99, "ordinary floor percentage");
        check(BrowserDownloadProgress.percent(100L, 100L) == 100, "exact completion");
        check(BrowserDownloadProgress.percent(150L, 100L) == 100, "provider overshoot clamps to complete");
        check(BrowserDownloadProgress.percent(50L, 0L) == 0, "unknown total");
        check(BrowserDownloadProgress.percent(50L, -1L) == 0, "negative/unknown total");

        long max = Long.MAX_VALUE;
        check(BrowserDownloadProgress.percent(max / 2L, max) == 49,
                "large half-size counters must not overflow into a false 0% or 50%");
        check(BrowserDownloadProgress.percent(max - 1L, max) == 99,
                "near-Long.MAX_VALUE progress must remain 99%");
        check(BrowserDownloadProgress.percent(max / 100L, max) == 0,
                "small ratio against a huge total must remain 0%");
        check(BrowserDownloadProgress.percent(max - 1L, max - 1L) == 100,
                "exact large completion");

        System.out.println("PASS BrowserDownloadProgressSmoke: ordinary, unknown, negative, overshoot and Long.MAX_VALUE counters");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
