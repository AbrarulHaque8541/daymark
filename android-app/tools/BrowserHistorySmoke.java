package com.abrar.daymark;

import java.util.Arrays;
import java.util.List;

/**
 * Host regression smoke for the origin-only local site history policy.
 * History stores validated HTTP/HTTPS origins only: no paths, queries,
 * fragments, userinfo, or titles, capped at MAX_ENTRIES, newest first.
 */
public final class BrowserHistorySmoke {
    private static int assertions;

    private BrowserHistorySmoke() { }

    public static void main(String[] args) {
        sanitizeUrlKeepsOnlyOrigins();
        normalizeInternationalizedHosts();
        encodeDecodeRoundTripAndBounds();
        addDedupesAndCapsAtFifty();
        removeFilterAndClear();
        System.out.println("PASS BrowserHistory smoke: " + assertions + " assertions");
    }

    private static void sanitizeUrlKeepsOnlyOrigins() {
        check("https://example.com".equals(BrowserHistory.sanitizeUrl("https://Example.COM/Path?q=1#f")),
                "scheme, host case, path, query, and fragment reduce to the origin");
        check("http://example.com".equals(BrowserHistory.sanitizeUrl("http://example.com:80/")),
                "the default HTTP port is dropped");
        check("https://example.com".equals(BrowserHistory.sanitizeUrl("https://example.com:443")),
                "the default HTTPS port is dropped");
        check("https://example.com:8443".equals(BrowserHistory.sanitizeUrl("https://example.com:8443/x")),
                "a non-default port is kept and the path is dropped");
        check("https://example.org".equals(BrowserHistory.sanitizeUrl("HTTPS://EXAMPLE.ORG")),
                "uppercase scheme and host normalize to a lowercase origin");
        check("https://[::1]:8443".equals(BrowserHistory.sanitizeUrl("https://[::1]:8443/")),
                "IPv6 literal hosts keep their brackets and non-default port");
        check(BrowserHistory.sanitizeUrl("ftp://example.com/") == null, "non-web schemes are rejected");
        check(BrowserHistory.sanitizeUrl("javascript:alert(1)") == null, "script schemes are rejected");
        check(BrowserHistory.sanitizeUrl("file:///etc/passwd") == null, "file URLs are rejected");
        check(BrowserHistory.sanitizeUrl("https://example.com:0/") == null, "port zero is rejected");
        check(BrowserHistory.sanitizeUrl("https://example.com:70000/") == null, "ports above 65535 are rejected");
        check(BrowserHistory.sanitizeUrl("not a url") == null, "relative junk is rejected");
        check(BrowserHistory.sanitizeUrl("") == null && BrowserHistory.sanitizeUrl(null) == null,
                "blank and null input are rejected");
    }

    private static void normalizeInternationalizedHosts() {
        check("https://xn--bcher-kva.de".equals(
                        BrowserHistory.sanitizeUrl("https://bücher.de/Path?q=secret#fragment")),
                "Unicode DNS names are canonicalized to punycode without retaining path/query/fragment");
        check("https://xn--bcher-kva.de".equals(
                        BrowserHistory.sanitizeUrl("https://XN--BCHER-KVA.DE/")),
                "ASCII punycode and Unicode IDN visits share one canonical history origin");
        check("https://xn--bcher-kva.de:8443".equals(
                        BrowserHistory.sanitizeUrl("https://user:pass@bücher.de:8443/path")),
                "userinfo is stripped and a non-default port survives IDN canonicalization");
        check("https://xn--bcher-kva.de".equals(
                        BrowserHistory.sanitizeUrl("https://bücher.de.:443/")),
                "a single DNS root dot and default HTTPS port normalize away");
        check(BrowserHistory.sanitizeUrl("https://bücher.de..") == null,
                "multiple trailing DNS root dots are rejected");
        check(BrowserHistory.sanitizeUrl("https://bücher.de:0/") == null,
                "zero port is rejected for Unicode hosts");
        check(BrowserHistory.sanitizeUrl("https://bücher.de:65536/") == null,
                "out-of-range port is rejected for Unicode hosts");
        check(BrowserHistory.sanitizeUrl("https://bücher.de:/") == null,
                "empty explicit port is rejected for Unicode hosts");
        check(BrowserHistory.sanitizeUrl("https://" + "ü".repeat(64) + ".example/") == null,
                "overlong IDN label is rejected");
        String deduped = BrowserHistory.add(
                BrowserHistory.add("", "https://xn--bcher-kva.de/one"),
                "https://bücher.de/two");
        check(BrowserHistory.decode(deduped).equals(List.of("https://xn--bcher-kva.de")),
                "Unicode and punycode visits deduplicate to one privacy-safe origin");
    }

