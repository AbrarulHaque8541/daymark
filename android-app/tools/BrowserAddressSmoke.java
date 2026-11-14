package com.abrar.daymark;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

public final class BrowserAddressSmoke {
    public static void main(String[] args) throws Exception {
        String encoded = BrowserAddress.resolveInput("two words & notes", BrowserAddress.SearchEngine.DUCKDUCKGO);
        assert encoded.equals("https://duckduckgo.com/?q=two+words+%26+notes") : encoded;

        String google = BrowserAddress.resolveInput("weather tomorrow", BrowserAddress.SearchEngine.GOOGLE);
        assert google.startsWith("https://www.google.com/search?q=") : google;
        String brave = BrowserAddress.resolveInput("weather tomorrow", BrowserAddress.SearchEngine.BRAVE);
        assert brave.startsWith("https://search.brave.com/search?q=") : brave;
        assert BrowserAddress.resolveInput("privacy search", BrowserAddress.SearchEngine.STARTPAGE)
                .startsWith("https://www.startpage.com/sp/search?query=");
        assert BrowserAddress.resolveInput("privacy search", BrowserAddress.SearchEngine.KAGI)
                .startsWith("https://kagi.com/search?q=");
        assert BrowserAddress.resolveInput("privacy search", BrowserAddress.SearchEngine.YANDEX)
                .startsWith("https://yandex.com/search/?text=");
        String retainedProviderQuery = "y";
        assert BrowserAddress.SearchEngine.GOOGLE.searchUrl(retainedProviderQuery)
                .equals("https://www.google.com/search?q=y");
        assert BrowserAddress.SearchEngine.YANDEX.searchUrl(retainedProviderQuery)
                .equals("https://yandex.com/search/?text=y");

        assert BrowserAddress.resolveInput("example.com/path", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("https://example.com/path");
        assert BrowserAddress.resolveInput("example.com:8443/path", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("https://example.com:8443/path");
        assert BrowserAddress.resolveInput("https://example.com/a", BrowserAddress.SearchEngine.GOOGLE)
                .equals("https://example.com/a");

        // HTTP is allowed alongside HTTPS (BrowserHttpPolicy.ALLOW_HTTP=true).
        // HTTP pages show "Not encrypted" in the UI; bare domains still resolve to HTTPS.
        assert BrowserAddress.resolveInput("http://example.com", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("http://example.com") : "HTTP URLs must be accepted";
        assert BrowserAddress.resolveInput("http://example.com/after-redirect", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("http://example.com/after-redirect") : "HTTP URLs must be accepted";
        assert BrowserAddress.isAllowedWebUrl("http://example.com/") : "HTTP must be an allowed web URL";
        assert BrowserAddress.isAllowedWebUrl("http://example.com/after-redirect");
        assert BrowserAddress.isAllowedWebUrl("http://example.com:8080/path?q=1");
        assert BrowserAddress.resolveInput("http://example.com:8080", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("http://example.com:8080");

        for (String address : new String[]{"javascript:alert(1)", "data:text/html,hello",
                "file:///etc/passwd", "content://com.example/private",
                "mailto:user@example.com", "tel:+18005550100", "sms:+18005550100",
                "geo:37.7749,-122.4194", "intent://scan/#Intent;scheme=zxing;end",
                "ftp://example.com/file"}) {
            assert BrowserAddress.resolveInput(address, BrowserAddress.SearchEngine.DUCKDUCKGO)
                    .equals(address) : "explicit URI scheme must reach route selection: " + address;
        }
        for (String address : new String[]{"javascript:alert(1)", "data:text/html,hello",
                "file:///etc/passwd", "content://com.example/private", "mailto:user@example.com",
                "tel:+18005550100", "sms:+18005550100", "geo:37.7749,-122.4194",
                "intent://scan/#Intent;scheme=zxing;end", "ftp://example.com/file"}) {
            assert !BrowserAddress.isAllowedWebUrl(address)
                    : "web-only validation must remain HTTP(S)-strict: " + address;
        }
        for (String scheme : new String[]{"mailto", "tel", "sms", "geo", "ftp", "custom+scheme"}) {
            assert BrowserAddress.shouldHandOffExternalScheme(true, true, scheme) : scheme;
        }
        for (String scheme : new String[]{"http", "https", "javascript", "data", "blob", "about",
                "file", "content", "intent", "daymark-download", "", "bad scheme", null}) {
            assert !BrowserAddress.shouldHandOffExternalScheme(true, true, scheme) : scheme;
        }
        assert BrowserUriRoutingPolicy.shouldConfirmExternalHandoff(true, true, "intent");
        assert BrowserUriRoutingPolicy.routeForScheme("http") == BrowserUriRoutingPolicy.Route.WEBVIEW;
        assert BrowserUriRoutingPolicy.routeForScheme("https") == BrowserUriRoutingPolicy.Route.WEBVIEW;
        assert BrowserUriRoutingPolicy.routeForScheme("javascript") == BrowserUriRoutingPolicy.Route.WEBVIEW;
        assert BrowserUriRoutingPolicy.routeForScheme("data") == BrowserUriRoutingPolicy.Route.WEBVIEW;
        assert BrowserUriRoutingPolicy.routeForScheme("file")
                == BrowserUriRoutingPolicy.Route.LOCAL_ACCESS_RESTRICTED;
        assert BrowserUriRoutingPolicy.routeForScheme("content")
                == BrowserUriRoutingPolicy.Route.LOCAL_ACCESS_RESTRICTED;
        assert BrowserUriRoutingPolicy.routeForScheme("mailto")
                == BrowserUriRoutingPolicy.Route.EXTERNAL_CONFIRMATION;
        assert BrowserUriRoutingPolicy.routeForScheme("tel")
                == BrowserUriRoutingPolicy.Route.EXTERNAL_CONFIRMATION;
        assert BrowserUriRoutingPolicy.routeForScheme("sms")
                == BrowserUriRoutingPolicy.Route.EXTERNAL_CONFIRMATION;
        assert BrowserUriRoutingPolicy.routeForScheme("geo")
                == BrowserUriRoutingPolicy.Route.EXTERNAL_CONFIRMATION;
        assert BrowserUriRoutingPolicy.routeForScheme("intent")
                == BrowserUriRoutingPolicy.Route.INTENT_CONFIRMATION;
        assert !BrowserAddress.shouldHandOffExternalScheme(false, true, "mailto");
        assert !BrowserAddress.shouldHandOffExternalScheme(true, false, "mailto");
        assert !BrowserAddress.shouldHandOffExternalScheme(true, true, null);

        assert !BrowserAddress.isAllowedWebUrl("https://user:pass@example.com/");
        assert !BrowserAddress.isAllowedWebUrl("http://user:pass@example.com/");
        assert !BrowserAddress.isAllowedWebUrl("https://example.com:");
        assert !BrowserAddress.isAllowedWebUrl("http://[::1]:");
        assert !BrowserAddress.isAllowedWebUrl("https://münchen.de:");
        rejects("https://example.com:/path");
        assert !BrowserAddress.isAllowedWebUrl("https://example.com:0");
        assert !BrowserAddress.isAllowedWebUrl("https://example.com:65536");
        assert !BrowserAddress.isAllowedWebUrl("https://example.com:99999");
        assert !BrowserAddress.isAllowedWebUrl("https://example.com:0/path");
        assert !BrowserAddress.isAllowedWebUrl("example.com:0");
        assert BrowserAddress.isAllowedWebUrl("https://example.com:1");
        assert BrowserAddress.isAllowedWebUrl("https://example.com:443");
        assert BrowserAddress.isAllowedWebUrl("https://example.com:65535");
        assert BrowserAddress.resolveInput("example.com:8443", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("https://example.com:8443");

        // IP literals and localhost work without a scheme just like ordinary bare domains.
        assert BrowserAddress.resolveInput("192.168.1.1/admin", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("https://192.168.1.1/admin") : "bare IPv4 literal must resolve to HTTPS";
        assert BrowserAddress.resolveInput("192.168.1.1:8080", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("https://192.168.1.1:8080") : "bare IPv4 literal with port must be accepted";
        assert BrowserAddress.isLikelyWebAddress("192.168.1.1");
        // Chromium/WHATWG also interprets shortened, integer, octal and hex
        // host spellings as IPv4. They must not be accepted as DNS names.
        for (String host : new String[]{"127.1", "2130706433", "0177.0.0.1",
                "0x7f.0.0.1", "127.0.0x1", "0x7f.0.0x1", "1.2.3.0x4",
                "foo.0x1", "foo.08", "0x"}) {
            assert !BrowserAddress.isLikelyWebAddress(host) : host;
            assert BrowserAddress.resolveInput(host, BrowserAddress.SearchEngine.DUCKDUCKGO)
                    .equals("https://duckduckgo.com/?q=" + host) : host;
            for (String scheme : new String[]{"http", "https"}) {
                String url = scheme + "://" + host + "/";
                assert !BrowserAddress.isAllowedWebUrl(url) : url;
                rejects(url);
            }
        }
        // WHATWG URL parsing treats leading-zero IPv4 octets as legacy octal/short forms.
        // Reject them before a URL string can be handed to WebView.
        for (String host : new String[]{"010.0.0.1", "001.002.003.004", "0.00.0.0"}) {
            assert !BrowserAddress.isLikelyWebAddress(host) : host;
            assert BrowserAddress.resolveInput(host, BrowserAddress.SearchEngine.DUCKDUCKGO)
                    .equals("https://duckduckgo.com/?q=" + host) : host;
            for (String scheme : new String[]{"http", "https"}) {
                String url = scheme + "://" + host + "/";
                assert !BrowserAddress.isAllowedWebUrl(url) : url;
                rejects(url);
            }
        }
        assert BrowserAddress.isAllowedWebUrl("http://0.0.0.0/");
        assert BrowserAddress.isAllowedWebUrl("https://192.0.2.1/");
        assert !BrowserAddress.isLikelyWebAddress("999.1.1.1");
        assert !BrowserAddress.isLikelyWebAddress("1.2.3");
        assert BrowserAddress.resolveInput("http://192.168.1.1/admin", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("http://192.168.1.1/admin") : "explicit HTTP IPv4 literal must be preserved";
        assert BrowserAddress.resolveInput("https://10.0.0.1:8443/", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("https://10.0.0.1:8443/") : "IPv4 with port must be accepted";
        assert BrowserAddress.resolveInput("[::1]/dev", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("https://[::1]/dev") : "bare IPv6 loopback must resolve to HTTPS";
        assert BrowserAddress.resolveInput("[2001:db8::1]:8443/path", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("https://[2001:db8::1]:8443/path") : "bare IPv6 with port must be accepted";
        assert BrowserAddress.resolveInput("[1:2:3:4:5:6:192.0.2.1]", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("https://[1:2:3:4:5:6:192.0.2.1]")
                : "bare IPv6 with an uncompressed IPv4 tail must be accepted";
        assert !BrowserAddress.isLikelyWebAddress("[1:2:3:4:5:192.0.2.1]")
                : "an IPv4 tail must still account for two IPv6 groups";
        assert !BrowserAddress.isLikelyWebAddress("[192.0.2.1::]")
                : "an IPv4 tail before trailing compression is not a valid IPv6 literal";
        assert !BrowserAddress.isAllowedWebUrl("https://[192.0.2.1::]/")
                : "the explicit URL parser must reject an IPv4 tail before trailing compression";
        assert !BrowserAddress.isLikelyWebAddress("[::ffff:192.000.2.1]");
        assert !BrowserAddress.isAllowedWebUrl("https://[::ffff:192.000.2.1]/");
        rejects("https://[::ffff:192.000.2.1]/");
        assert BrowserAddress.isAllowedWebUrl("https://[::ffff:192.0.2.1]/");
        assert BrowserAddress.resolveInput("localhost:3000/api", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("https://localhost:3000/api") : "localhost with port must resolve to HTTPS";
        assert BrowserAddress.isLikelyWebAddress("[::1]");
        assert BrowserAddress.isLikelyWebAddress("localhost:3000");
        assert !BrowserAddress.isLikelyWebAddress("[::1]:99999");
        assert BrowserAddress.isAllowedWebUrl("http://[::1]:8080/dev") : "IPv6 literal must be accepted";
        assert BrowserAddress.resolveInput("http://[::1]:8080/dev", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("http://[::1]:8080/dev") : "IPv6 literal with port must round-trip";
        assert BrowserAddress.isAllowedWebUrl("https://[2001:db8::1]/path") : "IPv6 global unicast must be accepted";
        assert !BrowserAddress.isAllowedWebUrl("https://[::1]:0/") : "IPv6 with invalid port must be rejected";
        assert !BrowserAddress.isAllowedWebUrl("https://[::1]:99999/") : "IPv6 with out-of-range port must be rejected";
        assert BrowserAddress.isLikelyWebAddress("http://192.168.1.1") : "explicit scheme makes IPv4 a web address";
        // Internationalized (non-ASCII) hosts must navigate instead of being rejected or
        // mistaken for a search: the address bar shows the punycode form, which is the
        // unambiguous representation a browser can actually load.
        assert BrowserAddress.resolveInput("münchen.de", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("https://xn--mnchen-3ya.de");
        assert BrowserAddress.resolveInput("https://münchen.de/straße", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("https://xn--mnchen-3ya.de/stra%C3%9Fe");
        assert BrowserAddress.resolveInput("例え.jp/path", BrowserAddress.SearchEngine.GOOGLE)
                .equals("https://xn--r8jz45g.jp/path");
        assert BrowserAddress.resolveInput("मेरा-साइट.in", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .startsWith("https://xn--");
        assert BrowserAddress.resolveInput("münchen.de:8443/x", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("https://xn--mnchen-3ya.de:8443/x");
        assert BrowserAddress.isAllowedWebUrl("https://例え.jp/खबर");
        assert BrowserAddress.isAllowedWebUrl("https://münchen.de");
        assert !BrowserAddress.isAllowedWebUrl("https://user:pass@例え.jp");
        assert !BrowserAddress.isAllowedWebUrl("https://exa mple.com");
        assert !BrowserAddress.isAllowedWebUrl("münchen.de@evil.example");

        String history = BrowserHistory.add("", "https://example.com/first");
        history = BrowserHistory.add(history, "https://example.com/second?item=2");
        List<String> sites = BrowserHistory.decode(history);
        assert sites.size() == 1 : sites;
        assert sites.get(0).equals("https://example.com") : sites;
        assert BrowserAddress.isAllowedWebUrl(sites.get(0)) : "Saved origin should be reopenable in WebView";
        assertStored(history, "https://example.com");
        assert BrowserHistory.decode(BrowserHistory.clear()).isEmpty();

        // HTTP origins are also stored in history (scheme preserved, default port 80 stripped).
        String httpHistory = BrowserHistory.add("", "http://insecure.example/page?q=secret");
        assert BrowserHistory.decode(httpHistory).get(0).equals("http://insecure.example")
                : "HTTP origin must be sanitized to scheme://host";
        assertStored(httpHistory, "http://insecure.example");
        assert BrowserHistory.sanitizeUrl("http://example.com/path?q=secret").equals("http://example.com");
        assert BrowserHistory.sanitizeUrl("http://example.com:80/path").equals("http://example.com");
        assert BrowserHistory.sanitizeUrl("http://example.com:8080/path").equals("http://example.com:8080");

        history = BrowserHistory.add(history, "https://other.example.net/path");
        history = BrowserHistory.add(history, "https://example.com/third");
        sites = BrowserHistory.decode(history);
        assert sites.size() == 2 : sites;
        assert sites.get(0).equals("https://example.com") : sites;
        assert sites.get(1).equals("https://other.example.net") : sites;

        String nonDefaultPortHistory = BrowserHistory.add("", "https://example.com:8443/private/path");
        assert BrowserHistory.decode(nonDefaultPortHistory).get(0).equals("https://example.com:8443");
        assertStored(nonDefaultPortHistory, "https://example.com:8443");
        assert BrowserHistory.sanitizeUrl("https://example.com:443/path").equals("https://example.com");
        assert BrowserHistory.sanitizeUrl("https://example.com:65536/path") == null;
        assert BrowserHistory.sanitizeUrl("https://example.com:0/path") == null;

        String searchUrl = BrowserAddress.resolveInput("secret search phrase", BrowserAddress.SearchEngine.DUCKDUCKGO);
        String searchHistory = BrowserHistory.add("", searchUrl);
        assertStored(searchHistory, "https://duckduckgo.com");
        assert BrowserHistory.decode(searchHistory).size() == 1;
        assert BrowserHistory.decode(searchHistory).get(0).equals("https://duckduckgo.com");

        String resetUrl = "https://user:password@example.com/reset/secret-reset-token"
                + "?token=secret-token&auth=secret-auth&key=secret-key&session=secret-session"
                + "&access_token=secret-access&id_token=secret-id&api_key=secret-api#secret-fragment";
        String resetHistory = BrowserHistory.add("", resetUrl);
        assert BrowserHistory.sanitizeUrl(resetUrl).equals("https://example.com");
        assertStored(resetHistory, "https://example.com");

        String oauthUrl = "https://example.com/oauth/secret-authorization-code?code=secret-code"
                + "&state=secret-state#fragment-secret";
        String oauthHistory = BrowserHistory.add("", oauthUrl);
        assert BrowserHistory.sanitizeUrl(oauthUrl).equals("https://example.com");
        assertStored(oauthHistory, "https://example.com");
        assert BrowserHistory.sanitizeUrl("Private password-reset page title with a secret code") == null
                : "Page/search titles must not be accepted as Site history entries";

        String queryVariants = BrowserHistory.add("", "https://example.com/search?q=private+query");
        queryVariants = BrowserHistory.add(queryVariants, "https://example.com/search?q=different+private+query");
        assertStored(queryVariants, "https://example.com");
        assert BrowserHistory.decode(queryVariants).size() == 1 : BrowserHistory.decode(queryVariants);

        String activeAddress = "https://example.com/oauth/secret-authorization-code?code=active-code#active-fragment";
        assert BrowserAddress.isAllowedWebUrl(activeAddress);
        assert BrowserAddress.resolveInput(activeAddress, BrowserAddress.SearchEngine.DUCKDUCKGO).equals(activeAddress)
                : "Web address resolution must preserve the current route, query, and fragment";
        String activePageHistory = BrowserHistory.add("", activeAddress);
        assertStored(activePageHistory, "https://example.com");
        assert activeAddress.contains("/oauth/secret-authorization-code?code=active-code#active-fragment")
                : "Sanitizing history must not mutate the active browsing URL";

        String legacyUrl = "https://legacy-user:legacy-pass@example.net/oauth/legacy-code"
                + "?query=legacy-search&token=legacy-token#legacy-fragment";
        String legacyStored = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(legacyUrl.getBytes(StandardCharsets.UTF_8));
        List<String> migrated = BrowserHistory.decode(legacyStored);
        assert migrated.size() == 1 : migrated;
        assert migrated.get(0).equals("https://example.net") : migrated;
        String sanitizedLegacy = BrowserHistory.sanitizeSerialized(legacyStored);
        assertStored(sanitizedLegacy, "https://example.net");
        assert BrowserHistory.decode(sanitizedLegacy).equals(migrated);

        for (int i = 0; i < BrowserHistory.MAX_ENTRIES + 5; i++) {
            history = BrowserHistory.add(history, "https://site" + i + ".example.com/page/" + i);
        }
        assert BrowserHistory.decode(history).size() == BrowserHistory.MAX_ENTRIES;
        assert BrowserHistory.decode(history).get(0).equals(
                "https://site" + (BrowserHistory.MAX_ENTRIES + 4) + ".example.com");

        String searchable = BrowserHistory.add("", "https://alpha.example");
        searchable = BrowserHistory.add(searchable, "https://beta.example:8443");
        searchable = BrowserHistory.add(searchable, "https://gamma.example");
        List<String> entries = BrowserHistory.decode(searchable);
        assert entries.size() == 3 : entries;
        assert BrowserHistory.filter(entries, "").size() == 3 : "a blank filter keeps every entry";
        assert BrowserHistory.filter(entries, "   ").size() == 3 : "whitespace is a blank filter";
        assert BrowserHistory.filter(entries, "BETA").equals(
                java.util.List.of("https://beta.example:8443")) : "filtering is case-insensitive";
        assert BrowserHistory.filter(entries, "8443").size() == 1 : "ports are searchable";
        assert BrowserHistory.filter(entries, "nothing").isEmpty() : "no match yields nothing";
        assert BrowserHistory.filter(null, "alpha").isEmpty() : "a null list is safe";
        assert BrowserHistory.filter(entries, null).size() == 3 : "a null query is a blank filter";

        String pruned = BrowserHistory.remove(searchable, "https://beta.example:8443/history");
        List<String> prunedEntries = BrowserHistory.decode(pruned);
        assert prunedEntries.size() == 2 : prunedEntries;
        assert !prunedEntries.contains("https://beta.example:8443") : "the forgotten site is gone";
        assert prunedEntries.get(0).equals("https://gamma.example") : "other entries keep their order";
        assert BrowserHistory.remove(searchable, "javascript:alert(1)").equals(searchable)
                : "an unusable URL must not change history";
        assert BrowserHistory.remove(searchable, null).equals(searchable)
                : "a null URL must not change history";

        System.out.println("PASS browser address/site-history smoke tests: search engines, HTTP+HTTPS validation, origin-only persistence, secret redaction, legacy migration, reopen, dedup, ports, search, single-site forget, and clear");
    }

    private static void rejects(String value) {
        boolean rejected = false;
        try {
            BrowserAddress.resolveInput(value, BrowserAddress.SearchEngine.DUCKDUCKGO);
        } catch (IllegalArgumentException expected) {
            rejected = true;
        }
        assert rejected : "Expected rejection: " + value;
    }

    private static void assertStored(String serialized, String expectedOrigin) throws Exception {
        String[] lines = serialized.split("\\n");
        assert lines.length == 1 : "Expected one origin entry, got " + lines.length;
        String stored = new String(Base64.getUrlDecoder().decode(lines[0]), StandardCharsets.UTF_8);
        assert stored.equals(expectedOrigin) : "Sensitive URL data persisted: " + stored;
        URI uri = new URI(stored);
        assert ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) && uri.getHost() != null
                : "History must be a validated HTTP/HTTPS origin";
        assert uri.getRawUserInfo() == null && uri.getRawQuery() == null && uri.getRawFragment() == null
                : "Userinfo, query, and fragment must not be stored: " + stored;
        assert uri.getRawPath() == null || uri.getRawPath().isEmpty()
                : "Paths and page titles must not be stored: " + stored;
    }
}
