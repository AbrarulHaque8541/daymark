package com.abrar.daymark;

/** Host smoke for {@link UiMotionPolicy}. */
public final class UiMotionPolicySmoke {
    private UiMotionPolicySmoke() {}

    public static void main(String[] args) {
        // Durations are positive and ordered for readable, non-sticky motion.
        check(UiMotionPolicy.TAB_SWITCH_MS > 0L && UiMotionPolicy.TAB_SWITCH_MS <= 300L,
                "tab switch must be short");
        check(UiMotionPolicy.TAB_INDICATOR_MS > 0L && UiMotionPolicy.TAB_INDICATOR_MS < UiMotionPolicy.TAB_SWITCH_MS,
                "indicator should finish before or with the tab content");
        check(UiMotionPolicy.CARD_EXPAND_MS > 0L && UiMotionPolicy.CARD_EXPAND_MS <= 320L,
                "card expand must stay responsive");
        check(UiMotionPolicy.SHEET_PRESENT_MS > 0L && UiMotionPolicy.SHEET_PRESENT_MS <= 320L,
                "sheet present must stay responsive");
        check(UiMotionPolicy.CHROME_HIDE_MS > 0L && UiMotionPolicy.CHROME_HIDE_MS <= 200L,
                "chrome hide must be quick");
        check(UiMotionPolicy.CHROME_SHOW_MS > 0L && UiMotionPolicy.CHROME_SHOW_MS <= 220L,
                "chrome show must be quick");
        check(UiMotionPolicy.EXPAND_DEBOUNCE_MS > 0L && UiMotionPolicy.EXPAND_DEBOUNCE_MS < UiMotionPolicy.CARD_EXPAND_MS,
                "debounce must be shorter than expand");

        // Collapse acceptance respects the debounce window.
        check(UiMotionPolicy.shouldAcceptCollapse(0L, 100L), "never-started expand accepts collapse");
        check(!UiMotionPolicy.shouldAcceptCollapse(1000L, 1050L), "collapse inside debounce is rejected");
        check(UiMotionPolicy.shouldAcceptCollapse(1000L, 1000L + UiMotionPolicy.EXPAND_DEBOUNCE_MS),
                "collapse at debounce boundary is accepted");

        // Slide fraction stays subtle.
        float slide = UiMotionPolicy.tabSlideFraction();
        check(slide > 0f && slide < 0.5f, "tab slide fraction must be subtle");

        System.out.println("PASS ui motion policy smoke");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
