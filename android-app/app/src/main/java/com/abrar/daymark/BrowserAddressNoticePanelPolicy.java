package com.abrar.daymark;

/** Pure layout policy for the address notice's showAsDropDown panel. */
final class BrowserAddressNoticePanelPolicy {
    private BrowserAddressNoticePanelPolicy() { }

    /** Returns the usable visible height below a fully visible anchor, in pixels. */
    static int maxHeightBelowAnchorPx(int visibleTopPx, int visibleBottomPx,
            int anchorTopPx, int anchorHeightPx, int verticalOffsetPx, int bottomMarginPx) {
        requireNonNegative(anchorHeightPx, "anchor height");
        requireNonNegative(verticalOffsetPx, "vertical offset");
        requireNonNegative(bottomMarginPx, "bottom margin");
        if (visibleBottomPx <= visibleTopPx || anchorHeightPx == 0) return 0;

        long anchorBottomPx = (long) anchorTopPx + anchorHeightPx;
        if (anchorTopPx < visibleTopPx || anchorBottomPx > visibleBottomPx) return 0;

        long panelTopPx = anchorBottomPx + verticalOffsetPx;
        long panelBottomPx = (long) visibleBottomPx - bottomMarginPx;
        long availablePx = panelBottomPx - panelTopPx;
        if (availablePx <= 0) return 0;
        return (int) Math.min(availablePx, Integer.MAX_VALUE);
    }

    /** Keeps short panels compact while ensuring tall content fits the available viewport. */
    static int fitContentHeightPx(int measuredContentHeightPx, int maxAvailableHeightPx) {
        requireNonNegative(measuredContentHeightPx, "measured content height");
        requireNonNegative(maxAvailableHeightPx, "available height");
        return Math.min(measuredContentHeightPx, maxAvailableHeightPx);
    }

    private static void requireNonNegative(int value, String field) {
        if (value < 0) throw new IllegalArgumentException(field + " must not be negative");
    }
}
