#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR=$(mktemp -d "daymark-cookie-import-tests.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT HUP INT TERM

javac -encoding UTF-8 --release 17 -d "$BUILD_DIR" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserCookieImport.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserCookieImportPolicy.java" \
  "$ROOT/tools/BrowserCookieImportSmoke.java" \
  "$ROOT/tools/BrowserCookieImportPolicySmoke.java"

java -ea -cp "$BUILD_DIR" com.abrar.daymark.BrowserCookieImportSmoke
java -ea -cp "$BUILD_DIR" com.abrar.daymark.BrowserCookieImportPolicySmoke
