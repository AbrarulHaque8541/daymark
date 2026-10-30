#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
panel = (root / "app/src/main/java/com/abrar/daymark/TaskFocusTimerPanel.java").read_text()
sound = (root / "app/src/main/java/com/abrar/daymark/TaskFocusTimerSoundscape.java").read_text()

required_panel = [
    "STOPWATCH", "COUNTDOWN", "onStart(TaskFocusTimer.Mode mode, long targetDurationMs)",
    "onPause()", "onResume()", "onStop()", "onChooseTask()",
    "setDailySummary", "setSoundEnabled", "setFinalTicksEnabled",
    "showCustomDuration", "ProgressRing", "ValueAnimator",
    "primaryAction.setEnabled(true)",
]
for token in required_panel:
    assert token in panel, f"Focus Timer panel missing contract: {token}"

required_sound = [
    "ToneGenerator", "AudioManager.STREAM_NOTIFICATION",
    "void onAction()", "void onSelection()", "void onCountdownSecond(int remainingSeconds)",
    "remainingSeconds > 10", "remainingSeconds == lastTickSecond",
    "void onFinished()", "void close()", "toneGenerator.release()",
]
for token in required_sound:
    assert token in sound, f"Focus Timer soundscape missing contract: {token}"

assert "private boolean soundEnabled;" in panel
assert "private boolean finalTicksEnabled;" in panel
assert "private boolean soundEnabled = true" not in panel
assert "startTone" not in panel, "UI must route sounds through the soundscape"
assert "while (" not in sound and "Thread.sleep" not in sound, "Sound must not use a looping/blocking playback loop"
assert "RECORD_AUDIO" not in sound and "MODIFY_AUDIO_SETTINGS" not in sound, "Sound effects must not request microphone/audio-control permissions"
assert "onChooseTask" in panel and "listener.onChooseTask()" in panel

print("PASS focus timer UI/sound source guard")
