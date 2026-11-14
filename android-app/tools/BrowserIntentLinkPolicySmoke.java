package com.abrar.daymark;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/** Host-side regression tests for safe Android intent:// browser-link parsing. */
public final class BrowserIntentLinkPolicySmoke {
    public static void main(String[] args) throws Exception {
        BrowserIntentLinkPolicy.Decision app = BrowserIntentLinkPolicy.parse(
                "intent://scan/#Intent;scheme=mailto;package=com.example.scan;"
                        + "action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end");
        check("mailto://scan/".equals(app.targetUri), "approved app target scheme and path are preserved");
        check("com.example.scan".equals(app.packageName),
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

        BrowserIntentLinkPolicy.Decision httpsTargetPort = BrowserIntentLinkPolicy.parse(
                "intent://example.com:8443/secure#Intent;scheme=https;end");
        check("https://example.com:8443/secure".equals(httpsTargetPort.targetUri),
                "valid HTTPS target with explicit port is accepted");

        expectFailure("intent://example.com:99999/#Intent;scheme=https;end",
                "out-of-range HTTPS target port rejected");
        expectFailure("intent://example.com:0/#Intent;scheme=http;end",
                "zero HTTP target port rejected");
        expectFailure("intent://example.com:/#Intent;scheme=https;end",
                "explicit empty HTTPS target port rejected");

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
                "intent://open/#Intent;scheme=mailto;package=com.example.mobile;end");
        check("mailto://open/".equals(packageOnly.targetUri), "approved app scheme is supported");
        check(BrowserIntentLinkPolicy.isSupportedTargetScheme("https"), "HTTPS intent targets are supported");
        for (String scheme : new String[]{"mailto", "tel", "sms", "geo"}) {
            check(BrowserIntentLinkPolicy.isSupportedTargetScheme(scheme),
                    scheme + " is an approved app target");
            BrowserIntentLinkPolicy.Decision allowedTarget = BrowserIntentLinkPolicy.parse(
                    "intent://open/#Intent;scheme=" + scheme + ";end");
            check((scheme + "://open/").equals(allowedTarget.targetUri),
                    scheme + " sanitized Intent target is preserved");
        }
        for (String scheme : new String[]{"tg", "market", "whatsapp", "telegram", "smsto", "viber",
                "spotify", "youtube", "chatgpt", "instagram", "android-app", "chrome",
                "chrome-extension", "devtools", "view-source", "vbscript", "zxing", "custom+scheme"}) {
            check(!BrowserIntentLinkPolicy.isSupportedTargetScheme(scheme),
                    scheme + " is not an approved Android app target");
            expectFailure("intent://scan/#Intent;scheme=" + scheme + ";end",
                    "unsupported intent target scheme rejected: " + scheme);
        }

        expectFailure(null, "missing URI rejected");
        expectFailure("https://example.com", "ordinary web links are not parsed as Intent URIs");
        expectFailure("intent://scan/", "missing Intent metadata rejected");
        expectFailure("intent://scan/#Intent;scheme=mailto", "missing end marker rejected");
        expectFailure("intent://scan/#Intent;scheme=mailto;component=com.evil/.Launch;end",
                "explicit component launch rejected");
        expectFailure("intent://scan/#Intent;scheme=mailto;SEL;end",
                "selectors and bare Intent flags rejected");
        expectFailure("intent://scan/#Intent;scheme=mailto;launchFlags=0x10000000;end",
                "arbitrary launch flags rejected");
        expectFailure("intent://scan/#Intent;scheme=mailto;launchFlags=0x00000001;end",
                "URI read-grant flag rejected");
        expectFailure("intent://scan/#Intent;scheme=mailto;launchFlags=0x00000002;end",
                "URI write-grant flag rejected");
        expectFailure("intent://scan/#Intent;scheme=mailto;launchFlags=0x00000003;end",
                "combined URI read/write-grant flags rejected");
        expectFailure("intent://scan/#Intent;scheme=mailto;S.extra=secret;end",
                "arbitrary extras rejected");
        expectFailure("intent://scan/#Intent;scheme=mailto;action=android.intent.action.SEND;end",
                "non-view actions rejected");
        expectFailure("intent://scan/#Intent;scheme=mailto;category=android.intent.category.DEFAULT;end",
                "non-browsable categories rejected");
        expectFailure("intent://scan/#Intent;scheme=javascript;end",
                "script execution scheme rejected");
        expectFailure("intent://scan/#Intent;scheme=file;end",
                "local file scheme rejected");
        expectFailure("intent://scan/#Intent;scheme=content;end",
                "content provider scheme rejected");
        expectFailure("intent://scan/#Intent;scheme=intent;end",
                "nested intent scheme rejected");
        expectFailure("intent://scan/#Intent;scheme=mailto;package=bad;end",
                "invalid package name rejected");
        expectFailure("intent://scan/#Intent;scheme=mailto;scheme=evil;end",
                "duplicate scheme metadata rejected");
        expectFailure("intent://scan/#Intent;scheme=mailto;S.browser_fallback_url=file%3A%2F%2F%2Fetc%2Fpasswd;end",
                "non-web fallback rejected");
        expectFailure("intent://example.com/#Intent;scheme=mailto;S.browser_fallback_url=chrome%3A%2F%2Fsettings;end",
                "browser/system fallback scheme rejected");
        expectFailure("intent://user@scan/#Intent;scheme=mailto;end",
                "embedded credentials rejected");
        expectFailure("intent://scan/#Intent;scheme=mailto;end#fragment",
                "trailing fragments rejected");

        if (args.length > 0) verifySharedContract(Path.of(args[0]));
        System.out.println("PASS Android intent link routing policy");
    }

    private static void verifySharedContract(Path fixture) throws Exception {
        List<String> lines = Files.readAllLines(fixture, StandardCharsets.UTF_8);
        int accepted = 0;
        int rejected = 0;
        for (String line : lines) {
            if (line.isEmpty() || line.startsWith("#")) continue;
            String[] fields = line.split("\\t", -1);
            if (fields.length != 5) throw new AssertionError("invalid shared Intent fixture row: " + line);
            String name = fields[0];
            String expected = fields[1];
            String input = fields[2];
            if ("accept".equals(expected)) {
                BrowserIntentLinkPolicy.Decision decision = BrowserIntentLinkPolicy.parse(input);
                check(fields[3].equals(decision.targetUri), name + " target mismatch: " + decision.targetUri);
                String fallback = fields[4].isEmpty() || "-".equals(fields[4]) ? null : fields[4];
                check(java.util.Objects.equals(fallback, decision.fallbackUrl), name + " fallback mismatch");
                accepted++;
            } else if ("reject".equals(expected)) {
                expectFailure(input, name);
                rejected++;
            } else {
                throw new AssertionError("unknown shared Intent fixture expectation: " + expected);
            }
        }
        check(accepted == 12 && rejected == 46, "shared Intent fixture must contain all fifty-eight cases");
        System.out.println("PASS shared Android/web Intent URI contract: " + accepted + " accepted, " + rejected + " rejected");
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
