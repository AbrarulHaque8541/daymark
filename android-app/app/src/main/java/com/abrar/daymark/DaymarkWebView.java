package com.abrar.daymark;
import android.app.Activity;
import android.net.http.SslError;
import android.os.Build;
import android.view.View;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Daymark system WebView with network policy, intent links, and GPU performance tiers. */
final class DaymarkWebView extends WebView {
    interface Listener {
        void onPageStarted(String url);
        void onPageFinished(String url);
        void onReceivedError(String url, int errorCode, String description);
        void onNavigationBlocked(String url, String reason);
        void onRendererGone();
        void onProgressChanged(int progress);
        void onShowFullscreen(View view, WebChromeClient.CustomViewCallback callback);
        void onHideFullscreen();
        boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture);
    }

    private final BrowserNetworkPolicy networkPolicy;
    private final Listener listener;
    private final ExtensionRuntime extensionRuntime;

    DaymarkWebView(Activity activity, BrowserNetworkPolicy networkPolicy,
                   boolean safeBrowsingEnabled, Listener listener) {
        super(activity);
        this.networkPolicy = networkPolicy;
        this.listener = listener;
        this.extensionRuntime = ExtensionRuntime.create(activity);
        try {
            android.webkit.CookieManager cookieManager = android.webkit.CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
        } catch (Throwable ignored) {
        }
        setFocusable(true);
        setFocusableInTouchMode(true);
        setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        setLayerType(View.LAYER_TYPE_HARDWARE, null);

        WebSettings settings = getSettings();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            settings.setOffscreenPreRaster(false);
        }
        settings.setBlockNetworkLoads(true);
        settings.setJavaScriptEnabled(true);
        settings.setUserAgentString(
                "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 "
                        + "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setLoadsImagesAutomatically(true);
        settings.setSafeBrowsingEnabled(safeBrowsingEnabled);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(BrowserViewportPolicy.SUPPORT_MULTIPLE_WINDOWS);
        settings.setUseWideViewPort(BrowserViewportPolicy.USE_WIDE_VIEW_PORT);
        settings.setLoadWithOverviewMode(BrowserViewportPolicy.LOAD_WITH_OVERVIEW_MODE);
        settings.setSupportZoom(BrowserViewportPolicy.SUPPORT_ZOOM);
        settings.setBuiltInZoomControls(BrowserViewportPolicy.BUILT_IN_ZOOM_CONTROLS);
        settings.setDisplayZoomControls(BrowserViewportPolicy.DISPLAY_ZOOM_CONTROLS);

        setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) return true;
                String url = request.getUrl().toString();
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                listener.onPageStarted(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                listener.onPageFinished(url);
            }
        });

        setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                listener.onProgressChanged(newProgress);
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                listener.onShowFullscreen(view, callback);
            }

            @Override
            public void onHideCustomView() {
                listener.onHideFullscreen();
            }
        });
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        super.onWindowVisibilityChanged(visibility);
        applyPerformanceTier(visibility == View.VISIBLE);
    }

    void applyPerformanceTier(boolean active) {
        if (active) {
            setLayerType(View.LAYER_TYPE_HARDWARE, null);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                getSettings().setOffscreenPreRaster(true);
            }
        } else {
            setLayerType(View.LAYER_TYPE_NONE, null);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                getSettings().setOffscreenPreRaster(false);
            }
        }
    }
}
