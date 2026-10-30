package com.abrar.daymark;

public final class BrowserExternalLinkPolicySmoke {
    public static void main(String[] args) {
        for (String scheme : new String[]{"tg", "telegram", "mailto", "tel", "sms",
                "smsto", "geo", "market", "whatsapp", "TG", "viber", "spotify",
                "youtube", "chatgpt", "instagram", "android-app", "custom+scheme"}) {
            assert BrowserAddress.shouldHandOffExternalScheme(true, true, scheme) : scheme;
        }
        for (String scheme : new String[]{"http", "https", "intent", "javascript", "vbscript",
                "file", "content", "data", "blob", "about", "daymark-download",
                "chrome", "chrome-extension", "devtools", "view-source", "", "bad scheme", null}) {
            assert !BrowserAddress.shouldHandOffExternalScheme(true, true, scheme) : scheme;
        }
        assert !BrowserAddress.shouldHandOffExternalScheme(false, true, "tg")
                : "subframe links must not launch external apps";
        assert !BrowserAddress.shouldHandOffExternalScheme(false, true, "custom+scheme")
                : "unknown schemes must not launch from subframes";
        assert !BrowserAddress.shouldHandOffExternalScheme(true, false, "tg")
                : "external app launches require a user gesture";
        assert !BrowserAddress.shouldHandOffExternalScheme(true, true, null);
        System.out.println("PASS browser external-link policy: allowlisted schemes, main-frame and gesture gates");
    }
}
