#!/usr/bin/env python3
"""Source guard for press feedback, touch haptics, and motion easing.

Every card, row and button in this app is a hand-built GradientDrawable, so a resting background
was the only appearance it ever had: tapping a task row, a settings row or a browser control gave
no confirmation at all. The obvious remedies each break a guard this repository already has, so
this file pins the resolutions rather than only the result:

1. A blanket Material-style 15 % state layer is not safe with this palette: the dark theme's
   muted-on-surface row rests at 6.50:1 and lands at 4.15:1 under that overlay, below the 4.5:1
   ratio check-accessibility-contrast.py promises. The tint is therefore clamped per surface by
   PressSurface, and PressSurfaceSmoke asserts the invariant over all real palette pairs.
2. A pressed look keyed on state_selected would leave a selected-but-idle row permanently pressed,
   so the active state set is pressed + focused only.
3. HapticFeedbackConstants.CONFIRM/REJECT/TOGGLE_ON/TOGGLE_OFF are API 29+ while minSdk is 26, so
   the call must stay behind a version gate with a LONG_PRESS fallback.
4. The framework already divides ViewPropertyAnimator durations by the system animator scale, so
   the activity must not read ANIMATOR_DURATION_SCALE itself; a second scale would double-apply.

It also pins the two animator literals other guards depend on, so a future easing change cannot
quietly break check-v1-source.sh or check-extension-trust-confirmation.py.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
ACTIVITY = (ROOT / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
PRESS_SURFACE = ROOT / "app/src/main/java/com/abrar/daymark/PressSurface.java"
SMOKE = ROOT / "tools/PressSurfaceSmoke.java"
checks = 0


def check(condition: bool, message: str) -> None:
    global checks
    checks += 1
    if not condition:
        raise AssertionError(message)


def region(start_marker: str, end_marker: str, label: str) -> str:
    """The source between two markers, for order-sensitive assertions."""
    body = ACTIVITY.split(start_marker, 1)
    if len(body) < 2 or end_marker not in body[1]:
        raise AssertionError(f"cannot locate {label} between {start_marker!r} and {end_marker!r}")
    return body[1].split(end_marker, 1)[0]


# --- 1. The pure press-surface helper stays pure and keeps its contract ------------------------
check(PRESS_SURFACE.is_file(), "PressSurface.java must exist; press feedback depends on it")
press_surface = PRESS_SURFACE.read_text(encoding="utf-8")
check("import android." not in press_surface,
      "PressSurface must stay free of android.graphics so the host smoke suite can run it")
check("public final class PressSurface" in press_surface, "PressSurface must remain a final class")
for constant in ("PREFERRED_ALPHA = 0x26", "HIGH_CONTRAST_ALPHA = 0x40", "MINIMUM_RATIO = 4.5"):
    check(constant in press_surface,
          f"PressSurface must keep the documented contrast contract: {constant}")
check("public static int pressedFill(int[] labelRgb" in press_surface,
      "the activity resolves the pressed color through the multi-label PressSurface.pressedFill")
check("public static int safeAlpha(int[] labelRgb" in press_surface,
      "PressSurface must keep the array clamp that takes every label a surface draws")

# --- 2. The activity builds a real pressed state, clamped for contrast -------------------------
check("import android.graphics.drawable.StateListDrawable;" in ACTIVITY,
      "press feedback requires StateListDrawable backgrounds")
check("private StateListDrawable pressable(int fillColor, int radiusDp, int strokeColor," in ACTIVITY,
      "the single press-background helper is missing")
pressable = region("private StateListDrawable pressable(", "private LinearLayout.LayoutParams",
                   "pressable()")
check("int... labelColors" in pressable,
      "a surface draws more than one label color, so the clamp must take them all")
check("android.R.attr.state_pressed" in pressable, "the pressed state must exist")
check("android.R.attr.state_focused" in pressable,
      "keyboard and D-pad focus must get the same confirmation as touch")
check("state_selected" not in pressable.replace("state_selected is deliberately absent", ""),
      "state_selected must stay out of the active set; an idle-but-selected row would sit pressed")
check("PressSurface.pressedFill(" in pressable,
      "the pressed fill must be the contrast-clamped color, never a fixed tint")
check("highContrast ? PressSurface.HIGH_CONTRAST_ALPHA : PressSurface.PREFERRED_ALPHA" in pressable,
      "the overlay strength must follow the theme's contrast mode")
check("shape(pressedFill, radiusDp, palette.accent)" in pressable,
      "the active state must also change the stroke, which carries the press when a surface has "
      "no contrast headroom for any tint")
check("states.addState(new int[] {}, shape(fillColor, radiusDp, strokeColor));" in pressable,
      "the default state must be the untouched resting surface")

# --- 3. Every interactive surface actually uses it ---------------------------------------------
for marker, who in (
    ("button.setBackground(pressable(palette.accent, 22, palette.accent,", "primaryButton"),
    ("button.setBackground(pressable(palette.accentSoft, 22, palette.line, palette.accent));",
     "plainButton"),
    ("button.setBackground(pressable(fillColor, 9, palette.line, labelColor));", "compactButton"),
    ("row.setBackground(pressable(palette.surface, 20, palette.line,\n"
     "                palette.text, palette.muted, palette.warning, palette.danger));",
     "buildTaskRow"),
    ("row.setBackground(pressable(palette.surface, 16, palette.line,\n"
     "                palette.text, palette.muted));",
     "addSettingsRow"),
):
    check(marker in ACTIVITY, f"{who} lost its press background")
check("palette.warning, palette.danger" in ACTIVITY,
      "the task row can render a today task in warning and an overdue task in danger, so the "
      "press clamp must be measured against those too, not just the resting muted label")
check("row.setBackground(pressable(palette.surface, 20, palette.line, palette.muted));"
      not in ACTIVITY,
      "a single-label clamp on the task row is the regression PressSurfaceSmoke pins against")
check(ACTIVITY.count("button.setBackground(pressable(palette.surfaceAlt, 22, palette.line,"
                    " palette.accent));") == 3,
      "all three browser chrome / shortcut button sites must keep a press background")
check("setBackground(shape(palette.surfaceAlt, 22, palette.line))" not in ACTIVITY,
      "a resting-only shape() background must not return to the chrome buttons")
check(region("private Button compactButton(", "private LinearLayout horizontalCard",
             "compactButton()").count("int labelColor = danger ? palette.danger : palette.accent;") == 1,
      "compactButton must pass its real label color to the clamp, so the danger variant is measured")

# --- 4. Haptics stay version-gated and on the decision points ----------------------------------
check("import android.view.HapticFeedbackConstants;" in ACTIVITY,
      "haptic feedback constants must be imported explicitly")
haptic = region("private void haptic(View source, int modernKind) {", "private void hapticToggle",
                "haptic()")
check("Build.VERSION.SDK_INT >= 29" in haptic,
      "CONFIRM/REJECT/TOGGLE_* are API 29+ and minSdk is 26")
check("HapticFeedbackConstants.LONG_PRESS" in haptic,
      "API 26-28 need a non-deprecated fallback kind")
check("if (source == null) return;" in haptic,
      "haptics must not crash on a view that was never attached")
check("hapticToggle(button, checked);" in ACTIVITY,
      "the completion checkbox is a switch and must use the TOGGLE_* kinds")
check(region("private void hapticToggle", "private LinearLayout.LayoutParams bottomMargin",
             "hapticToggle()").count("TOGGLE_ON : HapticFeedbackConstants.TOGGLE_OFF") == 1,
      "TOGGLE_ON must map to completed and TOGGLE_OFF to un-completed, not the reverse")
for kind in ("REJECT", "CONFIRM"):
    check(f"HapticFeedbackConstants.{kind})" in ACTIVITY,
          f"the {kind.lower()} kind must stay wired to a decision point")
check(ACTIVITY.count("haptic(quickCaptureInput, HapticFeedbackConstants.REJECT);") == 2,
      "both quick-add refusals (no title, task store unavailable) must buzz")
check("haptic(quickCaptureInput, HapticFeedbackConstants.CONFIRM);" in ACTIVITY,
      "a captured task must confirm with a buzz")
check("haptic(undoButton, HapticFeedbackConstants.CONFIRM);" in ACTIVITY,
      "delete and restore are the two most regret-prone actions; both must buzz")
swipe = region("@Override public boolean onTouchEvent(android.view.MotionEvent event) {",
               "private void rescheduleTaskReminders()", "SwipeTaskRow.onTouchEvent")
check("haptic(this, HapticFeedbackConstants.CONFIRM);" in swipe,
      "an accepted swipe action must buzz")
check("haptic(this, HapticFeedbackConstants.REJECT);" in swipe,
      "a swipe that cannot be stored must say so, while the encrypted store is unavailable")
check("if (listener != null && canEdit()) {" in swipe,
      "the swipe's editability gate must not be weakened by the haptic change")
# The row overrides onTouchEvent and never calls super, so View's default press handling does not
# run: the pressed state must be driven by hand or the row's press background is dead on touch.
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
check(ACTIVITY.count("setInterpolator(MOTION_ENTER)") >= 3,
      "brand label and composer must still use the enter curve in MainActivity")
check(ACTIVITY.count("setInterpolator(MOTION_EXIT)") >= 2,
      "brand label and composer hide must still use the exit curve in MainActivity")
check("WorkspaceMotion.hideChrome(" in ACTIVITY,
      "browser chrome hide must delegate to WorkspaceMotion")
check("WorkspaceMotion.showChrome(" in ACTIVITY,
      "browser chrome show must delegate to WorkspaceMotion")
check("WorkspaceMotion.animateWorkspaceSwitch(" in ACTIVITY,
      "workspace/tab switch must delegate to WorkspaceMotion")
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
