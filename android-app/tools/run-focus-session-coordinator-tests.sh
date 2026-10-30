#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR=$(mktemp -d "daymark-focus-session.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT HUP INT TERM
javac -encoding UTF-8 --release 17 -d "$BUILD_DIR" \
  "$ROOT/app/src/main/java/com/abrar/daymark/TaskFocusTimer.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/TaskFocusSessionCoordinator.java" \
  "$ROOT/tools/TaskFocusSessionCoordinatorSmoke.java"
java -ea -cp "$BUILD_DIR" com.abrar.daymark.TaskFocusSessionCoordinatorSmoke
