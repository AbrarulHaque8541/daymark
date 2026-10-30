package com.abrar.daymark;
import android.app.Activity;
import android.net.http.SslError;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceError;
import android.webkit.DownloadListener;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;

/** A narrow wrapper around Android System WebView; no native bridge or request interception is used. */
final class DaymarkWebView extends WebView {
    interface Listener {
        void onPageStarted(String url);
        void onPageFinished(String url);
        void onNavigationBlocked(String url);
        void onOfflineNavigationBlocked();
        void onHttpNavigationBlocked(String url, boolean redirect);
        void onLoadError(int errorCode, String description, String failingUrl);
        void onDownloadRequested(String url, String userAgent, String contentDisposition, String mimeType, long contentLength);
        void onMediaDownloadRequested(String url);
        void onShowFullscreen(View view, WebChromeClient.CustomViewCallback callback);
        void onHideFullscreen();
        void onRendererGone();
    }

    private boolean handleIntentLink(WebView view, String value) {
        final BrowserIntentLinkPolicy.Decision decision;
        try {
            decision = BrowserIntentLinkPolicy.parse(value);
        } catch (IllegalArgumentException invalid) {
            android.widget.Toast.makeText(view.getContext(),
                    "This Android app link was blocked because its Intent data is unsafe.",
                    android.widget.Toast.LENGTH_SHORT).show();
            return true;
        }

        android.net.Uri target = android.net.Uri.parse(decision.targetUri);
        String scheme = target.getScheme();
        boolean webTarget = "https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme);
        if (webTarget && decision.packageName == null) {
            if (!networkPolicy.allowsRemoteLoads()) {
                listener.onOfflineNavigationBlocked();
                return true;
            }
            if (BrowserAddress.isAllowedWebUrl(decision.targetUri)) {
                view.loadUrl(decision.targetUri);
            } else {
                listener.onNavigationBlocked(decision.targetUri);
            }
            return true;
        }

        android.content.Intent external = new android.content.Intent(
                android.content.Intent.ACTION_VIEW, target);
        external.addCategory(android.content.Intent.CATEGORY_BROWSABLE);
        if (decision.packageName != null) external.setPackage(decision.packageName);
        try {
            android.content.pm.ResolveInfo resolved = view.getContext().getPackageManager()
                    .resolveActivity(external, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY);
            if (resolved == null) throw new android.content.ActivityNotFoundException();
            view.getContext().startActivity(android.content.Intent.createChooser(
                    external, "Open with — cancel to stay in Daymark"));
            return true;
        } catch (android.content.ActivityNotFoundException | SecurityException unavailable) {
            String fallback = decision.fallbackUrl;
            if (fallback != null && BrowserAddress.isAllowedWebUrl(fallback)) {
                if (networkPolicy.allowsRemoteLoads()) view.loadUrl(fallback);
                else listener.onOfflineNavigationBlocked();
            } else {
                android.widget.Toast.makeText(view.getContext(),
                        "No compatible app found. This page remains open.",
                        android.widget.Toast.LENGTH_SHORT).show();
            }
            return true;
        }
    }

    private boolean handOffVerifiedAppLink(WebView view, android.net.Uri uri) {
        android.content.Intent appLink = new android.content.Intent(
                android.content.Intent.ACTION_VIEW, uri);
        appLink.addCategory(android.content.Intent.CATEGORY_BROWSABLE);
        android.content.pm.PackageManager packageManager = view.getContext().getPackageManager();
        android.content.pm.ResolveInfo resolved = packageManager.resolveActivity(appLink,
                android.content.pm.PackageManager.MATCH_DEFAULT_ONLY
                        | android.content.pm.PackageManager.GET_RESOLVED_FILTER);
        if (resolved == null || resolved.activityInfo == null || resolved.filter == null
                || !resolved.isDefault || resolved.filter.countDataAuthorities() == 0) {
            return false; // No default handler with an explicit host filter; keep the URL in Daymark.
        }
        boolean specificHost = false;
        for (int i = 0; i < resolved.filter.countDataAuthorities(); i++) {
            android.content.IntentFilter.AuthorityEntry authority =
                    resolved.filter.getDataAuthority(i);
            String filterHost = authority == null ? null : authority.getHost();
            if (filterHost == null || filterHost.startsWith("*")) continue;
            if (filterHost.equalsIgnoreCase(uri.getHost())
                    && authority.match(uri) != android.content.IntentFilter.NO_MATCH_DATA) {
                specificHost = true;
                break;
            }
        }
        if (!specificHost) {
            return false; // Generic browser/wildcard filters never count as a verified App Link.
        }
        try {
            view.getContext().startActivity(appLink);
            return true;
        } catch (android.content.ActivityNotFoundException | SecurityException unavailable) {
            return false; // Resolver changed or app declined: continue the original URL in WebView.
        }
    }

