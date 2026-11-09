#!/usr/bin/env python3
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
workflow = (root.parent / ".github/workflows/focus-timer-emulator.yml").read_text(encoding="utf-8")
runner = (root / "tools/run-platform-instrumentation-on-emulator.sh").read_text(encoding="utf-8")
helper = (root / "tools/platform-instrumentation-repeat.sh").read_text(encoding="utf-8")
test_runner = (root / "tools/run-platform-instrumentation-repeat-tests.sh").read_text(encoding="utf-8")
platform_test = (root / "app/src/androidTest/java/com/abrar/daymark/DaymarkPlatformInstrumentation.java").read_text(encoding="utf-8")
touch_sequence = (root / "app/src/androidTest/java/com/abrar/daymark/PlatformTouchSequence.java").read_text(encoding="utf-8")
touch_smoke = (root / "tools/PlatformTouchSequenceSmoke.java").read_text(encoding="utf-8")
touch_test_runner = (root / "tools/run-platform-instrumentation-touch-sequence-tests.sh").read_text(encoding="utf-8")
focus_panel = (root / "app/src/main/java/com/abrar/daymark/TaskFocusTimerPanel.java").read_text(encoding="utf-8")
selector_start = focus_panel.index("private final class ModeSelector")
selector_end = focus_panel.index("private void chooseDisplayUnit", selector_start)
selector = focus_panel[selector_start:selector_end]

down_branch = selector.split("case MotionEvent.ACTION_DOWN:", 1)[1].split("case MotionEvent.ACTION_MOVE:", 1)[0]
assert "disallowParentIntercept(true);" in selector
assert "disallowParentIntercept(false);" in down_branch, "parent ScrollView must remain eligible from ACTION_DOWN"
assert "disallowParentIntercept(false);" in selector
assert "disallowParentIntercept(true);" not in down_branch, "vertical Tasks scrolling must remain available until direction is known"
assert "getParent().requestDisallowInterceptTouchEvent(disallow);" in selector
assert "requestDisallowInterceptTouchEvent(true)" not in selector
assert "requestDisallowInterceptTouchEvent(false)" not in selector
vertical_branch = selector.split("if (result == TaskFocusTimerModeGesturePolicy.Result.VERTICAL)", 1)[1].split("if (result == TaskFocusTimerModeGesturePolicy.Result.TO_STOPWATCH", 1)[0]
assert "disallowParentIntercept(false);" in vertical_branch
assert "return false;" in vertical_branch, "vertical drags must be handed back to the parent ScrollView"
assert "verticalScrollTrace=" in platform_test, "failed vertical scroll assertions must emit the captured dispatch trace"
assert "ancestorTrace" in platform_test, "vertical diagnostics must trace the parent and intermediate ViewGroups"
assert "pointerId=" in platform_test and "toolType=" in platform_test, "touch diagnostics must record pointer identity and tool type"

canonical = (root / "tools/check-v1-source.sh").read_text(encoding="utf-8")
assert "timeout-minutes: 90" in workflow
assert "DAYMARK_FOCUS_EMULATOR_REPEAT_COUNT: ${{ matrix.api-level == 36 && '10' || '1' }}" in workflow
for path in (
    "android-app/app/src/androidTest/java/com/abrar/daymark/DaymarkPlatformInstrumentation.java",
    "android-app/app/src/androidTest/java/com/abrar/daymark/PlatformTouchSequence.java",
    "android-app/tools/PlatformTouchSequenceSmoke.java",
    "android-app/tools/run-platform-instrumentation-touch-sequence-tests.sh",
    "android-app/tools/platform-instrumentation-repeat.sh",
    "android-app/tools/run-platform-instrumentation-repeat-tests.sh",
    "android-app/tools/check-focus-emulator-repeat.py",
):
    assert f'"{path}"' in workflow, f"focus emulator workflow must trigger for {path}"

