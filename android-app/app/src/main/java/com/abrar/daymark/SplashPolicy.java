package com.abrar.daymark;

/**
 * Pure policy for the Daymark splash (opening) screen.
 *
 * <p>No Android framework dependency so host smoke tests can pin the numbers without an
 * emulator. Timings are deliberately bounded so cold start never feels stuck, and the hold
 * shortens when the user has disabled system transition animations.
 */
public final class SplashPolicy {
    private SplashPolicy() {}

    /** Brand title shown under the logo. */
    public static final String BRAND_TITLE = "DAYMARK";

    /** Attribution line shown under the brand title. */
    public static final String BRAND_SUBTITLE = "BY ABRARUL HAQUE";

    /** Minimum time the splash stays visible so the brand is perceivable. */
    public static final long SPLASH_HOLD_MS = 1400L;

    /** Shorter hold when the user has disabled system transition animations. */
    public static final long SPLASH_HOLD_REDUCED_MS = 500L;

    /** Logo entrance (scale + fade) duration. */
    public static final long LOGO_ENTER_MS = 420L;

    /** Title/subtitle entrance (fade + rise) duration. */
    public static final long TITLE_ENTER_MS = 360L;

    /** Light sweep across the splash duration. */
    public static final long SWEEP_MS = 900L;

    /** True when system transition animations are enabled (scale > 0). */
    public static boolean animationsEnabled(float transitionAnimationScale) {
        return transitionAnimationScale > 0f;
    }

    /** How long the splash should stay on screen before launching the main UI. */
    public static long splashHoldMs(boolean animationsEnabled) {
        return animationsEnabled ? SPLASH_HOLD_MS : SPLASH_HOLD_REDUCED_MS;
    }

    /** Total worst-case splash lifetime including entrance motion. */
    public static long totalSplashMs(boolean animationsEnabled) {
        long enter = animationsEnabled ? LOGO_ENTER_MS + TITLE_ENTER_MS : 0L;
        return splashHoldMs(animationsEnabled) + enter;
    }
}
