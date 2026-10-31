#!/usr/bin/env sh
# JDK-only regression tests for the Android browser download tracker.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR=$(mktemp -d "daymark-download-tracker.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT HUP INT TERM

javac -encoding UTF-8 --release 17 -d "$BUILD_DIR" \
  "$ROOT/tools/host-stubs/android/util/Log.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserDownloadTracker.java" \
  "$ROOT/tools/BrowserDownloadTrackerSmoke.java"
java -ea -cp "$BUILD_DIR" com.abrar.daymark.BrowserDownloadTrackerSmoke
echo "PASS run-browser-download-tracker-tests"
