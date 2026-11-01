#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(sys.argv[1])
policy = (root / "app/src/main/java/com/abrar/daymark/BrowserAppLinkApproval.java").read_text(encoding="utf-8")
webview = (root / "app/src/main/java/com/abrar/daymark/DaymarkWebView.java").read_text(encoding="utf-8")
smoke = (root / "tools/BrowserAppLinkApprovalSmoke.java").read_text(encoding="utf-8")
runner = (root / "tools/run-browser-app-link-approval-tests.sh").read_text(encoding="utf-8")
workflow = (root.parent / ".github/workflows/android.yml").read_text(encoding="utf-8")

for expected in (
    "sdkInt < API_S",
    "!linkHandlingAllowed",
    "DOMAIN_STATE_VERIFIED",
    "DOMAIN_STATE_SELECTED",
    "normalizeHost(entry.getKey())",
):
    assert expected in policy, f"App Link approval gate must retain: {expected}"

for expected in (
    "DomainVerificationManager",
    "getDomainVerificationUserState(packageName)",
    "state.isLinkHandlingAllowed()",
    "BrowserAppLinkApproval.isApproved(",
    "resolved.activityInfo.packageName",
    "uri.getHost()",
):
    assert expected in webview, f"WebView direct handoff must use platform host approval: {expected}"

gate = webview.split("private boolean handOffVerifiedAppLink", 1)[1].split(
    "private final ExtensionRuntime", 1)[0]
assert gate.index("isVerifiedAppLinkApproved(") < gate.index("view.getContext().startActivity(appLink)"), \
    "direct app launch must occur only after the platform host approval check"
assert "Build.VERSION.SDK_INT < Build.VERSION_CODES.S" in webview, \
    "pre-Android-12 direct App Link handoff must fail closed"

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
assert "run-browser-app-link-approval-tests.sh" in workflow, \
    "Android CI must execute App Link approval regressions"
assert "check-browser-app-link-approval.py" in workflow, \
    "Android CI must enforce runtime integration guard"
print("PASS browser App Link approval source guard")
