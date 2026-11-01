#!/usr/bin/env python3
"""Source guard for searching and pruning the local site history.

Site history is the only browser surface that lists more entries than fits on one screen, so it
must stay searchable and allow removing a single site without reaching for the destructive
clear-everything flow. Both helpers stay pure in BrowserHistory so the host smoke can pin them.
"""
from pathlib import Path
import sys

root = Path(sys.argv[1])
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
history_source = (root / "app/src/main/java/com/abrar/daymark/BrowserHistory.java").read_text(
    encoding="utf-8")
smoke = (root / "tools/BrowserAddressSmoke.java").read_text(encoding="utf-8")

assert "import java.net.IDN;" in history_source, \
    "history must support standards-based IDN normalization"
assert "IDN.toASCII(host, IDN.USE_STD3_ASCII_RULES)" in history_source, \
    "Unicode hosts must canonicalize through IDN rather than disappear from history"
assert "static int parsePort(String value)" in history_source, \
    "explicit ports must be parsed and range-checked even when URI.getHost() is null for IDN"
assert "normalizeInternationalizedHosts();" in smoke, \
    "host smoke must exercise Unicode/punycode history normalization"

assert "static List<String> filter(List<String> entries, String query)" in history_source, \
    "BrowserHistory.filter must stay pure and testable"
assert "static String remove(String serialized, String address)" in history_source, \
    "single-site removal must go through BrowserHistory.remove"
assert "BrowserHistory.filter(entries" in smoke and "BrowserHistory.remove(searchable" in smoke, \
    "the host smoke must pin search and single-site removal"

dialog = activity.split("private void showBrowserHistoryDialog", 1)[1].split(
    "private void clearBrowserData", 1
)[0]
refresh = activity.split("private void refreshHistoryDialogList", 1)[1].split(
    "private void showBrowserHistoryDialog", 1
)[0]
assert "sanitizeStoredBrowserHistory();" in dialog, "the dialog must still sanitize stored entries first"
assert "BrowserHistory.filter(history, query)" in refresh, \
    "the list must be filtered through BrowserHistory.filter"
assert '"No recent sites"' in refresh, "the empty-history message must be preserved"
assert '"No saved sites match this filter"' in refresh, \
    "an empty filter result needs its own message"
assert "ListView historyList" in dialog, "history must render as a list so long-press can work"
assert "setOnItemLongClickListener" in dialog, "a single site must be removable by long-press"
assert "if (position < 0 || position >= matchedIndices.size()) return false;" in dialog, \
    "placeholder rows must not be treated as sites"
assert '"Forget this site?"' in dialog, "single-site removal needs a confirmation"
assert "BrowserHistory.remove(" in dialog, "the confirmation must persist through BrowserHistory.remove"
assert "Cookies and " in dialog and "stored site data are not changed" in dialog, \
    "forgetting a site must not imply that its cookies were cleared"
assert "navigateBrowserTo(url);" in dialog, "tapping a saved site must still reopen it"
assert '"Clear site history & data"' in dialog, "the destructive clear-everything action must remain"
print("PASS browser history: searchable list, single-site forget with honest cookie disclosure, "
      "clear-everything preserved")
