#!/usr/bin/env python3
"""Guard the optional saved-origin shortcut rail and its safe navigation flow."""
from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
policy = (root / "app/src/main/java/com/abrar/daymark/BrowserBookmarkShortcuts.java").read_text(encoding="utf-8")


def method_body(source: str, signature: str) -> str:
    start = source.find(signature)
    assert start >= 0, f"missing method: {signature}"
    opening = source.find("{", start)
    assert opening >= 0, f"missing method body: {signature}"
    depth = 0
    for index in range(opening, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[opening + 1:index]
    raise AssertionError(f"unterminated method: {signature}")


home = method_body(activity, "private View buildBrowserHomeView()")
section = method_body(activity, "private LinearLayout browserHomeBookmarksSection()")
refresh = method_body(activity, "private void refreshBrowserHomeBookmarks()")
create_tab = method_body(activity, "private void createBrowserTab()")
switch_tab = method_body(activity, "private void switchBrowserTab(DaymarkWebView tab)")
show_home = method_body(activity, "private void showBrowserHome()")
bookmarks_dialog = method_body(activity, "private void showBrowserBookmarksDialog()")

assert "browserHomeBookmarksSection()" in home and "refreshBrowserHomeBookmarks()" in home, \
    "new-tab home must build and initially refresh the optional bookmark section"
assert 'text("Saved sites"' in section and "new HorizontalScrollView(this)" in section, \
    "saved shortcuts must be a clearly labeled, horizontally scrollable native section"
assert "section.setVisibility(View.GONE)" in section, "empty bookmarks must not add visual clutter"
assert 'browserPreferences.getString(BROWSER_BOOKMARKS_KEY, "")' in refresh, \
    "the row may read only the existing bookmark preference"
assert "BrowserBookmarkShortcuts.visibleOrigins" in refresh, "the view must use the bounded saved-origin policy"
assert "BROWSER_HISTORY_KEY" not in refresh and "BrowserHistory.decode" not in refresh, \
    "browsing history must never be used to infer saved shortcuts"
assert "if (origins.isEmpty())" in refresh and "browserHomeBookmarksSection.setVisibility(View.GONE)" in refresh, \
    "the optional section must hide when there are no valid bookmarks"
assert "browserHomeChip(" in refresh and "navigateBrowserTo(origin)" in refresh, \
    "each shortcut must use the existing native chip and guarded browser navigation"
assert "HTTP sites are not encrypted" in refresh, "HTTP bookmark shortcuts must be labeled honestly"
assert create_tab.find("refreshBrowserHomeBookmarks()") < create_tab.find("browserHomeView.setVisibility(View.VISIBLE)"), \
    "new tabs must refresh bookmarks before showing the blank-tab page"
assert "if (!hasPage) refreshBrowserHomeBookmarks()" in switch_tab, \
    "switching to an existing blank tab must refresh its shortcuts"
assert show_home.find("refreshBrowserHomeBookmarks()") < show_home.find("browserHomeView.setVisibility(View.VISIBLE)"), \
    "returning home must refresh shortcuts after a bookmark is saved"
assert "refreshBrowserHomeBookmarks()" in bookmarks_dialog, \
    "clearing bookmarks must immediately update the visible section"
assert "MAX_VISIBLE = 4" in policy and "BrowserHistory.decode(serializedBookmarks)" in policy, \
    "shortcut selection must be bounded and derive only from stored bookmark origins"
print("PASS browser bookmark shortcuts integration: saved-only data, bounded rail, safe tap, blank-tab refresh, and clear behavior")
