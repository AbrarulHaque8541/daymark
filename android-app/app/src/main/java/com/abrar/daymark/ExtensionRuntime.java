package com.abrar.daymark;

import android.content.Context;
import android.webkit.WebView;

import java.util.Collections;
import java.util.List;

/** Applies enabled local extension packs to a WebView page. */
final class ExtensionRuntime {
    private final ExtensionStore store;

    private ExtensionRuntime(ExtensionStore store) {
        this.store = store;
    }

    static ExtensionRuntime create(Context context) {
        return new ExtensionRuntime(new ExtensionStore(context));
    }

    ExtensionStore store() {
        return store;
    }

    void onPageFinished(WebView webView, String url) {
        if (webView == null || url == null) return;
        // Pass every pack so the page-local bootstrap can activate CSS when an SPA route
        // changes from a non-matching path to a matching path. The injector filters disabled
        // packs and rechecks the current URL before executing any userscript.
        List<BrowserExtension> packs = store.isGloballyEnabled()
                ? store.listAll() : Collections.<BrowserExtension>emptyList();
        ExtensionInjector.apply(webView, url, packs);
    }
}
