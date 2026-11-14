package com.abrar.daymark;

import java.util.Locale;
import java.util.regex.Pattern;

/** Scheme routing for browser navigation, independent of Android UI and WebView APIs. */
final class BrowserUriRoutingPolicy {
    enum Route {
        WEBVIEW,
        LOCAL_ACCESS_RESTRICTED,
        INTENT_CONFIRMATION,
        EXTERNAL_CONFIRMATION,
        INTERNAL,
        REJECTED
    }

    private static final Pattern SCHEME = Pattern.compile("^[A-Za-z][A-Za-z0-9+.-]*$");

    private BrowserUriRoutingPolicy() { }

    static Route routeForScheme(String scheme) {
        if (scheme == null) return Route.REJECTED;
        String normalized = scheme.trim().toLowerCase(Locale.ROOT);
        if (!SCHEME.matcher(normalized).matches()) return Route.REJECTED;
        switch (normalized) {
            case "http":
            case "https":
            case "javascript":
            case "data":
            case "blob":
            case "about":
                return Route.WEBVIEW;
            case "file":
            case "content":
                return Route.LOCAL_ACCESS_RESTRICTED;
            case "intent":
                return Route.INTENT_CONFIRMATION;
            case "daymark-download":
                return Route.INTERNAL;
            default:
                // Keep other valid URI schemes usable through an Android handler,
                // but only after the app asks the user to confirm the handoff.
                return Route.EXTERNAL_CONFIRMATION;
        }
    }

    static boolean shouldConfirmExternalHandoff(boolean isForMainFrame,
                                               boolean hasUserGesture,
                                               String scheme) {
        if (!isForMainFrame || !hasUserGesture) return false;
        Route route = routeForScheme(scheme);
        return route == Route.EXTERNAL_CONFIRMATION || route == Route.INTENT_CONFIRMATION;
    }

    static boolean isWebScheme(String scheme) {
        if (scheme == null) return false;
        return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
    }
}
