#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/daymark-extension-store-tests.XXXXXX")
trap 'rm -rf "$BUILD_DIR"' EXIT HUP INT TERM
javac -encoding UTF-8 --release 17 -d "$BUILD_DIR" \
  "$ROOT/tools/extension-store-stubs/android/content/Context.java" \
  "$ROOT/tools/extension-store-stubs/android/content/SharedPreferences.java" \
  "$ROOT/tools/host-stubs/org/json/JSONObject.java" \
  "$ROOT/tools/host-stubs/org/json/JSONArray.java" \
  "$ROOT/tools/host-stubs/org/json/JsonWriter.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/StrictJsonParser.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserHttpPolicy.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserAddress.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserExtension.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BuiltInExtensions.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/ExtensionPackageParser.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/ExtensionStore.java" \
  "$ROOT/tools/ExtensionStoreSmoke.java"
java -ea -cp "$BUILD_DIR" com.abrar.daymark.ExtensionStoreSmoke
