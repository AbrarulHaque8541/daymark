package com.abrar.daymark;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.Map;

/** Deterministic host regressions for browser download redirect policy. */
public final class BrowserDownloadRedirectPolicySmoke {
    private BrowserDownloadRedirectPolicySmoke() { }

    public static void main(String[] args) throws Exception {
        BrowserDownloadRedirectPolicy.HostResolver resolver = host -> {
            if (host.matches("[0-9.]+") || host.indexOf(':') >= 0) return new InetAddress[]{ip(host)};
            switch (host) {
                case "mixed.example.net":
                    return new InetAddress[]{ip("8.8.8.8"), ip("192.168.1.5")};
                case "private.example.net": return new InetAddress[]{ip("10.1.2.3")};
                case "loopback.example.net": return new InetAddress[]{ip("127.0.0.1")};
                case "linklocal.example.net": return new InetAddress[]{ip("169.254.10.2")};
                case "shared.example.net": return new InetAddress[]{ip("100.64.0.1")};
                case "ipv6-docs.example.net": return new InetAddress[]{ip("2001:db8::1")};
                case "dns-fail.example.net": throw new UnknownHostException("secret host must not escape");
                case "empty.example.net": return new InetAddress[0];
                case "too-many.example.net": {
                    InetAddress[] many = new InetAddress[BrowserDownloadRedirectPolicy.MAX_DNS_ADDRESSES + 1];
                    Arrays.fill(many, ip("8.8.8.8"));
                    return many;
                }
                default: return new InetAddress[]{ip("8.8.8.8")};
            }
        };

        BrowserDownloadRedirectPolicy.Hop initial = start("https://example.com/download#client-fragment", resolver);
        check(initial.redirectsFollowed == 0, "initial hop starts at redirect count zero");
        check(initial.validatedAddresses.size() == 1
                        && initial.validatedAddresses.get(0).getHostAddress().equals("8.8.8.8"),
                "validated DNS addresses are retained for the connector to pin");
        check(!initial.url.contains("#"), "client-only fragments are removed before transport");
        try {
            initial.validatedAddresses.add(ip("1.1.1.1"));
            throw new AssertionError("validated DNS address list must be immutable");
        } catch (UnsupportedOperationException expected) { }

        BrowserDownloadRedirectPolicy.Hop relative = redirect(initial, 302, "../files/report.pdf", resolver);
        check(relative.url.equals("https://example.com/files/report.pdf"),
                "relative Location resolves against the previous URL");
        check(relative.redirectsFollowed == 1, "redirect count increments exactly once");

        BrowserDownloadRedirectPolicy.Hop crossOrigin = redirect(relative, 307,
                "https://cdn.example.net/file.bin", resolver);
        check(crossOrigin.url.equals("https://cdn.example.net/file.bin"),
                "cross-origin HTTPS redirect is allowed when the destination is public");
        check(!BrowserDownloadRedirectPolicy.shouldForwardCookies(relative, crossOrigin),
                "cookies are not forwarded across origins");
        check(!BrowserDownloadRedirectPolicy.shouldForwardCookies(null, crossOrigin),
                "cookies are not forwarded without validated source and target hops");
        check(BrowserDownloadRedirectPolicy.shouldForwardCookies(initial, relative),
                "same-origin comparison normalizes host case and default HTTPS ports");
        BrowserDownloadRedirectPolicy.Hop httpHop = start("http://example.com/a", resolver);
        check(!BrowserDownloadRedirectPolicy.shouldForwardCookies(httpHop, initial),
                "scheme change is a different origin");
        BrowserDownloadRedirectPolicy.Hop nonDefaultPort = start("https://example.com:8443/a", resolver);
        check(!BrowserDownloadRedirectPolicy.shouldForwardCookies(nonDefaultPort, initial),
                "non-default ports are part of the origin");

        Map<String, String> sameOriginHeaders = BrowserDownloadRedirectPolicy.redirectRequestHeaders(
                initial, relative, "Daymark/1", "application/pdf", "sid=one");
        check("sid=one".equals(sameOriginHeaders.get("Cookie")),
                "same-origin redirect may use target-origin cookies");
        Map<String, String> crossOriginHeaders = BrowserDownloadRedirectPolicy.redirectRequestHeaders(
                relative, crossOrigin, "Daymark/1", "application/pdf", "sid=one");
        check(!crossOriginHeaders.containsKey("Cookie"), "cross-origin redirect strips cookies");
        check("identity".equals(crossOriginHeaders.get("Accept-Encoding")),
                "transport requests identity encoding so byte caps apply to the received representation");
        check(!crossOriginHeaders.containsKey("Referer") && !crossOriginHeaders.containsKey("Authorization")
                        && !crossOriginHeaders.containsKey("Proxy-Authorization")
                        && !crossOriginHeaders.containsKey("Origin"),
                "ambient credentials, referrer and origin are never copied");
        Map<String, String> initialHeaders = BrowserDownloadRedirectPolicy.initialRequestHeaders(
                initial, "Daymark/1", "application/octet-stream", "sid=initial");
        check("sid=initial".equals(initialHeaders.get("Cookie")),
                "first-hop cookies are explicitly scoped to the requested download URL");
        Map<String, String> hostileHeaders = BrowserDownloadRedirectPolicy.initialRequestHeaders(
                initial, "Daymark/1\r\nAuthorization: evil", "application/pdf", "sid=ok\r\nX-Evil: yes");
        check(!hostileHeaders.containsKey("User-Agent") && !hostileHeaders.containsKey("Cookie"),
                "header values with control characters are dropped");

        for (int status : new int[]{301, 302, 303, 307, 308}) {
            check(BrowserDownloadRedirectPolicy.isSupportedRedirectStatus(status),
                    "supported redirect status " + status);
        }
        for (int status : new int[]{200, 201, 300, 304, 305, 399, 400}) {
            check(!BrowserDownloadRedirectPolicy.isSupportedRedirectStatus(status),
                    "unsupported redirect status " + status);
        }

        rejects(BrowserDownloadRedirectPolicy.Rejection.NETWORK_DISABLED, () -> BrowserDownloadRedirectPolicy.start(
                "https://example.com/file", false, resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.INVALID_URL, () -> BrowserDownloadRedirectPolicy.start(
                "https://user:pass@example.com/file", true, resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.INVALID_URL, () -> BrowserDownloadRedirectPolicy.start(
                "javascript:alert(1)", true, resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.RESERVED_HOST, () -> start("https://localhost/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.RESERVED_HOST, () -> start("https://printer.local/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.RESERVED_HOST, () -> start("https://service.internal/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.RESERVED_HOST, () -> start("https://unit.test/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.RESERVED_HOST, () -> start("https://docs.example/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.RESERVED_HOST, () -> start("https://host.invalid/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.RESERVED_HOST, () -> start("https://hidden.onion/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.RESERVED_HOST, () -> start("https://intranet/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.RESERVED_HOST, () -> start("https://router.home.arpa/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://private.example.net/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://loopback.example.net/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://linklocal.example.net/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://shared.example.net/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://mixed.example.net/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://ipv6-docs.example.net/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.DNS_FAILED, () -> start("https://dns-fail.example.net/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.DNS_FAILED, () -> start("https://empty.example.net/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.DNS_FAILED, () -> start("https://too-many.example.net/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://127.0.0.1/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("http://192.168.1.1/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://[::1]/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://[fc00::1]/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://[fe80::1]/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://[2001:db8::1]/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://[2002::1]/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://192.0.2.1/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://198.51.100.1/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://203.0.113.1/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://100.64.0.1/file", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSAFE_ADDRESS, () -> start("https://224.0.0.1/file", resolver));

        BrowserDownloadRedirectPolicy.Hop https = start("https://example.com/file", resolver);
        rejects(BrowserDownloadRedirectPolicy.Rejection.HTTPS_DOWNGRADE, () -> redirect(https, 302, "http://example.com/file2", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.NETWORK_DISABLED, () ->
                BrowserDownloadRedirectPolicy.redirect(https, 302, "/next", false, resolver));
        BrowserDownloadRedirectPolicy.Hop http = start("http://example.com/file", resolver);
        BrowserDownloadRedirectPolicy.Hop upgraded = redirect(http, 301, "https://example.com/file", resolver);
        check("https://example.com/file".equals(upgraded.url), "HTTP may upgrade to HTTPS");
        rejects(BrowserDownloadRedirectPolicy.Rejection.UNSUPPORTED_REDIRECT_STATUS, () -> redirect(https, 300, "/next", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.MISSING_LOCATION, () -> redirect(https, 302, "  ", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.INVALID_URL, () -> redirect(https, 302, "javascript:alert(1)", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.INVALID_URL, () -> redirect(https, 302, "https://user:pass@example.com/", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.INVALID_URL, () -> redirect(https, 302, "https://bad host/", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.REDIRECT_LOOP, () -> redirect(https, 302, "https://EXAMPLE.com:443/file#different", resolver));
        rejects(BrowserDownloadRedirectPolicy.Rejection.REDIRECT_LOOP, () -> redirect(
                start("https://example.com/a/b", resolver), 302, "../a/./b", resolver));
        BrowserDownloadRedirectPolicy.Hop dotBase = start("https://example.com/a/b", resolver);
        BrowserDownloadRedirectPolicy.Hop encodedDot = redirect(dotBase, 302, "%2e%2e/files", resolver);
        check("https://example.com/files".equals(encodedDot.url),
                "encoded dot segments are normalized before transport");
        rejects(BrowserDownloadRedirectPolicy.Rejection.REDIRECT_LOOP, () -> redirect(
                dotBase, 302, "%2e%2e/a/b", resolver));

        BrowserDownloadRedirectPolicy.Hop chain = start("https://example.com/0", resolver);
        for (int i = 1; i <= BrowserDownloadRedirectPolicy.MAX_REDIRECTS; i++) {
            chain = redirect(chain, 302, "/" + i, resolver);
        }
        check(chain.redirectsFollowed == BrowserDownloadRedirectPolicy.MAX_REDIRECTS,
                "exactly the configured maximum redirect hops are allowed");
        BrowserDownloadRedirectPolicy.Hop finalChain = chain;
        rejects(BrowserDownloadRedirectPolicy.Rejection.TOO_MANY_REDIRECTS, () -> redirect(finalChain, 302, "/extra", resolver));

        System.out.println("BrowserDownloadRedirectPolicySmoke PASS");
    }

    private static BrowserDownloadRedirectPolicy.Hop start(String url,
            BrowserDownloadRedirectPolicy.HostResolver resolver) throws Exception {
        return BrowserDownloadRedirectPolicy.start(url, true, resolver);
    }

    private static BrowserDownloadRedirectPolicy.Hop redirect(BrowserDownloadRedirectPolicy.Hop previous,
            int status, String location, BrowserDownloadRedirectPolicy.HostResolver resolver) throws Exception {
        return BrowserDownloadRedirectPolicy.redirect(previous, status, location, true, resolver);
    }

    private static InetAddress ip(String value) throws UnknownHostException {
        return InetAddress.getByName(value);
    }

    private static void rejects(BrowserDownloadRedirectPolicy.Rejection expected,
                                 ThrowingCall call) throws Exception {
        try {
            call.run();
        } catch (BrowserDownloadRedirectPolicy.PolicyException actual) {
            check(actual.rejection == expected,
                    "expected " + expected + " but got " + actual.rejection);
            check(!actual.getMessage().contains("example.com") && !actual.getMessage().contains("token"),
                    "policy exception must not disclose URLs or tokens");
            return;
        }
        throw new AssertionError("Expected rejection: " + expected);
    }

    private interface ThrowingCall { void run() throws Exception; }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}