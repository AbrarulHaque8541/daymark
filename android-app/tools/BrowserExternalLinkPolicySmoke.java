package com.abrar.daymark;

public final class BrowserExternalLinkPolicySmoke {
    public static void main(String[] args) {
        for (String scheme : new String[]{"mailto", "tel", "sms", "geo"}) {
            check(BrowserUriRoutingPolicy.routeForScheme(scheme)
                            == BrowserUriRoutingPolicy.Route.EXTERNAL_CONFIRMATION,
                    scheme + " is an owner-approved Android handoff");
            check(BrowserAddress.shouldHandOffExternalScheme(true, true, scheme),
                    scheme + " main-frame user gesture may reach the confirmation dialog");
            check(BrowserUriRoutingPolicy.shouldConfirmExternalHandoff(true, true, scheme),
                    scheme + " requires explicit handoff confirmation");
        }

        for (String scheme : new String[]{"tg", "market", "whatsapp", "telegram", "smsto",
                "viber", "spotify", "youtube", "chatgpt", "instagram", "android-app", "TG"}) {
            check(BrowserUriRoutingPolicy.routeForScheme(scheme) == BrowserUriRoutingPolicy.Route.WEBVIEW,
                    scheme + " is not an approved Android handoff and stays in Daymark WebView");
            check(!BrowserAddress.shouldHandOffExternalScheme(true, true, scheme),
                    scheme + " must not start an Android app");
            check(!BrowserUriRoutingPolicy.shouldConfirmExternalHandoff(true, true, scheme),
                    scheme + " must not request Android handoff confirmation");
        }

        for (String scheme : new String[]{"http", "https", "javascript", "data", "blob", "about",
                "vbscript", "chrome", "chrome-extension", "devtools", "view-source", "ftp",
                "custom+scheme", "gopher"}) {
            check(BrowserUriRoutingPolicy.routeForScheme(scheme)
                            == BrowserUriRoutingPolicy.Route.WEBVIEW,
                    scheme + " must stay in Daymark WebView");
            check(!BrowserAddress.shouldHandOffExternalScheme(true, true, scheme),
                    scheme + " must not start an Android app");
        }
        for (String scheme : new String[]{"vbscript", "chrome", "chrome-extension", "devtools", "view-source"}) {
            check(BrowserUriRoutingPolicy.isExplicitlyExcludedScheme(scheme),
                    scheme + " must remain an explicit non-handoff exclusion");
            check(!BrowserUriRoutingPolicy.shouldConfirmExternalHandoff(true, true, scheme),
                    scheme + " must never request Android confirmation");
            check(!BrowserUriRoutingPolicy.isOfflinePermittedWebViewScheme(scheme),
                    scheme + " must not bypass its exclusion while Offline");
        }
        for (String scheme : new String[]{"javascript", "data", "blob", "about", "file", "content"}) {
            check(BrowserUriRoutingPolicy.isOfflinePermittedWebViewScheme(scheme),
                    scheme + " may reach its existing local WebView policy while Offline");
        }
        for (String scheme : new String[]{"http", "https", "ftp", "custom+scheme", "gopher"}) {
            check(!BrowserUriRoutingPolicy.isOfflinePermittedWebViewScheme(scheme),
                    scheme + " must not bypass the Offline network boundary");
        }
        for (String scheme : new String[]{"file", "content"}) {
            check(BrowserUriRoutingPolicy.routeForScheme(scheme)
                            == BrowserUriRoutingPolicy.Route.LOCAL_WEBVIEW,
                    scheme + " must dispatch to WebView under its current isolated settings");
            check(BrowserUriRoutingPolicy.isLocalResourceScheme(scheme),
                    scheme + " must identify a local-resource URI");
            check(!BrowserAddress.shouldHandOffExternalScheme(true, true, scheme),
                    scheme + " must not leave Daymark for another app");
        }
        check(BrowserUriRoutingPolicy.routeForScheme("intent")
                        == BrowserUriRoutingPolicy.Route.INTENT_CONFIRMATION,
                "intent:// uses the strict parser and explicit confirmation path");
        check(BrowserUriRoutingPolicy.shouldConfirmExternalHandoff(true, true, "intent"),
                "intent:// handoff requires an explicit confirmation");
        check(!BrowserAddress.shouldHandOffExternalScheme(true, true, "intent"),
                "intent:// must pass through its dedicated strict parser");
        check(BrowserUriRoutingPolicy.routeForScheme("daymark-download")
                        == BrowserUriRoutingPolicy.Route.INTERNAL,
                "Daymark's media-download callback remains internal");

        for (String scheme : new String[]{"tg", "mailto", "tel", "sms", "geo", "custom+scheme",
                "vbscript", "chrome", "chrome-extension", "devtools", "view-source"}) {
            check(!BrowserAddress.shouldHandOffExternalScheme(false, true, scheme),
                    "subframe " + scheme + " cannot trigger an Android chooser");
            check(!BrowserAddress.shouldHandOffExternalScheme(true, false, scheme),
                    "script-driven " + scheme + " cannot trigger an Android chooser");
            check(!BrowserUriRoutingPolicy.shouldConfirmExternalHandoff(false, true, scheme),
                    "subframe " + scheme + " cannot request a confirmation");
            check(!BrowserUriRoutingPolicy.shouldConfirmExternalHandoff(true, false, scheme),
                    "script-driven " + scheme + " cannot request a confirmation");
        }
        check(BrowserUriRoutingPolicy.routeForScheme(null) == BrowserUriRoutingPolicy.Route.REJECTED,
                "a missing scheme is not an external target");
        check(BrowserUriRoutingPolicy.routeForScheme("bad scheme") == BrowserUriRoutingPolicy.Route.REJECTED,
                "malformed schemes are not external targets");
        check(BrowserUriRoutingPolicy.routeForScheme("custom+scheme") == BrowserUriRoutingPolicy.Route.WEBVIEW,
                "an unlisted valid scheme must not be sent to an Android app");
        check(!BrowserAddress.shouldHandOffExternalScheme(true, true, null),
                "a missing scheme cannot hand off to Android");
        System.out.println("PASS browser URI routing: WebView, local isolation, and confirmed Android scheme handoffs");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
