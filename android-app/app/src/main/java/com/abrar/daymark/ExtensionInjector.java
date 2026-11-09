package com.abrar.daymark;

import android.webkit.WebView;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Applies page-local CSS/JS for enabled packs. No native bridge.
 *
 * <p>WebView.evaluateJavascript is asynchronous and targets the currently displayed document.
 * Bind every submitted payload to the exact URL that produced onPageFinished, both before queueing
 * and inside the JavaScript that will execute later. CSS bootstrap/style work is one submission;
 * pack scripts are a second, independently guarded submission.
 *
 * <p>Scripts still run in the page's main world. A trusted script can persist through same-document
 * SPA navigation; the URL guard prevents a stale callback from crossing into a different document.
 */
final class ExtensionInjector {
    private ExtensionInjector() { }

    static void apply(WebView webView, String pageUrl, List<BrowserExtension> enabledMatching) {
        if (webView == null || enabledMatching == null || enabledMatching.isEmpty()) return;
        if (!BrowserAddress.isAllowedWebUrl(pageUrl)) return;

        // onPageFinished can be stale if a newer navigation has already started.
        if (!pageUrl.equals(webView.getUrl())) return;

        List<BrowserExtension> limited = new ArrayList<>();
        for (BrowserExtension ext : enabledMatching) {
            if (limited.size() >= BrowserExtension.MAX_ENABLED_PER_PAGE) break;
            if (ext == null || !ext.enabled || !ext.matchesUrl(pageUrl)) continue;
            limited.add(ext);
        }
        if (limited.isEmpty()) return;

        StringBuilder css = new StringBuilder();
        StringBuilder js = new StringBuilder();
        for (BrowserExtension ext : limited) {
            if (ext.css != null && !ext.css.isEmpty()) {
                css.append("\n/* ").append(safeComment(ext.id)).append(" */\n")
                        .append(ext.css).append('\n');
            }
            if (ext.js != null && !ext.js.isEmpty()) {
                // Per-pack IIFE + duplicate-run guard (pack id).
                js.append("(function(){try{")
                        .append("var __dmId=").append(jsonString(ext.id)).append(";")
                        .append("if(window.__daymarkRan&&window.__daymarkRan[__dmId])return;")
                        .append("window.__daymarkRan=window.__daymarkRan||{};window.__daymarkRan[__dmId]=1;")
                        .append(ext.js)
                        .append("}catch(e){}})();\n");
            }
        }

        String expectedUrl = jsonString(pageUrl);
        if (css.length() > 0 || js.length() > 0) {
            // JS-only userscripts still need the page-bound GM_addStyle bootstrap.
            // Bootstrap and any CSS payload share one guarded WebView submission.
            webView.evaluateJavascript(cssScript(expectedUrl, css.toString()), null);
        }
        if (js.length() > 0) {
            // A navigation between the CSS and JS submissions must not retarget page scripts.
            webView.evaluateJavascript(jsScript(expectedUrl, js.toString()), null);
        }
    }

    private static String cssScript(String expectedUrl, String cssText) {
        return cssBootstrap(expectedUrl)
                + "(function(){try{if(String(window.location.href)!==" + expectedUrl + ")return;"
                + "window.__daymarkLastCss=" + jsonString(cssText) + ";"
                + "if(window.__daymarkApplyCss)window.__daymarkApplyCss(window.__daymarkLastCss);"
                + "else{var id='daymark-ext-css';var el=document.getElementById(id);"
                + "if(!el){el=document.createElement('style');el.id=id;"
                + "(document.head||document.documentElement).appendChild(el);}"
                + "el.textContent=window.__daymarkLastCss;}"
                + "}catch(e){}})();";
    }

    private static String cssBootstrap(String expectedUrl) {
        return "(function(){try{"
                + "var expected=" + expectedUrl + ";"
                + "if(String(window.location.href)!==expected)return;"
                + "if(window.__daymarkBoot){window.__daymarkExpectedUrl=expected;return;}"
                + "window.__daymarkBoot=1;window.__daymarkExpectedUrl=expected;"
                + "window.__daymarkApplyCss=function(css){try{"
                + "var id='daymark-ext-css';var el=document.getElementById(id);"
                + "if(!el){el=document.createElement('style');el.id=id;"
                + "(document.head||document.documentElement).appendChild(el);}"
                + "el.textContent=css||'';}catch(e){}};"
                + "window.GM_addStyle=function(css){try{"
                + "if(String(window.location.href)!==window.__daymarkExpectedUrl)return;"
                + "var s=document.createElement('style');s.textContent=String(css||'');"
                + "(document.head||document.documentElement).appendChild(s);}catch(e){}};"
                + "var _ps=history.pushState,_rs=history.replaceState;"
                + "function _dmNav(){try{if(window.__daymarkLastCss)"
                + "window.__daymarkApplyCss(window.__daymarkLastCss);}catch(e){}}"
                + "history.pushState=function(){_ps.apply(this,arguments);_dmNav();};"
                + "history.replaceState=function(){_rs.apply(this,arguments);_dmNav();};"
                + "window.addEventListener('popstate',_dmNav);"
                + "try{var mo=new MutationObserver(function(){_dmNav();});"
                + "mo.observe(document.documentElement,{childList:true,subtree:true});}catch(e){}"
                + "}catch(e){}})();";
    }

    private static String jsScript(String expectedUrl, String jsText) {
        return "(function(){try{if(String(window.location.href)!==" + expectedUrl + ")return;"
                + jsText
                + "}catch(e){}})();";
    }

    private static String safeComment(String id) {
        if (id == null) return "ext";
        return id.replace('*', '_').replace('/', '_');
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
