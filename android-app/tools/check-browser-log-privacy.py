#!/usr/bin/env python3
"""Guard against writing raw browser URLs or WebView error text to Logcat."""
from pathlib import Path
import re
import sys

root = Path(sys.argv[1]).resolve()
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
pattern = re.compile(r"Log\.(?:v|d|i|w|e)\(BROWSER_LOG_TAG,(.*?)\);", re.DOTALL)
calls = list(pattern.finditer(activity))
assert calls, "expected browser Logcat calls"
for match in calls:
    statement = match.group(1)
    # URL-bearing values are allowed only as input to the origin-only redactor.
    safe = re.sub(r"BrowserLogPolicy\.redactedOrigin\([^)]*\)", "", statement)
    unsafe = re.search(r"\b(?:address|url|lastBrowserAddress|restoreAddress|failingUrl|description)\b", safe)
    assert unsafe is None, f"raw browser URL/error text in Logcat call: {statement.strip()}"

assert "BrowserLogPolicy.redactedOrigin(" in activity, "browser logs must use the origin-only redactor"

for relative in (
    "app/src/main/java/com/abrar/daymark/DaymarkWebView.java",
    "app/src/main/java/com/abrar/daymark/BrowserLoadWatchdog.java",
):
    source = (root / relative).read_text(encoding="utf-8")
    log_calls = re.findall(r"Log\.(?:v|d|i|w|e)\((.*?)\);", source, re.DOTALL)
    assert log_calls, f"expected Android log calls in {relative}"
    for statement in log_calls:
        unsafe = re.search(r"\b(?:description|safeDesc)\b|getDescription\s*\(", statement)
        assert unsafe is None, f"raw WebView error text in {relative} Logcat call: {statement.strip()}"

print(f"PASS browser Logcat privacy: {len(calls)} MainActivity calls and WebView/watchdog logs contain no raw error text")
