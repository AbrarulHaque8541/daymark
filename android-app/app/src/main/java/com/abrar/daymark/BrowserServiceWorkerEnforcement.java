package com.abrar.daymark;

import android.util.Log;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/**
 * Process-wide Service Worker network enforcement tied to Daymark's Online/Offline mode.
 *
 * <p>ServiceWorkerController is shared by all WebViews. The client must be installed before
 * the first WebView instance is created; DaymarkWebView's class initializer provides that
 * ordering. The platform setting blocks Service Worker network loads globally, while the
 * client returns a synthetic 403 for remote/unknown requests as a second enforcement layer.</p>
 */
final class BrowserServiceWorkerEnforcement {
    private static final String TAG = "DaymarkServiceWorker";
    private static final String BLOCKED_BODY =
            "Blocked by Daymark: Service Worker network access is unavailable while Offline.";

    private static volatile boolean installAttempted;
    private static volatile boolean settingsBlocked;
    private static volatile boolean clientInstalled;
    private static volatile boolean onlineAllowed;

    private BrowserServiceWorkerEnforcement() { }

    static synchronized boolean installBeforeFirstWebView() {
        if (installAttempted) return settingsBlocked || clientInstalled;
        onlineAllowed = false;
        installAttempted = true;

        final ServiceWorkerController controller;
        try {
            controller = ServiceWorkerController.getInstance();
        } catch (RuntimeException unavailable) {
            Log.e(TAG, "Service Worker controller unavailable; browser navigation will remain blocked",
                    unavailable);
            return false;
        }

        try {
            controller.getServiceWorkerWebSettings().setBlockNetworkLoads(
                    BrowserServiceWorkerPolicy.blocksNetworkLoads(onlineAllowed));
            settingsBlocked = true;
        } catch (RuntimeException unavailable) {
            Log.e(TAG, "could not set global Service Worker network block", unavailable);
        }

        try {
            controller.setServiceWorkerClient(new ServiceWorkerClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    String scheme = request == null || request.getUrl() == null
                            ? null : request.getUrl().getScheme();
                    BrowserServiceWorkerPolicy.Decision decision =
                            BrowserServiceWorkerPolicy.decide(onlineAllowed, scheme);
                    if (decision != BrowserServiceWorkerPolicy.Decision.BLOCK) {
                        return null;
                    }
                    // No URL, headers, cookies or query values are logged or forwarded.
                    return blockedResponse();
                }
            });
            clientInstalled = true;
        } catch (RuntimeException unavailable) {
            Log.e(TAG, "could not install Service Worker request client", unavailable);
        }

        if (!settingsBlocked && !clientInstalled) {
            Log.e(TAG, "Service Worker network policy unavailable; browser navigation must fail closed");
        }
        return settingsBlocked || clientInstalled;
    }

    static synchronized boolean enforceBlocked() {
        onlineAllowed = false;
        if (!installAttempted) return installBeforeFirstWebView();
        try {
            ServiceWorkerController.getInstance().getServiceWorkerWebSettings()
                    .setBlockNetworkLoads(true);
            settingsBlocked = true;
        } catch (RuntimeException unavailable) {
            try {
                settingsBlocked = ServiceWorkerController.getInstance()
                        .getServiceWorkerWebSettings().getBlockNetworkLoads();
            } catch (RuntimeException stateUnavailable) {
                // Keep the last known state; the request client independently blocks Offline.
            }
            Log.e(TAG, "could not reassert global Service Worker network block", unavailable);
        }
        boolean enforced = settingsBlocked || clientInstalled;
        if (!enforced) {
            Log.e(TAG, "Offline Service Worker enforcement unavailable; no platform block or request client is active");
        }
        return enforced;
    }

    /**
     * Called only after the browser's existing Online consent/navigation gate has passed.
     * If the platform setting cannot be changed, keep worker requests fail-closed while
     * allowing the ordinary page navigation to proceed.
     */
    static synchronized boolean allowNetworkAfterExplicitConsent() {
        if (!installAttempted && !installBeforeFirstWebView()) return false;
        // Without the request client, the initial platform block is the only remaining
        // barrier. Do not remove it: a later Offline transition could fail to reassert it,
        // leaving service-worker requests with no independent fail-closed enforcement.
        if (!BrowserServiceWorkerPolicy.canEnableNetworkAfterConsent(clientInstalled)) {
            onlineAllowed = false;
            Log.w(TAG, "Service Worker request client unavailable; worker network remains blocked even while Online");
            return false;
        }
        // The user has already passed Daymark's explicit Online gate. The client may
        // allow HTTP/HTTPS now; the platform setting is separately unblocked when supported.
        onlineAllowed = true;
        try {
            ServiceWorkerController.getInstance().getServiceWorkerWebSettings()
                    .setBlockNetworkLoads(false);
            settingsBlocked = false;
            return true;
        } catch (RuntimeException unavailable) {
            try {
                settingsBlocked = ServiceWorkerController.getInstance()
                        .getServiceWorkerWebSettings().getBlockNetworkLoads();
            } catch (RuntimeException stateUnavailable) {
                // Retain the last known platform state. When installed, the request client
                // still applies the explicit Online/Offline decision independently.
            }
            Log.w(TAG, "could not change the Service Worker platform setting after Online consent; the current setting is retained",
                    unavailable);
            return !settingsBlocked;
        }
    }

    private static WebResourceResponse blockedResponse() {
        return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                403,
                "Blocked by Daymark",
                Collections.singletonMap("Cache-Control", "no-store"),
                new ByteArrayInputStream(BLOCKED_BODY.getBytes(StandardCharsets.UTF_8)));
    }
}
