package com.abrar.daymark;

/** Host-side checks for browser transport labels and top-level redirect policy. */
public final class BrowserHttpPolicySmoke {
    private BrowserHttpPolicySmoke() { }

    public static void main(String[] args) {
        check(BrowserHttpPolicy.ALLOW_HTTP, "browser policy explicitly permits HTTP pages");
        check(BrowserHttpPolicy.isAllowedWebScheme("http://insecure.example/page"),
                "explicit HTTP navigation is allowed");
        check(BrowserHttpPolicy.isAllowedWebScheme("https://secure.example/page"),
                "HTTPS navigation is allowed");
        check(!BrowserHttpPolicy.isAllowedWebScheme("ftp://files.example/file"),
                "non-web schemes are not page navigation");
        check("Not encrypted".equals(BrowserHttpPolicy.securityLabel("http://example.test/final")),
                "the final committed HTTP page is labelled Not encrypted");
        check("Encrypted".equals(BrowserHttpPolicy.securityLabel("https://example.test/final")),
                "a successfully committed HTTPS page is labelled Encrypted");
        check("Unknown".equals(BrowserHttpPolicy.securityLabel("file:///tmp/page")),
                "non-web and non-committed URLs have no false encryption claim");
        check("Unknown".equals(BrowserHttpPolicy.securityLabel("http://")),
                "malformed HTTP text is not labelled as a loaded page");

        String entered = "https://start.example/";
        String committed = "http://end.example/";
        check("Not encrypted".equals(BrowserHttpPolicy.securityLabel(committed)),
                "final-page status follows the committed HTTP URL rather than the entered HTTPS URL");
        check(BrowserHttpPolicy.shouldBlockTopLevelRedirect(
                        entered, committed, true, true),
                "an HTTPS-to-HTTP top-level redirect is blocked");
        check(!BrowserHttpPolicy.shouldBlockTopLevelRedirect(
                        "http://start.example/", "https://end.example/", true, true),
                "an HTTP-to-HTTPS redirect is permitted");
        check(!BrowserHttpPolicy.shouldBlockTopLevelRedirect(
                        entered, committed, false, true),
                "the top-level downgrade rule does not replace mixed-content policy");
        check(!BrowserHttpPolicy.shouldBlockTopLevelRedirect(
                        entered, committed, true, false),
                "a direct user-entered HTTP navigation is permitted");

        System.out.println("PASS browser URL policy: HTTP/HTTPS recognition, final-page label, HTTPS downgrade guard; runtime HTTP remains manifest-blocked pending integration");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
