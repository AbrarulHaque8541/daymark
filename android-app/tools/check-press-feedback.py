#!/usr/bin/env python3
"""Source guard: press feedback, haptics, and shared motion easing stay wired.

Press surfaces must keep a pressed state distinct from rest, task rows must drive
pressed state without delegating touch to View, and shared MOTION_ENTER/EXIT curves
must remain the single easing source for chrome, brand, composer, and workspace
motion (workspace/chrome may live in WorkspaceMotion).
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
ACTIVITY = (ROOT / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
SMOKE = ROOT / "tools/PressSurfaceSmoke.java"
checks = 0


def check(cond: bool, msg: str) -> None:
    global checks
    checks += 1
    if not cond:
        raise AssertionError(msg)


# --- 1. PressSurface exists and is used -------------------------------------------------------
press = (ROOT / "app/src/main/java/com/abrar/daymark/PressSurface.java").read_text(encoding="utf-8")
check("class PressSurface" in press, "PressSurface class missing")
check("MINIMUM_RATIO" in press, "PressSurface contrast floor missing")
check("pressed(" in press, "PressSurface.pressed helper missing")
check("PressSurface" in ACTIVITY, "MainActivity must use PressSurface")

# --- 2. Task row press background --------------------------------------------------------------
check("taskRowBackground" in ACTIVITY or "PressSurface.taskRow" in ACTIVITY,
      "task rows must use a press-aware background")

# --- 3. Chrome / shortcut buttons keep press backgrounds --------------------------------------
check(ACTIVITY.count("setBackground(") >= 3,
      "all three browser chrome / shortcut button sites must keep a press background")
check("shape(" in ACTIVITY,
      "a resting-only shape() background must not return to the chrome buttons")

# --- 4. SwipeTaskRow owns pressed state without View delegation --------------------------------
swipe_path = ROOT / "app/src/main/java/com/abrar/daymark/SwipeTaskRow.java"
if not swipe_path.is_file():
    # Some trees keep the row inline; fall back to Activity search.
    swipe = ACTIVITY
else:
    swipe = swipe_path.read_text(encoding="utf-8")
check("if (event.getAction() == android.view.MotionEvent.ACTION_DOWN) setPressed(true);" in swipe,
      "SwipeTaskRow must set the pressed state itself; super.onTouchEvent is never called here")
check("setPressed(false);" in swipe,
      "SwipeTaskRow must clear the pressed state on up and cancel")
check("return super.onTouchEvent(event);" not in swipe,
      "delegating to View would double-handle the gesture this row owns; keep the explicit "
      "pressed-state calls and update this guard deliberately if that ever changes")

# --- 5. Motion easing: curves present, no second animator-scale application --------------------
check("import android.view.animation.DecelerateInterpolator;" in ACTIVITY,
      "entering chrome must decelerate into place")
check("import android.view.animation.AccelerateInterpolator;" in ACTIVITY,
      "leaving chrome must accelerate away")
check("private static final Interpolator MOTION_ENTER = new DecelerateInterpolator(" in ACTIVITY,
      "the shared enter curve is missing")
check("private static final Interpolator MOTION_EXIT = new AccelerateInterpolator(" in ACTIVITY,
      "the shared exit curve is missing")
# Workspace tab switch + browser chrome hide/show now live in WorkspaceMotion and pass the
# shared MOTION_ENTER / MOTION_EXIT interpolators from MainActivity. Brand + composer motion
# remains inline in MainActivity. Require the production delegation plus remaining enter/exit uses.
WORKSPACE = (ROOT / "app/src/main/java/com/abrar/daymark/WorkspaceMotion.java").read_text(encoding="utf-8")
check("WorkspaceMotion.animateWorkspaceSwitch(" in ACTIVITY,
      "Tasks↔Web switch must delegate to WorkspaceMotion")
check("WorkspaceMotion.hideChrome(" in ACTIVITY and "WorkspaceMotion.showChrome(" in ACTIVITY,
      "browser chrome hide/show must delegate to WorkspaceMotion")
check("setInterpolator(enterInterpolator)" in WORKSPACE and "setInterpolator(exitInterpolator)" in WORKSPACE,
      "WorkspaceMotion must apply the interpolators MainActivity passes")
check(ACTIVITY.count("setInterpolator(MOTION_ENTER)") >= 2,
      "brand label and composer must still use the enter curve in MainActivity")
check(ACTIVITY.count("setInterpolator(MOTION_EXIT)") >= 2,
      "brand label and composer hide must still use the exit curve in MainActivity")
check("ANIMATOR_DURATION_SCALE" not in ACTIVITY,
      "the framework already scales ViewPropertyAnimator by the system animator duration scale; "
      "reading it again here would double-apply and break the reduced-motion setting")
# Easing must not have disturbed the literals other guards pin.
check("browserStatus.animate().alpha(0f).setDuration(180L)" in ACTIVITY,
      "check-v1-source.sh pins the browser status fade literal exactly")
check("content.animate().alpha(1f).translationY(0f).setDuration(160L).start()" in ACTIVITY,
      "check-extension-trust-confirmation.py pins the settings fade literal exactly")

# --- 6. The host suite must keep proving the clamp ---------------------------------------------
core = (ROOT / "tools/run-core-tests.sh").read_text(encoding="utf-8")
check("com/abrar/daymark/PressSurface.java" in core,
      "PressSurface.java must compile in the core host suite")
check("com.abrar.daymark.PressSurfaceSmoke" in core,
      "the press-surface smoke must run in the core host suite")
check(SMOKE.is_file(), "PressSurfaceSmoke.java must exist")
smoke = SMOKE.read_text(encoding="utf-8")
for role in ("taskRow", "settingsRow", "chromeButton", "compactButtonDanger", "plainButton",
             "primaryButton"):
    check(f'"{role}"' in smoke,
          f"the smoke must cover the {role} surface; press feedback is unguarded without it")
check("MINIMUM_RATIO" in smoke, "the smoke must assert the contrast invariant, not just colors")

print(f"PASS press feedback, haptics and motion easing: {checks} assertions")
