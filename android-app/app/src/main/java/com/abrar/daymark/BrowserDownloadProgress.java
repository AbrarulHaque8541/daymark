package com.abrar.daymark;

import java.math.BigInteger;

/** Exact, overflow-safe progress percentage for untrusted provider byte counters. */
final class BrowserDownloadProgress {
    private static final long SAFE_MULTIPLY_LIMIT = Long.MAX_VALUE / 100L;

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
}
