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
    static final String EXCLUDED_SCHEME_ATTEMPT_NOTICE =
            "This browser/system URI stays in Daymark; WebView may not support it, and it will not be sent to another app.";
    static final String EXCLUDED_SCHEME_BLOCKED_NOTICE =
            "Daymark WebView could not open this browser/system URI. It was not sent to another app.";
    static final String EXCLUDED_SCHEME_OFFLINE_NOTICE =
            "This browser/system URI is unavailable while Daymark is Offline. It was not sent to another app.";
    static final String OFFLINE_NON_WEB_BLOCKED_NOTICE =
            "This URI is not available while Daymark is Offline. No external app was opened.";

    private BrowserUriRoutingPolicy() { }

    static Route routeForScheme(String scheme) {
        if (scheme == null) return Route.REJECTED;
        String normalized = scheme.trim().toLowerCase(Locale.ROOT);
        if (!SCHEME.matcher(normalized).matches()) return Route.REJECTED;
        if (isExplicitlyExcludedScheme(normalized)) return Route.WEBVIEW;
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
                // Only the explicit Android-app URI allowlist leaves Daymark; other valid
                // but unlisted schemes are still offered to System WebView.
                return BrowserAddress.isExplicitExternalScheme(normalized)
                        ? Route.EXTERNAL_CONFIRMATION : Route.WEBVIEW;
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
