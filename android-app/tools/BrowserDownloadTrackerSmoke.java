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

        // Null and overlong URLs must fail closed without retaining attacker-controlled text.
        BrowserDownloadTracker.Entry nullUrl = tracker.start(
                11L, null, "null-url.bin");
        check("null".equals(nullUrl.url), "null URL must be represented safely");
        StringBuilder overlongUrl = new StringBuilder("https://cdn.example.test/");
        while (overlongUrl.length() <= BrowserDownloadTracker.MAX_URL_CHARS) {
            overlongUrl.append('x');
        }
        BrowserDownloadTracker.Entry overlong = tracker.start(
                12L, overlongUrl.toString(), "overlong.bin");
        check("[redact-error]".equals(overlong.url),
                "overlong URL must fail closed rather than be retained");

        // Filename and failure metadata are untrusted; strip control/format characters and bound
        // retained text so Logcat/UI strings cannot be multiline or bidi-spoofed.
        String hostileName = "report\u202E\nfinal\u0000" + "x".repeat(200) + ".pdf";
        BrowserDownloadTracker.Entry sanitized = tracker.start(
                13L, "https://safe.example/file", hostileName);
        check(!sanitized.fileName.contains("\u202E")
                        && !sanitized.fileName.contains("\n")
                        && !sanitized.fileName.contains("\u0000"),
                "filename must strip bidi/control characters");
        check(sanitized.fileName.codePointCount(0, sanitized.fileName.length())
                        <= BrowserDownloadTracker.MAX_FILE_NAME_CHARS,
                "filename must be bounded by code points");
        String hostileReason = "failure\u202E\n" + "z".repeat(300);
        tracker.onFailure(13L, hostileReason);
        check(sanitized.failureReason.codePointCount(0, sanitized.failureReason.length())
                        <= BrowserDownloadTracker.MAX_FAILURE_REASON_CHARS,
                "failure reason must be bounded by code points");
        for (int offset = 0; offset < sanitized.failureReason.length();) {
            int cp = sanitized.failureReason.codePointAt(offset);
            offset += Character.charCount(cp);
            int type = Character.getType(cp);
            check(type != Character.CONTROL && type != Character.FORMAT,
                    "failure reason must not retain control/format characters");
        }

        // A duplicate provider callback for the same ID must not reset an active entry or replace
        // its already-redacted URL/filename.
        BrowserDownloadTracker bounded = new BrowserDownloadTracker();
        BrowserDownloadTracker.Entry original = bounded.start(
                200L, "https://first.example/path?token=secret", "first.bin");
        bounded.onProgress(200L, 4L, 10L);
        BrowserDownloadTracker.Entry duplicate = bounded.start(
                200L, "https://second.example/path?token=other", "second.bin");
        check(original == duplicate && original.status == BrowserDownloadTracker.Status.IN_PROGRESS
                        && "https://first.example".equals(original.url)
                        && "first.bin".equals(original.fileName),
                "duplicate ID must preserve tracked state and safe metadata");

        // At capacity, never evict active downloads; after a terminal entry exists, evict it first.
        for (long id = 201L; id < 201L + BrowserDownloadTracker.MAX_TRACKED - 1; id++) {
            bounded.start(id, "https://active.example/" + id, "active.bin");
            bounded.onProgress(id, 1L, 10L);
        }
        check(bounded.activeCount() == BrowserDownloadTracker.MAX_TRACKED,
                "fixture should fill the tracker with active downloads");
        check(bounded.start(300L, "https://overflow.example/file", "overflow.bin") == null,
                "tracker must refuse growth when all retained entries are active");
        check(bounded.snapshot().size() == BrowserDownloadTracker.MAX_TRACKED,
                "active-capacity refusal must keep the tracker bounded");
        bounded.onComplete(200L);
        BrowserDownloadTracker.Entry admitted = bounded.start(
                300L, "https://admitted.example/file", "admitted.bin");
        check(admitted != null && bounded.snapshot().size() == BrowserDownloadTracker.MAX_TRACKED
                        && bounded.get(200L) == null,
                "a terminal oldest entry must be evicted to admit the new download");

        System.out.println("PASS BrowserDownloadTrackerSmoke: origin-only redaction, malformed fail-closed, status/progress");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
