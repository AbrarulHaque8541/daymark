package com.abrar.daymark;

/** Host smoke for {@link UiFeedbackPolicy}. */
public final class UiFeedbackPolicySmoke {
    private UiFeedbackPolicySmoke() {}

    public static void main(String[] args) {
        // Fast work still shows the indicator long enough to read.
        check(UiFeedbackPolicy.shouldKeepLoadingVisible(1000, 1050, 1100),
                "fast finish must still keep loading through the minimum window");
        check(!UiFeedbackPolicy.shouldKeepLoadingVisible(1000, 1050, 1000 + UiFeedbackPolicy.MIN_LOADING_VISIBLE_MS),
                "after the minimum window the indicator may hide");

        // Still running work keeps the indicator.
        check(UiFeedbackPolicy.shouldKeepLoadingVisible(1000, 0, 5000),
                "unfinished work must keep loading visible");

        // Never shown stays hidden.
        check(!UiFeedbackPolicy.shouldKeepLoadingVisible(0, 50, 100),
                "a never-shown indicator must not appear");

        // Debounce coalesces rapid shows.
        check(UiFeedbackPolicy.shouldAcceptLoadingShow(0, 10), "first show is accepted");
        check(!UiFeedbackPolicy.shouldAcceptLoadingShow(1000, 1040),
                "shows inside the debounce window are rejected");
        check(UiFeedbackPolicy.shouldAcceptLoadingShow(1000, 1000 + UiFeedbackPolicy.LOADING_DEBOUNCE_MS),
                "shows after the debounce window are accepted");

        // Toast timing.
        check(UiFeedbackPolicy.toastRemainingMs(1000, 1000) == UiFeedbackPolicy.TOAST_AUTO_DISMISS_MS,
                "fresh toast has full remaining life");
        check(UiFeedbackPolicy.toastRemainingMs(1000, 1000 + UiFeedbackPolicy.TOAST_AUTO_DISMISS_MS) == 0L,
                "expired toast has zero remaining");
        check(UiFeedbackPolicy.toastRemainingMs(0, 50) == 0L, "unshown toast has zero remaining");

        System.out.println("PASS ui feedback policy smoke");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
