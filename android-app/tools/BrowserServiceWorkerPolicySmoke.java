package com.abrar.daymark;

/** JDK-only regressions for the mode-aware Service Worker network policy. */
public final class BrowserServiceWorkerPolicySmoke {
    private BrowserServiceWorkerPolicySmoke() { }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void expect(BrowserServiceWorkerPolicy.Decision expected,
                               boolean online, String scheme) {
        BrowserServiceWorkerPolicy.Decision actual =
                BrowserServiceWorkerPolicy.decide(online, scheme);
        check(actual == expected, "unexpected decision for online=" + online
                + ", scheme=" + scheme + ": " + actual);
    }

    public static void main(String[] args) {
        check(BrowserServiceWorkerPolicy.blocksNetworkLoads(false),
                "Service Worker network loads must start blocked before explicit Online navigation");
        check(!BrowserServiceWorkerPolicy.blocksNetworkLoads(true),
                "Online consent must allow the process-wide Service Worker network setting");

        for (boolean online : new boolean[]{false, true}) {
            expect(BrowserServiceWorkerPolicy.Decision.BLOCK, online, null);
            expect(BrowserServiceWorkerPolicy.Decision.BLOCK, online, "ftp");
            expect(BrowserServiceWorkerPolicy.Decision.BLOCK, online, "file");
            expect(BrowserServiceWorkerPolicy.Decision.BLOCK, online, "content");
            expect(BrowserServiceWorkerPolicy.Decision.ALLOW_LOCAL, online, "data");
            expect(BrowserServiceWorkerPolicy.Decision.ALLOW_LOCAL, online, "blob");
            expect(BrowserServiceWorkerPolicy.Decision.ALLOW_LOCAL, online, "about");
        }
        expect(BrowserServiceWorkerPolicy.Decision.BLOCK, false, "http");
        expect(BrowserServiceWorkerPolicy.Decision.BLOCK, false, "https");
        expect(BrowserServiceWorkerPolicy.Decision.ALLOW_NETWORK, true, "http");
        expect(BrowserServiceWorkerPolicy.Decision.ALLOW_NETWORK, true, "https");

        check(BrowserServiceWorkerPolicy.shouldShowCompatibilityNotice(),
                "the compatibility notice must be shown once");
        check(!BrowserServiceWorkerPolicy.shouldShowCompatibilityNotice(),
                "the compatibility notice must not repeat for every tab");
        String disclosure = BrowserServiceWorkerPolicy.compatibilityDisclosure();
        check(disclosure.contains("Online/Offline mode")
                        && disclosure.contains("blocked while Offline")
                        && disclosure.contains("remains blocked even while Online"),
                "the user disclosure must explain normal mode behavior and the degraded fallback");

        System.out.println("PASS Service Worker policy: 18 state/scheme decisions, Online/Offline block, one-time disclosure");
    }
}
