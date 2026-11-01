package com.abrar.daymark;

import android.util.Log;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Tracks active and recent browser downloads with bounded state.
 *
 * <p>Contributes to #348 P0 "Downloads and link journeys":
 * - Tracks download id → (url, fileName, bytesDownloaded, totalBytes, status)
 * - Bounded to MAX_TRACKED (oldest completed entries are evicted)
 * - Status: QUEUED, IN_PROGRESS, PAUSED, COMPLETED, FAILED, CANCELLED
 * - Never logs auth tokens or cookie values; URL is redacted to origin
 *
 * <p>UI-independent; the Activity wires DownloadManager callbacks into this tracker.
 */
final class BrowserDownloadTracker {
    private static final String TAG = "DaymarkDownload";
    static final int MAX_TRACKED = 20;
    static final int MAX_URL_CHARS = 2048;
    static final int MAX_FILE_NAME_CHARS = 128;
    static final int MAX_FAILURE_REASON_CHARS = 160;

    enum Status { QUEUED, IN_PROGRESS, PAUSED, COMPLETED, FAILED, CANCELLED }

    static final class Entry {
        final long id;
        final String url;
        final String fileName;
        long bytesDownloaded;
        long totalBytes;
        Status status;
        String failureReason;

        Entry(long id, String url, String fileName) {
            this.id = id;
            this.url = url;
            this.fileName = fileName;
            this.status = Status.QUEUED;
        }

        double progress() {
            if (totalBytes <= 0 || bytesDownloaded <= 0) return 0;
            return Math.min(1.0, (double) bytesDownloaded / (double) totalBytes);
        }
    }

    private final Map<Long, Entry> entries = new LinkedHashMap<>();

    /**
     * Starts tracking a download without allowing the in-memory history to grow without bound.
     * If the cap is reached and every retained entry is active, returns null rather than
     * evicting an active download or exceeding MAX_TRACKED. Callers may still enqueue the
     * system download; this helper only declines to retain another tracking entry.
     */
    synchronized Entry start(long id, String url, String fileName) {
        Entry existing = entries.get(id);
        if (existing != null) return existing; // duplicate callbacks must not reset active state
        evictIfNeeded();
        if (entries.size() >= MAX_TRACKED) {
            Log.w(TAG, "download-not-tracked id=" + id + " reason=active-capacity");
            return null;
        }
        Entry e = new Entry(id, redact(url), sanitizeText(fileName, MAX_FILE_NAME_CHARS, "download"));
        entries.put(id, e);
        Log.i(TAG, "download-started id=" + id + " url=" + e.url);
        return e;
    }

    synchronized void onProgress(long id, long downloaded, long total) {
        Entry e = entries.get(id);
        if (e == null) return;
        e.bytesDownloaded = Math.max(0L, downloaded);
        e.totalBytes = Math.max(0L, total);
        e.status = Status.IN_PROGRESS;
    }

    synchronized void onComplete(long id) {
        Entry e = entries.get(id);
        if (e == null) return;
        e.status = Status.COMPLETED;
        e.bytesDownloaded = Math.max(0L, e.totalBytes);
        Log.i(TAG, "download-completed id=" + id + " size=" + e.totalBytes);
    }

    synchronized void onFailure(long id, String reason) {
        Entry e = entries.get(id);
        if (e == null) return;
        e.status = Status.FAILED;
        e.failureReason = sanitizeText(reason, MAX_FAILURE_REASON_CHARS, "unknown");
        Log.w(TAG, "download-failed id=" + id + " reason=" + e.failureReason);
    }

    synchronized void onCancel(long id) {
        Entry e = entries.get(id);
        if (e == null) return;
        e.status = Status.CANCELLED;
        Log.i(TAG, "download-cancelled id=" + id);
    }

    synchronized Entry get(long id) {
        return entries.get(id);
    }

    synchronized java.util.List<Entry> snapshot() {
        return new java.util.ArrayList<>(entries.values());
    }

    synchronized int activeCount() {
        int n = 0;
        for (Entry e : entries.values()) {
            if (e.status == Status.QUEUED || e.status == Status.IN_PROGRESS || e.status == Status.PAUSED) n++;
        }
        return n;
    }

    private void evictIfNeeded() {
        while (entries.size() >= MAX_TRACKED) {
            // Evict oldest non-active entry
            Long toRemove = null;
            for (Map.Entry<Long, Entry> me : entries.entrySet()) {
                Status s = me.getValue().status;
                if (s == Status.COMPLETED || s == Status.FAILED || s == Status.CANCELLED) {
                    toRemove = me.getKey();
                    break;
                }
            }
            if (toRemove == null) break; // all active, don't evict
            entries.remove(toRemove);
        }
    }

    /**
     * Bound and neutralize untrusted diagnostic metadata before retaining or logging it.
     * Unicode control/format characters include line separators and bidi controls.
     */
    private static String sanitizeText(String value, int maxCodePoints, String fallback) {
        if (value == null || value.isEmpty()) return fallback;
        StringBuilder safe = new StringBuilder(Math.min(value.length(), maxCodePoints));
        int count = 0;
        for (int offset = 0; offset < value.length() && count < maxCodePoints;) {
            int codePoint = value.codePointAt(offset);
            offset += Character.charCount(codePoint);
            int type = Character.getType(codePoint);
            if (type == Character.CONTROL || type == Character.FORMAT) codePoint = ' ';
            safe.appendCodePoint(codePoint);
            count++;
        }
        String result = safe.toString().trim();
        return result.isEmpty() ? fallback : result;
    }

    /**
     * Keep only the HTTP(S) origin in diagnostics. Parsing the URI (rather than searching for a
     * slash) is important: a URL such as https://example.test?token=... has no path slash before
     * its query, so delimiter scanning alone would accidentally retain the query in Logcat.
     */
    private static String redact(String url) {
        if (url == null) return "null";
        if (url.length() > MAX_URL_CHARS) return "[redact-error]";
        try {
            URI uri = new URI(url);
            String scheme = uri.getScheme();
            if (scheme == null || (!"http".equalsIgnoreCase(scheme)
                    && !"https".equalsIgnoreCase(scheme))) return "[non-http]";

            String authority = uri.getRawAuthority();
            if (authority == null || authority.isEmpty()) return "[redact-error]";
            // Strip every credential segment before the final authority separator.
            int atSign = authority.lastIndexOf('@');
            if (atSign >= 0) authority = authority.substring(atSign + 1);
            if (authority.isEmpty()) return "[redact-error]";

            return scheme.toLowerCase(java.util.Locale.ROOT) + "://" + authority;
        } catch (URISyntaxException e) {
            return "[redact-error]";
        }
    }
}
