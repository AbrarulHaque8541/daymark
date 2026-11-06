package com.abrar.daymark;

/**
 * Pure policy for UI motion timings and expand/collapse behaviour.
 *
 * <p>Keeps transitions short, readable and non-sticky. No Android framework dependency so host
 * smoke tests can pin the numbers without an emulator. Values are deliberately conservative to
 * stay lightweight on low-end devices while still giving a clear "feeling" of movement.
 *
 * <p>Used by bottom-nav tab switches, task-card expand panels, settings sheet and chrome
 * auto-hide. Callers remain free to use ViewPropertyAnimator, TransitionManager or any other
 * mechanism; this class only owns the durations and easing intent.
 */
public final class UiMotionPolicy {
    private UiMotionPolicy() {}

    /** Duration of a bottom-nav tab content cross-fade + slight horizontal slide (Tasks ↔ Web). */
    public static final long TAB_SWITCH_MS = 220L;

    /** Duration of the bottom-nav indicator slide itself. */
    public static final long TAB_INDICATOR_MS = 180L;

    /** Duration of a task-card right-to-left expand / collapse. */
    public static final long CARD_EXPAND_MS = 240L;

    /** Duration of a settings / overflow sheet slide-up. */
    public static final long SHEET_PRESENT_MS = 260L;

    /** Duration of soft chrome (address bar + bottom nav) hide on downward web scroll. */
    public static final long CHROME_HIDE_MS = 160L;

    /** Duration of soft chrome restore on upward scroll or top reach. */
    public static final long CHROME_SHOW_MS = 180L;

    /** Minimum task-list scroll delta, in dp, before changing task chrome visibility. */
    public static final int CHROME_SCROLL_THRESHOLD_DP = 3;

    /** Idle delay before task chrome is restored after scrolling stops. */
    public static final long CHROME_AUTO_RESTORE_MS = 700L;

    /** Minimum time a newly expanded panel stays open before a rapid re-collapse is allowed. */
    public static final long EXPAND_DEBOUNCE_MS = 120L;

    /**
     * Whether a rapid re-collapse request should be accepted given the expand start time.
     * Prevents accidental flicker when the user double-taps.
     */
    public static boolean shouldAcceptCollapse(long expandStartedAtMs, long nowMs) {
        if (expandStartedAtMs <= 0L) return true;
        if (nowMs < expandStartedAtMs) return false;
        return nowMs - expandStartedAtMs >= EXPAND_DEBOUNCE_MS;
    }

    public enum ChromeScrollAction { NONE, HIDE, SHOW }

    /** Classify a vertical scroll delta using a pixel threshold derived from dp. */
    public static ChromeScrollAction chromeActionForScrollDelta(int deltaPx, int thresholdPx) {
        int threshold = Math.max(0, thresholdPx);
        if (deltaPx > threshold) return ChromeScrollAction.HIDE;
        if (deltaPx < -threshold) return ChromeScrollAction.SHOW;
        return ChromeScrollAction.NONE;
    }

    /**
     * Fraction (0..1) of the tab-switch animation that should be a horizontal slide versus pure fade.
     * Keeps motion subtle on small screens.
     */
    public static float tabSlideFraction() {
        return 0.18f;
    }
}
