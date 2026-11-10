#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
panel = (root / "app/src/main/java/com/abrar/daymark/TaskFocusTimerPanel.java").read_text()
sound = (root / "app/src/main/java/com/abrar/daymark/TaskFocusTimerSoundscape.java").read_text()
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text()
runtime = (root / "app/src/main/java/com/abrar/daymark/TaskFocusSessionRuntime.java").read_text()
instrumentation = (root / "app/src/androidTest/java/com/abrar/daymark/DaymarkPlatformInstrumentation.java").read_text()

required_panel = [
    "STOPWATCH", "COUNTDOWN", "onStart(TaskFocusTimer.Mode mode, long targetDurationMs)",
    "onPause()", "onResume()", "onStop()", "onChooseTask()",
    "setDailySummary", "setSoundEnabled", "setFinalTicksEnabled",
    "void setActionPending(boolean pending)", "private boolean actionPending;",
    "primaryAction.setEnabled(enabled);", "stopAction.setEnabled(enabled && active);",
    "boolean configurationEnabled = enabled && !active;",
    "modeStopwatch.setEnabled(configurationEnabled);",
    "customDuration.setEnabled(configurationEnabled",
    "for (TextView button : displayUnitButtons) button.setEnabled(enabled);",
    "soundToggle.setEnabled(enabled);", "tickToggle.setEnabled(enabled && soundEnabled);",
    "showCustomDuration", "ProgressRing", "ValueAnimator",
    "int background, int surface, int surfaceAlt, int text, int muted",
    "int accent, int accentSoft, int warning",
    "ACCENT_SOFT", "DisplayUnit { AUTO, SECONDS, MINUTES, HOURS }",
    "TIME DISPLAY", "chooseDisplayUnit", "formatFixedUnit",
    "return totalSeconds + \" sec\";", "\"min\"", "\"hr\"",
    "RadioGroup units", "Maximum duration is 24 hours.",
    "TaskFocusTimer.MAX_COUNTDOWN_MS / multiplier",
]
for token in required_panel:
    assert token in panel, f"Focus Timer panel missing contract: {token}"

required_accessibility = [
    "info.setClassName(android.widget.Button.class.getName());",
    "info.setClassName(RadioButton.class.getName());",
    "info.setClassName(android.widget.CheckBox.class.getName());",
    "info.setCheckable(true);",
    "info.setChecked(host.isSelected());",
    "configureChoiceAccessibility(view);",
    "configureChoiceAccessibility(choice);",
    "configureChoiceAccessibility(preset);",
    "configureToggleAccessibility(view);",
    "setToggleState(soundToggle, \"Soft interaction sounds\", soundEnabled);",
    "setToggleState(tickToggle, \"Final 10-second ticks\", finalTicksEnabled);",
    "modeStopwatch.setSelected(mode == TaskFocusTimer.Mode.STOPWATCH);",
    "modeCountdown.setSelected(mode == TaskFocusTimer.Mode.COUNTDOWN);",
    "displayUnitButtons[i].setSelected(selected);",
    "preset.setSelected(selected);",
    "new LayoutParams(0, dp(48), 1)",
    "tickToggle.setEnabled(!actionPending && enabled);",
    "view.setMinimumHeight(dp(48));",
    "taskName.setMinimumHeight(dp(48));",
    "customDuration.setMinimumHeight(dp(48));",
    "primaryAction.setContentDescription(running ? \"Pause focus timer\"",
    "taskName.setContentDescription(\"Focus task: \" + taskLabel);",
]
for token in required_accessibility:
    assert token in panel, f"Focus Timer accessibility regression: {token}"
assert 'timeValue.setContentDescription("Focus timer value");' not in panel, (
    "a generic timer description must not hide the displayed time from screen readers"
)
print("PASS Focus Timer accessible control roles, selected/checkable states and 48dp targets")

required_sound = [
    "ToneGenerator", "AudioManager.STREAM_NOTIFICATION",
    "void onAction()", "void onSelection()", "void onCountdownSecond(int remainingSeconds)",
    "remainingSeconds > 10", "remainingSeconds == lastTickSecond",
    "void onFinished()", "void close()", "toneGenerator.release()",
    "private void ensureToneGenerator()",
]
for token in required_sound:
    assert token in sound, f"Focus Timer soundscape missing contract: {token}"

