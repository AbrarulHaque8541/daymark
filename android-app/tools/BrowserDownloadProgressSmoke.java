package com.abrar.daymark;

/** Regression tests for overflow-safe DownloadManager progress and size labels. */
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

        check(BrowserDownloadProgress.formatBytes(0L).equals("0 B"), "zero size");
        check(BrowserDownloadProgress.formatBytes(-5L).equals("0 B"), "negative size");
        check(BrowserDownloadProgress.formatBytes(512L).equals("512 B"), "bytes under 1 KB");
        check(BrowserDownloadProgress.formatBytes(1024L).equals("1.0 KB"), "exact 1 KB");
        check(BrowserDownloadProgress.formatBytes(1536L).equals("1.5 KB"), "1.5 KB");
        check(BrowserDownloadProgress.formatBytes(1048576L).equals("1.0 MB"), "exact 1 MB");
        check(BrowserDownloadProgress.formatBytes(1073741824L).equals("1.0 GB"), "exact 1 GB");

        System.out.println("PASS BrowserDownloadProgressSmoke: ordinary, unknown, negative, overshoot, Long.MAX_VALUE counters and size labels");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
