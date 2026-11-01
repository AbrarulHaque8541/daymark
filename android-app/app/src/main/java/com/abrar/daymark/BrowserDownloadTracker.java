package com.abrar.daymark;

import android.util.Log;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.LinkedHashMap;
import java.util.Iterator;
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

    synchronized void onQueued(long id) {
        Entry e = entries.get(id);
        if (e == null) return;
        e.status = Status.QUEUED;
    }

    synchronized void onPaused(long id) {
        Entry e = entries.get(id);
        if (e == null) return;
        e.status = Status.PAUSED;
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

    /** Clears all completed, failed, and cancelled entries, preserving active downloads. */
    synchronized int clearFinished() {
        int removed = 0;
        Iterator<Map.Entry<Long, Entry>> it = entries.entrySet().iterator();
        while (it.hasNext()) {
            Status s = it.next().getValue().status;
            if (s == Status.COMPLETED || s == Status.FAILED || s == Status.CANCELLED) {
                it.remove();
                removed++;
            }
        }
        return removed;
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
     * Control characters, bidi overrides, and excessive length are stripped or truncated.
     */
    private static String sanitizeText(String raw, int maxCodePoints, String fallback) {
        if (raw == null) return fallback;
        StringBuilder sb = new StringBuilder();
        int count = 0;
        for (int i = 0; i < raw.length() && count < maxCodePoints; ) {
            int cp = raw.codePointAt(i);
            i += Character.charCount(cp);
            if (Character.isISOControl(cp) || Character.getType(cp) == Character.FORMAT) continue;
            sb.appendCodePoint(cp);
            count++;
        }
        String cleaned = sb.toString().trim();
        return cleaned.isEmpty() ? fallback : cleaned;
    }

    private static String redact(String url) {
        if (url == null) return "null";
        try {
            URI uri = new URI(url);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (scheme == null || host == null) return "invalid";
            return scheme + "://" + host;
        } catch (URISyntaxException e) {
            return "invalid";
        }
    }
}