assert "private boolean soundEnabled;" in panel
assert "track.setColor(SURFACE_HI);" in panel, "progress track must use the injected Daymark palette"
assert "activeAnimator.cancel()" in panel, "progress animation must cancel superseded animations"
assert "LAYER_TYPE_SOFTWARE" not in panel, "timer ring must not force software rendering"
assert "private boolean finalTicksEnabled;" in panel
assert "startTone" not in panel, "UI must route sounds through the soundscape"
for fixed_accent in ["0xFF12617A", "0xFF54368F", "0xFF27D5F2", "0xFF9B70FF"]:
    assert fixed_accent not in panel, f"Focus Timer must not hardcode a separate palette: {fixed_accent}"
assert "while (" not in sound and "Thread.sleep" not in sound, "Sound must not use a looping/blocking playback loop"
assert "RECORD_AUDIO" not in sound and "MODIFY_AUDIO_SETTINGS" not in sound, "Sound effects must not request microphone/audio-control permissions"
assert "onChooseTask" in panel and "listener.onChooseTask()" in panel
assert "if (closed) return;" in panel, "disposed panel must ignore render and public state updates"
assert "if (!closed && !actionPending && timer != null && !timer.isFinished())" in panel, "disposed or pending panel must not dispatch Finish"
assert "private boolean released;" in sound and "|| released" in sound, "released soundscape must never recreate audio resources"

print("PASS focus timer UI/sound source guard")

required_integration = [
    "new TaskFocusTimerPanel(this, new TaskFocusTimerPanel.Listener()",
    "startFocusSession(mode, targetDurationMs)",
    "focusSessionRuntime.startFromUserAction(",
    "focusSessionRuntime.restoreAfterProcessStart(loaded)",
    "focusSessionRuntime.reconcileTasks(snapshot)",
    "focusSessionRuntime.reconcileTasks(currentTasksAfterRestore)",
    "focusTimerPanel.render(timer, android.os.SystemClock.elapsedRealtime())",
    "focusTimerPanel.close()",
    "stopFocusTimerTick()",
    "showFocusTaskPicker()",
    "focusSessionRuntime.switchTaskWhilePausedFromUserAction(",
    "focusSessionRuntime.resumeFromUserAction(selected.id, selected.title)",
    "focusTimerPanel.setActionPending(true)",
]
for token in required_integration:
    assert token in activity, f"Focus Timer Activity integration missing: {token}"

picker_start = activity.index("    private void showFocusTaskPicker()")
picker_end = activity.index("    private void startFocusSession(", picker_start)
picker = activity[picker_start:picker_end]
picker_gate = picker[:picker.index("List<Task> eligible")]
assert "if (focusSnapshot != null && focusSnapshot.isRunning())" in picker_gate, (
    "task switching must be blocked while the Focus Timer is RUNNING"
)
assert "isPaused()" not in picker_gate and "!focusSnapshot.isFinished()" not in picker_gate, (
    "PAUSED and FINISHED Focus Timer sessions must not block task switching"
)
selection_start = picker.index("Task chosen = eligible.get(which);")
selection_end = picker.index("selectedFocusTaskId = chosen.id;", selection_start)
selection = picker[selection_start:selection_end]
assert "if (focusSnapshot != null && focusSnapshot.isPaused())" in selection, (
    "paused task selection must take the durable session-switch path"
)
assert "runFocusAction(() -> focusSessionRuntime.switchTaskWhilePausedFromUserAction(" in selection, (
    "paused task selection must persist the task ID before updating the panel"
)
assert "return;" in selection, "paused task selection must not fall through to the UI-only selection path"
assert "selectedFocusTaskId = chosen.id;" in picker, (
    "the task picker must still apply the selected task"
)
resume_start = activity.index("    private void resumeFocusSession()")
resume_end = activity.index("    private void finishFocusSession()", resume_start)
resume = activity[resume_start:resume_end]
assert "resumeFromUserAction(selected.id, selected.title)" in resume, (
    "resume must identify the exact selected task so stale UI identity cannot publish a mismatched title"
)
print("PASS task-chip regression guard: paused selection is persisted before resume; RUNNING blocked")

