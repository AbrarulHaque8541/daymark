package com.abrar.daymark;

/**
 * Pure policy for short-lived UI feedback timing.
 *
 * <p>Keeps loading, toast, and empty-state transitions honest: long enough to read, short enough
 * that the app never feels sticky. No Android framework dependency so host smoke tests can pin
 * the numbers without an emulator.
 */
public final class UiFeedbackPolicy {
    private UiFeedbackPolicy() {}

    /** Minimum time a non-blocking progress indicator should stay visible once shown. */
    public static final long MIN_LOADING_VISIBLE_MS = 280L;

    /** Maximum time a soft toast remains before auto-dismiss. */
    public static final long TOAST_AUTO_DISMISS_MS = 3200L;

    /** Debounce for rapid successive save/load flashes so the UI does not flicker. */
    public static final long LOADING_DEBOUNCE_MS = 90L;

    /**
     * Whether a loading indicator that started at {@code shownAtMs} should still be kept visible
     * at {@code nowMs}, given that the underlying work finished at {@code finishedAtMs}.
     *
     * <p>Prevents a flash shorter than {@link #MIN_LOADING_VISIBLE_MS} when storage is fast.
     */
    public static boolean shouldKeepLoadingVisible(long shownAtMs, long finishedAtMs, long nowMs) {
        if (shownAtMs <= 0L) return false;
        long visibleFor = Math.max(0L, nowMs - shownAtMs);
        if (finishedAtMs <= 0L) return true;
        if (finishedAtMs < shownAtMs) return visibleFor < MIN_LOADING_VISIBLE_MS;
        long workMs = finishedAtMs - shownAtMs;
        if (workMs >= MIN_LOADING_VISIBLE_MS) return nowMs < finishedAtMs;
        return visibleFor < MIN_LOADING_VISIBLE_MS;
    }

    /**
     * Whether a new loading show request should be accepted given the previous show time.
     * Rapid toggles under {@link #LOADING_DEBOUNCE_MS} are coalesced.
     */
    public static boolean shouldAcceptLoadingShow(long lastShownAtMs, long nowMs) {
        if (lastShownAtMs <= 0L) return true;
        return nowMs - lastShownAtMs >= LOADING_DEBOUNCE_MS;
    }

    /**
     * Remaining auto-dismiss delay for a toast shown at {@code shownAtMs}.
     * Returns 0 when it should dismiss now.
     */
    public static long toastRemainingMs(long shownAtMs, long nowMs) {
        if (shownAtMs <= 0L) return 0L;
        long remaining = TOAST_AUTO_DISMISS_MS - (nowMs - shownAtMs);
        return Math.max(0L, remaining);
    }
}
