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
 * Process-wide fail-closed Service Worker network enforcement.
 *
 * <p>ServiceWorkerController is shared by all WebViews. The client must be installed before
 * the first WebView instance is created; DaymarkWebView's class initializer provides that
 * ordering. The platform setting blocks Service Worker network loads globally, while the
 * client returns a synthetic 403 for remote/unknown requests as a second enforcement layer.</p>
 */
final class BrowserServiceWorkerEnforcement {
    private static final String TAG = "DaymarkServiceWorker";
    private static final String BLOCKED_BODY =
            "Blocked by Daymark: Service Worker network access is disabled.";

    private static volatile boolean installAttempted;
    private static volatile boolean settingsBlocked;
    private static volatile boolean clientInstalled;

    private BrowserServiceWorkerEnforcement() { }

    static synchronized boolean installBeforeFirstWebView() {
        if (installAttempted) return settingsBlocked || clientInstalled;
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
                    BrowserServiceWorkerPolicy.blocksNetworkLoads());
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
                            BrowserServiceWorkerPolicy.decide(true, true, scheme);
                    if (decision == BrowserServiceWorkerPolicy.Decision.ALLOW_LOCAL) {
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
        if (!installAttempted) return installBeforeFirstWebView();
        try {
            ServiceWorkerController.getInstance().getServiceWorkerWebSettings()
                    .setBlockNetworkLoads(true);
            settingsBlocked = true;
        } catch (RuntimeException unavailable) {
            Log.e(TAG, "could not reassert global Service Worker network block", unavailable);
        }
        return settingsBlocked || clientInstalled;
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
