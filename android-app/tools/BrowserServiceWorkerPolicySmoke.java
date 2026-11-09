package com.abrar.daymark;

/** JDK-only regressions for the fail-closed Service Worker network policy. */
public final class BrowserServiceWorkerPolicySmoke {
    private BrowserServiceWorkerPolicySmoke() { }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void expect(BrowserServiceWorkerPolicy.Decision expected,
                               boolean online, boolean explicitNavigation, String scheme) {
        BrowserServiceWorkerPolicy.Decision actual =
                BrowserServiceWorkerPolicy.decide(online, explicitNavigation, scheme);
        check(actual == expected, "unexpected decision for online=" + online
                + ", explicitNavigation=" + explicitNavigation + ", scheme=" + scheme
                + ": " + actual);
    }

    public static void main(String[] args) {
        check(BrowserServiceWorkerPolicy.blocksNetworkLoads(),
                "the process-wide Service Worker network setting must remain blocked");

        for (boolean online : new boolean[]{false, true}) {
            for (boolean explicitNavigation : new boolean[]{false, true}) {
                expect(BrowserServiceWorkerPolicy.Decision.BLOCK, online, explicitNavigation, "http");
                expect(BrowserServiceWorkerPolicy.Decision.BLOCK, online, explicitNavigation, "https");
                expect(BrowserServiceWorkerPolicy.Decision.BLOCK, online, explicitNavigation, "ftp");
                expect(BrowserServiceWorkerPolicy.Decision.BLOCK, online, explicitNavigation, "file");
                expect(BrowserServiceWorkerPolicy.Decision.BLOCK, online, explicitNavigation, "content");
                expect(BrowserServiceWorkerPolicy.Decision.BLOCK, online, explicitNavigation, null);
                expect(BrowserServiceWorkerPolicy.Decision.ALLOW_LOCAL, online, explicitNavigation, "data");
                expect(BrowserServiceWorkerPolicy.Decision.ALLOW_LOCAL, online, explicitNavigation, "blob");
                expect(BrowserServiceWorkerPolicy.Decision.ALLOW_LOCAL, online, explicitNavigation, "about");
            }
        }

        check(BrowserServiceWorkerPolicy.shouldShowCompatibilityNotice(),
                "the compatibility notice must be shown once");
        check(!BrowserServiceWorkerPolicy.shouldShowCompatibilityNotice(),
                "the compatibility notice must not repeat for every tab");
        String disclosure = BrowserServiceWorkerPolicy.compatibilityDisclosure();
        check(disclosure.contains("even while Online") && disclosure.contains("Cached responses"),
                "the user disclosure must explain the Online-mode compatibility trade-off");

        System.out.println("PASS Service Worker policy: 36 state/scheme decisions, global block, one-time disclosure");
    }
}
