#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR=$(mktemp -d "daymark-service-worker-policy.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT HUP INT TERM
python3 "$ROOT/tools/check-browser-service-worker-policy.py" "$ROOT"
javac -encoding UTF-8 --release 17 -d "$BUILD_DIR" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserServiceWorkerPolicy.java" \
  "$ROOT/tools/BrowserServiceWorkerPolicySmoke.java"
java -ea -cp "$BUILD_DIR" com.abrar.daymark.BrowserServiceWorkerPolicySmoke
