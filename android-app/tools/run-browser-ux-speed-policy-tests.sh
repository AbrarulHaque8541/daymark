#!/usr/bin/env sh
# JDK-only regression tests for browser UX speed policies.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR=$(mktemp -d "daymark-browser-ux.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT HUP INT TERM

javac -encoding UTF-8 --release 17 -d "$BUILD_DIR" \
  "$ROOT/app/src/main/java/com/abrar/daymark/UiMotionPolicy.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserHomeLayoutPolicy.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserToolsSheetPolicy.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserDownloadUiPolicy.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/SettingsHierarchyPolicy.java" \
  "$ROOT/tools/BrowserUxSpeedPolicySmoke.java"
java -ea -cp "$BUILD_DIR" com.abrar.daymark.BrowserUxSpeedPolicySmoke
echo "PASS run-browser-ux-speed-policy-tests"
