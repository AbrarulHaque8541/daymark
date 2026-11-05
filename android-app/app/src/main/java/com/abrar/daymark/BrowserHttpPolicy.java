package com.abrar.daymark;

import java.net.URI;

/**
 * Address and transport-label policy for HTTP vs HTTPS navigation in the embedded browser.
 *
 * <p>This helper accepts HTTP and HTTPS addresses and labels the final committed URL. Actual
 * HTTP WebView loads remain blocked by the app manifest until the serialized downloader
 * integration can safely replace or contain the legacy DownloadManager path. Native app
 * clients remain HTTPS-only and enforce that policy in their own transports.
 */
final class BrowserHttpPolicy {
    static final boolean ALLOW_HTTP = true;

    private BrowserHttpPolicy() {}

    /** Returns true if the supplied URL is a valid HTTP page URL with a host. */
    static boolean isHttp(String url) {
        return hasWebSchemeAndHost(url, "http");
    }

    /** Returns true if the supplied URL is a valid HTTPS page URL with a host. */
    static boolean isHttps(String url) {
        return hasWebSchemeAndHost(url, "https");
    }

    /**
     * Returns the transport label for a committed page URL. Call this with WebView's final
     * URL after navigation completes, not the user's pre-redirect address.
     */
    static String securityLabel(String committedUrl) {
        if (isHttps(committedUrl)) return "Encrypted";
        if (isHttp(committedUrl)) return "Not encrypted";
        return "Unknown";
    }

    /**
     * HTTP and HTTPS are both browser schemes when ALLOW_HTTP is true. Other schemes are
     * handled separately by the app-link handoff and are not page navigations here.
     */
    static boolean isAllowedWebScheme(String url) {
        if (url == null) return false;
        String candidate = url.trim();
        return hasScheme(candidate, "https") || (ALLOW_HTTP && hasScheme(candidate, "http"));
    }

    /**
     * Blocks only an HTTPS-to-HTTP redirect of the top-level document. The browser policy
     * permits explicit HTTP and HTTP-to-HTTPS redirects; Android runtime cleartext remains
     * disabled in the manifest pending safe app-wide integration.
     */
    static boolean shouldBlockTopLevelRedirect(String currentUrl, String targetUrl,
                                               boolean mainFrame, boolean redirect) {
        return mainFrame && redirect && isHttps(currentUrl) && isHttp(targetUrl);
    }

    /**
     * Returns true if this URL is a bare domain (no scheme) that should be resolved to
     * HTTPS by default (e.g. "example.com" becomes "https://example.com").
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

    private static boolean hasWebSchemeAndHost(String value, String expectedScheme) {
        if (value == null || value.trim().isEmpty()) return false;
        try {
            URI uri = new URI(value.trim());
            return expectedScheme.equalsIgnoreCase(uri.getScheme())
                    && uri.getHost() != null && !uri.getHost().trim().isEmpty()
                    && uri.getRawUserInfo() == null;
        } catch (Exception invalid) {
            return false;
        }
    }

    private static boolean hasScheme(String value, String expectedScheme) {
        if (value == null) return false;
        int separator = expectedScheme.length();
        return value.length() > separator + 2
                && value.regionMatches(true, 0, expectedScheme, 0, separator)
                && value.regionMatches(false, separator, "://", 0, 3);
    }
}
