#!/usr/bin/env python3
"""Apply real browser home UX: search filters on by default; drop duplicate home library tiles."""
from pathlib import Path
import sys
root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
ma_path = root / "app/src/main/java/com/abrar/daymark/MainActivity.java"
text = ma_path.read_text(encoding="utf-8")
orig = text
old_pref = "return browserPreferences.getBoolean(SEARCH_FILTERS_ENABLED_KEY, false);"
new_pref = "return browserPreferences.getBoolean(SEARCH_FILTERS_ENABLED_KEY, true);"
if old_pref in text:
    text = text.replace(old_pref, new_pref, 1)
    text = text.replace(
        "/** The search filters row is opt-in: absent or corrupt preferences fail to off. */",
        "/** Search filters default on; absent key enables them. Corrupt preferences fail to off. */",
        1,
    )
quick = (
    '        LinearLayout quickRow = new LinearLayout(this);\n'
    '        quickRow.setOrientation(LinearLayout.HORIZONTAL);\n'
    '        quickRow.addView(browserHomeTile("H", "History", "Open saved site history",\n'
    '                this::showBrowserHistoryDialog), tileParams());\n'
    '        quickRow.addView(browserHomeTile("B", "Bookmarks", "Open saved bookmarks",\n'
    '                this::showBrowserBookmarksDialog), tileParams());\n'
    '        quickRow.addView(browserHomeTile("D", "Downloads", "Open the browser download list",\n'
    '                this::showBrowserDownloadsDialog), tileParams());\n'
    '        quickRow.addView(browserHomeTile("E", "Extensions", "Manage browser page scripts",\n'
    '                this::showBrowserExtensionsManager), tileParams());\n'
    '        home.addView(quickRow, bottomMargin(dp(8)));\n'
    '\n'
)
if quick in text:
    text = text.replace(
        quick,
        "        // Library tools (History, Bookmarks, Downloads, Extensions) live in the overflow\n"
        "        // only — home stays search-first: pill, optional saved sites, provider rail.\n"
        "\n",
        1,
    )
if text == orig:
    print("already applied or patterns missing")
    sys.exit(0)
ma_path.write_text(text, encoding="utf-8")
print("browser home real UX applied")
