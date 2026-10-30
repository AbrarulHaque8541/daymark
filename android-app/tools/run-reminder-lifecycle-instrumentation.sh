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
if [ "$STATUS" -ne 0 ] \
    || ! grep -q '^INSTRUMENTATION_RESULT: result=passed' /tmp/daymark-reminder-instrumentation.log \
    || ! grep -q '^INSTRUMENTATION_CODE: -1' /tmp/daymark-reminder-instrumentation.log; then
  FAIL_STATUS=$STATUS
  [ "$FAIL_STATUS" -ne 0 ] || FAIL_STATUS=1
  echo "FAIL platform instrumentation (am instrument exit: $STATUS; result marker missing or failed)" >&2
  echo "--- process state at failure:" >&2
  "$ADB" -s "$MODE" shell ps -A 2>/dev/null | grep daymark >&2 || true
  PID=$("$ADB" -s "$MODE" shell pidof com.abrar.daymark 2>/dev/null | tr -d '\r' || true)
  PID=$(echo "$PID" | tr -d ' ')
  if [ -n "$PID" ]; then
    STACKS=/tmp/daymark-thread-stacks.txt
    "$ADB" -s "$MODE" root >/dev/null 2>&1 || true
    "$ADB" -s "$MODE" wait-for-device >/dev/null 2>&1 || true
    : > "$STACKS"
    "$ADB" -s "$MODE" shell debuggerd -j "$PID" > "$STACKS" 2>/dev/null || \
      "$ADB" -s "$MODE" shell debuggerd -b "$PID" > "$STACKS" 2>/dev/null || true
    echo "--- main thread (pid $PID):" >&2
    awk '/^"main" prio/{flag=1} flag && /^"/ && !/^"main" prio/{exit} flag{print}' "$STACKS" >&2 || true
    echo "--- instrumentation thread (pid $PID):" >&2
    awk '/^"Instr/{flag=1} flag && /^"/ && !/^"Instr/{exit} flag{print}' "$STACKS" >&2 || true
    echo "--- threads running daymark code:" >&2
    grep -B 2 -A 14 'at com\.abrar\.daymark\.' "$STACKS" 2>/dev/null | head -n 200 >&2 || true
  fi
  echo "--- notification permission/channel diagnostics:" >&2
  "$ADB" -s "$MODE" shell dumpsys notification --noredact 2>/dev/null \
    | grep -n -C 3 'com.abrar.daymark\|daymark_task_reminders' | tail -n 120 >&2 || true
  echo "--- instrumentation phase markers (run-as file + logcat):" >&2
  "$ADB" -s "$MODE" shell run-as com.abrar.daymark cat files/instrumentation-phases.log 2>/dev/null >&2 || true
  "$ADB" -s "$MODE" logcat -d -s DaymarkInstr:V DaymarkReminder:V 2>/dev/null | tail -n 60 >&2 || true
  exit "$FAIL_STATUS"
fi
echo "PASS: Android platform instrumentation, including reminder notification reconciliation."
