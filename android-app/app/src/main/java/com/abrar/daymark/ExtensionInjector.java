package com.abrar.daymark;

import android.webkit.WebView;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Applies only packs matching the current page. No native bridge and no page-readable pack catalog.
 *
 * <p>The small asset is invoked as a function with a one-shot, current-page-only argument. It
 * keeps no global config/state and receives no match rules, excludes, disabled-site preferences,
 * or metadata for packs that do not match the current URL.
 */
final class ExtensionInjector {
    private static final String SPA_BOOTSTRAP_ASSET = "daymark-extension-spa.js";
    private static final int MAX_SPA_CONFIG_CHARS = 2_000_000;
    private static final int MAX_BOOTSTRAP_BYTES = 65_536;
    private static volatile String cachedSpaBootstrap;

    private ExtensionInjector() { }

    static boolean apply(WebView webView, String pageUrl, List<BrowserExtension> packs) {
        if (webView == null || packs == null || !BrowserAddress.isAllowedWebUrl(pageUrl)
                || !pageUrl.equals(webView.getUrl())) return false;

        List<BrowserExtension> matching = matchingPacks(pageUrl, packs);
        if (!submitCurrentPageStyles(webView, pageUrl, matching)) return false;

        StringBuilder js = new StringBuilder();
        for (BrowserExtension ext : matching) {
            if (ext.js == null || ext.js.isEmpty()) continue;

            // Userscripts run only on the matching document. GM_addStyle creates a pack-owned
            // style node so the next native same-document update can remove it if the pack stops
            // matching, without retaining a page-readable catalog of other packs.
            js.append("(function(){try{")
                    .append("var __dmExpectedUrl=").append(jsonString(pageUrl)).append(";")
                    .append("if(String(window.location.href)!==__dmExpectedUrl)return;")
                    .append("var __dmId=").append(jsonString(ext.id)).append(";")
                    .append("var __dmAddStyle=function(css){try{")
                    .append("if(String(window.location.href)!==__dmExpectedUrl)return null;")
                    .append("var p=document.head||document.documentElement;")
                    .append("if(!p||typeof p.appendChild!=='function'||typeof document.createElement!=='function')return null;")
                    .append("var s=document.createElement('style');")
                    .append("s.setAttribute('data-daymark-managed','true');")
                    .append("s.setAttribute('data-daymark-pack-id',__dmId);")
                    .append("s.setAttribute('data-daymark-pack-css','false');")
                    .append("s.textContent=String(css==null?'':css);p.appendChild(s);return s;")
                    .append("}catch(e){return null;}};")
                    .append("(function(){var GM_addStyle=__dmAddStyle;")
                    .append(ext.js)
                    .append("}).call(window);")
                    .append("}catch(e){}})();\n");
        }
        if (js.length() > 0) {
            // A navigation between the style and userscript submissions must not retarget code.
            try {
                webView.evaluateJavascript(jsScript(jsonString(pageUrl), js.toString()), null);
            } catch (RuntimeException rendererUnavailable) {
                return false;
            }
        }
        return true;
    }

    /**
     * Reconciles page-owned styles after a same-document URL change. Only the packs matching the
     * new URL are passed to the page; JavaScript userscripts are deliberately not re-run.
     *
     * <p>The safety boundary for a same-document update is the page-world exact-URL guard inside
     * the bootstrap asset, not {@link WebView#getUrl()}: WebView implementations report
     * pushState/replaceState through {@code doUpdateVisitedHistory} before (or without ever)
     * updating {@code getUrl()}, so comparing against it here would silently drop real route
     * changes on those versions. The one-shot config still reaches only the document whose
     * {@code window.location.href} matches {@code expectedUrl} exactly.
     *
     * @return true when a current-page reconciliation script was submitted.
     */
    static boolean applyStyles(WebView webView, String pageUrl, List<BrowserExtension> packs) {
        if (webView == null || packs == null || !BrowserAddress.isAllowedWebUrl(pageUrl)) return false;
        return submitCurrentPageStyles(webView, pageUrl, matchingPacks(pageUrl, packs));
    }

    private static List<BrowserExtension> matchingPacks(String pageUrl, List<BrowserExtension> packs) {
        List<BrowserExtension> matching = new ArrayList<>();
        for (BrowserExtension ext : packs) {
            if (ext == null || !ext.enabled || !ext.matchesUrl(pageUrl)) continue;
            if (matching.size() >= BrowserExtension.MAX_ENABLED_PER_PAGE) break;
            matching.add(ext);
        }
        return matching;
    }

    private static boolean submitCurrentPageStyles(WebView webView, String pageUrl,
                                                   List<BrowserExtension> packs) {
        String bootstrap = loadSpaBootstrap(webView);
        if (bootstrap == null) return false;

        String config = spaConfig(pageUrl, packs);
        if (config == null || config.length() > MAX_SPA_CONFIG_CHARS) {
            // Never leave stale styles active when a current-page configuration is unusable.
            config = spaConfig(pageUrl, Collections.<BrowserExtension>emptyList());
        }
        if (config == null) return false;

        try {
            // The config exists only as an invocation argument in this isolated IIFE. It is never
            // assigned to window or retained by a page-readable global.
            webView.evaluateJavascript("(" + bootstrap + ")(" + config + ");", null);
            return true;
        } catch (RuntimeException rendererUnavailable) {
            return false;
        }
    }

    private static String spaConfig(String pageUrl, List<BrowserExtension> packs) {
        StringBuilder out = new StringBuilder(256);
        out.append("{\"expectedUrl\":").append(jsonString(pageUrl)).append(",\"packs\":[");
        for (int i = 0; i < packs.size(); i++) {
            BrowserExtension ext = packs.get(i);
            if (i > 0) out.append(',');
            out.append("{\"id\":").append(jsonString(ext.id))
                    .append(",\"css\":").append(jsonString(ext.css))
                    .append('}');
            if (out.length() > MAX_SPA_CONFIG_CHARS) return null;
        }
        return out.append("]}").toString();
    }

    private static String loadSpaBootstrap(WebView webView) {
        String cached = cachedSpaBootstrap;
        if (cached != null) return cached;
        synchronized (ExtensionInjector.class) {
            cached = cachedSpaBootstrap;
            if (cached != null) return cached;
            try (InputStream input = webView.getContext().getAssets().open(SPA_BOOTSTRAP_ASSET);
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096];
                int read;
                int total = 0;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > MAX_BOOTSTRAP_BYTES) return null;
                    output.write(buffer, 0, read);
                }
                cached = new String(output.toByteArray(), StandardCharsets.UTF_8).trim();
                if (cached.isEmpty()) return null;
                cachedSpaBootstrap = cached;
                return cached;
            } catch (Exception unavailable) {
                return null;
            }
        }
    }

    private static String jsScript(String expectedUrl, String jsText) {
        return "(function(){try{if(String(window.location.href)!==" + expectedUrl + ")return;"
                + jsText
                + "}catch(e){}})();";
    }

    static String jsonString(String value) {
        if (value == null) return "\"\"";
        StringBuilder sb = new StringBuilder(value.length() + 16);
        sb.append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '\\': sb.append("\\\\"); break;
                case '"': sb.append("\\\""); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                case '\u2028': sb.append("\\u2028"); break;
                case '\u2029': sb.append("\\u2029"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
        return sb.toString();
    }
}
