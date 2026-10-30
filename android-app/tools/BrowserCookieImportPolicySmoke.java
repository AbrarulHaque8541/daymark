package com.abrar.daymark;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class BrowserCookieImportPolicySmoke {
    public static void main(String[] args) {
        String export = "# Netscape HTTP Cookie File\n"
                + ".example.com\tTRUE\t/\tTRUE\t1900000000\tsid\tabc123\n"
                + "#HttpOnly_secure.example.com\tFALSE\t/account\tTRUE\t0\tsecret\tvalue=1\n"
                + "host.example.com\tFALSE\t/\tFALSE\t0\t__Secure-missing\tno\n"
                + "host.example.com\tFALSE\t/\tFALSE\t0\t__Host-bad\tno\n"
                + "host.example.com\tFALSE\t/\tTRUE\t0\t__Host-valid\tgood\n"
                + "badhost.example.com\tTRUE\t/\tTRUE\t0\t__Host-domain\tno\n"
                + "badpath.example.com\tFALSE\t/sub\tTRUE\t0\t__Host-path\tno\n"
                + "expired.example.com\tFALSE\t/\tFALSE\t1\told\tvalue\n";
        BrowserCookieImport.ParseResult parsed = BrowserCookieImport.parse(export);
        BrowserCookieImportPolicy.Preview preview =
                BrowserCookieImportPolicy.createPreview(parsed, 1800000000L);

        assert preview.importableCookieCount == 3 : preview.importableCookieCount;
        assert preview.expiredCookieCount == 1 : preview.expiredCookieCount;
        assert preview.prefixRejectedCookieCount == 4 : preview.prefixRejectedCookieCount;
        assert preview.rejectedLineCount == 0;
        assert preview.domains.size() == 3;
        assert "example.com".equals(preview.domains.get(0).domain);
        // TreeMap ordering is deterministic: example.com, host.example.com, secure.example.com.
        assert "example.com".equals(preview.domains.get(0).domain);
        assert "host.example.com".equals(preview.domains.get(1).domain);
        assert "secure.example.com".equals(preview.domains.get(2).domain);
        assert preview.domains.get(0).secureCount == 1;
        assert preview.domains.get(2).httpOnlyCount == 1;
        assert preview.domains.get(2).sessionCount == 1;

        Set<String> onlyExample = new HashSet<>(Collections.singleton("example.com"));
        List<BrowserCookieImport.Cookie> selected =
                BrowserCookieImportPolicy.selectCookies(preview, onlyExample);
        assert selected.size() == 1;
        assert "sid".equals(selected.get(0).name);

        Set<String> onlySecure = new HashSet<>(Collections.singleton("secure.example.com"));
        List<BrowserCookieImport.Cookie> secureSelected =
                BrowserCookieImportPolicy.selectCookies(preview, onlySecure);
        assert secureSelected.size() == 1;
        assert "secret".equals(secureSelected.get(0).name);
        assert secureSelected.get(0).httpOnly;
        assert !secureSelected.get(0).includeSubdomains;

        String domainCookie = BrowserCookieImportPolicy.buildSetCookieHeader(
                selected.get(0), 1800000000L);
        assert "https://example.com/".equals(
                BrowserCookieImportPolicy.targetUrl(selected.get(0)));
        assert domainCookie.startsWith("sid=abc123; Domain=example.com; Path=/;");
        assert domainCookie.contains("Expires=");
        assert domainCookie.endsWith("; Secure");
        assert !domainCookie.contains("HttpOnly");

        BrowserCookieImport.Cookie hostOnly = preview.domains.get(2).cookies.get(0);
        String hostHeader = BrowserCookieImportPolicy.buildSetCookieHeader(hostOnly, 1800000000L);
        assert hostHeader.startsWith("secret=value=1; Path=/account");
        assert !hostHeader.contains("Domain=");
        assert !hostHeader.contains("Expires=");
        assert hostHeader.endsWith("; Secure; HttpOnly");

        BrowserCookieImport.Cookie hostPrefix = preview.domains.get(1).cookies.get(0);
        assert "__Host-valid".equals(hostPrefix.name);
        String hostPrefixHeader = BrowserCookieImportPolicy.buildSetCookieHeader(hostPrefix, 1800000000L);
        assert hostPrefixHeader != null && hostPrefixHeader.startsWith("__Host-valid=good; Path=/;");
        assert hostPrefixHeader.endsWith("; Secure");
        assert !hostPrefixHeader.contains("Domain=");

        BrowserCookieImport.ParseResult tooManyDomains = BrowserCookieImport.parse(
                makeManyDomains(BrowserCookieImportPolicy.MAX_PREVIEW_DOMAINS + 1));
        BrowserCookieImportPolicy.Preview bounded =
                BrowserCookieImportPolicy.createPreview(tooManyDomains, 1800000000L);
        assert bounded.tooManyDomains;
        assert bounded.domains.isEmpty();
        assert BrowserCookieImportPolicy.selectCookies(bounded, onlyExample).isEmpty();

        System.out.println("PASS browser cookie import policy: domain-scoped preview, expiry exclusion, prefix rules, explicit selection and safe Set-Cookie serialization");
    }

    private static String makeManyDomains(int count) {
        StringBuilder out = new StringBuilder("# Netscape HTTP Cookie File\n");
        for (int i = 0; i < count; i++) {
            out.append("host").append(i).append(".example.com")
                    .append("\tFALSE\t/\tFALSE\t0\tn\tv\n");
        }
        return out.toString();
    }
}
