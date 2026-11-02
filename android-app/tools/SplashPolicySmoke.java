package com.abrar.daymark;

/** JDK-only checks for the splash (opening) screen timing and branding policy. */
public final class SplashPolicySmoke {
    private SplashPolicySmoke() { }

    public static void main(String[] args) {
        assert "DAYMARK".equals(SplashPolicy.BRAND_TITLE) : "splash must show the DAYMARK brand title";
        assert "BY ABRARUL HAQUE".equals(SplashPolicy.BRAND_SUBTITLE) : "splash must show the BY ABRARUL HAQUE attribution";
        assert SplashPolicy.animationsEnabled(1f) : "full transition scale must enable animations";
        assert SplashPolicy.animationsEnabled(0.5f) : "partial transition scale must still enable animations";
        assert !SplashPolicy.animationsEnabled(0f) : "zero transition scale must disable animations";
        assert SplashPolicy.splashHoldMs(true) == SplashPolicy.SPLASH_HOLD_MS : "full-motion hold must be the standard hold";
        assert SplashPolicy.splashHoldMs(false) == SplashPolicy.SPLASH_HOLD_REDUCED_MS : "reduced-motion hold must be the short hold";
        assert SplashPolicy.splashHoldMs(false) < SplashPolicy.splashHoldMs(true) : "reduced motion must shorten the hold";
        assert SplashPolicy.totalSplashMs(false) < SplashPolicy.totalSplashMs(true) : "reduced motion must shorten total splash time";
        assert SplashPolicy.LOGO_ENTER_MS > 0 && SplashPolicy.TITLE_ENTER_MS > 0 && SplashPolicy.SWEEP_MS > 0
                : "entrance and sweep motion must be defined";
        assert SplashPolicy.SPLASH_HOLD_MS >= 1000L : "splash must stay perceivable for at least a second";
        assert SplashPolicy.SPLASH_HOLD_REDUCED_MS > 0 : "even reduced-motion splash must have a positive hold";
        System.out.println("PASS splash policy: brand text, bounded timings, and reduced-motion handling");
    }
}
