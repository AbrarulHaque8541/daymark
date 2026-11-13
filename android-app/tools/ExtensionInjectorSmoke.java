package com.abrar.daymark;

import android.webkit.WebView;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Host regressions for page-bound injection and private current-page-only extension metadata. */
public final class ExtensionInjectorSmoke {
    private static final String PAGE = "https://example.com/account?tab=one";
    private static int assertions;

    public static void main(String[] args) {
        bindsEverySubmissionToTheFinishedPage();
        jsOnlyUserscriptsReceiveScopedStyleHelper();
        filtersNonmatchingAndDisabledPacksBeforeSerialization();
        rejectsExcludedAndPausedPacksNatively();
        appliesStylesOnlyForSameDocumentUpdates();
        skipsStaleOnPageFinishedCallbacks();
        skipsInvalidAndEmptyInputs();
        boundsMatchingPacks();
        escapesExpectedUrlAsJavaScriptString();
        System.out.println("PASS ExtensionInjectorSmoke: " + assertions + " assertions");
    }

    private static void bindsEverySubmissionToTheFinishedPage() {
        WebView webView = new WebView(PAGE);
        BrowserExtension pack = pack("scope", true, "https://example.com/account*",
                "body{color:red}", "window.__scopeTest=1;");
        ExtensionInjector.apply(webView, PAGE, Collections.singletonList(pack));

        List<String> scripts = webView.getEvaluatedScripts();
        equal(2, scripts.size(), "current-page styles and userscript use two submissions");
        String guard = "if(String(window.location.href)!==" + ExtensionInjector.jsonString(PAGE) + ")return;";
        contains(scripts.get(0), "(function (config)", "bootstrap is invoked as a private function");
        contains(scripts.get(0), "\"expectedUrl\":" + ExtensionInjector.jsonString(PAGE),
                "one-shot config is bound to the exact finished-page URL");
        contains(scripts.get(0), "\"id\":\"scope\"", "only the current matching pack id is passed");
        contains(scripts.get(0), "\"css\":\"body{color:red}\"", "current matching CSS is passed");
        notContains(scripts.get(0), "window.__daymarkSpaConfig", "configuration is never assigned to window");
        notContains(scripts.get(0), "window.__daymarkSpaState", "pack state is never retained on window");
        notContains(scripts.get(0), "\"matches\"", "match rules are not exposed to the page");
        notContains(scripts.get(0), "\"excludes\"", "exclude rules are not exposed to the page");
        notContains(scripts.get(0), "\"disabledSites\"", "per-site pause preferences are not exposed");
        notContains(scripts.get(0), "history.pushState", "page-world history hooks are not installed");
        contains(scripts.get(0), "data-daymark-pack-id", "current-page styles remain attributable for cleanup");
        contains(scripts.get(1), guard, "userscript retains its exact-page guard");
        contains(scripts.get(1), "var GM_addStyle=__dmAddStyle", "userscript GM_addStyle is pack-scoped");
        notContains(scripts.get(1), "window.__daymarkRan",
                "userscript deduplication does not publish pack IDs on the page global");
        contains(scripts.get(1), "data-daymark-pack-css", "userscript-created styles are tracked separately");
        notContains(scripts.get(1), "window.__daymarkAddStyle", "no global style bridge is exposed");
        before(scripts.get(1), guard, "window.__scopeTest=1;", "pack code runs only after the page guard");
    }

    private static void jsOnlyUserscriptsReceiveScopedStyleHelper() {
        WebView webView = new WebView(PAGE);
        BrowserExtension pack = pack("script-only", true, "https://example.com/*",
                "", "GM_addStyle('body{color:red}');");
        ExtensionInjector.apply(webView, PAGE, Collections.singletonList(pack));

        List<String> scripts = webView.getEvaluatedScripts();
        equal(2, scripts.size(), "JS-only userscripts receive style reconciliation and script submissions");
        contains(scripts.get(0), "\"id\":\"script-only\"", "JS-only pack is current-page eligible");
        contains(scripts.get(1), "GM_addStyle('body{color:red}')", "JS-only script can call GM_addStyle");
        contains(scripts.get(1), "var GM_addStyle=__dmAddStyle", "GM_addStyle is a local closure");
    }

    private static void filtersNonmatchingAndDisabledPacksBeforeSerialization() {
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
        equal(2, scripts.size(), "only current matching pack is applied");
        contains(scripts.get(0), "\"id\":\"current\"", "current pack is serialized");
        contains(scripts.get(0), "\"css\":\"body{color:red}\"", "current pack CSS is serialized");
        notContains(scripts.get(0), "future", "future-route pack metadata is absent");
        notContains(scripts.get(0), "background:black", "future-route CSS is absent");
        notContains(scripts.get(0), "disabled", "disabled pack metadata is absent");
        notContains(scripts.get(0), "paused.example", "site pause preferences are absent");
        notContains(scripts.get(0), "account/private", "exclude paths are absent");
        notContains(scripts.get(0), "\"matches\":", "match rules are absent");
        contains(scripts.get(1), "window.__current=1;", "current matching userscript runs");
        notContains(scripts.get(1), "window.__future=1;", "future-route userscript does not run");
    }

