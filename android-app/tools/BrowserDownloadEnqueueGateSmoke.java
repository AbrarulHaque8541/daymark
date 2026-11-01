package com.abrar.daymark;

/** Host regression tests for duplicate DownloadManager enqueue suppression. */
public final class BrowserDownloadEnqueueGateSmoke {
    private BrowserDownloadEnqueueGateSmoke() {}

    public static void main(String[] args) {
        BrowserDownloadEnqueueGate gate = new BrowserDownloadEnqueueGate();
        check(!gate.tryAcquire(null, 0L), "null URL must not acquire a download slot");
        check(!gate.tryAcquire("   ", 0L), "blank URL must not acquire a download slot");

        String signed = "https://cdn.example.test/file.bin?token=private&sig=secret";
        check(gate.tryAcquire(signed, 10_000L), "first request must be admitted");
        check(!gate.tryAcquire(signed, 10_001L), "rapid duplicate must be suppressed");
        check(!gate.tryAcquire(signed + "#player", 10_002L),
                "fragment-only variation must not enqueue the same resource twice");
        check(gate.tryAcquire(signed, 11_200L), "request at the exact window boundary must be admitted");

        check(gate.tryAcquire("https://cdn.example.test/other.bin", 11_201L),
                "a different URL must not be blocked by a recent download");
        check(!gate.tryAcquire(signed, 11_202L),
                "recent URLs must be tracked independently, not only the most recent URL");

        String failed = "https://cdn.example.test/retry.bin?token=ephemeral";
        check(gate.tryAcquire(failed, 20_000L), "first enqueue attempt must be admitted");
        gate.release(failed);
        check(gate.tryAcquire(failed, 20_001L), "failed enqueue must release its key for immediate retry");

        // Capacity is bounded; after enough unique URLs, the oldest recent key is evicted.
        BrowserDownloadEnqueueGate bounded = new BrowserDownloadEnqueueGate();
        String first = "https://cdn.example.test/0";
        check(bounded.tryAcquire(first, 30_000L), "first bounded entry is admitted");
        for (int i = 1; i <= BrowserDownloadEnqueueGate.MAX_RECENT_KEYS; i++) {
            check(bounded.tryAcquire("https://cdn.example.test/" + i, 30_000L + i),
                    "distinct URL must be admitted without suppressing unrelated work");
        }
        check(bounded.tryAcquire(first, 30_100L), "bounded cache evicts its oldest key");

        // A monotonic-clock reset/test anomaly must fail open rather than suppress forever.
        check(gate.tryAcquire("https://cdn.example.test/clock.bin", 50_000L),
                "clock test setup must admit");
        check(gate.tryAcquire("https://cdn.example.test/clock.bin", 1L),
                "elapsed-time rollback must not suppress a legitimate retry");

        System.out.println("PASS BrowserDownloadEnqueueGateSmoke: duplicate window, fragments, independent keys, release, bounded cache, monotonic clock");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
