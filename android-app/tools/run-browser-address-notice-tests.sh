#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/daymark-browser-address-notice.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT HUP INT TERM

javac -encoding UTF-8 -d "$BUILD_DIR" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserAddressNotice.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserAddressNoticePanelPolicy.java" \
  "$ROOT/tools/BrowserAddressNoticeSmoke.java" \
  "$ROOT/tools/BrowserAddressNoticePanelPolicySmoke.java"
java -ea -cp "$BUILD_DIR" com.abrar.daymark.BrowserAddressNoticeSmoke
java -ea -cp "$BUILD_DIR" com.abrar.daymark.BrowserAddressNoticePanelPolicySmoke
