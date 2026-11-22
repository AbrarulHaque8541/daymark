package com.abrar.daymark;

import java.math.BigInteger;
import java.util.Locale;

/**
 * Exact, overflow-safe progress percentage and compact size labels for
 * untrusted DownloadManager byte counters.
 */
final class BrowserDownloadProgress {
    private static final long SAFE_MULTIPLY_LIMIT = Long.MAX_VALUE / 100L;
    private static final String[] SIZE_UNITS = {"B", "KB", "MB", "GB", "TB"};

    private BrowserDownloadProgress() { }

    static int percent(long downloaded, long total) {
        if (downloaded <= 0L || total <= 0L) return 0;
        if (downloaded >= total) return 100;

        // The common path is exact integer arithmetic and cannot overflow.
        if (downloaded <= SAFE_MULTIPLY_LIMIT) {
            return (int) (downloaded * 100L / total);
        }

        // DownloadManager exposes signed longs. Large valid files can overflow
        // downloaded * 100 even though downloaded < total; use exact wide math.
        return BigInteger.valueOf(downloaded)
                .multiply(BigInteger.valueOf(100L))
                .divide(BigInteger.valueOf(total))
                .intValue();
    }

    /**
     * Compact human-readable size for dialog labels. Negative or zero -> "0 B".
     * Uses 1024-based units; never throws; never allocates for the common path
     * beyond the returned string.
     */
    static String formatBytes(long bytes) {
        if (bytes <= 0L) return "0 B";
        double value = (double) bytes;
        int unit = 0;
        while (value >= 1024.0 && unit < SIZE_UNITS.length - 1) {
            value /= 1024.0;
            unit++;
        }
        if (unit == 0) {
            return ((long) value) + " B";
        }
        // One decimal for KB+ keeps labels short in the Downloads dialog.
        return String.format(Locale.US, "%.1f %s", value, SIZE_UNITS[unit]);
    }
}
