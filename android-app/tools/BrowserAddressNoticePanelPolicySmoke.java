package com.abrar.daymark;

public final class BrowserAddressNoticePanelPolicySmoke {
    public static void main(String[] args) {
        assert BrowserAddressNoticePanelPolicy.maxHeightBelowAnchorPx(
                100, 900, 140, 48, 4, 8) == 700;
        assert BrowserAddressNoticePanelPolicy.maxHeightBelowAnchorPx(
                100, 900, 820, 48, 4, 8) == 20;
        assert BrowserAddressNoticePanelPolicy.maxHeightBelowAnchorPx(
                100, 900, 850, 48, 4, 8) == 0 : "anchor below the visible frame has no room";
        assert BrowserAddressNoticePanelPolicy.maxHeightBelowAnchorPx(
                100, 900, 90, 48, 4, 8) == 0 : "partly hidden anchor must not produce a clipped panel";
        assert BrowserAddressNoticePanelPolicy.maxHeightBelowAnchorPx(
                900, 100, 140, 48, 4, 8) == 0 : "inverted visible frame has no room";
        assert BrowserAddressNoticePanelPolicy.maxHeightBelowAnchorPx(
                100, 900, 200, 0, 4, 8) == 0 : "unmeasured anchor has no room";

        assert BrowserAddressNoticePanelPolicy.fitContentHeightPx(240, 700) == 240;
        assert BrowserAddressNoticePanelPolicy.fitContentHeightPx(900, 700) == 700;
        assert BrowserAddressNoticePanelPolicy.fitContentHeightPx(100, 0) == 0;

        expectIllegalArgument(() -> BrowserAddressNoticePanelPolicy.maxHeightBelowAnchorPx(
                100, 900, 140, -1, 4, 8));
        expectIllegalArgument(() -> BrowserAddressNoticePanelPolicy.fitContentHeightPx(-1, 700));
        expectIllegalArgument(() -> BrowserAddressNoticePanelPolicy.fitContentHeightPx(1, -1));
        System.out.println("PASS address notice panel height policy: visible space below anchor, clipping, and content caps");
    }

    private static void expectIllegalArgument(Runnable action) {
        boolean rejected = false;
        try {
            action.run();
        } catch (IllegalArgumentException expected) {
            rejected = true;
        }
        assert rejected : "invalid dimensions must be rejected";
    }
}
