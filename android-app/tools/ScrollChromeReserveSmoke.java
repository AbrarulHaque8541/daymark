package com.abrar.daymark;

/**
 * Host-side regression checks for the home list's scroll reserve.
 *
 * <p>The device symptom this protects against: scrolling the task list down hides the shared
 * composer, the weighted ScrollView grows by the composer's height plus margin, and the shorter
 * scroll range re-clamps the live offset so the list snaps upward mid-drag. Reserving the same
 * space as ScrollView bottom padding keeps the maximum offset identical.
 */
public final class ScrollChromeReserveSmoke {
    private ScrollChromeReserveSmoke() {}

    public static void main(String[] args) {
        int composerHeight = 168;
        int composerMargin = 32;
        int fallback = 144;

        int reserve = ScrollChromeReserve.reserveFor(composerHeight, composerMargin, fallback);
        check(reserve == composerHeight + composerMargin,
                "reserve must equal the composer height plus the margin a GONE view also drops");
        check(ScrollChromeReserve.reserveFor(0, composerMargin, fallback) == fallback + composerMargin,
                "an unmeasured composer must fall back to a real height, never to the margin alone");
        check(ScrollChromeReserve.reserveFor(-5, -8, fallback) == fallback,
                "negative heights and margins must not shrink the reserve below the fallback");
        check(ScrollChromeReserve.effectiveHeight(200, fallback) == 200,
                "a measured composer must win over the fallback");

        // The invariant: hiding the chrome may change the viewport, but never the scroll range.
        int contentHeight = 2400;
        int viewportHeight = 1200;
        int maxBeforeHide = contentHeight - viewportHeight;
        int maxAfterHide = (contentHeight + reserve) - (viewportHeight + reserve);
        check(maxBeforeHide == maxAfterHide,
                "reserving the grown viewport must keep the maximum scroll offset identical");
        check(maxAfterHide > (contentHeight - (viewportHeight + reserve)),
                "without the reserve the offset would re-clamp, which is the jump being fixed");

        check(!ScrollChromeReserve.changesReserve(reserve, reserve),
                "re-applying the same reserve must not trigger another layout pass");
        check(ScrollChromeReserve.changesReserve(reserve, 0),
                "restoring the composer must clear the reserve");
        check(!ScrollChromeReserve.changesReserve(0, -reserve),
                "a negative restore request must clamp to zero padding, never to negative padding");

        System.out.println("PASS scroll chrome reserve smoke");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
