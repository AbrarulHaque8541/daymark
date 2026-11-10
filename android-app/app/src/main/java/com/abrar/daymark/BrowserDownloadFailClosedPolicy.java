package com.abrar.daymark;

/**
 * Temporary browser-download policy while an app-owned redirect-validating transport is absent.
 * New requests must not be sent to Android DownloadManager, which persists request URLs/headers
 * and replays headers across redirects. Existing provider history and completed-file actions remain.
 */
final class BrowserDownloadFailClosedPolicy {
    private static final String OFFLINE_MESSAGE =
            "Browser downloads are blocked while Online is off. Downloads also remain unavailable until Daymark can validate every redirect safely.";
    private static final String SAFE_TRANSPORT_UNAVAILABLE_MESSAGE =
            "Browser downloads are temporarily unavailable until Daymark can validate every redirect safely. Browsing remains available.";

    private BrowserDownloadFailClosedPolicy() { }

    static Decision evaluate(boolean onlineEnabled) {
        return new Decision(false, onlineEnabled
                ? SAFE_TRANSPORT_UNAVAILABLE_MESSAGE
                : OFFLINE_MESSAGE);
    }

    static final class Decision {
        final boolean downloadAllowed;
        final String userMessage;

        private Decision(boolean downloadAllowed, String userMessage) {
            this.downloadAllowed = downloadAllowed;
            this.userMessage = userMessage;
        }
    }
}
