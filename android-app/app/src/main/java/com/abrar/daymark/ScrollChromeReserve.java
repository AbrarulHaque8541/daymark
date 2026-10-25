package com.abrar.daymark;

/**
 * Geometry helper for the home task list's hide-the-composer-on-scroll behaviour.
 *
 * <p>The task list lives in a weighted {@code ScrollView}. When the shared composer is removed
 * from the layout, that viewport grows by exactly the composer's measured height plus its bottom
 * margin. A {@code ScrollView} clamps its offset to {@code contentHeight - viewportHeight}, so a
 * suddenly taller viewport shrinks the maximum offset and the list snaps upward — sometimes all
 * the way back to the top — while the reader is still dragging.
 *
 * <p>Reserving the same number of pixels as bottom padding on the {@code ScrollView} keeps the
 * scroll range and the viewport in step, because {@code clipToPadding} is disabled for it. Hiding
 * the chrome then buys reading space without moving the content under the finger.
 */
final class ScrollChromeReserve {

    private ScrollChromeReserve() { }

    /**
     * Height the composer should be treated as occupying. An unmeasured view reports {@code 0},
     * which must never collapse the reserve to the margin alone, so a fallback is used instead.
     */
    static int effectiveHeight(int measuredHeightPx, int fallbackHeightPx) {
        if (measuredHeightPx > 0) return measuredHeightPx;
        return Math.max(fallbackHeightPx, 0);
    }

    /** Bottom padding that keeps the task list scroll range stable while the composer is hidden. */
    static int reserveFor(int measuredHeightPx, int bottomMarginPx, int fallbackHeightPx) {
        return effectiveHeight(measuredHeightPx, fallbackHeightPx) + Math.max(bottomMarginPx, 0);
    }

    /**
     * True when the scroll view must actually be re-padded. A negative request is clamped, because
     * negative padding would shrink the scroll range instead of stabilising it.
     */
    static boolean changesReserve(int currentPaddingPx, int wantedPaddingPx) {
        return currentPaddingPx != Math.max(wantedPaddingPx, 0);
    }
}
