#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
REPO_ROOT=$(CDPATH= cd -- "$ROOT/.." && pwd)
BUILD_DIR=$(mktemp -d)
trap 'rm -rf "$BUILD_DIR"' EXIT HUP INT TERM

javac --release 17 -encoding UTF-8 -d "$BUILD_DIR" \
  "$ROOT/app/src/main/java/com/abrar/daymark/UiMotionPolicy.java" \
  "$ROOT/tools/UiMotionPolicySmoke.java"
java -ea -cp "$BUILD_DIR" com.abrar.daymark.UiMotionPolicySmoke
python3 "$ROOT/tools/check-ui-motion-policy-integration.py" "$REPO_ROOT"
