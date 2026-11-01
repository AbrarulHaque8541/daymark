#!/usr/bin/env python3
"""Source guard for the production UiMotionPolicy workspace-transition integration."""
from pathlib import Path
import re
import sys

root = Path(sys.argv[1])
activity = (root / "android-app/app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
policy = (root / "android-app/app/src/main/java/com/abrar/daymark/UiMotionPolicy.java").read_text(encoding="utf-8")
workspace = (root / "android-app/app/src/main/java/com/abrar/daymark/WorkspaceMotion.java").read_text(encoding="utf-8")
runner = (root / "android-app/tools/run-ui-motion-policy-tests.sh").read_text(encoding="utf-8")
workflow = (root / ".github/workflows/android.yml").read_text(encoding="utf-8")

checks = 0


def check(condition: bool, message: str) -> None:
    global checks
    checks += 1
    if not condition:
        raise AssertionError(message)


def region(source: str, start_marker: str, end_marker: str, label: str) -> str:
    start = source.find(start_marker)
    end = source.find(end_marker, start + len(start_marker)) if start >= 0 else -1
    if start < 0 or end < 0:
        raise AssertionError(f"cannot locate {label} between its source markers")
    return source[start:end]


# MainActivity owns mode selection and delegates animation mechanics to WorkspaceMotion.
transition = region(activity, "private void animateModeTransition(boolean enteringWeb)",
                    "private void setBrowserOnlineEnabled", "animateModeTransition()")
check(bool(re.search(
    r"WorkspaceMotion\.animateWorkspaceSwitch\(\s*browserScreen,\s*taskScreen,\s*"
    r"enteringWeb,\s*dp\(24\),\s*MOTION_ENTER\s*\);", transition)),
    "MainActivity must delegate both workspace views, direction, bounded travel and enter curve")
set_web_mode = region(activity, "private void setWebMode(boolean enabled)",
                      "private void animateModeTransition", "setWebMode()")
check("animateModeTransition(enabled);" in set_web_mode,
      "setWebMode must invoke the workspace transition")

# The helper must preserve the transition mechanics, not merely mention policy symbols.
switch = region(workspace, "public static void animateWorkspaceSwitch(",
                "    /** Soft browser chrome hide", "WorkspaceMotion.animateWorkspaceSwitch()")
check("View target = enteringWeb ? browserScreen : taskScreen;" in switch,
      "workspace transition must animate the screen selected by the requested direction")
check("if (target == null) return;" in switch,
      "workspace transition must safely handle a not-yet-created screen")
cancel = switch.find("target.animate().cancel();")
reset = switch.find("target.setAlpha(0f);")
check(cancel >= 0 and reset > cancel,
      "workspace transition must cancel a stale animator before resetting target properties")
check("slidePx * UiMotionPolicy.tabSlideFraction() * (enteringWeb ? 1f : -1f)" in switch,
      "workspace slide must use the shared fraction and reverse direction between screens")
check("target.setTranslationX(slide);" in switch,
      "workspace transition must initialize the horizontal slide offset")
check("target.setTranslationY(enteringWeb ? slidePx * 0.66f : -slidePx * 0.33f);" in switch,
      "workspace transition must preserve its directional vertical offset")
check(".alpha(1f)" in switch and ".translationX(0f)" in switch
      and ".translationY(0f)" in switch,
      "workspace transition must restore alpha and both translations to their resting values")
check(".setDuration(UiMotionPolicy.TAB_SWITCH_MS)" in switch,
      "production workspace transition must use the shared motion duration")
check(".setInterpolator(enterInterpolator)" in switch and ".start();" in switch,
      "workspace transition must apply the supplied enter curve and start the animation")

check("nowMs < expandStartedAtMs" in policy,
      "motion debounce must reject reversed timestamps before subtraction")
check("UiMotionPolicy.java" in runner and "UiMotionPolicySmoke.java" in runner,
      "canonical host runner must compile policy and smoke")
check("check-ui-motion-policy-tests.sh" not in runner,
      "motion runner must not reference the incorrect legacy script name")
check("run-ui-motion-policy-tests.sh" in workflow,
      "Android CI must invoke the canonical UI motion regression runner")
print(f"PASS UI motion integration source guard: {checks} assertions")
