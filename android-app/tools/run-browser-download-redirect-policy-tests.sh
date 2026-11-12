#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TMP=$(mktemp -d "/tmp/daymark-download-redirect-policy.XXXXXX")
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
javac -encoding UTF-8 --release 17 -d "$TMP" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserHttpPolicy.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserAddress.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserDownloadRedirectPolicy.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserDownloadBodyTransfer.java" \
  "$ROOT/tools/BrowserDownloadRedirectPolicySmoke.java" \
  "$ROOT/tools/BrowserDownloadBodyTransferSmoke.java"
java -ea -cp "$TMP" com.abrar.daymark.BrowserDownloadRedirectPolicySmoke
java -ea -cp "$TMP" com.abrar.daymark.BrowserDownloadBodyTransferSmoke
