package com.abrar.daymark;

import android.util.Log;

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
            if (totalBytes <= 0) return 0;
            return Math.min(1.0, (double) bytesDownloaded / (double) totalBytes);
        }
    }

    private final Map<Long, Entry> entries = new LinkedHashMap<>();

    synchronized Entry start(long id, String url, String fileName) {
        evictIfNeeded();
        Entry e = new Entry(id, redact(url), fileName != null ? fileName : "download");
        entries.put(id, e);
        Log.i(TAG, "download-started id=" + id + " url=" + e.url + " file=" + e.fileName);
        return e;
    }

    synchronized void onProgress(long id, long downloaded, long total) {
        Entry e = entries.get(id);
        if (e == null) return;
        e.bytesDownloaded = downloaded;
        e.totalBytes = total;
        e.status = Status.IN_PROGRESS;
    }

    synchronized void onComplete(long id) {
        Entry e = entries.get(id);
        if (e == null) return;
        e.status = Status.COMPLETED;
        e.bytesDownloaded = e.totalBytes;
        Log.i(TAG, "download-completed id=" + id + " file=" + e.fileName + " size=" + e.totalBytes);
    }

    synchronized void onFailure(long id, String reason) {
        Entry e = entries.get(id);
        if (e == null) return;
        e.status = Status.FAILED;
        e.failureReason = reason != null ? reason.replaceAll("[\r\n]", " ") : "unknown";
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

    private static String redact(String url) {
        if (url == null) return "null";
        try {
            int schemeEnd = url.indexOf("://");
            if (schemeEnd < 0) return "[non-http]";
            int hostStart = schemeEnd + 3;
            int pathStart = url.indexOf('/', hostStart);
            int atSign = url.indexOf('@', hostStart);
            int hostEnd = (pathStart >= 0) ? pathStart : url.length();
            if (atSign >= 0 && atSign < hostEnd) hostStart = atSign + 1;
            return url.substring(0, schemeEnd + 3) + url.substring(hostStart, hostEnd);
        } catch (Exception e) {
            return "[redact-error]";
        }
    }
}
