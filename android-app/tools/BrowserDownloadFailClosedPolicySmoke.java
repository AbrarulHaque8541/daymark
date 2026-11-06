package com.abrar.daymark;

/**
 * Host-side smoke for the fail-closed browser download policy.
 * Run via: sh android-app/tools/run-browser-download-fail-closed-tests.sh
 */
public final class BrowserDownloadFailClosedPolicySmoke {
    public static void main(String[] args) {
        var offline = BrowserDownloadFailClosedPolicy.evaluate(false);
        if (offline.downloadAllowed || !offline.userMessage.contains("Online is off")) {
            throw new AssertionError("offline decision must block with online-off message");
        }
        var online = BrowserDownloadFailClosedPolicy.evaluate(true);
        if (online.downloadAllowed || !online.userMessage.contains("temporarily unavailable")) {
            throw new AssertionError("online decision must still block with transport message");
        }
        System.out.println("BrowserDownloadFailClosedPolicySmoke: PASS");
    }
}
