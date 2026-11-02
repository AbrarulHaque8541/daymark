#!/usr/bin/env sh
set -eu

./gradlew --no-daemon installGithubSideloadDebug installGithubSideloadDebugAndroidTest

instrumentation="$(adb shell pm list instrumentation | tr -d '\r' | sed -n 's/^instrumentation:\([^ ]*DaymarkPlatformInstrumentation\).*/\1/p' | head -n 1)"
if [ -z "$instrumentation" ]; then
  echo "DaymarkPlatformInstrumentation was not installed" >&2
  adb shell pm list instrumentation >&2
  exit 1
fi

echo "Running Android instrumentation component: $instrumentation"
output="$(adb shell am instrument -w -r "$instrumentation" 2>&1)" || {
  printf '%s\n' "$output" >&2
  exit 1
}
printf '%s\n' "$output"
printf '%s\n' "$output" | grep -Fq 'INSTRUMENTATION_RESULT: result=passed'
printf '%s\n' "$output" | grep -Fq 'INSTRUMENTATION_RESULT: main_activity_tabs_transition=passed'
