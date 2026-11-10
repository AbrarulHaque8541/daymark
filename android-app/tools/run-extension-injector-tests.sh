#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TMP=$(mktemp -d "/tmp/daymark-extension-injector.XXXXXX")
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
javac -encoding UTF-8 -d "$TMP" \
  "$ROOT/tools/extension-injector-stubs/android/content/res/AssetManager.java" \
  "$ROOT/tools/extension-injector-stubs/android/content/Context.java" \
  "$ROOT/tools/extension-injector-stubs/android/webkit/WebView.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserHttpPolicy.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserAddress.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/BrowserExtension.java" \
  "$ROOT/app/src/main/java/com/abrar/daymark/ExtensionInjector.java" \
  "$ROOT/tools/ExtensionInjectorSmoke.java"
java -ea -Ddaymark.asset.dir="$ROOT/app/src/main/assets" -cp "$TMP" com.abrar.daymark.ExtensionInjectorSmoke
python3 "$ROOT/tools/check-extension-spa-privacy.py"
