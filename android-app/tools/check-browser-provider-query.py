#!/usr/bin/env python3
"""Guard the Android browser provider-shortcut query handoff against regressions."""
from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
start = activity.find("private Button browserSearchShortcutButton(")
end = activity.find("private Button browserSiteButton(", start)
assert start >= 0 and end > start, "browser provider shortcut handler must remain identifiable"
shortcut = activity[start:end]

# Preserve a typed query first, fall back to the last submitted search after the
# address bar displays a results URL, and carry that same text to the chosen engine.
ordered_markers = (
    "String entered = browserAddressInput.getText().toString().trim();",
    "if (!entered.isEmpty() && !BrowserAddress.isLikelyWebAddress(entered)) query = entered;",
    "if (query.isEmpty()) {",
    'query = browserLastSearchQuery == null ? "" : browserLastSearchQuery.trim();',
    "selectSearchEngine(engine);",
    "browserLastSearchQuery = query;",
    "engine.searchUrl(query)",
    "browserAddressInput.setText(query);",
    "navigateBrowserTo(address);",
)
last_position = -1
for marker in ordered_markers:
    position = shortcut.find(marker)
    assert position > last_position, f"provider shortcut query contract missing or reordered: {marker}"
    last_position = position

print("PASS browser provider shortcut retains the current query for the selected provider")
