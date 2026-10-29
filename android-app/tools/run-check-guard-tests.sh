#!/usr/bin/env sh
# Regression test for issue #196: source guards must fail when required wiring is absent.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ACTIVITY="$ROOT/app/src/main/java/com/abrar/daymark/MainActivity.java"
PROVIDER="$ROOT/app/src/main/java/com/abrar/daymark/AttachmentContentProvider.java"
BACKUP=$(mktemp)
cp "$ACTIVITY" "$BACKUP"
PROVIDER_BACKUP=$(mktemp)
cp "$PROVIDER" "$PROVIDER_BACKUP"
restore() {
  cp "$BACKUP" "$ACTIVITY"
  cp "$PROVIDER_BACKUP" "$PROVIDER"
  rm -f "$BACKUP" "$PROVIDER_BACKUP"
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
# The attachment streaming contract must fail closed if the reliable pipe is lost.
expect_fail_after_removal check-attachment-source.py "ParcelFileDescriptor.createReliablePipe()" "$PROVIDER" "$ROOT"
expect_fail_after_removal check-attachment-source.py "closeWithError(" "$PROVIDER" "$ROOT"
expect_fail_after_removal check-attachment-source.py "openReliablePipeHelper(" "$PROVIDER" "$ROOT"

for checker in check-text-scale.py check-window-insets.py check-web-mode-state.py check-silent-catch.py check-press-feedback.py; do
  python3 "$ROOT/tools/$checker" >/dev/null
  echo "PASS meta: $checker passes on current source"
done
python3 "$ROOT/tools/check-attachment-source.py" "$ROOT" >/dev/null
echo "PASS meta: check-attachment-source.py passes on current source"

echo "PASS source-check guard regression tests"
