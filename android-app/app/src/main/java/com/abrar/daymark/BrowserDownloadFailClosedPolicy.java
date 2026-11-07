package com.abrar.daymark;

/**
 * Temporary browser-download policy while the app-owned redirect-validating transport is absent.
 * Never routes new browser downloads to Android DownloadManager.
 */
final class BrowserDownloadFailClosedPolicy {
    private static final String OFFLINE_MESSAGE =
            "Browser downloads are blocked while Online is off. Enable Online before downloading.";
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
