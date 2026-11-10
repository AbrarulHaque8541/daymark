package com.abrar.daymark;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Pure policy for a Daymark-owned browser download transport.
 *
 * <p>This class does not open sockets or write files. Every returned Hop contains the exact
 * public addresses that were resolved and validated for that URL. The eventual connector MUST
 * connect to one of those addresses directly (while retaining the original host for HTTP Host,
 * TLS SNI, and certificate verification); it must never pass Hop.url to URLConnection or perform
 * a second DNS lookup, which would reintroduce a DNS-rebinding/TOCTOU gap.
 *
 * <p>Each redirect call receives a fresh network-policy decision. The caller must re-read the
 * browser's online/offline setting before every request and redirect.
 *
 * <p>URLs and query strings may contain credentials or one-time tokens. Do not log Hop.url,
 * Location values, cookie headers, or exception causes.
 */
final class BrowserDownloadRedirectPolicy {
    static final int MAX_REDIRECTS = 5;
    static final int MAX_URL_LENGTH = 2056;
    static final int MAX_DNS_ADDRESSES = 16;

    private BrowserDownloadRedirectPolicy() { }

    interface HostResolver {
        InetAddress[] resolve(String host) throws UnknownHostException;
    }

    static final HostResolver SYSTEM_RESOLVER = InetAddress::getAllByName;

    enum Rejection {
        NETWORK_DISABLED,
        INVALID_URL,
        UNSUPPORTED_REDIRECT_STATUS,
        MISSING_LOCATION,
        TOO_MANY_REDIRECTS,
        REDIRECT_LOOP,
        HTTPS_DOWNGRADE,
        RESERVED_HOST,
        DNS_FAILED,
        UNSAFE_ADDRESS
    }

    static final class PolicyException extends Exception {
        final Rejection rejection;

        PolicyException(Rejection rejection) {
            // Deliberately omit URL/host/Location details: these may contain secrets.
            super("Browser download request rejected by redirect policy: " + rejection.name());
            this.rejection = rejection;
        }
    }

    static final class Hop {
        final String url;
        final List<InetAddress> validatedAddresses;
        final int redirectsFollowed;
        private final Set<String> visited;

        private Hop(String url, List<InetAddress> validatedAddresses,
                    int redirectsFollowed, Set<String> visited) {
            this.url = url;
            this.validatedAddresses = Collections.unmodifiableList(
                    new ArrayList<>(validatedAddresses));
            this.redirectsFollowed = redirectsFollowed;
            this.visited = Collections.unmodifiableSet(new HashSet<>(visited));
        }
    }

    static Hop start(String initialUrl, boolean remoteLoadsAllowed, HostResolver resolver)
            throws PolicyException {
        if (!remoteLoadsAllowed) throw new PolicyException(Rejection.NETWORK_DISABLED);
        String safeUrl = normalizeWebUrl(initialUrl);
        URI uri = parseUri(safeUrl);
        List<InetAddress> addresses = resolvePublicAddresses(uri.getHost(), resolver);
        Set<String> visited = new HashSet<>();
        visited.add(loopKey(uri));
        return new Hop(safeUrl, addresses, 0, visited);
    }

    static Hop redirect(Hop previous, int statusCode, String location,
                        boolean remoteLoadsAllowed, HostResolver resolver)
            throws PolicyException {
        if (previous == null) throw new PolicyException(Rejection.INVALID_URL);
        if (!isSupportedRedirectStatus(statusCode)) {
            throw new PolicyException(Rejection.UNSUPPORTED_REDIRECT_STATUS);
        }
        if (location == null || location.trim().isEmpty()) {
            throw new PolicyException(Rejection.MISSING_LOCATION);
        }
        if (!remoteLoadsAllowed) throw new PolicyException(Rejection.NETWORK_DISABLED);
        if (previous.redirectsFollowed >= MAX_REDIRECTS) {
            throw new PolicyException(Rejection.TOO_MANY_REDIRECTS);
        }

        final URI resolved;
        try {
            String trimmed = location.trim();
            if (trimmed.length() > MAX_URL_LENGTH) {
                throw new IllegalArgumentException("Location too long");
            }
            URI reference = new URI(trimmed);
            resolved = parseUri(previous.url).resolve(reference).normalize();
        } catch (Exception invalidLocation) {
            throw new PolicyException(Rejection.INVALID_URL);
        }

        String nextUrl = normalizeWebUrl(resolved.toString());
        URI next = parseUri(nextUrl);
        URI current = parseUri(previous.url);
        if ("https".equalsIgnoreCase(current.getScheme())
                && "http".equalsIgnoreCase(next.getScheme())) {
            throw new PolicyException(Rejection.HTTPS_DOWNGRADE);
        }

        String key = loopKey(next);
        if (previous.visited.contains(key)) {
            throw new PolicyException(Rejection.REDIRECT_LOOP);
        }
        List<InetAddress> addresses = resolvePublicAddresses(next.getHost(), resolver);
        Set<String> visited = new HashSet<>(previous.visited);
        visited.add(key);
        return new Hop(nextUrl, addresses, previous.redirectsFollowed + 1, visited);
    }

