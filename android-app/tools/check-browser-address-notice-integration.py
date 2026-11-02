#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
main = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
view = (root / "app/src/main/java/com/abrar/daymark/BrowserAddressNoticeView.java").read_text(encoding="utf-8")
webview = (root / "app/src/main/java/com/abrar/daymark/DaymarkWebView.java").read_text(encoding="utf-8")
policy = (root / "app/src/main/java/com/abrar/daymark/BrowserAddressNoticePanelPolicy.java").read_text(encoding="utf-8")

required = (
    "private BrowserAddressNoticeView browserAddressNoticeView;",
    "new BrowserAddressNoticeView(this)",
    "setSiteInfoListener(this::showBrowserSiteInfo)",
    "setActionListener((noticeId, actionId) ->",
    "showBrowserSiteInfo()",
    "BrowserLogPolicy.redactedOrigin(lastBrowserAddress)",
    "showBrowserRetryNotice",
    '"retry".equals(actionId)',
    "onNavigationBlocked(String url)",
    "onHttpNavigationBlocked(String url, boolean redirect)",
    "onOfflineNavigationBlocked()",
    "onLoadError(int errorCode, String description, String failingUrl)",
    "BrowserAddressNotice.Severity.CRITICAL",
    "resolveBrowserAddressNotice();",
    "browserAddressNoticeView.dispose()",
)
for token in required:
    assert token in main, f"address notice integration missing: {token}"

assert "Daymark only opens HTTPS pages" in main
assert "Certificate errors are " in main and "cancelled and never bypassed." in main
assert "handler.cancel();" in webview and "handler.proceed();" not in webview
assert "void dispose()" in view and "disposed = true;" in view
assert "private static final long INFO_INLINE_TIMEOUT_MS = 1000L;" in view
assert "private static final long WARNING_INLINE_TIMEOUT_MS = 5000L;" in view
assert "notice.severity == BrowserAddressNotice.Severity.INFO" in view
assert "mainHandler.postDelayed(timeoutRunnable, timeoutMs);" in view
assert "indicatorTarget.getWindowVisibleDisplayFrame(visibleFrame)" in view
assert "indicatorTarget.getLocationOnScreen(anchorLocation)" in view
assert "BrowserAddressNoticePanelPolicy.maxHeightBelowAnchorPx(" in view
assert "new PopupWindow(content, panelWidthPx, panelHeightPx, true)" in view
assert "panel.showAsDropDown(indicatorTarget, 0, dp(4), gravity)" in view
assert "new ScrollView(getContext())" in view and "setVerticalScrollBarEnabled(true)" in view
assert "fitContentHeightPx" in policy and "availablePx" in policy

print("PASS live address notice integration: navigation/security wiring, explicit actions, visible below-anchor popup cap, scrollable overflow, critical notice persistence and disposal")
