package com.abrar.daymark;

import java.util.Map;

/** Regression tests for the non-sensitive DownloadManager request-header allowlist. */
public final class BrowserDownloadRequestHeadersSmoke {
    public static void main(String[] args) {
        Map<String, String> normal = BrowserDownloadRequestHeaders.forDownload(
                "Mozilla/5.0 (Android) Daymark");
        check(normal.size() == 1, "only one request header is allowed");
        check("Mozilla/5.0 (Android) Daymark".equals(normal.get("User-Agent")),
                "a normal user agent is preserved");
        check(normal.keySet().iterator().next().equals("User-Agent"),
                "the allowlist contains only User-Agent");
        check(BrowserDownloadRequestHeaders.forDownload(null).isEmpty(),
                "a missing user agent adds no custom headers");
        check(BrowserDownloadRequestHeaders.forDownload("  ").isEmpty(),
                "a blank user agent adds no custom headers");
        check(BrowserDownloadRequestHeaders.forDownload("ok\r\nCookie: session=secret").isEmpty(),
                "CR/LF header injection is rejected");
        check("Mozilla".equals(BrowserDownloadRequestHeaders.forDownload("  Mozilla  ").get("User-Agent")),
                "surrounding whitespace is trimmed");
        check(BrowserDownloadRequestHeaders.forDownload("ok\\u0000bad").isEmpty(),
                "NUL control characters are rejected");
        check(BrowserDownloadRequestHeaders.forDownload("ok\\u007fbad").isEmpty(),
                "DEL control characters are rejected");
        check(BrowserDownloadRequestHeaders.forDownload("x".repeat(
                BrowserDownloadRequestHeaders.MAX_USER_AGENT_CHARS)).size() == 1,
                "the maximum allowed user-agent length is accepted");
        check(BrowserDownloadRequestHeaders.forDownload("x".repeat(
                BrowserDownloadRequestHeaders.MAX_USER_AGENT_CHARS + 1)).isEmpty(),
                "oversized user agents are rejected");
        try {
            normal.put("Cookie", "session=secret");
            throw new AssertionError("returned header map must be immutable");
        } catch (UnsupportedOperationException expected) {
            // expected
        }
        System.out.println("PASS BrowserDownloadRequestHeadersSmoke: safe User-Agent allowlist only");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
