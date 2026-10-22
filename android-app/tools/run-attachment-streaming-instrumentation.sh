#!/usr/bin/env sh
# Runs only the attachment provider regression on an explicitly chosen scratch emulator.
# Usage: ANDROID_HOME=/path/to/sdk sh android-app/tools/run-attachment-streaming-instrumentation.sh emulator-5556
# --build-only builds/verifies the dedicated runner without installing or running it.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
if [ -z "$SDK" ]; then
  echo "Set ANDROID_HOME or ANDROID_SDK_ROOT to an Android SDK." >&2
  exit 2
fi
MODE=${1:-${ANDROID_SERIAL:-}}
case "$MODE" in
  --build-only) ;;
  emulator-*) ;;
  *) echo "Specify a scratch emulator serial (emulator-NNNN) or --build-only; no physical device is selected implicitly." >&2; exit 2 ;;
esac
TEMP=$(mktemp -d "${TMPDIR:-/tmp}/daymark-attachment-instrumentation.XXXXXX")
trap 'rm -rf "$TEMP"' EXIT HUP INT TERM
RUNNER=com.abrar.daymark.AttachmentStreamingErrorInstrumentation
# AGP rewrites androidTest manifest instrumentation names using the DSL runner.
# A task-local finalizeDsl override selects this runner without changing the app's
# default runner, application ID, production manifest, signing, or release configuration.
cat > "$TEMP/attachment-runner.init.gradle" <<'GRADLE'
gradle.beforeProject { project ->
    project.pluginManager.withPlugin('com.android.application') {
        project.extensions.getByName('androidComponents').finalizeDsl { android ->
            android.defaultConfig.testInstrumentationRunner =
                'com.abrar.daymark.AttachmentStreamingErrorInstrumentation'
        }
    }
}
GRADLE
(
  cd "$ROOT"
  ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK" ./gradlew --no-daemon \
    --init-script "$TEMP/attachment-runner.init.gradle" \
    :app:assembleGithubSideloadDebug :app:assembleGithubSideloadDebugAndroidTest
)
APP="$ROOT/app/build/outputs/apk/githubSideload/debug/app-githubSideload-debug.apk"
TEST="$ROOT/app/build/outputs/apk/androidTest/githubSideload/debug/app-githubSideload-debug-androidTest.apk"
AAPT=$(find "$SDK/build-tools" -type f -name aapt | sort -V | tail -n 1)
if [ -z "$AAPT" ]; then
  echo "An Android build-tools aapt is required to verify the packaged runner." >&2
  exit 2
fi
"$AAPT" dump xmltree "$TEST" AndroidManifest.xml > "$TEMP/test-manifest.txt"
if ! grep -F "\"$RUNNER\"" "$TEMP/test-manifest.txt" >/dev/null; then
  echo "FAIL: dedicated runner is missing from the packaged test APK." >&2
  exit 1
fi
echo "PASS packaged instrumentation runner: $RUNNER"
if [ "$MODE" = --build-only ]; then
  echo "NOT RUN: emulator instrumentation (--build-only)."
  exit 0
fi
ADB="$SDK/platform-tools/adb"
if [ "$("$ADB" -s "$MODE" get-state)" != device ]; then
  echo "Scratch emulator is not available: $MODE" >&2
  exit 2
fi
# Use only the explicitly selected disposable emulator. Never clear app data or uninstall.
"$ADB" -s "$MODE" shell am force-stop com.abrar.daymark
"$ADB" -s "$MODE" install -r "$APP"
"$ADB" -s "$MODE" install -r "$TEST"
set +e
timeout 180 "$ADB" -s "$MODE" shell am instrument -w \
  "com.abrar.daymark.test/$RUNNER" > "$TEMP/instrumentation.log" 2>&1
STATUS=$?
set -e
cat "$TEMP/instrumentation.log"
if [ "$STATUS" -ne 0 ]; then
  echo "FAIL instrumentation command exit: $STATUS" >&2
  exit "$STATUS"
fi
# adb can exit 0 even if Instrumentation.finish reports failure; inspect results.
grep -q '^INSTRUMENTATION_RESULT: result=passed' "$TEMP/instrumentation.log"
grep -q '^INSTRUMENTATION_RESULT: assertions=5' "$TEMP/instrumentation.log"
grep -q '^INSTRUMENTATION_CODE: -1' "$TEMP/instrumentation.log"
echo "PASS attachment streaming runtime regression: exact bytes, truncation, ciphertext corruption, GCM-tag failure; cancellation smoke only."
