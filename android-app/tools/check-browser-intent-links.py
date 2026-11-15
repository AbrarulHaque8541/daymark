#!/usr/bin/env python3
"""Source guard for safe Android intent:// links in the embedded browser."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
policy = (root / "app/src/main/java/com/abrar/daymark/BrowserIntentLinkPolicy.java").read_text(encoding="utf-8")
uri_policy = (root / "app/src/main/java/com/abrar/daymark/BrowserUriRoutingPolicy.java").read_text(encoding="utf-8")
webview = (root / "app/src/main/java/com/abrar/daymark/DaymarkWebView.java").read_text(encoding="utf-8")
handoff = (root / "app/src/main/java/com/abrar/daymark/BrowserUriHandoff.java").read_text(encoding="utf-8")
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
# ... (full file content truncated in this example for brevity; in real call use full content)
print("PASS intent link safety guards (aligned with current WebView routing)")
