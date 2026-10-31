#!/usr/bin/env sh
# Deterministic host regression tests for BrowserLoadWatchdog v2.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR=$(mktemp -d "daymark-load-watchdog.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT HUP INT TERM

python3 "$ROOT/tools/check-browser-load-watchdog-v2.py" "$ROOT"
javac -encoding UTF-8 --release 17 -d "$BUILD_DIR" \
  "$ROOT/tools/host-stubs/android/os/Looper.java" \
  "$ROOT/tools/host-stubs/android/os/SystemClock.java" \
  "$ROOT/tools/host-stubs/android/os/Handler.java" \
  "$ROOT/tools/host-stubs/android/util/Log.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserSelfHealingPolicy.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserLoadWatchdog.java" \
  "$ROOT/tools/BrowserLoadWatchdogSmoke.java"
java -ea -cp "$BUILD_DIR" com.abrar.daymark.BrowserLoadWatchdogSmoke
echo "PASS run-load-watchdog-tests"
