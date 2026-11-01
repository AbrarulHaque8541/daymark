#!/usr/bin/env sh
# Regression test for issue #196: source guards must fail when required wiring is absent.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ACTIVITY="$ROOT/app/src/main/java/com/abrar/daymark/MainActivity.java"
PROVIDER="$ROOT/app/src/main/java/com/abrar/daymark/AttachmentContentProvider.java"
RECEIVER="$ROOT/app/src/main/java/com/abrar/daymark/TaskReminderReceiver.java"
SCHEDULER="$ROOT/app/src/main/java/com/abrar/daymark/TaskReminderScheduler.java"
RENDER_GATE="$ROOT/app/src/main/java/com/abrar/daymark/TaskListRenderGate.java"
BACKUP=$(mktemp)
cp "$ACTIVITY" "$BACKUP"
PROVIDER_BACKUP=$(mktemp)
cp "$PROVIDER" "$PROVIDER_BACKUP"
RENDER_GATE_BACKUP=$(mktemp)
cp "$RENDER_GATE" "$RENDER_GATE_BACKUP"
restore() {
  cp "$BACKUP" "$ACTIVITY"
  cp "$PROVIDER_BACKUP" "$PROVIDER"
  cp "$RENDER_GATE_BACKUP" "$RENDER_GATE"
  rm -f "$BACKUP" "$PROVIDER_BACKUP" "$RENDER_GATE_BACKUP"
}
trap restore EXIT INT TERM

expect_fail_after_removal() {
  checker="$1"
  marker="$2"
  target="${3:-$ACTIVITY}"
  checker_arg="${4:-}"
  target_backup=$(mktemp)
  cp "$target" "$target_backup"
  MARKER="$marker" TARGET="$target" python3 - <<'PY'
import os
from pathlib import Path
p = Path(os.environ["TARGET"])
s = p.read_text(encoding="utf-8")
marker = os.environ["MARKER"]
if marker not in s:
    raise SystemExit(f"required marker not found in {p.name}: {marker}")
p.write_text(s.replace(marker, "REMOVED_BY_META_TEST"), encoding="utf-8")
PY
  if [ -n "$checker_arg" ]; then
    checker_ok=1
    python3 "$ROOT/tools/$checker" "$checker_arg" >/dev/null 2>&1 && checker_ok=0
  else
    checker_ok=1
    python3 "$ROOT/tools/$checker" >/dev/null 2>&1 && checker_ok=0
  fi
  cp "$target_backup" "$target"
  rm -f "$target_backup"
  if [ "$checker_ok" -eq 0 ]; then
    echo "FAIL: $checker exited 0 after removing required marker: $marker" >&2
    return 1
  fi
  echo "PASS meta: $checker fails when marker is missing"
}

expect_fail_after_curve_swap() {
  marker="$1"
  expected="$2"
  target_backup=$(mktemp)
  checker_output=$(mktemp)
  cp "$ACTIVITY" "$target_backup"
  TARGET="$ACTIVITY" MARKER="$marker" python3 - <<'PY'
import os
from pathlib import Path
p = Path(os.environ["TARGET"])
s = p.read_text(encoding="utf-8")
marker = os.environ["MARKER"]
start = s.find(marker)
if start < 0:
    raise SystemExit(f"show animation marker not found: {marker}")
end = s.find(";", start)
if end < 0:
    raise SystemExit(f"show animation terminator not found: {marker}")
branch = s[start:end]
if "setInterpolator(MOTION_ENTER)" not in branch:
    raise SystemExit(f"show animation enter curve not found in branch: {marker}")
p.write_text(s[:start] + branch.replace("setInterpolator(MOTION_ENTER)",
                                        "setInterpolator(MOTION_EXIT)", 1) + s[end:],
            encoding="utf-8")
PY
  checker_status=0
  python3 "$ROOT/tools/check-press-feedback.py" >"$checker_output" 2>&1 || checker_status=$?
  cp "$target_backup" "$ACTIVITY"
  rm -f "$target_backup"
  if [ "$checker_status" -eq 0 ]; then
    rm -f "$checker_output"
    echo "FAIL: check-press-feedback.py accepted a wrong show interpolator: $marker" >&2
    return 1
  fi
  if ! grep -F "$expected" "$checker_output" >/dev/null; then
    cat "$checker_output" >&2
    rm -f "$checker_output"
    echo "FAIL: wrong show-curve mutation did not fail at its branch assertion: $marker" >&2
    return 1
  fi
  rm -f "$checker_output"
  echo "PASS meta: check-press-feedback.py rejects a wrong show curve in $marker"
}

expect_fail_after_removal check-text-scale.py "TextScalePolicy.combined("
WINDOW="$ROOT/app/src/main/java/com/abrar/daymark/Api30Window.java"
if [ -f "$WINDOW" ]; then
  expect_fail_after_removal check-window-insets.py "WindowInsets.Type.ime()" "$WINDOW"
  expect_fail_after_removal check-window-insets.py "Api29Window.relaxBarContrast(window);" "$ACTIVITY"
