#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TMP=$(mktemp -d "${TMPDIR:-/tmp}/daymark-touch-sequence.XXXXXX")
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
javac -encoding UTF-8 -d "$TMP" \
  "$ROOT/app/src/androidTest/java/com/abrar/daymark/PlatformTouchSequence.java" \
  "$ROOT/tools/PlatformTouchSequenceSmoke.java"
java -cp "$TMP" com.abrar.daymark.PlatformTouchSequenceSmoke
