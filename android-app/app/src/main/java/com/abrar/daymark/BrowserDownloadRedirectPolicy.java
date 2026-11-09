package com.abrar.daymark;

import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;
import java.util.HashSet;

/**
 * Pure policy for validating each hop of a browser download redirect chain.
 * Rejects unsafe schemes, credentials, private/loopback/reserved destinations,
 * HTTPS-to-HTTP downgrades, and excessive hops.
 */
final class BrowserDownloadRedirectPolicy {
    static final int MAX_HOPS = 8;
    static final Set<Integer> ALLOWED_REDIRECTS = Set.of(301, 302, 303, 307, 308);

    private BrowserDownloadRedirectPolicy() {}

    static boolean isAllowedRedirectStatus(int status) {
        return ALLOWED_REDIRECTS.contains(status);
    }

    static String validateUrl(String raw, String previousScheme) {
        if (raw == null || raw.trim().isEmpty()) return "empty-url";
        URI uri;
        try {
            uri = new URI(raw.trim());
        } catch (URISyntaxException e) {
            return "malformed-url";
        }
        String scheme = uri.getScheme();
        if (scheme == null) return "missing-scheme";
        scheme = scheme.toLowerCase(Locale.ROOT);
        if (!"http".equals(scheme) && !"https".equals(scheme)) return "unsupported-scheme";
        if (uri.getUserInfo() != null) return "url-userinfo";
        if ("https".equalsIgnoreCase(previousScheme) && "http".equals(scheme)) return "https-downgrade";
        String host = uri.getHost();
        if (host == null || host.isEmpty()) return "missing-host";
        if (isUnsafeHost(host)) return "unsafe-host";
        return null; // allowed
    }

    static boolean isUnsafeHost(String host) {
        if (host == null) return true;
        String h = host.toLowerCase(Locale.ROOT);
        if (h.equals("localhost") || h.equals("127.0.0.1") || h.equals("::1") || h.equals("[::1]")) return true;
        try {
            InetAddress addr = InetAddress.getByName(h);
            return addr.isLoopbackAddress() || addr.isLinkLocalAddress() || addr.isSiteLocalAddress()
                    || addr.isAnyLocalAddress() || isReserved(addr);
        } catch (Exception e) {
            return true; // fail closed on resolution failure
        }
    }

    private static boolean isReserved(InetAddress addr) {
        byte[] b = addr.getAddress();
        if (b.length == 4) {
            int a = b[0] & 0xff;
            int c = b[1] & 0xff;
            // 0.0.0.0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16, 224/4, 240/4
            return a == 0 || a == 10 || (a == 100 && (c & 0xc0) == 64)
                    || a == 127 || (a == 169 && c == 254)
                    || (a == 172 && c >= 16 && c <= 31)
                    || (a == 192 && c == 168)
                    || a >= 224;
        }
        return false;
    }
}
