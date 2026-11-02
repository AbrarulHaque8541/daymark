#!/bin/sh
# Host smoke for UiPressFeedback. JDK 17 only; no Android framework required.
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$ROOT/build/ui-press-feedback-smoke"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
javac --release 17 -d "$BUILD_DIR" \
  "$ROOT/app/src/main/java/com/abrar/daymark/UiMotionPolicy.java" \
  "$ROOT/tools/UiPressFeedbackSmoke.java"
java -ea -cp "$BUILD_DIR" com.abrar.daymark.UiPressFeedbackSmoke
echo "UiPressFeedback host smoke PASS"
