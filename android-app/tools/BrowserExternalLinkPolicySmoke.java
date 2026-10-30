package com.abrar.daymark;

public final class BrowserExternalLinkPolicySmoke {
    public static void main(String[] args) {
        for (String scheme : new String[]{"tg", "telegram", "mailto", "tel", "sms",
                "smsto", "geo", "market", "whatsapp", "TG"}) {
            assert BrowserExternalLinkPolicy.shouldHandOff(true, true, scheme) : scheme;
        }
        for (String scheme : new String[]{"http", "https", "intent", "javascript",
                "file", "content", "data", "ftp", null}) {
            assert !BrowserExternalLinkPolicy.shouldHandOff(true, true, scheme) : scheme;
        }
        assert !BrowserExternalLinkPolicy.shouldHandOff(false, true, "tg")
                : "subframe links must not launch external apps";
        assert !BrowserExternalLinkPolicy.shouldHandOff(true, false, "tg")
                : "external app launches require a user gesture";
        assert !BrowserExternalLinkPolicy.shouldHandOff(true, true, null);
        System.out.println("PASS browser external-link policy: allowlisted schemes, main-frame and gesture gates");
    }
}
