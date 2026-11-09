package com.abrar.daymark;

import android.webkit.WebView;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Host regression tests for page-bound extension injection and bounded WebView submissions. */
public final class ExtensionInjectorSmoke {
    private static final String PAGE = "https://example.com/account?tab=one";
    private static int assertions;

    public static void main(String[] args) {
        bindsEverySubmissionToTheFinishedPage();
        skipsStaleOnPageFinishedCallbacks();
        skipsDisabledAndNonmatchingPacks();
        skipsInvalidAndEmptyInputs();
        boundsSubmissionsAndEnabledPacks();
        escapesExpectedUrlAsJavaScriptString();
        System.out.println("PASS ExtensionInjectorSmoke: " + assertions + " assertions");
    }

    private static void bindsEverySubmissionToTheFinishedPage() {
        WebView webView = new WebView(PAGE);
        BrowserExtension pack = pack("scope", true, "https://example.com/*",
                "body{color:red}", "window.__scopeTest=1;");
        ExtensionInjector.apply(webView, PAGE, Collections.singletonList(pack));

        List<String> scripts = webView.getEvaluatedScripts();
        equal(2, scripts.size(), "CSS bootstrap/style and JS use two submissions");
        String guard = "if(String(window.location.href)!==" + ExtensionInjector.jsonString(PAGE) + ")return;";
        contains(scripts.get(0), guard, "CSS submission checks current page");
        contains(scripts.get(1), guard, "JS submission checks current page");
        before(scripts.get(0), guard, "window.__daymarkBoot", "CSS guard runs before bootstrap");
        before(scripts.get(0), guard, "window.__daymarkLastCss", "CSS guard runs before style payload");
        before(scripts.get(1), guard, "window.__scopeTest", "JS guard runs before pack code");
        contains(scripts.get(0), "window.__daymarkExpectedUrl", "bootstrap records expected page");
        contains(scripts.get(0), "window.GM_addStyle", "userscript style helper remains available");
        contains(scripts.get(0), "history.pushState", "SPA CSS reapply remains available");
        contains(scripts.get(1), "window.__daymarkRan", "per-pack duplicate-run guard remains available");
    }

    private static void skipsStaleOnPageFinishedCallbacks() {
        WebView webView = new WebView("https://other.example/private");
        ExtensionInjector.apply(webView, PAGE, Collections.singletonList(
                pack("stale", true, "https://example.com/*", "", "window.__stale=1;")));
        equal(0, webView.getEvaluatedScripts().size(),
                "stale onPageFinished URL is rejected before evaluateJavascript");
    }

    private static void skipsDisabledAndNonmatchingPacks() {
        WebView webView = new WebView(PAGE);
        List<BrowserExtension> packs = Arrays.asList(
                pack("disabled", false, "https://example.com/*", "body{}", "window.__disabled=1;"),
                pack("wrong-host", true, "https://other.example/*", "body{}", "window.__wrongHost=1;"));
        ExtensionInjector.apply(webView, PAGE, packs);
        equal(0, webView.getEvaluatedScripts().size(),
                "disabled and nonmatching packs are rechecked at injection boundary");
    }

    private static void skipsInvalidAndEmptyInputs() {
        WebView invalid = new WebView("javascript:alert(1)");
        ExtensionInjector.apply(invalid, "javascript:alert(1)", Collections.singletonList(
                pack("invalid", true, "<all_urls>", "body{}", "window.__invalid=1;")));
        equal(0, invalid.getEvaluatedScripts().size(), "non-web scheme is rejected");

        WebView empty = new WebView(PAGE);
        ExtensionInjector.apply(empty, PAGE, Collections.singletonList(
                pack("empty", true, "https://example.com/*", "", "")));
        equal(0, empty.getEvaluatedScripts().size(), "empty pack does not submit bootstrap work");

        ExtensionInjector.apply(null, PAGE, Collections.singletonList(
                pack("null-view", true, "https://example.com/*", "", "window.__nullView=1;")));
        ExtensionInjector.apply(new WebView(PAGE), PAGE, Collections.<BrowserExtension>emptyList());
        assertions += 2;
    }

    private static void boundsSubmissionsAndEnabledPacks() {
        WebView cssOnly = new WebView(PAGE);
        ExtensionInjector.apply(cssOnly, PAGE, Collections.singletonList(
                pack("css-only", true, "https://example.com/*", "body{}", "")));
        equal(1, cssOnly.getEvaluatedScripts().size(), "CSS-only pack uses one submission");

        WebView jsOnly = new WebView(PAGE);
        ExtensionInjector.apply(jsOnly, PAGE, Collections.singletonList(
                pack("js-only", true, "https://example.com/*", "", "window.__jsOnly=1;")));
        equal(1, jsOnly.getEvaluatedScripts().size(), "JS-only pack uses one submission");

        List<BrowserExtension> many = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            many.add(pack("pack-" + i, true, "https://example.com/*", "", "window.__pack" + i + "=1;"));
        }
        WebView bounded = new WebView(PAGE);
        ExtensionInjector.apply(bounded, PAGE, many);
        equal(1, bounded.getEvaluatedScripts().size(), "JS packs share one bounded submission");
        String payload = bounded.getEvaluatedScripts().get(0);
        for (int i = 0; i < BrowserExtension.MAX_ENABLED_PER_PAGE; i++) {
            contains(payload, "window.__pack" + i + "=1;", "enabled pack " + i + " is retained");
        }
        notContains(payload, "window.__pack8=1;", "ninth enabled pack is not injected");
        notContains(payload, "window.__pack9=1;", "tenth enabled pack is not injected");
    }

    private static void escapesExpectedUrlAsJavaScriptString() {
        String value = "https://example.com/search?q=%22";
        equal("\"https://example.com/search?q=%22\"", ExtensionInjector.jsonString(value),
                "expected URL is serialized as a quoted JavaScript string");
        equal("\"a\\\"b\\nc\"", ExtensionInjector.jsonString("a\"b\nc"),
                "quotes and newlines are escaped");
    }

    private static BrowserExtension pack(String id, boolean enabled, String pattern, String css, String js) {
        return new BrowserExtension(id, "Test", "1", "", enabled, false,
                Collections.singletonList(pattern), css, js, "document_end");
    }

    private static void before(String source, String first, String second, String label) {
        assertions++;
        int a = source.indexOf(first);
        int b = source.indexOf(second);
        if (a < 0 || b < 0 || a >= b) {
            throw new AssertionError(label + ": expected " + first + " before " + second);
        }
    }

    private static void contains(String source, String expected, String label) {
        assertions++;
        if (!source.contains(expected)) throw new AssertionError(label + ": missing " + expected);
    }

    private static void notContains(String source, String unexpected, String label) {
        assertions++;
        if (source.contains(unexpected)) throw new AssertionError(label + ": found " + unexpected);
    }

    private static void equal(Object expected, Object actual, String label) {
        assertions++;
        if (!expected.equals(actual)) {
            throw new AssertionError(label + ": expected " + expected + ", got " + actual);
        }
    }
}
