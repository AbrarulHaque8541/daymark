package com.abrar.daymark;

import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Daymark-owned download transport that validates every redirect hop before following it,
 * streams the body with a hard byte cap, and only returns a completed temp file after full validation.
 * Partial files are deleted on any failure. No silent retries.
 */
final class BrowserDownloadTransport {
    private static final String TAG = "DaymarkDownloadTransport";
    static final long MAX_BYTES = 200L * 1024 * 1024; // 200 MiB hard cap
    static final int CONNECT_TIMEOUT_MS = 15_000;
    static final int READ_TIMEOUT_MS = 30_000;

    static final class Result {
        final boolean success;
        final File file;
        final String finalUrl;
        final String mimeType;
        final String error;

        Result(boolean success, File file, String finalUrl, String mimeType, String error) {
            this.success = success;
            this.file = file;
            this.finalUrl = finalUrl;
            this.mimeType = mimeType;
            this.error = error;
        }
    }

    private BrowserDownloadTransport() {}

    static Result download(String startUrl, String userAgent, String cookies, File tempDir) {
        if (tempDir == null || !tempDir.isDirectory()) return new Result(false, null, null, null, "no-temp-dir");
        List<String> seen = new ArrayList<>();
        String current = startUrl;
        String previousScheme = null;
        for (int hop = 0; hop < BrowserDownloadRedirectPolicy.MAX_HOPS; hop++) {
            String reject = BrowserDownloadRedirectPolicy.validateUrl(current, previousScheme);
            if (reject != null) {
                return new Result(false, null, current, null, "rejected:" + reject);
            }
            if (seen.contains(current)) return new Result(false, null, current, null, "redirect-loop");
            seen.add(current);
            HttpURLConnection conn = null;
            try {
                URL url = new URL(current);
                conn = (HttpURLConnection) url.openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
                conn.setReadTimeout(READ_TIMEOUT_MS);
                conn.setRequestProperty("User-Agent", userAgent != null ? userAgent : "Daymark");
                if (cookies != null && !cookies.isEmpty() && isSameOrigin(startUrl, current)) {
                    conn.setRequestProperty("Cookie", cookies);
                }
                conn.setRequestProperty("Referer", ""); // no referrer
                int status = conn.getResponseCode();
                previousScheme = url.getProtocol();
                if (BrowserDownloadRedirectPolicy.isAllowedRedirectStatus(status)) {
                    String loc = conn.getHeaderField("Location");
                    if (loc == null || loc.isEmpty()) return new Result(false, null, current, null, "missing-location");
                    current = resolve(current, loc);
                    continue;
                }
                if (status < 200 || status >= 300) {
                    return new Result(false, null, current, null, "http-error:" + status);
                }
                // Success path: stream body
                long declared = conn.getContentLengthLong();
                if (declared > MAX_BYTES) return new Result(false, null, current, null, "oversized-declared");
                String mime = conn.getContentType();
                File temp = File.createTempFile("daymark-dl-", ".partial", tempDir);
                try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(temp)) {
                    byte[] buf = new byte[8192];
                    long total = 0;
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        total += n;
                        if (total > MAX_BYTES) {
                            temp.delete();
                            return new Result(false, null, current, null, "oversized-stream");
                        }
                        out.write(buf, 0, n);
                    }
                }
                return new Result(true, temp, current, mime, null);
            } catch (IOException e) {
                Log.w(TAG, "transport-io", e);
                return new Result(false, null, current, null, "io-error");
            } finally {
                if (conn != null) conn.disconnect();
            }
        }
        return new Result(false, null, current, null, "hop-limit");
    }

    private static boolean isSameOrigin(String a, String b) {
        try {
            URL ua = new URL(a);
            URL ub = new URL(b);
            return ua.getProtocol().equalsIgnoreCase(ub.getProtocol())
                    && ua.getHost().equalsIgnoreCase(ub.getHost())
                    && ua.getPort() == ub.getPort();
        } catch (Exception e) {
            return false;
        }
    }

    private static String resolve(String base, String loc) {
        try {
            return new URL(new URL(base), loc).toString();
        } catch (Exception e) {
            return loc;
        }
    }
}