    private final ExtensionRuntime extensionRuntime;
    private final BrowserNetworkPolicy networkPolicy;
    private final Listener listener;

    boolean isShowingCustomView() {
        return fullscreenView != null;
    }

    void hideCustomView() {
        if (fullscreenView == null) return;
        WebChromeClient.CustomViewCallback callback = fullscreenCallback;
        fullscreenView = null;
        fullscreenCallback = null;
        listener.onHideFullscreen();
        if (callback != null) callback.onCustomViewHidden();
    }

    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

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
            // CookieManager may fail in headless/isolated test environments
        }
        setFocusable(true);
        setFocusableInTouchMode(true);
        setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        setLayerType(View.LAYER_TYPE_HARDWARE, null);

        WebSettings settings = getSettings();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            settings.setOffscreenPreRaster(true);
        }
        settings.setBlockNetworkLoads(true);
        settings.setJavaScriptEnabled(true);
        // Many sites (including Google) render poorly or blank with the default WebView UA.
        settings.setUserAgentString(
                "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 "
                        + "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(false);
        // Performance: reuse HTTP disk cache; decode images (network policy still gates loads).
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
        // Viewport/zoom/pop-up policy: see BrowserViewportPolicy. Multiple windows stay
        // disabled so target="_blank" result links load in this WebView (and still pass the
        // HTTPS/offline guard) instead of being silently dropped.
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
                String scheme = request.getUrl().getScheme();
                // Android intent:// links are parsed into a fresh, allowlisted ACTION_VIEW intent.
                // Component names, selectors, arbitrary extras and launch flags are never forwarded.
                if ("intent".equalsIgnoreCase(scheme)) return handleIntentLink(view, url);
                // Verified HTTP(S) App Links may open in their owning app after a top-level
                // user gesture. Generic browser handlers remain inside Daymark.
                if (request.isForMainFrame() && request.hasGesture()
                        && BrowserAddress.isAllowedWebUrl(url)
                        && handOffVerifiedAppLink(view, request.getUrl())) {
                    return true;
                }

                if (BrowserAddress.shouldHandOffExternalScheme(request.isForMainFrame(),
                        request.hasGesture(), scheme)) {
                    try {
                        android.content.Intent external = new android.content.Intent(
                                android.content.Intent.ACTION_VIEW, request.getUrl());
                        external.addCategory(android.content.Intent.CATEGORY_BROWSABLE);
                        android.content.Intent chooser = android.content.Intent.createChooser(
                                external, "Open with — cancel to stay in Daymark");
                        view.getContext().startActivity(chooser);
                    } catch (android.content.ActivityNotFoundException
                             | SecurityException unavailable) {
                        android.widget.Toast.makeText(view.getContext(),
                                "No compatible app found. This page remains open.",
                                android.widget.Toast.LENGTH_SHORT).show();
                    }
                    return true;
                }
                if ("daymark-download".equalsIgnoreCase(request.getUrl().getScheme())) {
                    String mediaUrl = request.getUrl().getQueryParameter("url");
                    if (BrowserMediaPolicy.allowsHandoff(networkPolicy.allowsRemoteLoads(),
                            request.hasGesture(), request.getUrl().getScheme(),
                            request.getUrl().getHost(), mediaUrl)) {
                        listener.onMediaDownloadRequested(mediaUrl);
                    }
                    return true;
                }
                if (!networkPolicy.allowsRemoteLoads()) {
                    listener.onOfflineNavigationBlocked();
                    return true;
                }
                // HTTP and HTTPS are both allowed in the browser (BrowserHttpPolicy.ALLOW_HTTP).
                // HTTP pages show "Not encrypted" in the UI. Updater stays HTTPS-only (separate path).
                // HTTPS→HTTP redirect downgrades are still blocked below for safety.
                if (request.isForMainFrame() && request.isRedirect()
                        && "http".equalsIgnoreCase(request.getUrl().getScheme())
                        && view.getUrl() != null
                        && "https".equalsIgnoreCase(android.net.Uri.parse(view.getUrl()).getScheme())) {
                    listener.onHttpNavigationBlocked(url, true);
                    return true;
                }
                if (BrowserAddress.isAllowedWebUrl(url)) return false;
                listener.onNavigationBlocked(url);
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                Log.i("DaymarkWebView", "page started origin=" + BrowserLogPolicy.redactedOrigin(url));
                if (!networkPolicy.allowsRemoteLoads()) {
                    listener.onOfflineNavigationBlocked();
                    return;
                }
                listener.onPageStarted(url);
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                Log.i("DaymarkWebView", "page commit visible origin="
                        + BrowserLogPolicy.redactedOrigin(url));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Log.i("DaymarkWebView", "page finished origin=" + BrowserLogPolicy.redactedOrigin(url));
                listener.onPageFinished(url);
                // Diagnostic only: distinguish completed navigation from content ready for a draw.
                view.postVisualStateCallback(SystemClock.uptimeMillis(),
                        new WebView.VisualStateCallback() {
                            @Override
                            public void onComplete(long requestId) {
                                Log.i("DaymarkWebView", "visual state ready origin="
                                        + BrowserLogPolicy.redactedOrigin(url)
                                        + " attached=" + (view.getParent() != null)
                                        + " visible=" + (view.getVisibility() == View.VISIBLE)
                                        + " size=" + view.getWidth() + "x" + view.getHeight());
                            }
                        });
                // Local Daymark packs only (CSS/userscript-style). No chrome.* APIs, no request interception.
                if (extensionRuntime != null && networkPolicy.allowsRemoteLoads()) {
                    extensionRuntime.onPageFinished(view, url);
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                listener.onLoadError(-1, "certificate error: " + error.getPrimaryError(), error.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Log.e("DaymarkWebView", "onReceivedError code=" + errorCode
                        + " origin=" + BrowserLogPolicy.redactedOrigin(failingUrl)
                        + " description=" + (description == null ? "" : description));
                if (!networkPolicy.allowsRemoteLoads()) {
                    listener.onOfflineNavigationBlocked();
                    return;
                }
                listener.onLoadError(errorCode, description == null ? "" : description, failingUrl);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                Log.e("DaymarkWebView", "onReceivedError code=" + error.getErrorCode()
                        + " origin=" + BrowserLogPolicy.redactedOrigin(request.getUrl().toString())
                        + " description=" + (error.getDescription() == null
                        ? "" : error.getDescription().toString()));
                if (!networkPolicy.allowsRemoteLoads()) {
                    listener.onOfflineNavigationBlocked();
                    return;
                }
                listener.onLoadError(error.getErrorCode(),
                        error.getDescription() == null ? "" : error.getDescription().toString(),
                        request.getUrl().toString());
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request,
                                            WebResourceResponse errorResponse) {
                if (!request.isForMainFrame()) return;
                int statusCode = errorResponse == null ? -1 : errorResponse.getStatusCode();
                Log.e("DaymarkWebView", "onReceivedHttpError status=" + statusCode
                        + " origin=" + BrowserLogPolicy.redactedOrigin(request.getUrl().toString()));
            }

            @Override
            public void onFormResubmission(WebView view, android.os.Message dontResend, android.os.Message resend) {
                // Never silently re-POST form data; avoids accidental duplicate submissions.
                if (dontResend != null) dontResend.sendToTarget();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                Log.e("DaymarkWebView", "onRenderProcessGone origin="
                        + BrowserLogPolicy.redactedOrigin(view.getUrl())
                        + " didCrash=" + (detail != null && detail.didCrash()));
                listener.onRendererGone();
                return true;
            }
        });

        setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                fullscreenView = view;
                fullscreenCallback = callback;
                listener.onShowFullscreen(view, callback);
            }

            @Override
            public void onHideCustomView() {
                if (fullscreenView == null) return;
                fullscreenView = null;
                fullscreenCallback = null;
                listener.onHideFullscreen();
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.deny();
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, false, false);
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture,
                                         android.os.Message resultMsg) {
                // Multiple windows are disabled, so target="_blank" / window.open navigations
                // are loaded by this WebView and still pass through shouldOverrideUrlLoading's
                // HTTPS/offline guard. Returning false here would silently drop them.
                return BrowserViewportPolicy.allowsSeparateWindow();
            }
        });
        setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
                listener.onDownloadRequested(url, userAgent, contentDisposition, mimeType, contentLength));
    }
}
