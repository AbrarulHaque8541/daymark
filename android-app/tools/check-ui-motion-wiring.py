#!/usr/bin/env python3
"""Source guard for production workspace and browser-chrome motion integration."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTIVITY = (ROOT / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
POLICY = (ROOT / "app/src/main/java/com/abrar/daymark/UiMotionPolicy.java").read_text(encoding="utf-8")
WORKSPACE = (ROOT / "app/src/main/java/com/abrar/daymark/WorkspaceMotion.java").read_text(encoding="utf-8")

checks = 0


def check(cond: bool, msg: str) -> None:
    global checks
    checks += 1
    if not cond:
        raise AssertionError(msg)


check("TAB_SWITCH_MS" in POLICY, "UiMotionPolicy.TAB_SWITCH_MS missing")
check("tabSlideFraction" in POLICY, "UiMotionPolicy.tabSlideFraction missing")
check("shouldAcceptCollapse" in POLICY, "UiMotionPolicy.shouldAcceptCollapse missing")

transition_start = ACTIVITY.find("private void animateModeTransition(boolean enteringWeb)")
transition_end = ACTIVITY.find("private void setBrowserOnlineEnabled", transition_start)
check(transition_start >= 0 and transition_end > transition_start,
      "MainActivity workspace transition method missing")
transition = ACTIVITY[transition_start:transition_end]
check("WorkspaceMotion.animateWorkspaceSwitch(" in transition,
      "MainActivity must delegate workspace motion to WorkspaceMotion")
check("animateModeTransition(enabled);" in ACTIVITY,
      "setWebMode must invoke the guarded workspace transition")
check("dp(24)" in transition,
      "workspace transition must use a bounded, nonzero horizontal travel distance")

check("UiMotionPolicy.TAB_SWITCH_MS" in WORKSPACE,
      "WorkspaceMotion must use the shared tab-switch duration")
check("UiMotionPolicy.tabSlideFraction()" in WORKSPACE,
      "WorkspaceMotion must use the shared directional slide fraction")
check("setTranslationX(slide)" in WORKSPACE and ".translationX(0f)" in WORKSPACE,
      "WorkspaceMotion must set the horizontal slide offset and animate it back to zero")
check("enteringWeb ? 1f : -1f" in WORKSPACE,
      "workspace slide direction must reverse between Tasks and Web")
check("target.animate().cancel();" in WORKSPACE,
      "workspace transition must cancel stale target animators")
check("isReducedMotion" in WORKSPACE and "ANIMATOR_DURATION_SCALE" in WORKSPACE,
      "WorkspaceMotion must explicitly respect system reduced-motion (animator duration scale 0)")

chrome_start = ACTIVITY.find("private void setBrowserChromeHidden(boolean hidden)")
chrome_end = ACTIVITY.find("private void ", chrome_start + len("private void setBrowserChromeHidden(boolean hidden)"))
check(chrome_start >= 0 and chrome_end > chrome_start,
      "browser chrome hide/show method missing")
chrome = ACTIVITY[chrome_start:chrome_end]
check("WorkspaceMotion.hideChrome(" in chrome,
      "MainActivity must delegate chrome hiding to WorkspaceMotion")
check("WorkspaceMotion.showChrome(" in chrome,
      "MainActivity must delegate chrome showing to WorkspaceMotion")
check("UiMotionPolicy.CHROME_HIDE_MS" in WORKSPACE,
      "WorkspaceMotion must use the shared chrome-hide duration")
check("UiMotionPolicy.CHROME_SHOW_MS" in WORKSPACE,
      "WorkspaceMotion must use the shared chrome-show duration")
check(WORKSPACE.count("view.animate().cancel();") >= 2,
      "hide and show must cancel stale chrome animators before resetting properties")

print(f"PASS UI motion integration source guard: {checks} assertions")
