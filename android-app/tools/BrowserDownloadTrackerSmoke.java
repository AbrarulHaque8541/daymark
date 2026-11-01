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
        tracker.onProgress(1L, 25L, 100L);
        tracker.onQueued(1L);
        check(tracker.get(1L).status == BrowserDownloadTracker.Status.QUEUED
                        && tracker.get(1L).bytesDownloaded == 25L,
                "provider pending status must preserve prior progress metadata");
        tracker.onProgress(1L, 50L, 100L);
        tracker.onPaused(1L);
        check(tracker.get(1L).status == BrowserDownloadTracker.Status.PAUSED
                        && tracker.get(1L).bytesDownloaded == 50L,
                "paused status must preserve the last provider progress");
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

        // Capacity must remain hard-bounded even when every retained download is active.
        BrowserDownloadTracker saturated = new BrowserDownloadTracker();
        for (long id = 0; id < BrowserDownloadTracker.MAX_TRACKED; id++) {
            check(saturated.start(id, "https://cdn.example.test/" + id, "download.bin") != null,
                    "initial active downloads should be tracked");
        }
        check(saturated.activeCount() == BrowserDownloadTracker.MAX_TRACKED,
                "all retained entries are active at the cap");
        check(saturated.start(BrowserDownloadTracker.MAX_TRACKED,
                        "https://cdn.example.test/overflow", "download.bin") == null,
                "new active download must not exceed the tracking cap");
        check(saturated.snapshot().size() == BrowserDownloadTracker.MAX_TRACKED,
                "all-active saturation must remain bounded");
        check(saturated.get(0L) != null,
                "capacity pressure must not evict an active download");

        // A terminal entry can be evicted to make room without losing active entries.
        saturated.onComplete(0L);
        BrowserDownloadTracker.Entry admitted = saturated.start(
                BrowserDownloadTracker.MAX_TRACKED,
                "https://cdn.example.test/next", "download.bin");
        check(admitted != null, "a completed entry should be evicted to admit a new download");
        check(saturated.snapshot().size() == BrowserDownloadTracker.MAX_TRACKED,
                "admitting after terminal eviction must preserve the cap");
        check(saturated.get(0L) == null, "oldest completed entry is evicted first");
        check(saturated.get((long) BrowserDownloadTracker.MAX_TRACKED) != null,
                "new entry is retained after terminal eviction");

        // Duplicate provider callbacks must not reset the original active record.
        BrowserDownloadTracker.Entry duplicate = tracker.start(
                20L, "https://cdn.example.test/original", "original.bin");
        tracker.onProgress(20L, 25L, 100L);
        BrowserDownloadTracker.Entry duplicateAgain = tracker.start(
                20L, "https://other.example.test/replacement?token=secret", "replacement.bin");
        check(duplicateAgain == duplicate, "duplicate id must return the existing tracker entry");
        check(duplicateAgain.status == BrowserDownloadTracker.Status.IN_PROGRESS
                        && duplicateAgain.bytesDownloaded == 25L,
                "duplicate start must not reset progress/status");
        check("original.bin".equals(duplicateAgain.fileName)
                        && "https://cdn.example.test".equals(duplicateAgain.url),
                "duplicate start must not replace retained metadata");

        // Entry count alone is not enough: bound each untrusted string too.
        String oversizedUrl = "https://" + "a".repeat(BrowserDownloadTracker.MAX_URL_CHARS + 50)
                + "/?token=must-not-be-retained";
        BrowserDownloadTracker.Entry boundedUrl = tracker.start(21L, oversizedUrl, "url.bin");
        check("[redact-error]".equals(boundedUrl.url),
                "oversized URL must fail closed before retaining an unbounded origin");

        String hostileName = "x".repeat(BrowserDownloadTracker.MAX_FILE_NAME_CHARS + 100)
                + "\r\nforged-log-line";
        BrowserDownloadTracker.Entry boundedName = tracker.start(
                22L, "https://cdn.example.test/name", hostileName);
        check(boundedName.fileName.codePointCount(0, boundedName.fileName.length())
                        <= BrowserDownloadTracker.MAX_FILE_NAME_CHARS,
                "retained filename must be bounded by code points");
        check(!boundedName.fileName.contains("\r") && !boundedName.fileName.contains("\n"),
                "filename must not inject line breaks into logs");

        tracker.onFailure(22L, "failure\r\n".repeat(1000));
        check(tracker.get(22L).failureReason.codePointCount(0,
                        tracker.get(22L).failureReason.length())
                        <= BrowserDownloadTracker.MAX_FAILURE_REASON_CHARS,
                "failure diagnostic must be bounded");
        check(!tracker.get(22L).failureReason.contains("\r")
                        && !tracker.get(22L).failureReason.contains("\n"),
                "failure diagnostic must not inject log lines");

        BrowserDownloadTracker.Entry negativeProgress = tracker.start(
                23L, "https://cdn.example.test/progress", "progress.bin");
        tracker.onProgress(23L, -5L, -1L);
        check(negativeProgress.bytesDownloaded == 0L && negativeProgress.totalBytes == 0L
                        && negativeProgress.progress() == 0d,
                "negative provider counters must be normalized to a safe zero state");

        System.out.println("PASS BrowserDownloadTrackerSmoke: origin-only redaction, malformed fail-closed, status/progress, bounded capacity");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
