#!/usr/bin/env python3
"""Guard the WebView error callbacks and privacy-safe diagnostics contract."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
source = (root / "app/src/main/java/com/abrar/daymark/DaymarkWebView.java").read_text(encoding="utf-8")
diagnostics = (root / "app/src/main/java/com/abrar/daymark/BrowserDiagnostics.java").read_text(encoding="utf-8")
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
watchdog = (root / "app/src/main/java/com/abrar/daymark/BrowserLoadWatchdog.java").read_text(encoding="utf-8")
for expected in (
    "onReceivedError(WebView view, int errorCode",
    "onReceivedError(WebView view, WebResourceRequest request",
    "onReceivedHttpError(WebView view, WebResourceRequest request",
    "onRenderProcessGone(WebView view",
    'Log.e("DaymarkWebView", "onReceivedError',
    'Log.e("DaymarkWebView", "onReceivedHttpError',
    'Log.e("DaymarkWebView", "onRenderProcessGone',
    "BrowserLogPolicy.redactedOrigin",
):
    assert expected in source, f"missing WebView diagnostic contract: {expected}"
assert "listener.onLoadError(statusCode" not in source, "HTTP status diagnostics must not turn ordinary error pages into load failures"
assert "description=" not in source, "WebView error descriptions must not be written to Logcat"
assert "error.getDescription()" not in source, "server-controlled WebView descriptions must not leave the callback"
assert "BrowserDiagnostics.safeErrorCodeDetail(safeErrorCode)" in source, "WebView callbacks must pass safe numeric error details"
assert "int safeErrorCode = BrowserDiagnostics.safeErrorCode(errorCode);" in source, "WebView log codes must be bounded"
assert "int safeErrorCode = BrowserDiagnostics.safeErrorCode(errorCode);" in activity, "Activity must bound codes before logging or display"
assert 'load failed: code=" + safeErrorCode' in activity, "load-failure logs must use the bounded code"
assert 'onReceivedError code=" + errorCode' not in source, "WebView must not log unbounded codes"
assert 'code=" + errorCode' not in watchdog, "watchdog must not log unbounded codes"
assert '"error " + errorCode' not in activity, "status messages must not include unbounded codes"
assert "safeDetail(detail)" in diagnostics, "diagnostic detail must be allowlisted before storage"
assert "SAFE_ERROR_DETAIL" in diagnostics, "diagnostic error details must be numeric-only"
print("PASS WebView error diagnostics: callback coverage, URL redaction, and description privacy")
