#!/usr/bin/env python3
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
workflow = (root.parent / ".github/workflows/focus-timer-emulator.yml").read_text(encoding="utf-8")
runner = (root / "tools/run-platform-instrumentation-on-emulator.sh").read_text(encoding="utf-8")
helper = (root / "tools/platform-instrumentation-repeat.sh").read_text(encoding="utf-8")
test_runner = (root / "tools/run-platform-instrumentation-repeat-tests.sh").read_text(encoding="utf-8")
platform_test = (root / "app/src/androidTest/java/com/abrar/daymark/DaymarkPlatformInstrumentation.java").read_text(encoding="utf-8")
focus_panel = (root / "app/src/main/java/com/abrar/daymark/TaskFocusTimerPanel.java").read_text(encoding="utf-8")
selector_start = focus_panel.index("private final class ModeSelector")
selector_end = focus_panel.index("private void chooseDisplayUnit", selector_start)
selector = focus_panel[selector_start:selector_end]
assert "disallowParentIntercept(true);" in selector
assert "disallowParentIntercept(false);" in selector
assert "getParent().requestDisallowInterceptTouchEvent(disallow);" in selector
assert "requestDisallowInterceptTouchEvent(true)" not in selector
assert "requestDisallowInterceptTouchEvent(false)" not in selector

canonical = (root / "tools/check-v1-source.sh").read_text(encoding="utf-8")

assert "timeout-minutes: 90" in workflow
assert "DAYMARK_FOCUS_EMULATOR_REPEAT_COUNT: ${{ matrix.api-level == 36 && '10' || '1' }}" in workflow
for path in (
    "android-app/tools/platform-instrumentation-repeat.sh",
    "android-app/tools/run-platform-instrumentation-repeat-tests.sh",
    "android-app/tools/check-focus-emulator-repeat.py",
):
    assert f'"{path}"' in workflow, f"focus emulator workflow must trigger for {path}"
assert ". tools/platform-instrumentation-repeat.sh" in runner
assert "run_instrumentation_repeated run_instrumentation_once" in runner
assert "adb shell pm clear com.abrar.daymark" in helper
assert "1|2|3|4|5|6|7|8|9|10" in helper
assert "no retry was attempted" in helper
assert "sh ./tools/run-platform-instrumentation-repeat-tests.sh" in canonical
assert 'python3 "$ROOT/tools/check-focus-emulator-repeat.py" "$ROOT"' in canonical
assert "run_instrumentation_repeated" in test_runner
assert "event.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN)" in platform_test
assert "sendPointerSync(event);" in platform_test  # taps and instrumented-window swipes
assert "injectPointerEvent(android.view.MotionEvent.ACTION_DOWN" in platform_test
assert "injectPointerEvent(android.view.MotionEvent.ACTION_MOVE" in platform_test
assert "injectPointerEvent(android.view.MotionEvent.ACTION_UP" in platform_test
assert "vertical drag delivers touchscreen events to target" in platform_test
assert "getUiAutomation().injectInputEvent" not in platform_test
assert "check(capturedTouchTrace[0] != null && !capturedTouchTrace[0].isEmpty()" in platform_test
assert "stableVisibleBounds" in platform_test
assert "locationOnScreen=(" in platform_test
print("PASS focus emulator repeat wiring: API 36 ten-run gate, bounded disposable reset, fail-fast test integration")
