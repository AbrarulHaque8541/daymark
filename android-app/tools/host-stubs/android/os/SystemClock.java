package android.os;

/** Virtual monotonic clock for deterministic watchdog host tests. */
public final class SystemClock {
    private static long elapsedRealtime;
    private SystemClock() {}
    public static synchronized long elapsedRealtime() { return elapsedRealtime; }
    public static synchronized void advanceTimeBy(long millis) {
        if (millis < 0) throw new IllegalArgumentException("millis must be non-negative");
        elapsedRealtime += millis;
    }
    public static synchronized void resetForTests() { elapsedRealtime = 0L; }
}
