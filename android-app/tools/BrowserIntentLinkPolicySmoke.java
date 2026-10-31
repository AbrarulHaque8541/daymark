package com.abrar.daymark;
/** Host-side regression tests for safe Android intent:// browser-link parsing. */
public final class BrowserIntentLinkPolicySmoke {
    public static void main(String[] args) {
        BrowserIntentLinkPolicy.Decision app = BrowserIntentLinkPolicy.parse(
                "intent://scan/#Intent;scheme=zxing;package=com.google.zxing.client.android;"
                        + "action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end");
        check("zxing://scan/".equals(app.targetUri), "custom app target scheme and path are preserved");
        check("com.google.zxing.client.android".equals(app.packageName),
                "valid package target is parsed without trusting a component name");
        check(app.fallbackUrl == null, "fallback is optional");

        BrowserIntentLinkPolicy.Decision web = BrowserIntentLinkPolicy.parse(
                "intent://example.com/path?q=one#Intent;scheme=https;"
                        + "S.browser_fallback_url=https%3A%2F%2Fexample.com%2Ffallback;end");
        check("https://example.com/path?q=one".equals(web.targetUri),
                "HTTPS target is reconstructed without Intent metadata");
        check("https://example.com/fallback".equals(web.fallbackUrl),
                "encoded browser fallback is decoded");

        BrowserIntentLinkPolicy.Decision httpFallback = BrowserIntentLinkPolicy.parse(
                "intent://example.com/#Intent;scheme=https;"
                        + "S.browser_fallback_url=http%3A%2F%2Fexample.com%3A8080%2Ffallback;end");
        check("http://example.com:8080/fallback".equals(httpFallback.fallbackUrl),
                "valid HTTP fallback with explicit port is accepted");

        expectFailure("intent://example.com/#Intent;scheme=https;"
                        + "S.browser_fallback_url=https%3A%2F%2Fexample.com%3A99999%2Ffallback;end",
                "out-of-range fallback port rejected");
        expectFailure("intent://example.com/#Intent;scheme=https;"
                        + "S.browser_fallback_url=https%3A%2F%2Fexample.com%3A0%2Ffallback;end",
                "zero fallback port rejected");
        expectFailure("intent://example.com/#Intent;scheme=https;"
                        + "S.browser_fallback_url=https%3A%2F%2Fexample.com%3A65536%2Ffallback;end",
                "port above 65535 rejected");
        expectFailure("intent://example.com/#Intent;scheme=https;"
                        + "S.browser_fallback_url=https%3A%2F%2Fexample.com%3A%2Ffallback;end",
                "explicit empty fallback port rejected");
        expectFailure("intent://example.com/#Intent;scheme=https;"
                        + "S.browser_fallback_url=https%3A%2F%2Fuser%40example.com%2Ffallback;end",
                "fallback credentials rejected");

        BrowserIntentLinkPolicy.Decision plusFallback = BrowserIntentLinkPolicy.parse(
                "intent://example.com/#Intent;scheme=https;"
                        + "S.browser_fallback_url=https%3A%2F%2Fexample.com%2Fa+b%3Fq%3Done+two;end");
        check("https://example.com/a+b?q=one+two".equals(plusFallback.fallbackUrl),
                "literal plus in URI metadata must not be form-decoded into spaces");

        BrowserIntentLinkPolicy.Decision encodedPlusFallback = BrowserIntentLinkPolicy.parse(
                "intent://example.com/#Intent;scheme=https;"
                        + "S.browser_fallback_url=https%3A%2F%2Fexample.com%2Fa%252Bb%3Fq%3Done%252Btwo;end");
        check("https://example.com/a%2Bb?q=one%2Btwo".equals(encodedPlusFallback.fallbackUrl),
                "percent-encoded plus inside fallback URL is decoded once, not twice");

        BrowserIntentLinkPolicy.Decision packageOnly = BrowserIntentLinkPolicy.parse(
                "intent://open/#Intent;scheme=myapp;package=com.example.mobile;end");
        check("myapp://open/".equals(packageOnly.targetUri), "custom app scheme is supported");

        expectFailure(null, "missing URI rejected");
        expectFailure("https://example.com", "ordinary web links are not parsed as Intent URIs");
        expectFailure("intent://scan/", "missing Intent metadata rejected");
        expectFailure("intent://scan/#Intent;scheme=zxing", "missing end marker rejected");
        expectFailure("intent://scan/#Intent;scheme=zxing;component=com.evil/.Launch;end",
                "explicit component launch rejected");
        expectFailure("intent://scan/#Intent;scheme=zxing;SEL;end",
                "selectors and bare Intent flags rejected");
        expectFailure("intent://scan/#Intent;scheme=zxing;launchFlags=0x10000000;end",
                "arbitrary launch flags rejected");
        expectFailure("intent://scan/#Intent;scheme=zxing;S.extra=secret;end",
                "arbitrary extras rejected");
        expectFailure("intent://scan/#Intent;scheme=zxing;action=android.intent.action.SEND;end",
                "non-view actions rejected");
        expectFailure("intent://scan/#Intent;scheme=zxing;category=android.intent.category.DEFAULT;end",
                "non-browsable categories rejected");
        expectFailure("intent://scan/#Intent;scheme=javascript;end",
                "script execution scheme rejected");
        expectFailure("intent://scan/#Intent;scheme=file;end",
                "local file scheme rejected");
        expectFailure("intent://scan/#Intent;scheme=content;end",
                "content provider scheme rejected");
        expectFailure("intent://scan/#Intent;scheme=intent;end",
                "nested intent scheme rejected");
        expectFailure("intent://scan/#Intent;scheme=zxing;package=bad;end",
                "invalid package name rejected");
        expectFailure("intent://scan/#Intent;scheme=zxing;scheme=evil;end",
                "duplicate scheme metadata rejected");
        expectFailure("intent://scan/#Intent;scheme=zxing;S.browser_fallback_url=file%3A%2F%2F%2Fetc%2Fpasswd;end",
                "non-web fallback rejected");
        expectFailure("intent://user@scan/#Intent;scheme=zxing;end",
                "embedded credentials rejected");
        expectFailure("intent://scan/#Intent;scheme=zxing;end#fragment",
                "trailing fragments rejected");

        System.out.println("PASS Android intent link routing policy");
    }

    private static void expectFailure(String input, String message) {
        try {
            BrowserIntentLinkPolicy.parse(input);
            throw new AssertionError(message);
        } catch (IllegalArgumentException expected) {
            // Expected fail-closed behavior.
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