    private static void rejectsExcludedAndPausedPacksNatively() {
        BrowserExtension excluded = pack("excluded", true,
                Collections.singletonList("https://example.com/account*"),
                Collections.singletonList("https://example.com/account*"),
                Collections.<String>emptyList(),
                "body{color:red}", "window.__excluded=1;");
        WebView excludedView = new WebView(PAGE);
        ExtensionInjector.apply(excludedView, PAGE, Collections.singletonList(excluded));
        equal(1, excludedView.getEvaluatedScripts().size(), "excluded pack still sends only an empty cleanup config");
        notContains(excludedView.getEvaluatedScripts().get(0), "excluded",
                "excluded pack id never reaches the page");
        notContains(excludedView.getEvaluatedScripts().get(0), "body{color:red}",
                "excluded pack CSS never reaches the page");

        BrowserExtension paused = pack("paused", true,
                Collections.singletonList("https://example.com/account*"),
                Collections.<String>emptyList(),
                Collections.singletonList("example.com"),
                "body{display:none}", "window.__paused=1;");
        WebView pausedView = new WebView(PAGE);
        ExtensionInjector.apply(pausedView, PAGE, Collections.singletonList(paused));
        equal(1, pausedView.getEvaluatedScripts().size(), "site-paused pack sends only an empty cleanup config");
        notContains(pausedView.getEvaluatedScripts().get(0), "paused",
                "site-paused pack id never reaches the page");
        notContains(pausedView.getEvaluatedScripts().get(0), "body{display:none}",
                "site-paused pack CSS never reaches the page");
    }

    private static void appliesStylesOnlyForSameDocumentUpdates() {
        WebView webView = new WebView(PAGE);
        BrowserExtension current = pack("current", true, "https://example.com/account*",
                "body{color:red}", "window.__mustNotRunOnSpa=1;");
        check(ExtensionInjector.applyStyles(webView, PAGE, Collections.singletonList(current)),
                "same-document style reconciliation is submitted");
        equal(1, webView.getEvaluatedScripts().size(), "style-only update does not submit userscript code");
        notContains(webView.getEvaluatedScripts().get(0), "window.__mustNotRunOnSpa",
                "same-document update never re-runs userscripts");

        check(ExtensionInjector.applyStyles(webView, PAGE, Collections.<BrowserExtension>emptyList()),
                "empty matching set still submits cleanup");
        equal(2, webView.getEvaluatedScripts().size(), "nonmatching route receives a cleanup script");
        contains(webView.getEvaluatedScripts().get(1), "\"packs\":[]",
                "nonmatching route receives no extension metadata");
    }

    private static void skipsStaleOnPageFinishedCallbacks() {
        WebView webView = new WebView("https://other.example/private");
        ExtensionInjector.apply(webView, PAGE, Collections.singletonList(
                pack("stale", true, "https://example.com/*", "", "window.__stale=1;")));
        equal(0, webView.getEvaluatedScripts().size(),
                "stale onPageFinished URL is rejected before evaluateJavascript");
    }

    private static void skipsInvalidAndEmptyInputs() {
        WebView invalid = new WebView("javascript:alert(1)");
        ExtensionInjector.apply(invalid, "javascript:alert(1)", Collections.singletonList(
                pack("invalid", true, "<all_urls>", "body{}", "window.__invalid=1;")));
        equal(0, invalid.getEvaluatedScripts().size(), "non-web scheme is rejected");

        WebView empty = new WebView(PAGE);
        ExtensionInjector.apply(empty, PAGE, Collections.<BrowserExtension>emptyList());
        equal(1, empty.getEvaluatedScripts().size(), "empty store still clears old Daymark styles");
        contains(empty.getEvaluatedScripts().get(0), "\"packs\":[]",
                "empty store sends no pack metadata");

        check(!ExtensionInjector.applyStyles(null, PAGE, Collections.<BrowserExtension>emptyList()),
                "null WebView is rejected");
    }

    private static void boundsMatchingPacks() {
        List<BrowserExtension> many = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            many.add(pack("pack-" + i, true, "https://example.com/*",
                    "body{--pack:" + i + "}", "window.__pack" + i + "=1;"));
        }
        WebView bounded = new WebView(PAGE);
        ExtensionInjector.apply(bounded, PAGE, many);
        List<String> scripts = bounded.getEvaluatedScripts();
        equal(2, scripts.size(), "bounded current-page styles and scripts use two submissions");
        String styles = scripts.get(0);
        String code = scripts.get(1);
        for (int i = 0; i < BrowserExtension.MAX_ENABLED_PER_PAGE; i++) {
            contains(styles, "\"id\":\"pack-" + i + "\"", "matching pack " + i + " is retained");
            contains(code, "window.__pack" + i + "=1;", "matching script " + i + " is retained");
        }
        notContains(styles, "pack-8", "ninth pack metadata is not sent");
        notContains(styles, "pack-9", "tenth pack metadata is not sent");
        notContains(code, "window.__pack8=1;", "ninth userscript is not injected");
        notContains(code, "window.__pack9=1;", "tenth userscript is not injected");
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

    private static void check(boolean value, String label) {
        assertions++;
        if (!value) throw new AssertionError(label);
    }

    private static void equal(Object expected, Object actual, String label) {
        assertions++;
        if (!expected.equals(actual)) {
            throw new AssertionError(label + ": expected " + expected + ", got " + actual);
        }
    }
}
