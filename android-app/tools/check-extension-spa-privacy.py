#!/usr/bin/env python3
"""Source-level privacy guard for the Android extension injection boundary."""
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
runtime = (root / "app/src/main/java/com/abrar/daymark/ExtensionRuntime.java").read_text(encoding="utf-8")
injector = (root / "app/src/main/java/com/abrar/daymark/ExtensionInjector.java").read_text(encoding="utf-8")
webview = (root / "app/src/main/java/com/abrar/daymark/DaymarkWebView.java").read_text(encoding="utf-8")
asset = (root / "app/src/main/assets/daymark-extension-spa.js").read_text(encoding="utf-8")
node_test = (root.parent / "tests/extension-spa-navigation.test.js").read_text(encoding="utf-8")

checks = []

def require(condition, message):
    checks.append((bool(condition), message))

require("store.enabledMatching(url)" in runtime,
        "runtime selects packs through the native current-URL matcher")
require("store.listAll()" not in runtime,
        "runtime never hands the complete extension store to a WebView")
require("onSameDocumentNavigation" in runtime and "ExtensionInjector.applyStyles" in runtime,
        "same-document updates use style-only native reconciliation")
require("doUpdateVisitedHistory(WebView view, String url, boolean isReload)" in webview,
        "WebViewClient observes visited-history updates")
require("extensionRuntime.onSameDocumentNavigation(view, url)" in webview,
        "history updates trigger current-URL extension reevaluation")
require("view.getProgress() < 100" in webview,
        "same-document injection waits until the committed document is complete")
require('webView.evaluateJavascript("(" + bootstrap + ")(" + config + ");", null)' in injector,
        "configuration is passed as a one-shot function argument")
require("window.__daymarkSpaConfig" not in injector and "window.__daymarkSpaState" not in injector,
        "injector does not assign a page-readable all-pack global")

start = injector.find("private static String spaConfig(")
end = injector.find("private static String loadSpaBootstrap(", start)
config_builder = injector[start:end] if start >= 0 and end > start else ""
require(r'\\\"id\\\"' in config_builder and r'\\\"css\\\"' in config_builder,
        "current-page config contains only pack id and CSS")
for field in (r'\\\"matches\\\"', r'\\\"excludes\\\"', r'\\\"disabledSites\\\"'):
    require(field not in config_builder,
            f"current-page config excludes {field} metadata")

for forbidden in ("window.__daymarkSpaConfig", "window.__daymarkSpaState",
                  "window.__daymarkAddStyle", "history.pushState",
                  "history.replaceState", "MutationObserver", "popstate", "hashchange"):
    require(forbidden not in asset,
            f"bootstrap does not expose or install {forbidden}")

require("bootstrap does not install page-readable config" in node_test,
        "Node regression suite covers absence of page-readable globals")

failed = [message for ok, message in checks if not ok]
for ok, message in checks:
    print(("PASS " if ok else "FAIL ") + message)
if failed:
    print(f"FAIL extension privacy guard: {len(failed)} of {len(checks)} checks failed")
    sys.exit(1)
print(f"PASS extension privacy guard: {len(checks)} checks")
