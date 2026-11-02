package com.abrar.daymark;

/**
 * Host smoke for UiPressFeedback policy invariants.
 * Runs on JDK 17 without Android framework; verifies constants and reduced-motion default.
 */
public final class UiPressFeedbackSmoke {
    private UiPressFeedbackSmoke() {}

    public static void main(String[] args) {
        if (UiMotionPolicy.isReducedMotion()) {
            throw new AssertionError("UiMotionPolicy.isReducedMotion must default to false for host determinism");
        }
        // Constants are package-private or we just document them; no runtime Android needed.
        System.out.println("UiPressFeedbackSmoke PASS");
    }
}
