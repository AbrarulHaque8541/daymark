#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
main = root / "app/src/main/java/com/abrar/daymark"
policy = (main / "BrowserServiceWorkerPolicy.java").read_text(encoding="utf-8")
enforcement = (main / "BrowserServiceWorkerEnforcement.java").read_text(encoding="utf-8")
webview = (main / "DaymarkWebView.java").read_text(encoding="utf-8")
workspace = (main / "BrowserWorkspaceController.java").read_text(encoding="utf-8")
docs = (root / "ANDROID_SOURCES.md").read_text(encoding="utf-8")
docs_flat = " ".join(docs.split())
test_module = (root / "service-worker-test/build.gradle.kts").read_text(encoding="utf-8")

def require(condition, message):
    if not condition:
        raise SystemExit("FAIL browser service-worker policy: " + message)

static_init = "private static final boolean SERVICE_WORKER_NETWORK_POLICY_READY"
constructor = "DaymarkWebView(Activity activity"
require(static_init in webview and constructor in webview
        and webview.index(static_init) < webview.index(constructor),
        "install the process-wide client during class initialization before the first WebView constructor")
require("BrowserServiceWorkerEnforcement.installBeforeFirstWebView()" in webview,
        "DaymarkWebView must install the global policy before super(activity)")
require("!SERVICE_WORKER_NETWORK_POLICY_READY" in webview,
        "a failed global policy install must keep per-WebView navigation blocked")
require("BrowserServiceWorkerPolicy.shouldShowCompatibilityNotice()" in webview
        and "Toast.LENGTH_LONG" in webview,
        "the Online-mode Service Worker compatibility trade-off must be disclosed in-app")
require("ServiceWorkerController.getInstance()" in enforcement,
        "use the process-wide ServiceWorkerController")
require("getServiceWorkerWebSettings()" in enforcement
        and ".setBlockNetworkLoads(" in enforcement
        and "BrowserServiceWorkerPolicy.blocksNetworkLoads()" in enforcement,
        "set the platform ServiceWorkerWebSettings network block")
require("controller.setServiceWorkerClient(new ServiceWorkerClient()" in enforcement
        and "shouldInterceptRequest(WebResourceRequest request)" in enforcement,
        "install request-level ServiceWorkerClient enforcement")
require("BrowserServiceWorkerPolicy.decide(true, true, scheme)" in enforcement
        and "return blockedResponse();" in enforcement,
        "block remote/unknown Service Worker requests without forwarding request data")
require("new WebResourceResponse(" in enforcement and "403" in enforcement,
        "return a synthetic blocked response instead of allowing network pass-through")
require(".setBlockNetworkLoads(false)" not in enforcement,
        "never unblock the process-wide Service Worker network setting")
require("BrowserServiceWorkerEnforcement.enforceBlocked();" in workspace
        and "if (policy != null && !policy.allowsRemoteLoads())" in workspace,
        "reassert the process-wide block in the Android workspace controller on Offline transition")
require("DaymarkWebView.isServiceWorkerNetworkPolicyReady()" in workspace,
        "do not unblock page loads if global Service Worker enforcement could not be installed")
require("Service Worker network requests remain blocked even while ordinary page navigation is Online" in docs_flat,
        "document the fail-closed behavior and compatibility trade-off")
require("static Decision decide(boolean onlineEnabled, boolean explicitNavigation, String scheme)" in policy,
        "keep Online toggle and explicit navigation distinct from Service Worker network grants")
require('missingDimensionStrategy("distribution", "githubSideload")' in test_module,
        "resolve the app's distribution flavor explicitly for the dedicated Service Worker test module")

print("PASS browser service-worker policy source guard")
