#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(sys.argv[1])
policy = (root / "app/src/main/java/com/abrar/daymark/BrowserAppLinkApproval.java").read_text(encoding="utf-8")
webview = (root / "app/src/main/java/com/abrar/daymark/DaymarkWebView.java").read_text(encoding="utf-8")
routes = (root / "app/src/main/java/com/abrar/daymark/BrowserUriRoutingPolicy.java").read_text(encoding="utf-8")
smoke = (root / "tools/BrowserAppLinkApprovalSmoke.java").read_text(encoding="utf-8")
runner = (root / "tools/run-browser-app-link-approval-tests.sh").read_text(encoding="utf-8")
canonical = (root / "tools/check-v1-source.sh").read_text(encoding="utf-8")
workflow = (root.parent / ".github/workflows/android.yml").read_text(encoding="utf-8")

for expected in (
    "sdkInt < API_S",
    "!linkHandlingAllowed",
    "DOMAIN_STATE_VERIFIED",
    "DOMAIN_STATE_SELECTED",
    "normalizeHost(entry.getKey())",
):
    assert expected in policy, f"App Link approval gate must retain: {expected}"

for forbidden in (
    "handOffVerifiedAppLink(",
    "isVerifiedAppLinkApproved(",
    "DomainVerificationManager",
    "startActivity(appLink)",
):
    assert forbidden not in webview, f"HTTP(S) links, including verified App Links, must stay in Daymark: {forbidden}"
assert "// Verified HTTP(S) App Links stay in Daymark" in webview
assert "BrowserAddress.isAllowedWebUrl(url)" in webview, \
    "HTTP(S) navigation must continue through the WebView web URL gate"
for expected in ('case "http":', 'case "https":', 'return Route.WEBVIEW;'):
    assert expected in routes, f"HTTP(S) must be classified for WebView routing: {expected}"

for expected in (
    "pre-Android-12 must fail closed",
    "DOMAIN_STATE_VERIFIED",
    "DOMAIN_STATE_SELECTED",
    "DOMAIN_STATE_NONE",
    "global link-handling opt-out",
    "conflicting normalized platform entries fail closed",
):
    assert expected in smoke, f"App Link approval regression test missing: {expected}"

assert "BrowserAppLinkApprovalSmoke.java" in runner and "BrowserAppLinkApprovalSmoke" in runner, \
    "dedicated JDK regression runner must compile and execute the smoke"
assert "run-browser-app-link-approval-tests.sh" in canonical, \
    "canonical source guard must execute App Link approval regressions"
assert "check-browser-app-link-approval.py" in canonical, \
    "canonical source guard must enforce App Link runtime integration"
assert "sh ./tools/check-v1-source.sh" in workflow, \
    "Android CI must execute the canonical source guard"
print("PASS browser App Link routing guard: verified and ordinary HTTP(S) links stay in Daymark")
