#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TMP=$(mktemp -d "${TMPDIR:-/tmp}/daymark-shell-input.XXXXXX")
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
javac -encoding UTF-8 -d "$TMP" \
  "$ROOT/app/src/androidTest/java/com/abrar/daymark/PlatformShellInputCommand.java" \
  "$ROOT/tools/PlatformShellInputCommandSmoke.java"
java -cp "$TMP" com.abrar.daymark.PlatformShellInputCommandSmoke
