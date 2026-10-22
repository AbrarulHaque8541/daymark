#!/usr/bin/env python3
"""Guard the WebView error callbacks and privacy-safe diagnostics contract."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
source = (root / "app/src/main/java/com/abrar/daymark/DaymarkWebView.java").read_text(encoding="utf-8")
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
print("PASS WebView error diagnostics: callback coverage, error-level logging, and URL redaction")
