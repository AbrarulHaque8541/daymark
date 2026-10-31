#!/usr/bin/env sh
# Optional local comparison only; no timing threshold or Android performance claim.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/daymark-search-benchmark.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT HUP INT TERM
SOURCE="$ROOT/app/src/main/java/com/abrar/daymark"
javac -encoding UTF-8 --release 17 -d "$BUILD_DIR" \
  "$SOURCE/AttachmentRef.java" "$SOURCE/AttachmentLogic.java" \
  "$SOURCE/Subtask.java" "$SOURCE/Task.java" "$SOURCE/TaskDuePresets.java" \
  "$SOURCE/TaskSearch.java" "$SOURCE/TaskLogic.java" \
  "$ROOT/tools/TaskSearchPassBenchmark.java"
java -cp "$BUILD_DIR" com.abrar.daymark.TaskSearchPassBenchmark
