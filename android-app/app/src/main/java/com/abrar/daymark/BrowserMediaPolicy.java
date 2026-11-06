package com.abrar.daymark;

/** Validation for user-initiated media downloads discovered inside WebView pages. HTTP media is allowed on the owner-approved HTTP+HTTPS browsing policy. */
final class BrowserMediaPolicy {
    private BrowserMediaPolicy() { }

    static boolean allowsHandoff(boolean onlineEnabled, boolean userGesture,
                                 String scheme, String host, String mediaUrl) {
        return onlineEnabled
                && userGesture
                && "daymark-download".equalsIgnoreCase(scheme)
                && "media".equalsIgnoreCase(host)
                && BrowserHttpPolicy.isAllowedWebScheme(mediaUrl)
                && BrowserAddress.isAllowedWebUrl(mediaUrl);
    }
}
