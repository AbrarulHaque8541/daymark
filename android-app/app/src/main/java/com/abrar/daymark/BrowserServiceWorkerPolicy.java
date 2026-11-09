package com.abrar.daymark;

import java.util.Locale;

/**
 * Deliberately fail-closed policy for the process-wide WebView Service Worker network path.
 *
 * <p>Daymark does not yet have a reviewed origin-scoped Service Worker grant model. An
 * Online toggle or an explicit top-level navigation therefore never grants a worker
 * permission to make its own network requests. Local responses may still be used.</p>
 */
final class BrowserServiceWorkerPolicy {
    enum Decision {
        ALLOW_LOCAL,
        BLOCK
    }

    private static boolean compatibilityNoticeShown;

    private BrowserServiceWorkerPolicy() { }

    static Decision decide(boolean onlineEnabled, boolean explicitNavigation, String scheme) {
        // These inputs are intentionally not grants. Service Worker network access remains
        // disabled even after an explicit site navigation while normal page loads are Online.
        if (scheme == null) return Decision.BLOCK;
        String normalized = scheme.trim().toLowerCase(Locale.ROOT);
        if ("data".equals(normalized) || "blob".equals(normalized)
                || "about".equals(normalized)) {
            return Decision.ALLOW_LOCAL;
        }
        return Decision.BLOCK;
    }

    static boolean blocksNetworkLoads() {
        return true;
    }

    static synchronized boolean shouldShowCompatibilityNotice() {
        if (compatibilityNoticeShown) return false;
        compatibilityNoticeShown = true;
        return true;
    }

    static String compatibilityDisclosure() {
        return "Daymark blocks Service Worker network requests, even while Online. Cached responses may still work; sites that rely on worker updates or background network sync may be limited.";
    }
}