assert ". tools/platform-instrumentation-repeat.sh" in runner
assert "run_instrumentation_repeated run_instrumentation_once" in runner
assert "adb shell am instrument -w -r" in runner
assert "parse_platform_instrumentation_component" in runner
assert 'while [ "$attempt" -le 20 ]' in runner
assert "parse_platform_instrumentation_component()" in helper
assert "DaymarkPlatformInstrumentation" in helper
assert "parse_platform_instrumentation_component" in test_runner
assert "adb logcat -d -t 500 -s DaymarkInstr:I" in runner
assert "drive_instrumentation_input_bridge" not in runner
assert "input_package=" not in runner
assert "run-as" not in runner
assert "no retry was attempted" in helper
assert "adb shell pm clear com.abrar.daymark" in helper
assert "sh ./tools/run-platform-instrumentation-repeat-tests.sh" in canonical
assert 'python3 "$ROOT/tools/check-focus-emulator-repeat.py" "$ROOT"' in canonical
assert "run_instrumentation_repeated" in test_runner
assert "run-platform-instrumentation-touch-sequence-tests.sh" in test_runner
assert 'sh -n "$ROOT/tools/run-platform-instrumentation-on-emulator.sh"' in test_runner
assert "javac -encoding UTF-8" in touch_test_runner
assert "PlatformTouchSequenceSmoke" in touch_smoke
assert "PlatformTouchSequence.tap" in platform_test
assert "PlatformTouchSequence.swipe" in platform_test
assert "automation.injectInputEvent(event, true)" in platform_test
assert 'adoptShellPermissionIdentity("android.permission.INJECT_EVENTS")' in platform_test
assert "dropShellPermissionIdentity()" in platform_test
assert "event.setDisplayId(" not in platform_test, "instrumentation must not call hidden MotionEvent display APIs"
assert "event.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN)" in platform_test
assert "sendPointerSync(event)" in platform_test, "pre-29 instrumentation fallback must remain"
assert "MAX_COORDINATE = 10000" in touch_sequence
assert "MAX_DURATION_MS = 5000" in touch_sequence
assert "MIN_SWIPE_DURATION_MS = SWIPE_MOVE_STEPS + 1" in touch_sequence
assert "SWIPE_MOVE_STEPS = 8" in touch_sequence
assert "checkPoint" in touch_sequence
assert "PlatformShellInputCommand" not in platform_test
assert "executeShellCommand" not in platform_test
assert "dispatchHostInput" not in platform_test
assert "vertical drag delivers touchscreen events to target" in platform_test
assert 'findAncestorWithSimpleName(modeRow, "ModeSelector")' in platform_test
assert "dispatchSwipe(modeSelector, true)" in platform_test
assert "dispatchSwipe(modeSelector, false)" in platform_test
assert "dispatchVerticalScrollSwipe(modeSelector, parentScroll, canScroll[0])" in platform_test
assert '"parent-scroll"' in platform_test
assert "parent-scroll:ACTION_MOVE" in platform_test, "vertical dispatch diagnostics must retain the parent ScrollView MOVE trace marker"
assert "MotionEvent.actionToString(event.getActionMasked())" in platform_test
assert "ancestor == parentScroll ? \"parent-scroll\"" in platform_test
assert "ancestor.setOnTouchListener" in platform_test
assert "appendTouchTrace(ancestorTrace, label, targetView, event)" in platform_test
assert "selectorTrace" in platform_test
assert "ancestorTrace" in platform_test
assert "attachTouchTraceListeners(view" in platform_test
assert "scrollDeadline" in platform_test
assert "horizontal swipe delivers touchscreen events to the ModeSelector or descendants" in platform_test
assert "parent Tasks ScrollView scrolls after a vertical Focus-mode drag" in platform_test
assert "check(capturedTouchTrace[0] != null && !capturedTouchTrace[0].isEmpty()" in platform_test
assert 'System.out.println("INSTRUMENTATION_PHASE: " + message);' in platform_test
marker_method = platform_test.split("private void marker(String message)", 1)[1].split("private interface PhaseAction", 1)[0]
assert "getFilesDir()" not in marker_method and "FileOutputStream" not in marker_method
assert "INPUT_REQUEST_FILE" not in platform_test and "INPUT_RESULT_FILE" not in platform_test
assert "platform-instrumentation-input-bridge" not in workflow
assert "platform-instrumentation-input-bridge" not in runner
assert "platform-instrumentation-input-bridge" not in test_runner
print("PASS focus emulator wiring: shell-identity UiAutomation touchscreen injection, API 36 ten-run gate, vertical-scroll handoff, fail-fast")
