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
                + "expired.example.com\tFALSE\t/\tFALSE\t1\told\tvalue\n";
        BrowserCookieImport.ParseResult parsed = BrowserCookieImport.parse(export);
        BrowserCookieImportPolicy.Preview preview =
                BrowserCookieImportPolicy.createPreview(parsed, 1800000000L);

        assert preview.importableCookieCount == 2 : preview.importableCookieCount;
        assert preview.expiredCookieCount == 1 : preview.expiredCookieCount;
        assert preview.prefixRejectedCookieCount == 2 : preview.prefixRejectedCookieCount;
        assert preview.rejectedLineCount == 0;
        assert preview.domains.size() == 2;
        assert "example.com".equals(preview.domains.get(0).domain);
        assert "secure.example.com".equals(preview.domains.get(1).domain);
        assert preview.domains.get(0).secureCount == 1;
        assert preview.domains.get(1).httpOnlyCount == 1;
        assert preview.domains.get(1).sessionCount == 1;

        Set<String> onlyExample = new HashSet<>(Collections.singleton("example.com"));
        List<BrowserCookieImport.Cookie> selected =
                BrowserCookieImportPolicy.selectCookies(preview, onlyExample);
        assert selected.size() == 1;
        assert "sid".equals(selected.get(0).name);

        String domainCookie = BrowserCookieImportPolicy.buildSetCookieHeader(
                selected.get(0), 1800000000L);
        assert "https://example.com/".equals(
                BrowserCookieImportPolicy.targetUrl(selected.get(0)));
        assert domainCookie.startsWith("sid=abc123; Domain=example.com; Path=/;");
        assert domainCookie.contains("Expires=");
        assert domainCookie.endsWith("; Secure");
        assert !domainCookie.contains("HttpOnly");

        BrowserCookieImport.Cookie hostOnly = preview.domains.get(1).cookies.get(0);
        String hostHeader = BrowserCookieImportPolicy.buildSetCookieHeader(hostOnly, 1800000000L);
        assert hostHeader.startsWith("secret=value=1; Path=/account");
        assert !hostHeader.contains("Domain=");
        assert !hostHeader.contains("Expires=");
        assert hostHeader.endsWith("; Secure; HttpOnly");

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
