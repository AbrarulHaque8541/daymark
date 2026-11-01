package com.abrar.daymark;

/** Host smoke for {@link UiMotionPolicy}. */
public final class UiMotionPolicySmoke {
    private UiMotionPolicySmoke() {}

    public static void main(String[] args) {
        // Conservative timings stay short and readable.
        check(UiMotionPolicy.TAB_SWITCH_MS == 220L, "tab switch stays under 250 ms");
        check(UiMotionPolicy.TAB_INDICATOR_MS == 180L, "indicator slide is slightly snappier");
        check(UiMotionPolicy.CARD_EXPAND_MS == 240L, "card expand is gentle");
        check(UiMotionPolicy.SHEET_PRESENT_MS == 260L, "sheet present stays short");
        check(UiMotionPolicy.CHROME_HIDE_MS == 160L, "chrome hide is fast");
        check(UiMotionPolicy.CHROME_SHOW_MS == 180L, "chrome show matches hide family");
        check(UiMotionPolicy.EXPAND_DEBOUNCE_MS == 120L, "debounce prevents flicker");

        // Debounce accepts first collapse and rejects rapid re-collapse.
        check(UiMotionPolicy.shouldAcceptCollapse(0L, 50L), "never-expanded collapse is accepted");
        check(UiMotionPolicy.shouldAcceptCollapse(1000L, 1000L + UiMotionPolicy.EXPAND_DEBOUNCE_MS),
                "collapse after debounce window is accepted");
        check(!UiMotionPolicy.shouldAcceptCollapse(1000L, 1000L + 50L),
                "collapse inside debounce window is rejected");

        // Slide fraction stays subtle.
        check(UiMotionPolicy.tabSlideFraction() > 0f && UiMotionPolicy.tabSlideFraction() < 0.3f,
                "tab slide fraction stays subtle on small screens");

        System.out.println("PASS ui motion policy smoke");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