else
  expect_fail_after_removal check-window-insets.py "WindowInsets.Type.ime()"
fi
expect_fail_after_removal check-web-mode-state.py "STATE_WEB_MODE"
expect_fail_after_removal check-silent-catch.py "StartupDiagnostics.record("
# Press feedback, haptics and easing must fail closed if the wiring is removed (issue #160 UI work).
expect_fail_after_removal check-press-feedback.py "setInterpolator(MOTION_ENTER)"
expect_fail_after_removal check-press-feedback.py "android.R.attr.state_focused"
expect_fail_after_removal check-press-feedback.py "PressSurface.pressedFill(labelColors"
expect_fail_after_removal check-press-feedback.py "hapticToggle(button, checked);"
expect_fail_after_removal check-press-feedback.py "android.view.MotionEvent.ACTION_DOWN) setPressed(true);"
expect_fail_after_removal check-press-feedback.py "palette.text, palette.muted, palette.warning, palette.danger"
expect_fail_after_removal check-press-feedback.py "int... labelColors"
expect_fail_after_removal check-press-feedback.py "Build.VERSION.SDK_INT >= 29"
expect_fail_after_curve_swap "topBarBrand.animate().alpha(1f).setDuration(180L)" \
  "topBarBrand show must use the shared enter curve in its own branch"
expect_fail_after_curve_swap "sharedComposer.animate().translationY(0f).alpha(1f).setDuration(200L)" \
  "sharedComposer show must use the shared enter curve in its own branch"
# Tag filtering, note formatting and keyboard shortcuts must fail closed too.
expect_fail_after_removal check-task-ux.py "renderTagFilters();"
expect_fail_after_removal check-task-ux.py "TaskLogic.filter(tasks, selectedFilter, selectedQuery, selectedTag, today)"
expect_fail_after_removal check-task-ux.py "renderTaskCount(renderTaskList(today));"
expect_fail_after_removal check-task-ux.py "searchInput.setMinimumHeight(dp(48));"
expect_fail_after_removal check-task-ux.py "checkBox.setMinimumHeight(dp(48));"
expect_fail_after_removal check-task-ux.py "more.setMinimumHeight(dp(48));"
expect_fail_after_removal check-task-ux.py "quickCaptureInput.setMinimumHeight(dp(48));"
expect_fail_after_removal check-task-ux.py "NoteFormat.spans(task.notes)"
expect_fail_after_removal check-task-ux.py "KeyShortcuts.actionFor(event.getKeyCode()"
expect_fail_after_removal check-task-ux.py "BrowserAddress.isAllowedWebUrl(url)"
expect_fail_after_removal check-task-ux.py "ShareIntake.parse("
expect_fail_after_removal check-task-ux.py "Intent.ACTION_PROCESS_TEXT.equals(intent.getAction())"
expect_fail_after_removal check-task-ux.py 'if (task != iterator.next()) return false;' "$RENDER_GATE"
# A clip is review-only until the user saves it through the encrypted task pipeline.
expect_fail_after_removal check-web-clip.py "pendingWebClip = WebClip.fromReader(" "$ACTIVITY" "$ROOT"
expect_fail_after_removal check-web-clip.py 'saveTasksAsync("Saving offline clip…");' "$ACTIVITY" "$ROOT"
# Reminder snooze must only re-arm the alarm slot.
expect_fail_after_removal check-reminder-lifecycle.py '"Snooze " + TaskReminderScheduler.SNOOZE_MINUTES + " min"' "$RECEIVER" "$ROOT"
expect_fail_after_removal check-reminder-lifecycle.py "alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, snoozeFire.toEpochMilli()," "$SCHEDULER" "$ROOT"
# Site history search and single-site removal must fail closed.
python3 "$ROOT/tools/check-browser-history.py" "$ROOT" >/dev/null
echo "PASS meta: check-browser-history.py passes on current source"
expect_fail_after_removal check-browser-history.py "BrowserHistory.filter(history, query)" "$ACTIVITY" "$ROOT"
expect_fail_after_removal check-browser-history.py "BrowserHistory.remove(" "$ACTIVITY" "$ROOT"
# The attachment streaming contract must fail closed if the reliable pipe is lost.
expect_fail_after_removal check-attachment-source.py "ParcelFileDescriptor.createReliablePipe()" "$PROVIDER" "$ROOT"
expect_fail_after_removal check-attachment-source.py "closeWithError(" "$PROVIDER" "$ROOT"
expect_fail_after_removal check-attachment-source.py "openReliablePipeHelper(" "$PROVIDER" "$ROOT"

for checker in check-text-scale.py check-window-insets.py check-web-mode-state.py check-silent-catch.py check-press-feedback.py check-task-ux.py; do
  python3 "$ROOT/tools/$checker" >/dev/null
  echo "PASS meta: $checker passes on current source"
done
python3 "$ROOT/tools/check-attachment-source.py" "$ROOT" >/dev/null
echo "PASS meta: check-attachment-source.py passes on current source"

echo "PASS source-check guard regression tests"
