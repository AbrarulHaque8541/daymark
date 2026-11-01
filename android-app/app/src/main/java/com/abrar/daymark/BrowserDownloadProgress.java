package com.abrar.daymark;

import java.math.BigInteger;

/**
 * Safe percentage calculation for DownloadManager byte counters.
 * Avoids signed 64-bit overflow when computing downloaded * 100 / total
 * for very large but valid transfers near Long.MAX_VALUE.
 */
public final class BrowserDownloadProgress {
    private BrowserDownloadProgress() {}

    /**
     * Returns the floor percentage of downloaded/total, in 0..100.
     * Negative or unknown (total <= 0) counters yield 0.
     * Provider overshoot or exact completion is clamped to 100.
     */
    public static int percent(long downloaded, long total) {
        if (downloaded < 0L || total <= 0L) return 0;
        if (downloaded >= total) return 100;

        // Normal path: no overflow possible when downloaded * 100 fits in long.
        if (downloaded <= Long.MAX_VALUE / 100L) {
            return (int) (downloaded * 100L / total);
        }

        // Rare large-counter path: exact BigInteger floor division.
        BigInteger pct = BigInteger.valueOf(downloaded)
                .multiply(BigInteger.valueOf(100L))
                .divide(BigInteger.valueOf(total));
        int result = pct.intValue();
        return Math.max(0, Math.min(100, result));
    }
}
