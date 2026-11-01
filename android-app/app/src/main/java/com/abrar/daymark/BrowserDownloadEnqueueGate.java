package com.abrar.daymark;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Suppresses accidental duplicate browser-download enqueue callbacks without
 * retaining raw URLs (which may contain short-lived query credentials).
 * The gate is in-memory only and does not alter DownloadManager persistence.
 */
final class BrowserDownloadEnqueueGate {
    static final long DUPLICATE_WINDOW_MS = 1_200L;
    static final int MAX_RECENT_KEYS = 16;

    private final LinkedHashMap<String, Long> recent = new LinkedHashMap<>();

    synchronized boolean tryAcquire(String url, long nowElapsedMs) {
        String key = keyFor(url);
        if (key == null) return false;
        prune(nowElapsedMs);
        Long last = recent.get(key);
        if (last != null && nowElapsedMs >= last
                && nowElapsedMs - last < DUPLICATE_WINDOW_MS) {
            return false;
        }
        recent.remove(key);
        recent.put(key, nowElapsedMs);
        while (recent.size() > MAX_RECENT_KEYS) {
            Iterator<Map.Entry<String, Long>> iterator = recent.entrySet().iterator();
            if (!iterator.hasNext()) break;
            iterator.next();
            iterator.remove();
        }
        return true;
    }

    synchronized void release(String url) {
        String key = keyFor(url);
        if (key != null) recent.remove(key);
    }

    private void prune(long nowElapsedMs) {
        Iterator<Map.Entry<String, Long>> iterator = recent.entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<String, Long> entry = iterator.next();
            long timestamp = entry.getValue();
            if (nowElapsedMs >= timestamp && nowElapsedMs - timestamp >= DUPLICATE_WINDOW_MS) {
                iterator.remove();
            }
        }
    }

    private static String keyFor(String url) {
        if (url == null || url.trim().isEmpty()) return null;
        String value = url.trim();
        int fragment = value.indexOf('#');
        if (fragment >= 0) value = value.substring(0, fragment);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            char[] hex = new char[digest.length * 2];
            final char[] alphabet = "0123456789abcdef".toCharArray();
            for (int i = 0; i < digest.length; i++) {
                int b = digest[i] & 0xff;
                hex[i * 2] = alphabet[b >>> 4];
                hex[i * 2 + 1] = alphabet[b & 0x0f];
            }
            return new String(hex);
        } catch (NoSuchAlgorithmException unavailable) {
            // SHA-256 is required by every Android/Java runtime Daymark supports.
            return null;
        }
    }
}