assert "coordinator.startFromUserAction(" in runtime
assert "coordinator.switchTaskWhilePausedFromUserAction(taskId, title)" in runtime
assert "coordinator.resumeFromUserAction(taskId, title)" in runtime
assert "store.save(timer, elapsed, wall, boot)" in runtime
assert "TaskFocusTimerNotification.publish(" in runtime
assert "findTask(tasks, saved == null ? null : saved.taskId())" in runtime
assert "TaskFocusTimerStore" in runtime and "focus-session.enc" not in activity
print("PASS focus timer task UI integration: explicit user actions, encrypted session runtime, task resolution, Activity cleanup")

layout_policy = (root / "app/src/main/java/com/abrar/daymark/TasksHomeLayoutPolicy.java").read_text()
assert "TasksHomeLayoutPolicy.forWidthDp(screenWidthDp)" in activity
assert "homeLayout.maxContentWidthDp" in activity
assert "homeLayout.columns" in activity
assert "contentFrame.addView(content, contentParams)" in activity
assert "if (widthDp >= 840)" in layout_policy
assert "new Layout(1040, 24, 2, 16, 12)" in layout_policy
assert "new Layout(720, 24, 1, 0, 12)" in layout_policy
print("PASS responsive Tasks Home: centered max-width content and two-column expanded task grid")

mode_start = panel.index("    private final class ModeSelector extends LinearLayout {")
mode_end = panel.index("    private void chooseDisplayUnit(", mode_start)
mode_selector = panel[mode_start:mode_end]
assert "public void requestDisallowInterceptTouchEvent(boolean disallow)" in mode_selector, (
    "mode selector must neutralize child disallow-intercept requests so it can classify MOVE"
)
assert "disallowParentIntercept(false);" in mode_selector, (
    "mode selector must release the parent for vertical movement and every terminal path"
)
down_case = mode_selector.split("case MotionEvent.ACTION_DOWN:", 1)[1].split(
    "case MotionEvent.ACTION_MOVE:", 1
)[0]
assert "disallowParentIntercept(false);" in down_case, (
    "ACTION_DOWN must not reserve the parent before direction is known; child taps and vertical drags must remain deliverable"
)
assert "disallowParentIntercept(true);" not in down_case, (
    "only a classified horizontal MOVE may disallow parent interception"
)
move_case = mode_selector.split("case MotionEvent.ACTION_MOVE:", 1)[1].split(
    "case MotionEvent.ACTION_UP:", 1
)[0]
vertical_branch = move_case.split(
    "if (result == TaskFocusTimerModeGesturePolicy.Result.VERTICAL)", 1
)[1].split("if (result == TaskFocusTimerModeGesturePolicy.Result.TO_STOPWATCH", 1)[0]
assert "verticalGesture = true;" in vertical_branch
assert "disallowParentIntercept(false);" in vertical_branch and "return false;" in vertical_branch, (
    "a classified vertical drag must release the parent ScrollView and leave the stream available for scrolling"
)
horizontal_branch = move_case.split(
    "if (result == TaskFocusTimerModeGesturePolicy.Result.TO_STOPWATCH", 1
)[1]
assert "disallowParentIntercept(true);" in horizontal_branch and "return true;" in horizontal_branch, (
    "only a classified horizontal mode swipe may keep the parent blocked and intercept the selector stream"
)
up_case = mode_selector.split("case MotionEvent.ACTION_UP:", 1)[1].split(
    "case MotionEvent.ACTION_CANCEL:", 1
)[0]
assert "resetGesture();" in up_case and "return false;" in up_case, (
    "an unclassified tap must release the parent and return ACTION_UP to the clickable child"
)
cancel_case = mode_selector.split("case MotionEvent.ACTION_CANCEL:", 1)[1].split(
    "default:", 1
)[0]
assert "resetGesture();" in cancel_case, (
    "cancellation must always release the parent interception request"
)
vertical_touch = mode_selector.split("public boolean onTouchEvent(MotionEvent event)", 1)[1].split(
    "private void disallowParentIntercept", 1
)[0]
assert "if (verticalGesture)" in vertical_touch
assert "disallowParentIntercept(false);" in vertical_touch and "return false;" in vertical_touch, (
    "vertical streams must be handed back to the parent rather than consumed by the mode selector"
)
reset_method = mode_selector.split("private void resetGesture()", 1)[1].split(
    "@Override", 1
)[0]
assert "disallowParentIntercept(false);" in reset_method, (
    "all terminal and detach paths must clear the parent's disallow-intercept state"
)
assert "getParent().requestDisallowInterceptTouchEvent(disallow);" in mode_selector, (
    "gesture ownership must be forwarded to the parent without setting the selector's own disallow flag"
)
assert "if (verticalGesture)" in mode_selector and "return false;" in mode_selector, (
    "vertical movement must be released to the parent Tasks ScrollView"
)
assert "if (result == TaskFocusTimerModeGesturePolicy.Result.VERTICAL)" in mode_selector, (
    "the selector must classify vertical movement before intercepting horizontal swipes"
)
assert "if (result == TaskFocusTimerModeGesturePolicy.Result.TO_STOPWATCH" in mode_selector, (
    "rightward horizontal movement must be explicitly classified for Stopwatch"
)
assert "|| result == TaskFocusTimerModeGesturePolicy.Result.TO_COUNTDOWN)" in mode_selector, (
    "leftward horizontal movement must be explicitly classified for Countdown"
)
assert "requestDisallowInterceptTouchEvent(true)" not in mode_selector
assert "requestDisallowInterceptTouchEvent(false)" not in mode_selector, (
    "the selector must forward parent interception through disallowParentIntercept(), not set its own flag"
)
print("PASS Focus Timer gesture arbitration: horizontal mode swipes and parent vertical scrolling")

