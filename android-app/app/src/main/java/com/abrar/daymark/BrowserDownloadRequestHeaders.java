package com.abrar.daymark;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Builds the deliberately small header allowlist for Android DownloadManager.
 *
 * <p>DownloadProvider replays stored request headers while following redirects. A WebView
 * session Cookie header therefore cannot be safely attached to a request whose redirect
 * destinations are not validated by Daymark. Only a bounded, CR/LF-free User-Agent is copied.
 * Cookies, Authorization, Referer and other origin-sensitive headers are never accepted.</p>
 */
final class BrowserDownloadRequestHeaders {
    static final int MAX_USER_AGENT_CHARS = 512;

    private BrowserDownloadRequestHeaders() { }

    private static boolean containsHeaderControl(String value) {
        for (int i = 0; i < value.length(); i++) {
            char character = value.charAt(i);
            if (character < 0x20 || character == 0x7f) return true;
        }
        return false;
    }

    static Map<String, String> forDownload(String userAgent) {
        if (userAgent == null) return Collections.emptyMap();
        String value = userAgent.trim();
        if (value.isEmpty() || value.length() > MAX_USER_AGENT_CHARS
                || containsHeaderControl(value)) {
            return Collections.emptyMap();
        }
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("User-Agent", value);
        return Collections.unmodifiableMap(headers);
    }
}
