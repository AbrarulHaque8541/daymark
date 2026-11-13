package com.abrar.daymark;

/**
 * Navigation gate for Android intent:// handoffs.
 *
 * <p>Intent URIs can cause either a top-level WebView load or an external app chooser.
 * Only a top-level navigation explicitly initiated by a user may reach the parser/handler.
 */
final class BrowserIntentHandoffPolicy {
    private BrowserIntentHandoffPolicy() { }

    static boolean allows(boolean isForMainFrame, boolean hasUserGesture) {
        return isForMainFrame && hasUserGesture;
    }
}
