package com.abrar.daymark;

public final class BrowserCookieImportSmoke {
    public static void main(String[] args) {
        String export = "# Netscape HTTP Cookie File\n"
                + ".example.com\tTRUE\t/\tTRUE\t1900000000\tsid\tabc123\n"
                + "#HttpOnly_secure.example.com\tFALSE\t/account\tTRUE\t0\tsecret\tvalue=1\n"
                + "bad.example.com\tmaybe\t/\tFALSE\t1\tx\ty\n"
                + "bad.example.com\tFALSE\tno-slash\tFALSE\t1\tx\ty\n";
        BrowserCookieImport.ParseResult parsed = BrowserCookieImport.parse(export);
        assert parsed.recognizedFormat;
        assert parsed.cookies.size() == 2 : parsed.cookies.size();
        assert parsed.rejectedLines.size() == 2 : parsed.rejectedLines.size();

        BrowserCookieImport.Cookie first = parsed.cookies.get(0);
        assert "example.com".equals(first.domain);
        assert first.includeSubdomains;
        assert first.secure;
        assert !first.httpOnly;
        assert "sid".equals(first.name);
        assert "abc123".equals(first.value);
        assert !first.isSessionCookie();
        assert !first.isExpired(1800000000L);

        BrowserCookieImport.Cookie second = parsed.cookies.get(1);
        assert "secure.example.com".equals(second.domain);
        assert !second.includeSubdomains;
        assert second.httpOnly;
        assert second.isSessionCookie();
        assert !second.isExpired(Long.MAX_VALUE);

        BrowserCookieImport.ParseResult unrecognized =
                BrowserCookieImport.parse("not a cookie export");
        assert !unrecognized.recognizedFormat;
        assert unrecognized.cookies.isEmpty();
        assert BrowserCookieImport.parse(null).cookies.isEmpty();
        assert BrowserCookieImport.parse("x".repeat(BrowserCookieImport.MAX_FILE_CHARS + 1))
                .cookies.isEmpty();

        String tooLargeValue = "x".repeat(BrowserCookieImport.MAX_VALUE_CHARS + 1);
        String oversized = "# Netscape HTTP Cookie File\n"
                + "example.com\tFALSE\t/\tFALSE\t0\tname\t" + tooLargeValue;
        assert BrowserCookieImport.parse(oversized).cookies.isEmpty();
        System.out.println("PASS browser cookie import parser: Netscape format, HttpOnly, flags, expiry, bounds and malformed-line rejection");
    }
}
