package com.abrar.daymark;

import android.content.Context;
import android.webkit.WebView;

import java.util.Collections;
import java.util.List;

/** Applies only the enabled packs that match the current WebView URL. */
final class ExtensionRuntime {
    private final ExtensionStore store;
    private String lastAppliedUrl;
    private boolean userscriptsAppliedForCurrentDocument;

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
        // A full navigation creates a new document. Reset native-only duplicate suppression;
        // never expose the set of executed pack IDs through a page-readable window property.
        lastAppliedUrl = null;
        userscriptsAppliedForCurrentDocument = false;
    }

    void onPageFinished(WebView webView, String url) {
        if (!isCurrentWebPage(webView, url)) return;
        List<BrowserExtension> matching = matchingPacks(url);
        if (userscriptsAppliedForCurrentDocument) {
            // A repeated finish callback for this document may reconcile styles, but must not
            // execute userscripts again (including after a same-document route update).
            if (ExtensionInjector.applyStyles(webView, url, matching)) lastAppliedUrl = url;
            return;
        }
        if (ExtensionInjector.apply(webView, url, matching)) {
            userscriptsAppliedForCurrentDocument = true;
            lastAppliedUrl = url;
        }
    }

    /**
     * Re-evaluates only the current URL after WebView reports a same-document history update.
     * No match rules, disabled-site preferences, or nonmatching pack metadata are sent to the page.
     *
     * <p>The exact-document safety boundary lives in the page-world expected-URL guard of the
     * bootstrap asset, so this path deliberately trusts the native visited-history callback URL
     * instead of comparing it against {@link WebView#getUrl()}, which some WebView versions do
     * not update for pushState/replaceState route changes.
     */
    void onSameDocumentNavigation(WebView webView, String url) {
        if (!userscriptsAppliedForCurrentDocument
                || webView == null || url == null
                || !BrowserAddress.isAllowedWebUrl(url)
                || url.equals(lastAppliedUrl)) return;
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
