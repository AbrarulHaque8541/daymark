package com.abrar.daymark;

import android.webkit.WebView;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Host regressions for page-bound injection and same-document SPA CSS scope reevaluation. */
public final class ExtensionInjectorSmoke {
    private static final String PAGE = "https://example.com/account?tab=one";
    private static int assertions;

    public static void main(String[] args) {
        bindsEverySubmissionToTheFinishedPage();
        jsOnlyUserscriptsReceiveTheStyleHelper();
        skipsStaleOnPageFinishedCallbacks();
        serializesFutureScopesButRunsOnlyCurrentScripts();
        skipsInvalidAndEmptyInputs();
        boundsSubmissionsAndEnabledPacks();
        escapesExpectedUrlAsJavaScriptString();
        System.out.println("PASS ExtensionInjectorSmoke: " + assertions + " assertions");
    }

    private static void bindsEverySubmissionToTheFinishedPage() {
        WebView webView = new WebView(PAGE);
        BrowserExtension pack = pack("scope", true, "https://example.com/account*",
                "body{color:red}", "window.__scopeTest=1;");
        ExtensionInjector.apply(webView, PAGE, Collections.singletonList(pack));

        List<String> scripts = webView.getEvaluatedScripts();
        equal(2, scripts.size(), "SPA bootstrap/style configuration and JS use two submissions");
        String guard = "if(String(window.location.href)!==" + ExtensionInjector.jsonString(PAGE) + ")return;";
        contains(scripts.get(0), "window.__daymarkSpaConfig=", "SPA configuration is submitted before the bootstrap");
        contains(scripts.get(0), "\"expectedUrl\":" + ExtensionInjector.jsonString(PAGE),
                "SPA configuration carries the exact finished-page URL");
        contains(scripts.get(0), "String(window.location.href) !== String(config.expectedUrl)",
                "SPA bootstrap checks the current page before creating state");
        before(scripts.get(0), "var config = window.__daymarkSpaConfig;",
                "window.__daymarkSpaState", "page guard/bootstrap configuration precedes state creation");
        contains(scripts.get(0), "\"matches\":[\"https://example.com/account*\"]",
                "all match rules are serialized for future SPA routes");
        contains(scripts.get(0), "\"css\":\"body{color:red}\"",
                "CSS is stored per pack rather than concatenated into one global style");
        contains(scripts.get(0), "history.pushState", "pushState is observed");
        contains(scripts.get(0), "history.replaceState", "replaceState is observed");
        contains(scripts.get(0), "hashchange", "hash changes trigger a scope reevaluation");
        contains(scripts.get(0), "data-daymark-pack-id", "managed styles are attributed to their owning pack");
        contains(scripts.get(0), "window.__daymarkAddStyle", "userscript-created styles use the same ownership tracking");
        contains(scripts.get(1), guard, "pack scripts retain the finished-page guard");
        contains(scripts.get(1), "var GM_addStyle=__dmAddStyle", "userscript GM_addStyle is scoped to its pack");
        before(scripts.get(1), guard, "window.__scopeTest=1;", "pack code runs only after the page guard");
    }

    private static void jsOnlyUserscriptsReceiveTheStyleHelper() {
        WebView webView = new WebView(PAGE);
        BrowserExtension pack = pack("script-only", true, "https://example.com/*",
                "", "GM_addStyle('body{color:red}');");
        ExtensionInjector.apply(webView, PAGE, Collections.singletonList(pack));

        List<String> scripts = webView.getEvaluatedScripts();
        equal(2, scripts.size(), "JS-only userscripts receive bootstrap and script submissions");
        contains(scripts.get(0), "window.__daymarkAddStyle", "JS-only bootstrap installs the managed style helper");
        contains(scripts.get(1), "GM_addStyle('body{color:red}')", "JS-only script can call GM_addStyle");
        contains(scripts.get(1), "var GM_addStyle=__dmAddStyle", "JS-only pack receives an owned style closure");
    }

    private static void skipsStaleOnPageFinishedCallbacks() {
        WebView webView = new WebView("https://other.example/private");
        ExtensionInjector.apply(webView, PAGE, Collections.singletonList(
                pack("stale", true, "https://example.com/*", "", "window.__stale=1;")));
        equal(0, webView.getEvaluatedScripts().size(),
                "stale onPageFinished URL is rejected before evaluateJavascript");
    }

