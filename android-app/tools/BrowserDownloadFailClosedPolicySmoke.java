package com.abrar.daymark;

/** Host regression tests for the browser-download fail-closed fallback. */
public final class BrowserDownloadFailClosedPolicySmoke {
    public static void main(String[] args) {
        BrowserDownloadFailClosedPolicy.Decision online =
                BrowserDownloadFailClosedPolicy.evaluate(true);
        check(!online.downloadAllowed,
                "Online mode must not enable the unsafe legacy DownloadManager path");
        check(online.userMessage.contains("validate every redirect safely"),
                "Online users must be told why browser downloads are temporarily unavailable");
        check(online.userMessage.contains("Browsing remains available"),
                "the temporary download block must not imply that HTTP/HTTPS browsing is disabled");

        BrowserDownloadFailClosedPolicy.Decision offline =
                BrowserDownloadFailClosedPolicy.evaluate(false);
        check(!offline.downloadAllowed,
                "Offline mode must fail closed without starting a request");
        check(offline.userMessage.contains("Online is off"),
                "Offline users must be told that downloads are blocked while Online is off");
        check(offline.userMessage.contains("Downloads also remain unavailable"),
                "the message must not imply that enabling Online alone restores unsafe downloads");
        check(offline.userMessage.contains("validate every redirect safely"),
                "Offline users must receive the same redirect-safety explanation");
        System.out.println("PASS BrowserDownloadFailClosedPolicySmoke: 7 assertions");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
