package com.abrar.daymark;

/**
 * Policy for HTTP vs HTTPS navigation in the embedded browser.
 *
 * <p>Contributes to #348 P0 "Support HTTP and HTTPS deliberately":
 * - Explicitly entered HTTP URLs are allowed (not silently rewritten to HTTPS)
 * - Each active HTTP page keeps a persistent "Not encrypted" marker in the browser UI
 * - Transient status messages continue to explain the HTTP transport state
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
     * Non-web scheme routing is handled separately by the browser URI policies, not here.
     */
    static boolean isAllowedWebScheme(String url) {
        if (url == null) return false;
        return isHttps(url) || (ALLOW_HTTP && isHttp(url));
    }

    /**
     * Returns true if the input is a bare web host (no scheme) that should be
     * resolved to HTTPS by default: domains, IPv4/IPv6 literals, or localhost.
     */
    static boolean isBareDomain(String input) {
        if (input == null) return false;
        String candidate = input.trim();
        if (candidate.isEmpty() || candidate.contains("://") || candidate.startsWith("file:")
                || candidate.indexOf('@') >= 0
                || candidate.chars().anyMatch(Character::isWhitespace)) return false;
        int end = candidate.length();
        for (char delimiter : new char[]{'/', '?', '#'}) {
            int index = candidate.indexOf(delimiter);
            if (index >= 0 && index < end) end = index;
        }
        String authority = candidate.substring(0, end);
        return authority.contains(".") || authority.startsWith("[")
                || authority.matches("(?i)^localhost(?::[0-9]{1,5})?$");
    }

    /** Resolves a bare domain to HTTPS. */
    static String resolveBareDomain(String input) {
        if (isBareDomain(input)) return "https://" + input;
        return input;
    }
}
