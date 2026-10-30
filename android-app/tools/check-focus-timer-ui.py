#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
panel = (root / "app/src/main/java/com/abrar/daymark/TaskFocusTimerPanel.java").read_text()
sound = (root / "app/src/main/java/com/abrar/daymark/TaskFocusTimerSoundscape.java").read_text()
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text()
runtime = (root / "app/src/main/java/com/abrar/daymark/TaskFocusSessionRuntime.java").read_text()

required_panel = [
    "STOPWATCH", "COUNTDOWN", "onStart(TaskFocusTimer.Mode mode, long targetDurationMs)",
    "onPause()", "onResume()", "onStop()", "onChooseTask()",
    "setDailySummary", "setSoundEnabled", "setFinalTicksEnabled",
    "showCustomDuration", "ProgressRing", "ValueAnimator",
    "primaryAction.setEnabled(true)",
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
assert "if (!closed && timer != null && !timer.isFinished())" in panel, "disposed panel must not dispatch Finish"
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
]
for token in required_integration:
    assert token in activity, f"Focus Timer Activity integration missing: {token}"

assert "coordinator.startFromUserAction(" in runtime
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
