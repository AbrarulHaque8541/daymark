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
 * Applies page-local CSS/JS for enabled packs. No native bridge.
 *
 * <p>WebView.evaluateJavascript is asynchronous and targets the currently displayed page.
 * Every submitted payload is bound to the exact URL that produced onPageFinished. The
 * page-local bootstrap separately re-evaluates CSS scopes on same-document SPA navigation.
 */
final class ExtensionInjector {
    private static final String SPA_BOOTSTRAP_ASSET = "daymark-extension-spa.js";
    private static final int MAX_SPA_PACKS = 64;
    private static final int MAX_SPA_CONFIG_CHARS = 2_000_000;
    private static final int MAX_BOOTSTRAP_BYTES = 65_536;
    private static volatile String cachedSpaBootstrap;

    private ExtensionInjector() { }

    static void apply(WebView webView, String pageUrl, List<BrowserExtension> packs) {
        if (webView == null || packs == null) return;
        if (!BrowserAddress.isAllowedWebUrl(pageUrl)) return;

        // onPageFinished can be stale if a newer navigation has already started.
        if (!pageUrl.equals(webView.getUrl())) return;

        String bootstrap = loadSpaBootstrap(webView);
        if (bootstrap == null) return;

        List<BrowserExtension> enabled = new ArrayList<>();
        boolean tooManyPacks = false;
        for (BrowserExtension ext : packs) {
            if (ext == null || !ext.enabled) continue;
            if ((ext.css == null || ext.css.isEmpty()) && (ext.js == null || ext.js.isEmpty())) continue;
            if (enabled.size() >= MAX_SPA_PACKS) {
                tooManyPacks = true;
                break;
            }
            enabled.add(ext);
        }

        if (tooManyPacks) {
            // Fail closed and remove prior Daymark styles instead of leaving stale CSS active.
            submitSpaConfig(webView, pageUrl, Collections.<BrowserExtension>emptyList(), bootstrap);
            return;
        }

        String config = spaConfig(pageUrl, enabled);
        if (config == null || config.length() > MAX_SPA_CONFIG_CHARS) {
            // Oversized configuration must not leave previously injected styles on this page.
            submitSpaConfig(webView, pageUrl, Collections.<BrowserExtension>emptyList(), bootstrap);
            return;
        }
        webView.evaluateJavascript("window.__daymarkSpaConfig=" + config + ";\n" + bootstrap, null);

        StringBuilder js = new StringBuilder();
        int matchingPacks = 0;
        for (BrowserExtension ext : enabled) {
            if (!ext.matchesUrl(pageUrl)) continue;
            if (matchingPacks >= BrowserExtension.MAX_ENABLED_PER_PAGE) break;
            matchingPacks++;
            if (ext.js == null || ext.js.isEmpty()) continue;

            // A local GM_addStyle closure keeps asynchronous userscript styles attributed to
            // their owning pack, so a later SPA route can remove only that pack's styles.
            js.append("(function(){var __dmId=").append(jsonString(ext.id)).append(";try{")
                    .append("if(window.__daymarkRan&&window.__daymarkRan[__dmId])return;")
                    .append("window.__daymarkRan=window.__daymarkRan||Object.create(null);")
                    .append("window.__daymarkRan[__dmId]=1;")
                    .append("var __dmState=window.__daymarkSpaState;")
                    .append("if(__dmState)__dmState.currentPackId=__dmId;")
                    .append("var __dmAddStyle=function(css){try{if(window.__daymarkAddStyle)")
                    .append("window.__daymarkAddStyle(__dmId,css);}catch(e){}};")
                    .append("(function(){var GM_addStyle=__dmAddStyle;")
                    .append(ext.js)
                    .append("}).call(window);")
                    .append("}catch(e){}finally{try{var __s=window.__daymarkSpaState;")
                    .append("if(__s&&__s.currentPackId===__dmId)__s.currentPackId=null;")
                    .append("}catch(e){}}})()\n");
        }
        if (js.length() > 0) {
            // A navigation between the bootstrap and script submissions must not retarget scripts.
            webView.evaluateJavascript(jsScript(jsonString(pageUrl), js.toString()), null);
        }
    }

    private static void submitSpaConfig(WebView webView, String pageUrl,
                                        List<BrowserExtension> packs, String bootstrap) {
        String config = spaConfig(pageUrl, packs);
        if (config == null || config.length() > MAX_SPA_CONFIG_CHARS) {
            config = spaConfig(pageUrl, Collections.<BrowserExtension>emptyList());
        }
        webView.evaluateJavascript("window.__daymarkSpaConfig=" + config + ";\n" + bootstrap, null);
    }

    private static String spaConfig(String pageUrl, List<BrowserExtension> packs) {
        StringBuilder out = new StringBuilder(256);
        out.append("{\"expectedUrl\":").append(jsonString(pageUrl))
                .append(",\"maxEnabled\":").append(BrowserExtension.MAX_ENABLED_PER_PAGE)
                .append(",\"packs\":[");
        for (int i = 0; i < packs.size(); i++) {
            BrowserExtension ext = packs.get(i);
            if (i > 0) out.append(',');
            out.append("{\"id\":").append(jsonString(ext.id))
                    .append(",\"matches\":").append(jsonArray(ext.matches))
                    .append(",\"excludes\":").append(jsonArray(ext.excludes))
                    .append(",\"disabledSites\":").append(jsonArray(ext.disabledSites))
                    .append(",\"css\":").append(jsonString(ext.css))
                    .append('}');
            if (out.length() > MAX_SPA_CONFIG_CHARS) return null;
        }
        return out.append("]}").toString();
    }

    private static String jsonArray(List<String> values) {
        StringBuilder out = new StringBuilder("[");
        if (values != null) {
            for (int i = 0; i < values.size(); i++) {
                if (i > 0) out.append(',');
                out.append(jsonString(values.get(i)));
            }
        }
        return out.append(']').toString();
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
                cached = new String(output.toByteArray(), StandardCharsets.UTF_8);
                if (cached.trim().isEmpty()) return null;
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
