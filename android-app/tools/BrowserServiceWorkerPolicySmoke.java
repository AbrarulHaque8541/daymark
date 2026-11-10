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
                "Online consent may remove the process-wide Service Worker setting block");

        check(!BrowserServiceWorkerPolicy.canEnableNetworkAfterConsent(false),
                "without the independent request client, Online must retain the initial platform block");
        check(BrowserServiceWorkerPolicy.canEnableNetworkAfterConsent(true),
                "Online may enable worker requests only when the independent request client is installed");

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
                        && disclosure.contains("request guard")
                        && disclosure.contains("remains blocked even while Online"),
                "the user disclosure must explain normal mode behavior and both fail-closed fallbacks");

        System.out.println("PASS Service Worker policy: 20 state/scheme decisions, request-client prerequisite, one-time disclosure");
    }
}
