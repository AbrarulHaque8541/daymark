#!/usr/bin/env python3
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
workflow = (root.parent / ".github/workflows/focus-timer-emulator.yml").read_text(encoding="utf-8")
runner = (root / "tools/run-platform-instrumentation-on-emulator.sh").read_text(encoding="utf-8")
helper = (root / "tools/platform-instrumentation-repeat.sh").read_text(encoding="utf-8")
test_runner = (root / "tools/run-platform-instrumentation-repeat-tests.sh").read_text(encoding="utf-8")
platform_test = (root / "app/src/androidTest/java/com/abrar/daymark/DaymarkPlatformInstrumentation.java").read_text(encoding="utf-8")
shell_policy = (root / "app/src/androidTest/java/com/abrar/daymark/PlatformShellInputCommand.java").read_text(encoding="utf-8")
shell_smoke = (root / "tools/PlatformShellInputCommandSmoke.java").read_text(encoding="utf-8")
shell_test_runner = (root / "tools/run-platform-instrumentation-shell-input-tests.sh").read_text(encoding="utf-8")
focus_panel = (root / "app/src/main/java/com/abrar/daymark/TaskFocusTimerPanel.java").read_text(encoding="utf-8")
selector_start = focus_panel.index("private final class ModeSelector")
selector_end = focus_panel.index("private void chooseDisplayUnit", selector_start)
selector = focus_panel[selector_start:selector_end]
assert "disallowParentIntercept(true);" in selector
assert "disallowParentIntercept(false);" in selector
down_branch = selector.split("case MotionEvent.ACTION_DOWN:", 1)[1].split("case MotionEvent.ACTION_MOVE:", 1)[0]
assert "disallowParentIntercept(true);" not in down_branch, "vertical Tasks scrolling must remain available until direction is known"
assert "getParent().requestDisallowInterceptTouchEvent(disallow);" in selector
assert "requestDisallowInterceptTouchEvent(true)" not in selector
assert "requestDisallowInterceptTouchEvent(false)" not in selector
vertical_branch = selector.split("if (result == TaskFocusTimerModeGesturePolicy.Result.VERTICAL)", 1)[1].split("if (result == TaskFocusTimerModeGesturePolicy.Result.TO_STOPWATCH", 1)[0]
assert "disallowParentIntercept(false);" in vertical_branch
assert "return false;" in vertical_branch, "vertical drags must be handed back to the parent ScrollView"

canonical = (root / "tools/check-v1-source.sh").read_text(encoding="utf-8")
assert "timeout-minutes: 90" in workflow
assert "DAYMARK_FOCUS_EMULATOR_REPEAT_COUNT: ${{ matrix.api-level == 36 && '10' || '1' }}" in workflow
for path in (
    "android-app/app/src/androidTest/java/com/abrar/daymark/DaymarkPlatformInstrumentation.java",
    "android-app/app/src/androidTest/java/com/abrar/daymark/PlatformShellInputCommand.java",
    "android-app/tools/PlatformShellInputCommandSmoke.java",
    "android-app/tools/run-platform-instrumentation-shell-input-tests.sh",
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
assert "run-platform-instrumentation-shell-input-tests.sh" in test_runner
assert "sh -n \"$ROOT/tools/run-platform-instrumentation-on-emulator.sh\"" in test_runner
assert "javac -encoding UTF-8" in shell_test_runner
assert "PlatformShellInputCommandSmoke" in shell_smoke
assert "PlatformShellInputCommand.tap" in platform_test
assert "PlatformShellInputCommand.swipe" in platform_test
assert "getUiAutomation().executeShellCommand(inputCommand)" in platform_test
assert "vertical drag delivers touchscreen events to target" in platform_test
assert "parent Tasks ScrollView scrolls after a vertical Focus-mode drag" in platform_test
assert "check(capturedTouchTrace[0] != null && !capturedTouchTrace[0].isEmpty()" in platform_test
assert 'System.out.println("INSTRUMENTATION_PHASE: " + message);' in platform_test
marker_method = platform_test.split("private void marker(String message)", 1)[1].split("private interface PhaseAction", 1)[0]
assert "getFilesDir()" not in marker_method and "FileOutputStream" not in marker_method
assert "INPUT_REQUEST_FILE" not in platform_test and "INPUT_RESULT_FILE" not in platform_test
assert "MAX_COORDINATE = 10000" in shell_policy
assert "MAX_DURATION_MS = 5000" in shell_policy
assert "checkCoordinate" in shell_policy
assert '/system/bin/input tap ' in shell_policy
assert '/system/bin/input swipe ' in shell_policy
assert '2>&1"' in shell_policy
assert "negative tap coordinate" in shell_smoke
assert "oversized swipe duration" in shell_smoke
assert "platform-instrumentation-input-bridge" not in workflow
assert "platform-instrumentation-input-bridge" not in runner
assert "platform-instrumentation-input-bridge" not in test_runner
print("PASS focus emulator wiring: bounded numeric UiAutomation shell input, API 36 ten-run gate, vertical-scroll handoff, fail-fast")
