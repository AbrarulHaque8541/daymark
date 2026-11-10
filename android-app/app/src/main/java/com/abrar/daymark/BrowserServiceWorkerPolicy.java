package com.abrar.daymark;

import java.util.Locale;

/**
 * User-controlled Online/Offline policy for the process-wide WebView Service Worker path.
 *
 * <p>Online is a browser-wide consent state. Once the user explicitly navigates while
 * Online, HTTP/HTTPS worker requests follow that same state. Offline blocks remote worker
 * requests process-wide; local and cached responses remain usable.</p>
 */
final class BrowserServiceWorkerPolicy {
    enum Decision {
        ALLOW_LOCAL,
        ALLOW_NETWORK,
        BLOCK
    }

    private static boolean compatibilityNoticeShown;

    private BrowserServiceWorkerPolicy() { }

    static Decision decide(boolean onlineEnabled, String scheme) {
        if (scheme == null) return Decision.BLOCK;
        String normalized = scheme.trim().toLowerCase(Locale.ROOT);
        if ("data".equals(normalized) || "blob".equals(normalized)
                || "about".equals(normalized)) {
            return Decision.ALLOW_LOCAL;
        }
        if (onlineEnabled && ("http".equals(normalized) || "https".equals(normalized))) {
            return Decision.ALLOW_NETWORK;
        }
        return Decision.BLOCK;
    }

    static boolean blocksNetworkLoads(boolean onlineEnabled) {
        return !onlineEnabled;
    }

    /**
     * The process-wide platform setting is a useful first barrier, but it can fail to
     * reassert after an Online session. Only the installed request client provides the
     * independent fail-closed fallback required before worker networking may be enabled.
     */
    static boolean canEnableNetworkAfterConsent(boolean requestClientInstalled) {
        return requestClientInstalled;
    }

    static synchronized boolean shouldShowCompatibilityNotice() {
        if (compatibilityNoticeShown) return false;
        compatibilityNoticeShown = true;
        return true;
    }

    static String compatibilityDisclosure() {
        return "Service Worker network requests follow Daymark's Online/Offline mode. Remote worker requests are blocked while Offline; cached responses may still work. If Daymark cannot install its request guard or change its process-wide worker setting, worker network access remains blocked even while Online.";
    }
}