    static boolean isSupportedRedirectStatus(int statusCode) {
        return statusCode == 301 || statusCode == 302 || statusCode == 303
                || statusCode == 307 || statusCode == 308;
    }

    /** Cookies may be fetched for a redirect target only when it remains same-origin. */
    static boolean shouldForwardCookies(Hop from, Hop to) {
        return from != null && to != null && shouldForwardCookies(from.url, to.url);
    }

    private static boolean shouldForwardCookies(String fromUrl, String toUrl) {
        try {
            URI from = parseUri(normalizeWebUrl(fromUrl));
            URI to = parseUri(normalizeWebUrl(toUrl));
            return sameOrigin(from, to);
        } catch (PolicyException invalid) {
            return false;
        }
    }

    /**
     * Builds the only headers permitted on the first request. CookieManager cookies are
     * explicitly scoped to the requested download URL; ambient WebView Authorization,
     * Referer, Origin, Proxy-Authorization and caller-supplied arbitrary headers are never copied.
     */
    static Map<String, String> initialRequestHeaders(Hop target, String userAgent,
                                                     String accept, String cookiesForTarget) {
        if (target == null) throw new IllegalArgumentException("A validated download hop is required.");
        return requestHeaders(userAgent, accept, cookiesForTarget, true);
    }

    /**
     * Builds headers for a redirect hop. The caller must obtain cookies for the new URL only
     * when this method's same-origin rule allows them; no previous-hop cookie is forwarded
     * across an origin boundary.
     */
    static Map<String, String> redirectRequestHeaders(Hop from, Hop to,
                                                      String userAgent, String accept,
                                                      String cookiesForTarget) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("Validated source and target hops are required.");
        }
        return requestHeaders(userAgent, accept, cookiesForTarget,
                shouldForwardCookies(from, to));
    }

    private static Map<String, String> requestHeaders(String userAgent, String accept,
                                                       String cookies, boolean allowCookies) {
        Map<String, String> headers = new LinkedHashMap<>();
        addHeader(headers, "User-Agent", userAgent, 1024);
        addHeader(headers, "Accept", accept, 512);
        // Do not let an unbounded/decompressed representation bypass the transport byte cap.
        headers.put("Accept-Encoding", "identity");
        if (allowCookies) addHeader(headers, "Cookie", cookies, 8192);
        return Collections.unmodifiableMap(headers);
    }

    private static void addHeader(Map<String, String> headers, String name,
                                  String value, int maxLength) {
        if (value == null || value.isEmpty() || value.length() > maxLength) return;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '\r' || c == '\n' || c == 0 || (c < 0x20 && c != '\t') || c == 0x7f) {
                return;
            }
        }
        headers.put(name, value);
    }

    private static String normalizeWebUrl(String value) throws PolicyException {
        if (value == null || value.trim().isEmpty() || value.length() > MAX_URL_LENGTH) {
            throw new PolicyException(Rejection.INVALID_URL);
        }
        try {
            String validated = BrowserAddress.requireAllowedWebUrl(value.trim());
            URI uri = new URI(validated).normalize();
            if (uri.getRawUserInfo() != null || uri.getHost() == null || uri.getHost().isEmpty()) {
                throw new IllegalArgumentException("Invalid authority");
            }
            String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
            String host = canonicalHost(uri.getHost());
            String authority = host.indexOf(':') >= 0 ? "[" + host + "]" : host;
            int port = uri.getPort();
            if (("https".equals(scheme) && port == 443) || ("http".equals(scheme) && port == 80)) {
                port = -1;
            }
            if (port >= 0) authority += ":" + port;
            String path = normalizeRawPath(uri.getRawPath());
            StringBuilder result = new StringBuilder(scheme).append("://").append(authority).append(path);
            if (uri.getRawQuery() != null) result.append('?').append(uri.getRawQuery());
            String normalized = result.toString();
            if (normalized.length() > MAX_URL_LENGTH) throw new IllegalArgumentException("URL too long");
            // Parse the rebuilt raw URL once more so malformed escapes/authorities cannot pass.
            URI checked = new URI(normalized);
            if (checked.getHost() == null || checked.getRawUserInfo() != null) {
                throw new IllegalArgumentException("Invalid normalized URL");
            }
            return checked.toASCIIString();
        } catch (Exception invalid) {
            throw new PolicyException(Rejection.INVALID_URL);
        }
    }

    private static String normalizeRawPath(String rawPath) {
        if (rawPath == null || rawPath.isEmpty()) return "/";
        String[] segments = rawPath.split("/", -1);
        List<String> output = new ArrayList<>();
        boolean trailingSlash = rawPath.endsWith("/");
        for (int i = 0; i < segments.length; i++) {
            if (i == 0 && rawPath.startsWith("/")) continue;
            String segment = segments[i];
            String dotProbe = segment.replaceAll("(?i)%2e", ".");
            if (".".equals(dotProbe)) {
                if (i == segments.length - 1) trailingSlash = true;
                continue;
            }
            if ("..".equals(dotProbe)) {
                if (!output.isEmpty()) output.remove(output.size() - 1);
                if (i == segments.length - 1) trailingSlash = true;
                continue;
            }
            output.add(segment);
        }
        StringBuilder normalized = new StringBuilder("/");
        for (int i = 0; i < output.size(); i++) {
            if (i > 0) normalized.append('/');
            normalized.append(output.get(i));
        }
        if (trailingSlash && normalized.charAt(normalized.length() - 1) != '/') normalized.append('/');
        return normalized.toString();
    }

    private static URI parseUri(String value) throws PolicyException {
        try {
            URI uri = new URI(value);
            if (!BrowserHttpPolicy.isAllowedWebScheme(value) || uri.getHost() == null
                    || uri.getRawUserInfo() != null) {
                throw new IllegalArgumentException("Invalid web URI");
            }
            return uri;
        } catch (Exception invalid) {
            throw new PolicyException(Rejection.INVALID_URL);
        }
    }

    private static String loopKey(URI uri) throws PolicyException {
        return normalizeWebUrl(uri.toString());
    }

    private static boolean sameOrigin(URI left, URI right) {
        return left.getScheme().equalsIgnoreCase(right.getScheme())
                && canonicalHost(left.getHost()).equals(canonicalHost(right.getHost()))
                && effectivePort(left) == effectivePort(right);
    }

    private static int effectivePort(URI uri) {
        if (uri.getPort() >= 0) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private static String canonicalHost(String host) {
        String value = host == null ? "" : host.toLowerCase(Locale.ROOT);
        if (value.startsWith("[") && value.endsWith("]")) {
            value = value.substring(1, value.length() - 1);
        }
        while (value.endsWith(".")) value = value.substring(0, value.length() - 1);
        return value;
    }

    private static List<InetAddress> resolvePublicAddresses(String rawHost, HostResolver resolver)
            throws PolicyException {
        if (resolver == null) throw new PolicyException(Rejection.DNS_FAILED);
        String host = canonicalHost(rawHost);
        if (host.isEmpty() || isReservedHostName(host)
                || (host.indexOf('.') < 0 && host.indexOf(':') < 0)) {
            throw new PolicyException(Rejection.RESERVED_HOST);
        }
        final InetAddress[] resolved;
        try {
            resolved = resolver.resolve(host);
        } catch (UnknownHostException | RuntimeException failure) {
            throw new PolicyException(Rejection.DNS_FAILED);
        }
        if (resolved == null || resolved.length == 0 || resolved.length > MAX_DNS_ADDRESSES) {
            throw new PolicyException(Rejection.DNS_FAILED);
        }
        List<InetAddress> addresses = new ArrayList<>();
        for (InetAddress address : resolved) {
            if (address == null || !isPubliclyRoutable(address)) {
                // Reject the entire DNS answer if even one address is unsafe; never select only
                // the public member of a mixed public/private response.
                throw new PolicyException(Rejection.UNSAFE_ADDRESS);
            }
            addresses.add(address);
        }
        return addresses;
    }

    private static boolean isReservedHostName(String host) {
        return "localhost".equals(host)
                || host.endsWith(".localhost")
                || host.endsWith(".local")
                || host.endsWith(".internal")
                || host.endsWith(".test")
                || host.endsWith(".example")
                || host.endsWith(".invalid")
                || host.endsWith(".onion")
                || "alt".equals(host)
                || host.endsWith(".alt") // RFC 9476 special-use namespace; do not send to DNS.
                || "home.arpa".equals(host)
                || host.endsWith(".home.arpa");
    }

    private static boolean isPubliclyRoutable(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress()
                || address.isLinkLocalAddress() || address.isSiteLocalAddress()
                || address.isMulticastAddress()) return false;
        byte[] bytes = address.getAddress();
        if (address instanceof Inet4Address || bytes.length == 4) {
            return isPublicIpv4(bytes);
        }
        if (!(address instanceof Inet6Address) || bytes.length != 16) return false;

        if (isIpv4Mapped(bytes)) {
            byte[] ipv4 = new byte[]{bytes[12], bytes[13], bytes[14], bytes[15]};
            return isPublicIpv4(ipv4);
        }

        // Only global-unicast 2000::/3 is eligible. This excludes unspecified, loopback,
        // link-local, unique-local, site-local, multicast and most special-purpose ranges.
        if ((bytes[0] & 0xe0) != 0x20) return false;
        // IETF protocol assignments/Teredo (2001:0000::/23), benchmarking (2001:0002::/48),
        // documentation (2001:db8::/32), ORCHID (2001:0010::/28 and 2001:0020::/28),
        // 6to4 (2002::/16), and documentation (3fff::/20).
        if ((bytes[0] & 0xff) == 0x20 && (bytes[1] & 0xff) == 0x01) {
            if ((bytes[2] & 0xfe) == 0x00) return false;
            if ((bytes[2] & 0xff) == 0x00 && ((bytes[3] & 0xf0) == 0x10
                    || (bytes[3] & 0xf0) == 0x20)) return false;
            if ((bytes[2] & 0xff) == 0x0d && (bytes[3] & 0xff) == 0xb8) return false;
            if ((bytes[2] & 0xff) == 0x00 && (bytes[3] & 0xff) == 0x02) return false;
        }
        if ((bytes[0] & 0xff) == 0x20 && (bytes[1] & 0xff) == 0x02) return false;
        if ((bytes[0] & 0xff) == 0x3f && (bytes[1] & 0xff) == 0xff
                && (bytes[2] & 0xf0) == 0x00) return false;
        return true;
    }

    private static boolean isIpv4Mapped(byte[] bytes) {
        for (int i = 0; i < 10; i++) if (bytes[i] != 0) return false;
        return (bytes[10] & 0xff) == 0xff && (bytes[11] & 0xff) == 0xff;
    }

    private static boolean isPublicIpv4(byte[] bytes) {
        if (bytes == null || bytes.length != 4) return false;
        int a = bytes[0] & 0xff;
        int b = bytes[1] & 0xff;
        int c = bytes[2] & 0xff;
        if (a == 0 || a == 10 || a == 127 || a >= 224) return false;
        if (a == 100 && b >= 64 && b <= 127) return false; // shared address space
        if (a == 169 && b == 254) return false; // link-local
        if (a == 172 && b >= 16 && b <= 31) return false; // private
        if (a == 192 && b == 168) return false; // private
        if (a == 192 && b == 0 && c == 0) return false; // IETF special-purpose
        if (a == 192 && b == 0 && c == 2) return false; // documentation
        if (a == 192 && b == 88 && c == 99) return false; // deprecated 6to4 relay
        if (a == 198 && (b == 18 || b == 19)) return false; // benchmarking
        if (a == 198 && b == 51 && c == 100) return false; // documentation
        if (a == 203 && b == 0 && c == 113) return false; // documentation
        return true;
    }
}