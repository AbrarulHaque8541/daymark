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
check("CHROME_SCROLL_THRESHOLD_DP = 3" in POLICY,
      "task chrome scroll threshold must remain explicitly bounded")
check("CHROME_AUTO_RESTORE_MS = 700L" in POLICY,
      "task chrome must restore after the documented idle delay")
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
task_listener_start = ACTIVITY.find("taskScrollView.setOnScrollChangeListener")
task_listener_end = ACTIVITY.find("});", task_listener_start)
check(task_listener_start >= 0 and task_listener_end > task_listener_start,
      "task ScrollView must observe vertical scroll changes")
task_listener = ACTIVITY[task_listener_start:task_listener_end]
task_listener_compact = " ".join(task_listener.split())
check("chromeActionForScrollDelta( y - oldY" in task_listener_compact,
      "task chrome must react to vertical scroll direction")
check("ChromeScrollAction.HIDE" in task_listener and "ChromeScrollAction.SHOW" in task_listener,
      "downward scroll must hide and upward scroll must reveal task chrome")
check("scheduleTaskChromeRestore();" in task_listener,
      "task chrome restore timer must reset on scroll activity")
task_chrome_start = ACTIVITY.find("private void setTaskChromeHidden(boolean hidden)")
task_chrome_end = ACTIVITY.find("private void ", task_chrome_start + len("private void setTaskChromeHidden(boolean hidden)"))
check(task_chrome_start >= 0 and task_chrome_end > task_chrome_start,
      "task chrome hide/show helper missing")
task_chrome = ACTIVITY[task_chrome_start:task_chrome_end]
check("WorkspaceMotion.hideChrome(appTopBar" in task_chrome and "showTaskComposer();" in task_chrome,
      "task chrome helper must animate the pinned top bar and restore the composer")
composer_hide_start = ACTIVITY.find("private void hideTaskComposerWhenOffscreen()")
composer_hide_end = ACTIVITY.find("private void ", composer_hide_start + len("private void hideTaskComposerWhenOffscreen()"))
check(composer_hide_start >= 0 and composer_hide_end > composer_hide_start,
      "composer offscreen-visibility helper missing")
composer_hide = ACTIVITY[composer_hide_start:composer_hide_end]
check("taskScrollView.getScrollY() < sharedComposer.getBottom()" in composer_hide
      and "sharedComposer.setVisibility(View.INVISIBLE)" in composer_hide,
      "composer must scroll naturally and only become invisible after leaving the viewport")
check("WorkspaceMotion.showChrome(sharedComposer" in ACTIVITY,
      "an offscreen composer must be restored when scroll direction reverses or idles")
restore_start = ACTIVITY.find("private void scheduleTaskChromeRestore()")
restore_end = ACTIVITY.find("private void ", restore_start + len("private void scheduleTaskChromeRestore()"))
check(restore_start >= 0 and restore_end > restore_start,
      "task chrome idle restore helper missing")
restore = ACTIVITY[restore_start:restore_end]
check("CHROME_AUTO_RESTORE_MS" in restore and "setTaskChromeHidden(false)" in restore,
      "task chrome must restore after the shared idle delay")
check("if (webMode) resetTaskChromeForModeSwitch();" in ACTIVITY,
      "task chrome animations and timers must be cleared when opening Web mode")
check("removeCallbacks(taskChromeRestoreRunnable)" in ACTIVITY,
      "task chrome restore callback must be cleaned up at lifecycle boundaries")
check("UiMotionPolicy.CHROME_HIDE_MS" in WORKSPACE,
      "WorkspaceMotion must use the shared chrome-hide duration")
check("UiMotionPolicy.CHROME_SHOW_MS" in WORKSPACE,
      "WorkspaceMotion must use the shared chrome-show duration")
check(WORKSPACE.count("view.animate().cancel();") >= 2,
      "hide and show must cancel stale chrome animators before resetting properties")

check("applyPressFeedback" in ACTIVITY, "MainActivity must apply press feedback to navigation tabs")
check("scaleX(0.96f)" in ACTIVITY, "press feedback must use subtle scale")
check("isReducedMotionPublic" in WORKSPACE, "WorkspaceMotion must expose reduced-motion query for press feedback")

print(f"PASS UI motion integration source guard: {checks} assertions")

# Additional assertion for reduced-motion path in WorkspaceMotion (added Cycle A 2026-11-02).
MOTION = (ROOT / "app/src/main/java/com/abrar/daymark/WorkspaceMotion.java").read_text(encoding="utf-8")
check("isReducedMotion" in MOTION, "WorkspaceMotion must implement isReducedMotion")
check("Settings.Global.ANIMATOR_DURATION_SCALE" in MOTION, "reduced-motion must read ANIMATOR_DURATION_SCALE")
check("if (isReducedMotion" in MOTION, "reduced-motion early-return must be present")
print("PASS reduced-motion wiring assertions added")
