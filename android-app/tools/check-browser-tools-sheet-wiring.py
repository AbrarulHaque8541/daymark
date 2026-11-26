#!/usr/bin/env python3
"""Source guard: browser overflow must use BrowserToolsSheetPolicy groups."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTIVITY = (ROOT / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
POLICY = (ROOT / "app/src/main/java/com/abrar/daymark/BrowserToolsSheetPolicy.java").read_text(encoding="utf-8")
LABELS = (ROOT / "app/src/main/java/com/abrar/daymark/BrowserToolsSheetLabels.java").read_text(encoding="utf-8")

def check(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)

check("preferGroupedSheet" in POLICY, "BrowserToolsSheetPolicy.preferGroupedSheet missing")
check("groupsInOrder" in POLICY, "BrowserToolsSheetPolicy.groupsInOrder missing")
check("label(" in LABELS, "BrowserToolsSheetLabels.label missing")
check("showBrowserOverflowMenu" in ACTIVITY, "showBrowserOverflowMenu missing")
check("BrowserToolsSheetPolicy" in ACTIVITY, "MainActivity must reference BrowserToolsSheetPolicy")
check("BrowserToolsSheetLabels" in ACTIVITY, "MainActivity must reference BrowserToolsSheetLabels")
check("dispatchBrowserToolAction" in ACTIVITY or "groupsInOrder" in ACTIVITY,
      "MainActivity must build the sheet from policy groups or dispatch by action id")
# Flat 23-string array without policy is the old path we are leaving.
if '"New tab", "Find in page", "Reader mode"' in ACTIVITY and "BrowserToolsSheetPolicy" not in ACTIVITY:
    raise AssertionError("flat unlabeled overflow list still owns the menu without policy")
print("PASS browser tools sheet wiring checks")
