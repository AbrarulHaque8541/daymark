#!/usr/bin/env python3
"""Source guard for bottom navigation, workspace switching, and Tasks-home controls."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
ACTIVITY = (ROOT / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
checks = 0


def check(condition: bool, message: str) -> None:
    global checks
    checks += 1
    if not condition:
        raise AssertionError(message)


# Persistent destinations and their stable layout.
check("private LinearLayout bottomNavigationBar;" in ACTIVITY, "bottomNavigationBar field missing")
check("bottomNavigationBar = buildBottomNavigationBar();" in ACTIVITY, "bottomNavigationBar construction missing")
check("root.addView(bottomNavigationBar" in ACTIVITY, "bottomNavigationBar must be added to root layout")
check('buildNavTab("✓", "Tasks"' in ACTIVITY, "Tasks tab missing")
check('buildNavTab("🌐", "Web"' in ACTIVITY, "Web tab missing")
check('buildNavTab("⚙", "Settings"' in ACTIVITY, "Settings tab missing")
check("view -> setWebMode(false)" in ACTIVITY, "Tasks tab must switch to tasks mode")
check("view -> setWebMode(true)" in ACTIVITY, "Web tab must switch to web mode")
check("view -> showSettingsDialog()" in ACTIVITY, "Settings tab must open settings dialog")
check('addSettingsRow(content, "Task templates"' in ACTIVITY, "Templates must be available contextually in Settings")
check('buildNavTab("📑", "Templates"' not in ACTIVITY, "Templates must not occupy persistent bottom navigation")
check('Button moreButton = plainButton("More")' not in ACTIVITY, "Duplicate top-right More action must be removed")

# The entire shared composer is in the task ScrollView, not pinned above it.
check("content.addView(sharedComposer, bottomMargin(dp(8)));" in ACTIVITY,
      "shared composer must be part of scrollable Tasks content")
check("root.addView(sharedComposer" not in ACTIVITY, "shared composer must not be pinned as a root sibling")
check("scrollView.setOnScrollChangeListener" not in ACTIVITY,
      "Tasks scrolling must not hide or restore the composer on direction changes")
check("setTaskChromeHidden" not in ACTIVITY and "taskChromeHidden" not in ACTIVITY,
      "obsolete task chrome hide/show behavior must be removed")
composer = ACTIVITY.split("private View buildSharedComposer() {", 1)[1].split(
    "private View buildBrowserAddressBar() {", 1)[0]
check(composer.count('compactButton("Add task", false)') == 1,
      "the composer must have exactly one Add task control")
check('compactButton("+ Task"' not in composer and "addTaskShortcut" not in composer,
      "duplicate + Task shortcut must be removed")
check('Button searchTasksShortcut = compactButton("⌕", false)' in composer,
      "top-right task search must use a compact icon button")
check("quickActions.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);" in composer,
      "task search icon must be aligned at the composer’s upper-right")
check('searchTasksShortcut.setContentDescription("Show task search")' in composer,
      "task search icon must have an accessible action label")
check('view.setContentDescription(searchVisible ? "Hide task search" : "Show task search")' in composer,
      "task search action label must reflect its expanded state")
check("searchControlView.setVisibility(searchControlView.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE);" in composer,
      "task search must expand and collapse from the icon")
check("searchHost.setVisibility(View.GONE);" in composer
      and "card.addView(searchHost, bottomMargin(dp(7)));" in composer,
      "the task search field must start collapsed inside the composer")
check('((LinearLayout) searchControlView).addView(searchRow,' in ACTIVITY
      and "content.addView(searchRow" not in ACTIVITY,
      "the top-right affordance must reveal the single existing search field")

# Existing browser workspace and its compact browser chrome remain intact.
check('browserPrivacyButton = text("ⓘ", 18' in ACTIVITY, "Browser privacy disclosure must be a compact info icon")
check('Button chooseProvider = compactButton("Choose search provider"' not in ACTIVITY,
      "Browser home must not show redundant provider CTA")
check("Arrays.asList(browserHomeButton, browserTabButton, browserOverflowButton)" in ACTIVITY,
      "Browser toolbar should keep only essential compact controls")
check('"Save page as task", "Back", "Forward", "Reload"' in ACTIVITY,
      "Navigation controls must remain reachable in overflow")
check("syncBottomNavSelection();" in ACTIVITY, "syncBottomNavSelection must be called in syncModeUi")
check("Tasks page, selected." in ACTIVITY, "Tasks selected accessibility description missing")
check("Web browser page, selected." in ACTIVITY, "Web selected accessibility description missing")
check("View[] chrome = {browserAddressBarView, browserToolbarScroll, browserProviderRow, bottomNavigationBar};" in ACTIVITY,
      "bottomNavigationBar must remain animated alongside browser chrome")

print(f"PASS bottom navigation and Tasks-home checks: {checks} assertions")
