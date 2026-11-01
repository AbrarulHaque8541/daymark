package com.abrar.daymark;

import java.util.List;

/**
 * Enforces the embedded browser's network boundary.
 *
 * <p>Online consent is not navigation consent: turning Online on never loads or reloads a
 * page. A WebView is unblocked only at the explicit, validated user-navigation boundary.
 * Switching Offline immediately stops and blocks every retained tab before teardown.</p>
 */
final class BrowserWorkspaceController {
    private BrowserWorkspaceController() {}

    static void prepareForExplicitNavigation(BrowserNetworkPolicy policy, DaymarkWebView target) {
        if (policy == null || target == null || !policy.allowsRemoteLoads()) {
            throw new IllegalStateException("Explicit Online consent is required before navigation.");
        }
        target.getSettings().setBlockNetworkLoads(false);
    }

    /**
     * Unblocks every retained tab at an explicit, validated user-navigation boundary.
     * {@link #enforceOffline} blocks ALL tabs when going Offline; without this counterpart
     * a background tab stays blocked after an offline→online cycle and silently drops
     * every load with no WebView callback (#221).
     */
    static void prepareTabsForExplicitNavigation(BrowserNetworkPolicy policy, List<DaymarkWebView> tabs) {
        if (policy == null || !policy.allowsRemoteLoads() || tabs == null) return;
        for (DaymarkWebView tab : tabs) {
            if (tab == null) continue;
            try {
                tab.getSettings().setBlockNetworkLoads(false);
            } catch (RuntimeException rendererUnavailable) {
                // A crashed renderer is recovered via onRenderProcessGone.
            }
        }
    }

    static void enforceOffline(BrowserNetworkPolicy policy, List<DaymarkWebView> tabs) {
        BrowserOfflineEnforcement.enforceOffline(policy, tabs);
    }
}
