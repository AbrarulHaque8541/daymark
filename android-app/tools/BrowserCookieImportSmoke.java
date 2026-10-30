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
        assert parsed.rejectedLineCount == 2 : parsed.rejectedLineCount;

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

        BrowserCookieImport.ParseResult headerless = BrowserCookieImport.parse(
                "host.example.com\tFALSE\t/\tFALSE\t0\tname\tvalue=1");
        assert headerless.recognizedFormat;
        assert headerless.cookies.size() == 1;

        BrowserCookieImport.ParseResult unrecognized =
                BrowserCookieImport.parse("not a cookie export");
        assert !unrecognized.recognizedFormat;
        assert unrecognized.cookies.isEmpty();
        assert BrowserCookieImport.parse(null).cookies.isEmpty();
        assert BrowserCookieImport.parse("x".repeat(BrowserCookieImport.MAX_FILE_CHARS + 1))
                .cookies.isEmpty();

        String tooLargeValue = "x".repeat(BrowserCookieImport.MAX_VALUE_CHARS + 1);
        assert BrowserCookieImport.parse("# Netscape HTTP Cookie File\n"
                + "example.com\tFALSE\t/\tFALSE\t0\tname\t" + tooLargeValue)
                .cookies.isEmpty();

        String[] unsafeValues = {"x; Secure", "x,Domain=evil.test", "x\\\"y",
                "x\\\\y", "value with space", "caf\\u00e9"};
        for (String value : unsafeValues) {
            BrowserCookieImport.ParseResult unsafe = BrowserCookieImport.parse(
                    "example.com\tFALSE\t/\tFALSE\t0\tname\t" + value);
            assert unsafe.cookies.isEmpty() : value;
            assert unsafe.rejectedLineCount == 1 : value;
        }

        assert BrowserCookieImport.parse("example.com\tFALSE\t/; Secure\tFALSE\t0\tn\tv")
                .cookies.isEmpty();
        assert BrowserCookieImport.parse("example.com\tFALSE\t/\tFALSE\t0\tbad;name\tv")
                .cookies.isEmpty();
        assert BrowserCookieImport.parse(".example.com\tFALSE\t/\tFALSE\t0\tn\tv")
                .cookies.isEmpty();
        assert BrowserCookieImport.parse("example.com\tFALSE\t/\tFALSE\t253402300800\tn\tv")
                .cookies.isEmpty();

        BrowserCookieImport.ParseResult tooManyLines =
                BrowserCookieImport.parse("\n".repeat(BrowserCookieImport.MAX_LINES + 1));
        assert tooManyLines.rejectedLineCount == 1;
        assert tooManyLines.rejectedLines.get(0).reason == BrowserCookieImport.Rejection.TOO_MANY_LINES;

        StringBuilder manyBadRows = new StringBuilder();
        for (int i = 0; i < BrowserCookieImport.MAX_REJECTED_LINES_RETAINED + 20; i++) {
            manyBadRows.append("not-a-cookie-row\n");
        }
        BrowserCookieImport.ParseResult boundedRejections =
                BrowserCookieImport.parse(manyBadRows.toString());
        assert boundedRejections.rejectedLineCount == BrowserCookieImport.MAX_REJECTED_LINES_RETAINED + 20;
        assert boundedRejections.rejectedLines.size() == BrowserCookieImport.MAX_REJECTED_LINES_RETAINED;
        assert boundedRejections.rejectionListTruncated;

        String validRow = "host.example.com\tFALSE\t/\tFALSE\t0\tn\tv\n";
        StringBuilder manyCookies = new StringBuilder();
        for (int i = 0; i < BrowserCookieImport.MAX_COOKIES + 1; i++) manyCookies.append(validRow);
        BrowserCookieImport.ParseResult boundedCookies = BrowserCookieImport.parse(manyCookies.toString());
        assert boundedCookies.cookies.size() == BrowserCookieImport.MAX_COOKIES;
        assert boundedCookies.rejectedLines.get(0).reason == BrowserCookieImport.Rejection.TOO_MANY_COOKIES;

        System.out.println("PASS browser cookie import parser: headerless Netscape, HttpOnly, strict cookie-octet, flags, expiry, line/cookie/rejection bounds and malformed-line rejection");
    }
}
