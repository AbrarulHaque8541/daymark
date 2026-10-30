
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

        rejects("javascript:alert(1)");
        rejects("file:///etc/passwd");
        rejects("content://com.example/private");
        rejects("intent://open");
        rejects("ftp://example.com/file");
        rejects("data:text/html,hello");

        for (String scheme : new String[]{"tg", "telegram", "mailto", "tel", "sms",
                "smsto", "geo", "market", "whatsapp", "TG"}) {
            assert BrowserAddress.shouldHandOffExternalScheme(true, true, scheme) : scheme;
        }
        for (String scheme : new String[]{"http", "https", "intent", "javascript",
                "file", "content", "data", "ftp", null}) {
            assert !BrowserAddress.shouldHandOffExternalScheme(true, true, scheme) : scheme;
        }
        assert !BrowserAddress.shouldHandOffExternalScheme(false, true, "tg");
        assert !BrowserAddress.shouldHandOffExternalScheme(true, false, "tg");
        assert !BrowserAddress.shouldHandOffExternalScheme(true, true, null);

        assert !BrowserAddress.isAllowedWebUrl("https://user:pass@example.com/");
        assert !BrowserAddress.isAllowedWebUrl("http://user:pass@example.com/");
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

        // IPv4 and IPv6 literals must navigate when an explicit scheme is given.
        assert BrowserAddress.resolveInput("http://192.168.1.1/admin", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("http://192.168.1.1/admin") : "IPv4 literal with explicit scheme must be accepted";
        assert BrowserAddress.resolveInput("https://10.0.0.1:8443/", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("https://10.0.0.1:8443/") : "IPv4 with port must be accepted";
        assert BrowserAddress.isAllowedWebUrl("http://[::1]:8080/dev") : "IPv6 literal must be accepted";
        assert BrowserAddress.resolveInput("http://[::1]:8080/dev", BrowserAddress.SearchEngine.DUCKDUCKGO)
                .equals("http://[::1]:8080/dev") : "IPv6 literal with port must round-trip";
        assert BrowserAddress.isAllowedWebUrl("https://[2001:db8::1]/path") : "IPv6 global unicast must be accepted";
        assert !BrowserAddress.isAllowedWebUrl("https://[::1]:0/") : "IPv6 with invalid port must be rejected";
        assert !BrowserAddress.isAllowedWebUrl("https://[::1]:99999/") : "IPv6 with out-of-range port must be rejected";
        assert !BrowserAddress.isLikelyWebAddress("192.168.1.1") : "bare IPv4 is not a bare domain";
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
