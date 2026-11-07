#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR=$(mktemp -d daymark-tmp.XXXXXX)
trap 'rm -rf "$BUILD_DIR"' EXIT
javac -encoding UTF-8 --release 17 -d "$BUILD_DIR" "$ROOT/app/src/main/java/com/abrar/daymark/BrowserDownloadFailClosedPolicy.java" "$ROOT/tools/BrowserDownloadFailClosedPolicySmoke.java"
java -ea -cp "$BUILD_DIR" com.abrar.daymark.BrowserDownloadFailClosedPolicySmoke
