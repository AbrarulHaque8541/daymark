#!/usr/bin/env sh
# Executes the Android platform instrumentation suite, including real NotificationManager
# reconciliation checks, on an explicitly selected scratch emulator.
# Usage: ANDROID_HOME=/path/to/sdk sh android-app/tools/run-reminder-lifecycle-instrumentation.sh emulator-5554
# --build-only builds the app and instrumentation APK without installing or running them.
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
(
  cd "$ROOT"
  ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK" ./gradlew --no-daemon \
    :app:assembleGithubSideloadDebug :app:assembleGithubSideloadDebugAndroidTest
)
APP="$ROOT/app/build/outputs/apk/githubSideload/debug/app-githubSideload-debug.apk"
TEST="$ROOT/app/build/outputs/apk/androidTest/githubSideload/debug/app-githubSideload-debug-androidTest.apk"
test -s "$APP"
test -s "$TEST"
ADB="$SDK/platform-tools/adb"
if [ "$MODE" = --build-only ]; then
  echo "PASS: app and platform instrumentation APKs built."
  echo "NOT RUN: Android runtime instrumentation (--build-only)."
  exit 0
fi
if [ "$("$ADB" -s "$MODE" get-state)" != device ]; then
  echo "Scratch emulator is not available: $MODE" >&2
  exit 2
fi
"$ADB" -s "$MODE" install -r "$APP"
"$ADB" -s "$MODE" install -r "$TEST"
SDK_INT=$("$ADB" -s "$MODE" shell getprop ro.build.version.sdk | tr -d '\r')
if [ "$SDK_INT" -ge 33 ]; then
  "$ADB" -s "$MODE" shell pm grant com.abrar.daymark android.permission.POST_NOTIFICATIONS
fi
set +e
timeout 900 "$ADB" -s "$MODE" shell am instrument -w \
  com.abrar.daymark.test/com.abrar.daymark.DaymarkPlatformInstrumentation > /tmp/daymark-reminder-instrumentation.log 2>&1
STATUS=$?
set -e
cat /tmp/daymark-reminder-instrumentation.log
if [ "$STATUS" -ne 0 ]; then
  echo "FAIL platform instrumentation command exit: $STATUS" >&2
  echo "--- process state at failure:" >&2
  "$ADB" -s "$MODE" shell ps -A 2>/dev/null | grep daymark >&2 || true
  echo "--- recent device log:" >&2
  "$ADB" -s "$MODE" logcat -d -t 200 2>/dev/null | tail -n 100 >&2 || true
  exit "$STATUS"
fi
grep -q '^INSTRUMENTATION_RESULT: result=passed' /tmp/daymark-reminder-instrumentation.log
grep -q '^INSTRUMENTATION_CODE: -1' /tmp/daymark-reminder-instrumentation.log
echo "PASS: Android platform instrumentation, including reminder notification reconciliation."