mode_test_start = instrumentation.index("private void focusTimerModeSelectorTapsAndSwipes()")
mode_test_end = instrumentation.index("private android.view.View findViewByContentDescription", mode_test_start)
mode_test = instrumentation[mode_test_start:mode_test_end]
assert 'findAncestorWithSimpleName(modeRow, "ModeSelector")' in mode_test, (
    "gesture acceptance must resolve the real ModeSelector parent, not inject directly into the button row"
)
assert "dispatchSwipe(modeSelector, true)" in mode_test
assert "dispatchSwipe(modeSelector, false)" in mode_test, (
    "both horizontal directions must be injected through the actual ModeSelector"
)
assert "findParentScrollView(modeSelector)" in mode_test
assert "scrollDescendantIntoScrollView(parentScroll, modeSelector)" in mode_test
assert "dispatchVerticalScrollSwipe(modeSelector, parentScroll" in mode_test, (
    "the parent Tasks ScrollView must be exercised with a real vertical drag"
)
print("PASS Focus Timer instrumentation targets ModeSelector and parent Tasks ScrollView")

tap_start = instrumentation.index("private String dispatchTap(android.view.View view)")
tap_end = instrumentation.index("private String dispatchSwipe", tap_start)
tap_method = instrumentation[tap_start:tap_end]
assert "waitForScrollPositionToSettle(parentScroll);" in tap_method
assert tap_method.index("waitForScrollPositionToSettle(parentScroll);") < tap_method.index("stableVisibleBounds(view)"), (
    "child tap coordinates must be computed only after the parent ScrollView has stopped moving"
)
settle_start = instrumentation.index("private void waitForScrollPositionToSettle(")
settle_end = instrumentation.index("private void scrollViewIntoFocus(", settle_start)
settle_method = instrumentation[settle_start:settle_end]
assert "stableSamples >= 3" in settle_method and "SystemClock.sleep(50L)" in settle_method
assert "uptimeMillis() + 2000L" in settle_method, (
    "ScrollView settling must be bounded and require repeated stable samples"
)
scroll_start = instrumentation.index("private void scrollDescendantIntoScrollView(")
scroll_end = instrumentation.index("private void scrollViewIntoFocus(", scroll_start)
scroll_method = instrumentation[scroll_start:scroll_end]
assert "waitForScrollPositionToSettle(scrollView);" in scroll_method, (
    "programmatic centering must finish before a touch is injected"
)
print("PASS Focus Timer tap injection waits for stable parent ScrollView position")