    private static void serializesFutureScopesButRunsOnlyCurrentScripts() {
        WebView webView = new WebView(PAGE);
        BrowserExtension current = pack("current", true,
                Collections.singletonList("https://example.com/account*"),
                Collections.singletonList("https://example.com/account/private/*"),
                Collections.singletonList("paused.example"),
                "body{color:red}", "window.__current=1;");
        BrowserExtension future = pack("future", true, "https://example.com/public/*",
                "body{background:black}", "window.__future=1;");
        BrowserExtension disabled = pack("disabled", false, "https://example.com/*",
                "body{display:none}", "window.__disabled=1;");

        ExtensionInjector.apply(webView, PAGE, Arrays.asList(current, future, disabled));
        List<String> scripts = webView.getEvaluatedScripts();
        equal(2, scripts.size(), "current scripts are injected after one SPA configuration");
        contains(scripts.get(0), "\"id\":\"current\"", "current pack is tracked");
        contains(scripts.get(0), "\"id\":\"future\"", "nonmatching future-route pack is tracked");
        notContains(scripts.get(0), "\"id\":\"disabled\"", "disabled packs are not tracked");
        contains(scripts.get(0), "\"excludes\":[\"https://example.com/account/private/*\"]",
                "exclude rules are serialized");
        contains(scripts.get(0), "\"disabledSites\":[\"paused.example\"]",
                "per-site pause rules are serialized");
        contains(scripts.get(1), "window.__current=1;", "current matching userscript runs");
        notContains(scripts.get(1), "window.__future=1;", "future-route userscript waits for a matching document load");
    }

    private static void skipsInvalidAndEmptyInputs() {
        WebView invalid = new WebView("javascript:alert(1)");
        ExtensionInjector.apply(invalid, "javascript:alert(1)", Collections.singletonList(
                pack("invalid", true, "<all_urls>", "body{}", "window.__invalid=1;")));
        equal(0, invalid.getEvaluatedScripts().size(), "non-web scheme is rejected");

        WebView empty = new WebView(PAGE);
        ExtensionInjector.apply(empty, PAGE, Collections.singletonList(
                pack("empty", true, "https://example.com/*", "", "")));
        equal(1, empty.getEvaluatedScripts().size(), "empty configuration still clears stale page-owned styles");
        contains(empty.getEvaluatedScripts().get(0), "\"packs\":[]", "empty packs are represented explicitly");

        ExtensionInjector.apply(null, PAGE, Collections.singletonList(
                pack("null-view", true, "https://example.com/*", "", "window.__nullView=1;")));
        WebView noPacks = new WebView(PAGE);
        ExtensionInjector.apply(noPacks, PAGE, Collections.<BrowserExtension>emptyList());
        equal(1, noPacks.getEvaluatedScripts().size(), "empty store still updates the page-local state");
    }

    private static void boundsSubmissionsAndEnabledPacks() {
        WebView cssOnly = new WebView(PAGE);
        ExtensionInjector.apply(cssOnly, PAGE, Collections.singletonList(
                pack("css-only", true, "https://example.com/*", "body{}", "")));
        equal(1, cssOnly.getEvaluatedScripts().size(), "CSS-only pack uses one SPA bootstrap submission");

        WebView jsOnly = new WebView(PAGE);
        ExtensionInjector.apply(jsOnly, PAGE, Collections.singletonList(
                pack("js-only", true, "https://example.com/*", "", "window.__jsOnly=1;")));
        equal(2, jsOnly.getEvaluatedScripts().size(), "JS-only pack receives bootstrap and one script submission");
        contains(jsOnly.getEvaluatedScripts().get(0), "window.__daymarkAddStyle", "JS-only pack receives style bootstrap");
        contains(jsOnly.getEvaluatedScripts().get(1), "window.__jsOnly=1;", "JS-only pack code follows the bootstrap");

        List<BrowserExtension> many = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            many.add(pack("pack-" + i, true, "https://example.com/*", "", "window.__pack" + i + "=1;"));
        }
        WebView bounded = new WebView(PAGE);
        ExtensionInjector.apply(bounded, PAGE, many);
        equal(2, bounded.getEvaluatedScripts().size(), "JS packs share one bounded script submission after the bootstrap");
        String payload = bounded.getEvaluatedScripts().get(1);
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
        return pack(id, enabled, Collections.singletonList(pattern),
                Collections.<String>emptyList(), Collections.<String>emptyList(), css, js);
    }

    private static BrowserExtension pack(String id, boolean enabled, List<String> matches,
                                         List<String> excludes, List<String> disabledSites,
                                         String css, String js) {
        return new BrowserExtension(id, "Test", "1", "", enabled, false,
                matches, excludes, css, js, "document_end", "", disabledSites);
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
