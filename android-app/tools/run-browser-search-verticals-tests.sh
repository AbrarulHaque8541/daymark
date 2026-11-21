#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR=$(mktemp -d "daymark-search-verticals.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT HUP INT TERM
javac -encoding UTF-8 --release 17 -d "$BUILD_DIR" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserAddress.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserHttpPolicy.java" \
  "$ROOT/tools/BrowserSearchVerticalsSmoke.java"
java -ea -cp "$BUILD_DIR" com.abrar.daymark.BrowserSearchVerticalsSmoke
echo "PASS run-browser-search-verticals-tests"