    private static void encodeDecodeRoundTripAndBounds() {
        List<String> entries = Arrays.asList("https://b.example", "https://a.example");
        String encoded = BrowserHistory.encode(entries);
        check(BrowserHistory.decode(encoded).equals(entries), "encode/decode round-trips origins in order");
        check(BrowserHistory.decode(null).isEmpty() && BrowserHistory.decode("").isEmpty(),
                "empty or null serialized history decodes to an empty list");
        check(BrowserHistory.decode("!!!not-base64!!!\n" + encoded).equals(entries),
                "undecodable lines are ignored without failing startup");
        List<String> overCap = new java.util.ArrayList<>();
        for (int i = 0; i < BrowserHistory.MAX_ENTRIES + 10; i++) {
            overCap.add("https://host" + i + ".example");
        }
        check(BrowserHistory.decode(BrowserHistory.encode(overCap)).size() == BrowserHistory.MAX_ENTRIES,
                "history is capped at fifty entries");
        check(BrowserHistory.sanitizeSerialized(encoded).equals(encoded),
                "sanitizeSerialized is idempotent for valid history");
    }

    private static void addDedupesAndCapsAtFifty() {
        String history = BrowserHistory.add(BrowserHistory.add("", "https://a.example/page"),
                "https://b.example");
        check(BrowserHistory.decode(history).equals(Arrays.asList("https://b.example", "https://a.example")),
                "add prepends the newest origin");
        String reopened = BrowserHistory.add(history, "https://a.example/other");
        check(BrowserHistory.decode(reopened).equals(Arrays.asList("https://a.example", "https://b.example")),
                "reopening an origin moves it to the front instead of duplicating it");
        expectIllegalArgument(() -> BrowserHistory.add("", "javascript:alert(1)"),
                "non-web URLs cannot be saved to history");
        String full = "";
        for (int i = 0; i < BrowserHistory.MAX_ENTRIES; i++) {
            full = BrowserHistory.add(full, "https://host" + i + ".example");
        }
        String capped = BrowserHistory.add(full, "https://new.example");
        List<String> decoded = BrowserHistory.decode(capped);
        check(decoded.size() == BrowserHistory.MAX_ENTRIES && "https://new.example".equals(decoded.get(0))
                        && !decoded.contains("https://host0.example"),
                "adding past the cap keeps fifty entries and drops the oldest");
    }

    private static void removeFilterAndClear() {
        String history = BrowserHistory.add(BrowserHistory.add("", "https://Alpha.example"),
                "https://beta.example");
        check(BrowserHistory.decode(BrowserHistory.remove(history, "https://alpha.example/anything"))
                        .equals(Arrays.asList("https://beta.example")),
                "remove deletes exactly one origin regardless of path");
        List<String> entries = BrowserHistory.decode(history);
        check(BrowserHistory.filter(entries, "ALPHA").equals(Arrays.asList("https://alpha.example")),
                "filter matches case-insensitively");
        check(BrowserHistory.filter(entries, "").size() == 2 && BrowserHistory.filter(null, "x").isEmpty(),
                "blank query keeps every entry and null entries filter to empty");
        check("".equals(BrowserHistory.clear()), "clear empties the history");
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private static void expectIllegalArgument(Runnable operation, String message) {
        assertions++;
        try {
            operation.run();
            throw new AssertionError(message);
        } catch (IllegalArgumentException expected) {
            // Expected validation failure.
        }
    }
}
