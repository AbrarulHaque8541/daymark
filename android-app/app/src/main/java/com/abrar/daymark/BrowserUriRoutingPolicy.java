package com.abrar.daymark;

import java.util.Locale;
import java.util.regex.Pattern;

/** Scheme routing for browser navigation, independent of Android UI and WebView APIs. */
final class BrowserUriRoutingPolicy {
    enum Route {
        WEBVIEW,
        LOCAL_WEBVIEW,
        INTENT_CONFIRMATION,
        EXTERNAL_CONFIRMATION,
        INTERNAL,
        REJECTED
    }

    private static final Pattern SCHEME = Pattern.compile("^[A-Za-z][A-Za-z0-9+.-]*$");
    static final String LOCAL_RESOURCE_ATTEMPT_NOTICE =
            "Daymark WebView will try this URI, but local file and content-provider access is disabled for safety.";
    static final String LOCAL_RESOURCE_BLOCKED_NOTICE =
            "Daymark WebView could not open this URI because local file and content-provider access is disabled for safety.";
    static final String REJECTED_SCHEME_NOTICE =
            "Daymark blocked this URI scheme. Nothing was opened or sent to another app.";
    static final String OFFLINE_NON_WEB_BLOCKED_NOTICE =
            "This URI is not available while Daymark is Offline. No external app was opened.";

    private BrowserUriRoutingPolicy() { }

    static Route routeForScheme(String scheme) {
        if (scheme == null) return Route.REJECTED;
        String normalized = scheme.trim().toLowerCase(Locale.ROOT);
        if (!SCHEME.matcher(normalized).matches()) return Route.REJECTED;
        if (isExplicitlyExcludedScheme(normalized)) return Route.REJECTED;
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
                return Route.LOCAL_WEBVIEW;
            case "intent":
                return Route.INTENT_CONFIRMATION;
            case "daymark-download":
                return Route.INTERNAL;
            default:
                return BrowserAddress.isExplicitExternalScheme(normalized)
                        ? Route.EXTERNAL_CONFIRMATION : Route.REJECTED;
        }
    }

    static boolean isLocalResourceScheme(String scheme) {
        if (scheme == null) return false;
        String normalized = scheme.trim().toLowerCase(Locale.ROOT);
        return "file".equals(normalized) || "content".equals(normalized);
    }

    static boolean isExplicitlyExcludedScheme(String scheme) {
        if (scheme == null) return false;
        String normalized = scheme.trim().toLowerCase(Locale.ROOT);
        switch (normalized) {
            case "vbscript":
            case "chrome":
            case "chrome-extension":
            case "devtools":
            case "view-source":
                return true;
            default:
                return false;
        }
    }

    static boolean isOfflinePermittedWebViewScheme(String scheme) {
        if (scheme == null) return false;
        String normalized = scheme.trim().toLowerCase(Locale.ROOT);
        // These existing WebView-local schemes do not require remote network access.
        switch (normalized) {
            case "javascript":
            case "data":
            case "blob":
            case "about":
            case "file":
            case "content":
                return true;
            default:
                return false;
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
