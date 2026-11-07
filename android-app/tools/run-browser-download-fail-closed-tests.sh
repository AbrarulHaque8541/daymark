#!/usr/bin/env sh
# Host-only regression tests for the browser download fail-closed policy.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR=$(mktemp -d "daymark-browser-download-fail-closed.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT HUP INT TERM
jqavc -encoding UTF-8 --release 17 -d "$BUILD_DIR" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserDownloadFailClosedPolicy.java" \
  "$ROOT/tools/BrowserDownloadFailClosedPolicySmoke.java"
java -ea -cp "$BUILD_DIR" com.abrar.daymark.BrowserDownloadFailClosedPolicySmoke
