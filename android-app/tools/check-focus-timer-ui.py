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

prefs_helper = (root / "app/src/main/java/com/abrar/daymark/TaskFocusTimerPrefs.java").read_text()
assert 'PREFS = "daymark.focus.prefs.v1"' in prefs_helper, (
    "Focus preferences must use a versioned SharedPreferences name"
)
assert "KEY_DISPLAY_UNIT" in prefs_helper and "KEY_SOUND_ENABLED" in prefs_helper and "KEY_FINAL_TICKS" in prefs_helper, (
    "Focus preference keys for display unit, sound, and final ticks are required"
)
assert "loadFocusPreferences()" in panel, "constructor must load Focus preferences before building controls"
assert "saveFocusPreferences()" in panel, "user changes to Focus preferences must be saved"
assert "TaskFocusTimerPrefs.loadDisplayUnit" in panel and "TaskFocusTimerPrefs.loadSoundEnabled" in panel, (
    "panel must load display unit and sound prefs through TaskFocusTimerPrefs"
)
assert "TaskFocusTimerPrefs.save(" in panel, "panel must save Focus preferences through TaskFocusTimerPrefs"
assert "DisplayUnit.valueOf" in panel, "invalid saved display unit values must fail closed via valueOf"
assert '(selected ? " (selected)" : "")' in panel, (
    "display-unit buttons must expose selected state in content descriptions"
)
assert 'settingRow("Final 10-second ticks", finalTicksEnabled)' in panel, (
    "tick toggle must restore the saved final-ticks preference"
)
assert "sounds.setFinalTicksEnabled(finalTicksEnabled)" in panel, (
    "soundscape must receive the restored final-ticks preference at construction"
)
print("PASS focus timer preference persistence source guard")

print("PASS focus timer UI/sound source guard")
