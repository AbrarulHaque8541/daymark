package com.abrar.daymark;

public final class BrowserExternalLinkPolicySmoke {
    public static void main(String[] args) {
        for (String scheme : new String[]{"mailto", "tel", "sms", "geo", "tg", "telegram",
                "smsto", "market", "whatsapp", "TG", "viber", "spotify", "youtube",
                "chatgpt", "instagram", "android-app", "custom+scheme", "ftp", "vbscript",
                "chrome", "chrome-extension", "devtools", "view-source"}) {
            check(BrowserUriRoutingPolicy.routeForScheme(scheme)
                            == BrowserUriRoutingPolicy.Route.EXTERNAL_CONFIRMATION,
                    scheme + " must remain usable through a confirmed Android handoff");
            check(BrowserAddress.shouldHandOffExternalScheme(true, true, scheme),
                    scheme + " main-frame user gesture may reach the confirmation dialog");
            check(BrowserUriRoutingPolicy.shouldConfirmExternalHandoff(true, true, scheme),
                    scheme + " requires explicit handoff confirmation");
        }

        for (String scheme : new String[]{"http", "https", "javascript", "data", "blob", "about"}) {
            check(BrowserUriRoutingPolicy.routeForScheme(scheme)
                            == BrowserUriRoutingPolicy.Route.WEBVIEW,
                    scheme + " must stay in Daymark WebView");
            check(!BrowserAddress.shouldHandOffExternalScheme(true, true, scheme),
                    scheme + " must not start an Android app");
        }
        for (String scheme : new String[]{"file", "content"}) {
            check(BrowserUriRoutingPolicy.routeForScheme(scheme)
                            == BrowserUriRoutingPolicy.Route.LOCAL_ACCESS_RESTRICTED,
                    scheme + " must not broaden local file/content access");
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

        for (String scheme : new String[]{"tg", "mailto", "tel", "sms", "geo", "custom+scheme"}) {
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
        check(!BrowserAddress.shouldHandOffExternalScheme(true, true, null),
                "a missing scheme cannot hand off to Android");
        System.out.println("PASS browser URI routing: WebView, local isolation, and confirmed Android scheme handoffs");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
