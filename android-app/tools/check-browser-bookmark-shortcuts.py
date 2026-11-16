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
refresh = method_body(activity, "private void refreshSavedSitesRail()")
create_tab = method_body(activity, "private void createBrowserTab()")
switch_tab = method_body(activity, "private void switchBrowserTab(DaymarkWebView tab)")
show_home = method_body(activity, "private void showBrowserHome()")
bookmarks_dialog = method_body(activity, "private void showBrowserBookmarksDialog()")

assert "refreshSavedSitesRail()" in home, \
    "new-tab home must initially refresh the optional bookmark section"
assert 'text("Saved sites"' in refresh and "new HorizontalScrollView(this)" in refresh, \
    "saved shortcuts must be a clearly labeled, horizontally scrollable native section"
assert "setVisibility(View.GONE)" in refresh, "empty bookmarks must not add visual clutter"
assert 'browserPreferences.getString(BROWSER_BOOKMARKS_KEY, "")' in refresh, \
    "the row may read only the existing bookmark preference"
assert "BrowserBookmarkShortcuts.visibleOrigins" in refresh, "the view must use the bounded saved-origin policy"
assert "BROWSER_HISTORY_KEY" not in refresh and "BrowserHistory.decode" not in refresh, \
    "browsing history must never be used to infer saved shortcuts"
assert "if (origins.isEmpty())" in refresh and "setVisibility(View.GONE)" in refresh, \
    "the optional section must hide when there are no valid bookmarks"
assert "browserHomeChip(" in refresh and "navigateBrowserTo(origin)" in refresh, \
    "each shortcut must use the existing native chip and guarded browser navigation"
assert "Not encrypted" in refresh, "HTTP bookmark shortcuts must be labeled honestly"
assert "refreshSavedSitesRail()" in create_tab, \
    "new tabs must refresh bookmarks"
assert "refreshSavedSitesRail()" in show_home, \
    "returning home must refresh shortcuts"
assert "refreshSavedSitesRail()" in bookmarks_dialog, \
    "clearing bookmarks must immediately update the visible section"
assert "MAX_VISIBLE = 4" in policy and "BrowserHistory.decode(serializedBookmarks)" in policy, \
    "shortcut selection must be bounded and derive only from stored bookmark origins"
assert "hasAdditionalOrigins" in policy and "totalOrigins" in policy, \
    "policy must expose overflow detection without forcing the view to decode bookmarks"
assert "hasAdditionalOrigins(serialized)" in refresh and '"More…"' in refresh, \
    "rail must offer a More… chip when overflow exists"
assert "showBrowserBookmarksDialog" in refresh, \
    "More… must open the existing bookmarks dialog"
assert "BrowserHistory.decode" not in refresh, \
    "view must not decode bookmark storage directly; use BrowserBookmarkShortcuts policy"
print("PASS browser bookmark shortcuts integration: saved-only data, bounded rail, More overflow via policy, safe tap, blank-tab refresh, and clear behavior")
