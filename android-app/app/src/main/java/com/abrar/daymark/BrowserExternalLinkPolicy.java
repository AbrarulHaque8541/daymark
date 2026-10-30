package com.abrar.daymark;

import java.util.Locale;
import java.util.Set;

/**
 * Narrow allowlist for explicit user-initiated links that belong in another Android app.
 * WebView remains responsible for HTTP/HTTPS pages; this policy never accepts file/content,
 * javascript, data, intent, or arbitrary custom schemes.
 */
final class BrowserExternalLinkPolicy {
    private static final Set<String> ALLOWED_SCHEMES = Set.of(
            "tg", "telegram", "mailto", "tel", "sms", "smsto", "geo", "market", "whatsapp");

    private BrowserExternalLinkPolicy() { }

    static boolean shouldHandOff(boolean mainFrame, boolean userGesture, String scheme) {
        if (!mainFrame || !userGesture || scheme == null) return false;
        return ALLOWED_SCHEMES.contains(scheme.toLowerCase(Locale.ROOT));
    }
}
