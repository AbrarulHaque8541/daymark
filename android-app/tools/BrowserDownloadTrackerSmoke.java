package com.abrar.daymark;

import java.util.List;

/** Host regression tests for BrowserDownloadTracker origin-only URL redaction and state. */
public final class BrowserDownloadTrackerSmoke {
    private BrowserDownloadTrackerSmoke() {}

    public static void main(String[] args) {
        BrowserDownloadTracker tracker = new BrowserDownloadTracker();

        // The query may start immediately after authority; there is no slash to stop at.
        BrowserDownloadTracker.Entry queryOnly = tracker.start(
                1L, "https://cdn.example.test?token=private&sig=secret", "download.bin");
        check("https://cdn.example.test".equals(queryOnly.url),
                "query-only URL must retain only its origin");
        check(!queryOnly.url.contains("token") && !queryOnly.url.contains("private")
                        && !queryOnly.url.contains("sig") && !queryOnly.url.contains("secret"),
                "query-only credentials must not be retained in tracker state");

        BrowserDownloadTracker.Entry fragmentOnly = tracker.start(
                2L, "https://cdn.example.test#session=secret", "download.bin");
        check("https://cdn.example.test".equals(fragmentOnly.url),
                "fragment-only URL must retain only its origin");

        BrowserDownloadTracker.Entry credentials = tracker.start(
                3L, "https://user:pass@cdn.example.test?token=secret", "download.bin");
        check("https://cdn.example.test".equals(credentials.url),
                "userinfo and query must be stripped when no path is present");

        BrowserDownloadTracker.Entry multipleCredentials = tracker.start(
                4L, "https://first-secret@second-secret@cdn.example.test?token=secret", "download.bin");
        check("https://cdn.example.test".equals(multipleCredentials.url),
                "all userinfo before the final authority separator must be stripped");

        BrowserDownloadTracker.Entry path = tracker.start(
                5L, "https://cdn.example.test/files/item.bin?token=secret#frag", "download.bin");
        check("https://cdn.example.test".equals(path.url),
                "path/query/fragment must be removed");

        BrowserDownloadTracker.Entry port = tracker.start(
                6L, "https://cdn.example.test:8443?token=secret", "download.bin");
        check("https://cdn.example.test:8443".equals(port.url),
                "non-default port should remain in the safe origin");

        BrowserDownloadTracker.Entry ipv6 = tracker.start(
                7L, "https://[2001:db8::1]:8443?token=secret", "download.bin");
        check("https://[2001:db8::1]:8443".equals(ipv6.url),
                "IPv6 host and port must remain intact without the query");

        BrowserDownloadTracker.Entry http = tracker.start(
                8L, "http://example.test?session=secret", "download.bin");
        check("http://example.test".equals(http.url), "HTTP should also be redacted to origin-only");

        BrowserDownloadTracker.Entry nonWeb = tracker.start(
                9L, "file:///private/document.pdf", "document.pdf");
        check("[non-http]".equals(nonWeb.url), "non-HTTP(S) URL must not be retained");

        BrowserDownloadTracker.Entry malformed = tracker.start(
                10L, "https://bad host?token=secret", "download.bin");
        check("[redact-error]".equals(malformed.url), "malformed URL must fail closed");

        for (long id = 2L; id <= 10L; id++) tracker.onCancel(id);
        tracker.onProgress(1L, 50L, 100L);
        check(tracker.get(1L).status == BrowserDownloadTracker.Status.IN_PROGRESS,
                "progress must mark entry in progress");
        check(tracker.get(1L).progress() == 0.5d, "progress ratio must be correct");
        tracker.onProgress(1L, 150L, 100L);
        check(tracker.get(1L).progress() == 1.0d, "progress must clamp at 100%");
        tracker.onComplete(1L);
        check(tracker.get(1L).status == BrowserDownloadTracker.Status.COMPLETED,
                "completion status must be recorded");
        check(tracker.activeCount() == 0, "completed download must not count as active");

        List<BrowserDownloadTracker.Entry> snapshot = tracker.snapshot();
        snapshot.clear();
        check(!tracker.snapshot().isEmpty(), "snapshot must be defensive");

        System.out.println("PASS BrowserDownloadTrackerSmoke: origin-only redaction, malformed fail-closed, status/progress");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
