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
variant_guard = (root / "tools/check-service-worker-test-variants.sh").read_text(encoding="utf-8")
runtime_workflow = (root.parent / ".github/workflows/browser-service-worker-runtime.yml").read_text(encoding="utf-8")

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
        and "BrowserServiceWorkerPolicy.blocksNetworkLoads(onlineAllowed)" in enforcement,
        "initialize the platform ServiceWorkerWebSettings from the fail-closed mode state")
require("controller.setServiceWorkerClient(new ServiceWorkerClient()" in enforcement
        and "shouldInterceptRequest(WebResourceRequest request)" in enforcement,
        "install request-level ServiceWorkerClient enforcement")
require("BrowserServiceWorkerPolicy.decide(onlineAllowed, scheme)" in enforcement
        and "return blockedResponse();" in enforcement,
        "allow HTTP/HTTPS worker requests only in the explicit Online mode and block remote/unknown requests Offline")
require("new WebResourceResponse(" in enforcement and "403" in enforcement,
        "return a synthetic blocked response instead of allowing network pass-through")
require("allowNetworkAfterExplicitConsent()" in enforcement
        and ".setBlockNetworkLoads(false)" in enforcement
        and "return settingsBlocked || clientInstalled;" in enforcement
        and "if (!enforced)" in enforcement,
        "only explicit Online consent may unblock workers, and Offline must report a verified block or client fallback")
require("BrowserServiceWorkerEnforcement.enforceBlocked();" in workspace
        and "BrowserServiceWorkerEnforcement.allowNetworkAfterExplicitConsent();" in workspace
        and "if (policy != null && !policy.allowsRemoteLoads())" in workspace,
        "synchronize the process-wide worker policy on explicit Online navigation and Offline transition")
require("DaymarkWebView.isServiceWorkerNetworkPolicyReady()" in workspace,
        "do not unblock page loads if global Service Worker enforcement could not be installed")
require("Service Worker network requests follow Daymark's Online/Offline mode" in docs_flat
        and "blocked while Offline" in docs_flat,
        "document that worker network access follows the user-controlled Online/Offline mode")
require("static Decision decide(boolean onlineEnabled, String scheme)" in policy
        and "ALLOW_NETWORK" in policy,
        "allow HTTP/HTTPS Service Worker requests only while Online")
require('flavorDimensions += "distribution"' in test_module
        and 'create("githubSideload")' in test_module
        and 'create("play")' in test_module
        and test_module.count('dimension = "distribution"') >= 2,
        "mirror both target-app distribution flavors in the dedicated Service Worker test module")
require("connectedGithubSideloadDebugAndroidTest" in variant_guard
        and "connectedPlayDebugAndroidTest" in variant_guard,
        "verify that both target-app instrumentation variants are registered")
require("tools/check-service-worker-test-variants.sh" in runtime_workflow,
        "run the explicit Service Worker target-variant check before emulator instrumentation")

print("PASS browser service-worker policy source guard")
