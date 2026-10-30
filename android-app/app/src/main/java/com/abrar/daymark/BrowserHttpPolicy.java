package com.abrar.daymark;

/**
 * Policy for HTTP vs HTTPS navigation in the embedded browser.
 *
 * <p>Contributes to #348 P0 "Support HTTP and HTTPS deliberately":
 * - Explicitly entered HTTP URLs are allowed (not silently rewritten to HTTPS)
 * - Each HTTP page load is flagged as "not encrypted" in the UI status
 * - Updater and other app network clients remain HTTPS-only (separate code path)
 *
 * <p>This is a deliberate product decision: the browser supports HTTP + HTTPS,
 * but the user must see when a page lacks transport encryption.
 */
final class BrowserHttpPolicy {
    static final boolean ALLOW_HTTP = true;

    private BrowserHttpPolicy() {}

    /** Returns true if the given URL is HTTP (not HTTPS). */
    static boolean isHttp(String url) {
        return url != null && url.regionMatches(true, 0, "http://", 0, 7)
                && !url.regionMatches(true, 0, "https://", 0, 8);
    }

    /** Returns true if the given URL is HTTPS. */
    static boolean isHttps(String url) {
        return url != null && url.regionMatches(true, 0, "https://", 0, 8);
    }

    /**
     * Returns a user-facing security label for the given URL.
     * HTTPS → "Encrypted", HTTP → "Not encrypted", other → "Unknown".
     */
    static String securityLabel(String url) {
        if (isHttps(url)) return "Encrypted";
        if (isHttp(url)) return "Not encrypted";
        return "Unknown";
    }

    /**
     * Returns true if this URL should be allowed in the browser.
     * HTTP and HTTPS are both allowed when ALLOW_HTTP is true.
     * Non-web schemes (intent://, market://, etc.) are handled by app-link handoff, not here.
     */
    static boolean isAllowedWebScheme(String url) {
        if (url == null) return false;
        return isHttps(url) || (ALLOW_HTTP && isHttp(url));
    }

    /**
     * Returns true if the URL is a bare domain (no scheme) that should be
     * resolved to HTTPS by default (e.g. "example.com" → "https://example.com").
     */
    static boolean isBareDomain(String input) {
        if (input == null || input.isEmpty()) return false;
        return !input.contains("://") && input.contains(".") && !input.startsWith("file:");
    }

    /** Resolves a bare domain to HTTPS. */
    static String resolveBareDomain(String input) {
        if (isBareDomain(input)) return "https://" + input;
        return input;
    }
}
