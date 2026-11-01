package com.abrar.daymark;

/** Host smoke for the pure address-notice panel layout policy. */
final class BrowserAddressNoticePanelPolicySmoke {
    public static void main(String[] args) {
        assertEquals(0, BrowserAddressNoticePanelPolicy.maxHeightBelowAnchorPx(0, 0, 0, 0, 0, 0));
        assertEquals(0, BrowserAddressNoticePanelPolicy.maxHeightBelowAnchorPx(0, 100, -1, 10, 0, 0));
        assertEquals(0, BrowserAddressNoticePanelPolicy.maxHeightBelowAnchorPx(0, 100, 95, 10, 0, 0));
        assertEquals(80, BrowserAddressNoticePanelPolicy.maxHeightBelowAnchorPx(0, 100, 10, 10, 0, 0));
        assertEquals(70, BrowserAddressNoticePanelPolicy.maxHeightBelowAnchorPx(0, 100, 10, 10, 5, 5));
        assertEquals(50, BrowserAddressNoticePanelPolicy.fitContentHeightPx(50, 100));
        assertEquals(100, BrowserAddressNoticePanelPolicy.fitContentHeightPx(200, 100));
        System.out.println("PASS BrowserAddressNoticePanelPolicySmoke");
    }

    private static void assertEquals(int expected, int actual) {
        if (expected != actual) throw new AssertionError(expected + " != " + actual);
    }
}
