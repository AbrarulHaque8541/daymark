package com.abrar.daymark;

import java.util.List;

/**
 * Best-effort offline teardown for WebViews whose renderer may have exited.
 *
 * Android's onRenderProcessGone contract makes that WebView unusable. A stale tab
 * must not crash the Activity or prevent other tabs from being blocked. Attempt
 * both operations independently; the app-level navigation policy remains Offline.
 */
final class BrowserOfflineEnforcement {
    interface Tab {
        void blockNetworkLoads(boolean blocked);
        void stopLoading();
    }

    private BrowserOfflineEnforcement() { }

    static void enforceOffline(BrowserNetworkPolicy policy, List<? extends Tab> tabs) {
        if (policy == null || policy.allowsRemoteLoads() || tabs == null) return;
        for (Tab tab : tabs) {
            if (tab == null) continue;
            try {
                tab.blockNetworkLoads(true);
            } catch (RuntimeException rendererUnavailable) {
                // A terminated renderer cannot continue issuing page/resource requests.
            }
            try {
                tab.stopLoading();
            } catch (RuntimeException rendererUnavailable) {
                // Continue enforcing Offline for every other retained tab.
            }
        }
    }
}
