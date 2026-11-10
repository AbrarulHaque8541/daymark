package com.abrar.daymark;

import android.content.Context;
import android.webkit.WebView;

import java.util.Collections;
import java.util.List;

/** Applies only the enabled packs that match the current WebView URL. */
final class ExtensionRuntime {
    private final ExtensionStore store;
    private String lastAppliedUrl;

    private ExtensionRuntime(ExtensionStore store) {
        this.store = store;
    }

    static ExtensionRuntime create(Context context) {
        return new ExtensionRuntime(new ExtensionStore(context));
    }

    ExtensionStore store() {
        return store;
    }

    void onPageStarted(String url) {
        // A full navigation creates a new document. Do not let the previous document's URL
        // suppress the first extension pass for the new one.
        lastAppliedUrl = null;
    }

    void onPageFinished(WebView webView, String url) {
        if (!isCurrentWebPage(webView, url)) return;
        List<BrowserExtension> matching = matchingPacks(url);
        ExtensionInjector.apply(webView, url, matching);
        lastAppliedUrl = url;
    }

    /**
     * Re-evaluates only the current URL after WebView reports a same-document history update.
     * No match rules, disabled-site preferences, or nonmatching pack metadata are sent to the page.
     */
    void onSameDocumentNavigation(WebView webView, String url) {
        if (!isCurrentWebPage(webView, url) || url.equals(lastAppliedUrl)) return;
        List<BrowserExtension> matching = matchingPacks(url);
        if (ExtensionInjector.applyStyles(webView, url, matching)) {
            lastAppliedUrl = url;
        }
    }

    private List<BrowserExtension> matchingPacks(String url) {
        if (!store.isGloballyEnabled()) return Collections.emptyList();
        return store.enabledMatching(url);
    }

    private static boolean isCurrentWebPage(WebView webView, String url) {
        return webView != null && url != null && BrowserAddress.isAllowedWebUrl(url)
                && url.equals(webView.getUrl());
    }
}
