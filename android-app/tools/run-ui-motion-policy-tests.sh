#!/usr/bin/env sh
# JDK-only regression tests for the UI motion timing policy.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR=$(mktemp -d "daymark-ui-motion.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT HUP INT TERM

javac -encoding UTF-8 --release 17 -d "$BUILD_DIR" \
  "$ROOT/app/src/main/java/com/abrar/daymark/UiMotionPolicy.java" \
  "$ROOT/tools/UiMotionPolicySmoke.java"
java -ea -cp "$BUILD_DIR" com.abrar.daymark.UiMotionPolicySmoke
echo "PASS run-ui-motion-policy-tests"
