#!/usr/bin/env python3
"""Source guard: UiMotionPolicy must drive Tasks\u2194Web transition motion."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTIVITY = (ROOT / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
POLICY = (ROOT / "app/src/main/java/com/abrar/daymark/UiMotionPolicy.java").read_text(encoding="utf-8")
checks = 0

def check(cond: bool, msg: str) -> None:
    global checks
    checks += 1
    if not cond:
        raise AssertionError(msg)

check("TAB_SWITCH_MS" in POLICY, "UiMotionPolicy.TAB_SWITCH_MS missing")
check("tabSlideFraction" in POLICY, "UiMotionPolicy.tabSlideFraction missing")
check("shouldAcceptCollapse" in POLICY, "UiMotionPolicy.shouldAcceptCollapse missing")
check("UiMotionPolicy.TAB_SWITCH_MS" in ACTIVITY, "MainActivity must use UiMotionPolicy.TAB_SWITCH_MS")
check("animateModeTransition" in ACTIVITY, "animateModeTransition missing")
check("target.animate().cancel()" in ACTIVITY, "stale animator cancel missing")
check("tabSlideFraction" in ACTIVITY, "MainActivity must use UiMotionPolicy.tabSlideFraction for directional tab switch")
check("translationX" in ACTIVITY and "animateModeTransition" in ACTIVITY,
      "animateModeTransition must animate translationX for horizontal slide")
check("UiMotionPolicy.CHROME_HIDE_MS" in ACTIVITY, "browser chrome hide must use UiMotionPolicy.CHROME_HIDE_MS")
check("UiMotionPolicy.CHROME_SHOW_MS" in ACTIVITY, "browser chrome show must use UiMotionPolicy.CHROME_SHOW_MS")
print(f"PASS ui-motion wiring checks: {checks} assertions")
